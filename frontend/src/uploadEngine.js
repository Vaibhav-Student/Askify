/**
 * Chunked Upload Engine
 * Handles file slicing, per-chunk SHA-256 hashing, parallel upload with
 * retry/backoff, pause/resume/cancel, and progress tracking.
 */

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const API_BASE = '/api';

/**
 * Compute SHA-256 hex digest for an ArrayBuffer via SubtleCrypto.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function hashChunk(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sleep helper for exponential backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ── Upload state enum ──
export const UploadStatus = Object.freeze({
  PENDING:    'pending',
  UPLOADING:  'uploading',
  PAUSED:     'paused',
  PROCESSING: 'processing',
  COMPLETE:   'complete',
  FAILED:     'failed',
  CANCELLED:  'cancelled',
});


/**
 * @typedef {Object} UploadCallbacks
 * @property {(progress: number, speed: number, chunksDone: number, totalChunks: number) => void} onProgress
 * @property {(result: Object) => void} onComplete
 * @property {(error: Error) => void} onError
 * @property {(status: string) => void} onStatusChange
 */

export class UploadEngine {
  constructor({ chunkSize = DEFAULT_CHUNK_SIZE } = {}) {
    /** @type {number} */
    this.chunkSize = chunkSize;
    /** @type {Map<string, UploadTask>} */
    this.tasks = new Map();
  }

  /**
   * Begin uploading a file. Returns the internal task ID (upload_id from server).
   * @param {File} file
   * @param {UploadCallbacks} callbacks
   * @returns {Promise<string>} upload task id
   */
  async uploadFile(file, callbacks = {}) {
    const totalChunks = Math.ceil(file.size / this.chunkSize);

    // 1. Init session on server
    const initRes = await fetch(`${API_BASE}/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        total_size: file.size,
        total_chunks: totalChunks,
        content_type: file.type,
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      const error = new Error(err.error || `Init failed: ${initRes.status}`);
      callbacks.onError?.(error);
      throw error;
    }

    const { upload_id: uploadId } = await initRes.json();

    // 2. Create task
    const task = new UploadTask({
      uploadId,
      file,
      totalChunks,
      chunkSize: this.chunkSize,
      callbacks,
    });

    this.tasks.set(uploadId, task);
    callbacks.onStatusChange?.(UploadStatus.UPLOADING);

    // 3. Start uploading chunks
    task.start();

    return uploadId;
  }

  pause(uploadId) {
    this.tasks.get(uploadId)?.pause();
  }

  resume(uploadId) {
    this.tasks.get(uploadId)?.resume();
  }

  cancel(uploadId) {
    const task = this.tasks.get(uploadId);
    if (task) {
      task.cancel();
      this.tasks.delete(uploadId);
    }
  }

  getTask(uploadId) {
    return this.tasks.get(uploadId);
  }
}


/**
 * Internal class managing the upload of a single file.
 */
class UploadTask {
  constructor({ uploadId, file, totalChunks, chunkSize, callbacks }) {
    this.uploadId = uploadId;
    this.file = file;
    this.totalChunks = totalChunks;
    this.chunkSize = chunkSize;
    this.callbacks = callbacks;

    this.status = UploadStatus.PENDING;
    this.completedChunks = new Set();
    this.pendingQueue = [];
    this.activeCount = 0;
    this.cancelled = false;
    this.paused = false;

    // Speed tracking
    this._bytesThisWindow = 0;
    this._windowStart = Date.now();
    this._speed = 0;

    // Build initial queue
    for (let i = 0; i < totalChunks; i++) {
      this.pendingQueue.push(i);
    }
  }

  start() {
    this.status = UploadStatus.UPLOADING;
    this.paused = false;
    this._drainQueue();
  }

  pause() {
    this.paused = true;
    this.status = UploadStatus.PAUSED;
    this.callbacks.onStatusChange?.(UploadStatus.PAUSED);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.status = UploadStatus.UPLOADING;
    this.callbacks.onStatusChange?.(UploadStatus.UPLOADING);
    this._drainQueue();
  }

  async cancel() {
    this.cancelled = true;
    this.status = UploadStatus.CANCELLED;
    this.callbacks.onStatusChange?.(UploadStatus.CANCELLED);

    try {
      await fetch(`${API_BASE}/upload/${this.uploadId}`, { method: 'DELETE' });
    } catch {
      // Best-effort cleanup
    }
  }

  _drainQueue() {
    while (
      this.activeCount < MAX_CONCURRENT &&
      this.pendingQueue.length > 0 &&
      !this.paused &&
      !this.cancelled
    ) {
      const chunkIndex = this.pendingQueue.shift();
      this.activeCount++;
      this._uploadChunk(chunkIndex).finally(() => {
        this.activeCount--;
        if (!this.paused && !this.cancelled) {
          this._drainQueue();
        }
      });
    }
  }

  async _uploadChunk(chunkIndex, retries = 0) {
    if (this.cancelled) return;

    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const blob = this.file.slice(start, end);
    const buffer = await blob.arrayBuffer();
    const hash = await hashChunk(buffer);

    const formData = new FormData();
    formData.append('upload_id', this.uploadId);
    formData.append('chunk_index', String(chunkIndex));
    formData.append('chunk_hash', hash);
    formData.append('chunk', new Blob([buffer]), `chunk_${chunkIndex}`);

    try {
      const res = await fetch(`${API_BASE}/upload/chunk`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Chunk ${chunkIndex} failed: ${res.status}`);
      }

      // Track speed
      this._bytesThisWindow += (end - start);
      const elapsed = (Date.now() - this._windowStart) / 1000;
      if (elapsed >= 1) {
        this._speed = this._bytesThisWindow / elapsed;
        this._bytesThisWindow = 0;
        this._windowStart = Date.now();
      }

      this.completedChunks.add(chunkIndex);

      const progress = this.completedChunks.size / this.totalChunks;
      this.callbacks.onProgress?.(
        progress,
        this._speed,
        this.completedChunks.size,
        this.totalChunks,
      );

      // Check if all chunks done → finalize
      if (this.completedChunks.size === this.totalChunks) {
        await this._finalize();
      }
    } catch (err) {
      if (this.cancelled) return;

      if (retries < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retries);
        await sleep(delay);
        return this._uploadChunk(chunkIndex, retries + 1);
      }

      this.status = UploadStatus.FAILED;
      this.callbacks.onStatusChange?.(UploadStatus.FAILED);
      this.callbacks.onError?.(err);
    }
  }

  async _finalize() {
    this.status = UploadStatus.PROCESSING;
    this.callbacks.onStatusChange?.(UploadStatus.PROCESSING);

    try {
      const res = await fetch(`${API_BASE}/upload/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: this.uploadId }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Finalize failed: ${res.status}`);
      }

      const result = await res.json();
      this.status = UploadStatus.COMPLETE;
      this.callbacks.onStatusChange?.(UploadStatus.COMPLETE);
      this.callbacks.onComplete?.(result);
    } catch (err) {
      this.status = UploadStatus.FAILED;
      this.callbacks.onStatusChange?.(UploadStatus.FAILED);
      this.callbacks.onError?.(err);
    }
  }
}

/**
 * Check if a file is small enough to use the legacy single-shot upload.
 * @param {File} file
 * @param {number} threshold  bytes (default 5 MB)
 * @returns {boolean}
 */
export function isSmallFile(file, threshold = 5 * 1024 * 1024) {
  return file.size <= threshold;
}

/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format speed (bytes/sec) to human-readable string.
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}
