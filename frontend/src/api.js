/**
 * API helper functions for the AI Academic Assistant.
 */

const API_BASE = '/api';

/**
 * A robust fetch wrapper that safely handles JSON parsing, network errors,
 * and unexpected content types.
 */
async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    let data = null;

    // 1. Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    // 2. Validate Content-Type and Safely Parse JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        // Only attempt to parse JSON if the content length is > 0
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error(`[API Error] JSON Parse Failed for ${url}:`, parseError);
        throw new Error('Received malformed data from the server.');
      }
    } else {
      // Received non-JSON response (e.g. 502 Bad Gateway HTML)
      console.warn(`[API Warning] Non-JSON response from ${url}`);
      data = { message: await response.text() };
    }

    // 3. Handle HTTP Errors
    if (!response.ok) {
      const errorMessage = data?.error || data?.message || `Error ${response.status}: ${response.statusText}`;
      console.error(`[API Error] ${response.status} on ${url}:`, errorMessage);
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      console.error(`[Network Error] Could not connect to the server at ${url}.`);
      throw new Error('Network error. Please check your connection or ensure the server is running.');
    }
    throw error;
  }
}

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  return await safeFetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function fetchDocuments() {
  return await safeFetch(`${API_BASE}/documents`);
}

export async function deleteDocument(filename) {
  return await safeFetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export async function sendChat(query) {
  return await safeFetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

export async function clearHistory() {
  await safeFetch(`${API_BASE}/clear-history`, { method: 'POST' });
}

export async function getApiKeyStatus() {
  return await safeFetch(`${API_BASE}/api-key`);
}

export async function saveApiKey(apiKey) {
  return await safeFetch(`${API_BASE}/api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });
}

// ── Chunked Upload API ──

export async function initUpload(filename, totalSize, totalChunks, contentType) {
  return await safeFetch(`${API_BASE}/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      total_size: totalSize,
      total_chunks: totalChunks,
      content_type: contentType,
    }),
  });
}

export async function cancelUpload(uploadId) {
  return await safeFetch(`${API_BASE}/upload/${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
  });
}
