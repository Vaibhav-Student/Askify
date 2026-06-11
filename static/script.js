/**
 * AI Academic Assistant – Frontend Logic
 * Handles file upload, chat interaction, and document management.
 */

// ── DOM Elements ──
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const menuBtn = document.getElementById('menuBtn');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const documentsList = document.getElementById('documentsList');
const totalChunksEl = document.getElementById('totalChunks');
const chatContainer = document.getElementById('chatContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messagesEl = document.getElementById('messages');
const queryInput = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const statusText = document.getElementById('statusText');
const chipsBar = document.getElementById('chipsBar');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyToggle = document.getElementById('apiKeyToggle');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyStatus = document.getElementById('apiKeyStatus');

let isGenerating = false;

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
    loadDocuments();
    setupEventListeners();
    configureMarked();
    checkApiKeyStatus();
});

function configureMarked() {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
    });
}

// ── Event Listeners ──
function setupEventListeners() {
    // Sidebar toggle
    sidebarToggle.addEventListener('click', () => sidebar.classList.remove('open'));
    menuBtn.addEventListener('click', () => sidebar.classList.add('open'));

    // File upload
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length) uploadFiles(files);
    });

    // Chat input
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    sendBtn.addEventListener('click', sendMessage);

    // Auto-resize textarea
    queryInput.addEventListener('input', () => {
        queryInput.style.height = 'auto';
        queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + 'px';
    });

    // Clear history
    clearHistoryBtn.addEventListener('click', clearChat);

    // API key
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    apiKeyToggle.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        apiKeyToggle.textContent = isPassword ? '🙈' : '👁';
    });
    apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // Quick action chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.dataset.query;
            queryInput.value = query;
            queryInput.focus();
            // Place cursor at end
            queryInput.selectionStart = queryInput.selectionEnd = query.length;
        });
    });
}

// ── File Upload ──
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length) uploadFiles(files);
    fileInput.value = ''; // Reset so same file can be re-uploaded
}

async function uploadFiles(files) {
    for (const file of files) {
        await uploadSingleFile(file);
    }
}

async function uploadSingleFile(file) {
    const allowedTypes = ['application/pdf', 'text/plain'];
    const allowedExts = ['.pdf', '.txt'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!allowedExts.includes(ext)) {
        showNotification(`❌ "${file.name}" is not supported. Use PDF or TXT files.`, 'error');
        return;
    }

    // Show progress
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = `Uploading "${file.name}"...`;

    const formData = new FormData();
    formData.append('file', file);

    try {
        // Simulate progress
        progressFill.style.width = '30%';
        progressText.textContent = `Processing "${file.name}"...`;

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        progressFill.style.width = '80%';

        const data = await response.json();

        if (response.ok) {
            progressFill.style.width = '100%';
            progressText.textContent = `✅ ${data.message}`;
            showNotification(`✅ ${data.message} (${data.chunks} chunks)`, 'success');
            loadDocuments();
        } else {
            progressText.textContent = `❌ ${data.error}`;
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (error) {
        progressText.textContent = `❌ Upload failed`;
        showNotification('❌ Upload failed. Is the server running?', 'error');
    }

    // Hide progress after delay
    setTimeout(() => {
        uploadProgress.style.display = 'none';
    }, 3000);
}

// ── Documents Management ──
async function loadDocuments() {
    try {
        const response = await fetch('/documents');
        const data = await response.json();

        totalChunksEl.textContent = `${data.total_chunks} chunks`;

        if (data.documents.length === 0) {
            documentsList.innerHTML = `
                <div class="empty-docs">
                    <span>📭</span>
                    <p>No documents uploaded yet</p>
                </div>
            `;
            return;
        }

        documentsList.innerHTML = data.documents.map(doc => `
            <div class="doc-item" data-name="${doc.name}">
                <div class="doc-info">
                    <span class="doc-icon">${doc.name.endsWith('.pdf') ? '📕' : '📄'}</span>
                    <div class="doc-details">
                        <div class="doc-name" title="${doc.name}">${doc.name}</div>
                        <div class="doc-meta">${doc.chunks} chunks · ${doc.size_formatted}</div>
                    </div>
                </div>
                <button class="doc-delete" onclick="deleteDocument('${doc.name}')" title="Remove">🗑</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

async function deleteDocument(filename) {
    if (!confirm(`Delete "${filename}" and all its indexed chunks?`)) return;

    try {
        const response = await fetch(`/documents/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
        const data = await response.json();
        showNotification(`🗑 ${data.message}`, 'info');
        loadDocuments();
    } catch (error) {
        showNotification('❌ Failed to delete document', 'error');
    }
}

// ── API Key ──
async function checkApiKeyStatus() {
    try {
        const response = await fetch('/api-key');
        const data = await response.json();
        if (data.has_key) {
            apiKeyStatus.textContent = '✅ API key is configured';
            apiKeyStatus.style.color = 'var(--success)';
            apiKeyInput.placeholder = '••••••••  (key is set)';
        }
    } catch (e) {
        // Ignore
    }
}

async function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showNotification('❌ Please enter an API key', 'error');
        return;
    }

    saveApiKeyBtn.disabled = true;
    saveApiKeyBtn.textContent = 'Saving...';

    try {
        const response = await fetch('/api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await response.json();

        if (response.ok) {
            showNotification('✅ API key saved successfully', 'success');
            apiKeyInput.value = '';
            apiKeyInput.placeholder = '••••••••  (key is set)';
            apiKeyStatus.textContent = '✅ API key is configured';
            apiKeyStatus.style.color = 'var(--success)';
            saveApiKeyBtn.classList.add('saved');
            saveApiKeyBtn.textContent = '✅ Saved';
            setTimeout(() => {
                saveApiKeyBtn.classList.remove('saved');
                saveApiKeyBtn.textContent = 'Save Key';
            }, 2000);
        } else {
            showNotification(`❌ ${data.error}`, 'error');
            saveApiKeyBtn.textContent = 'Save Key';
        }
    } catch (error) {
        showNotification('❌ Failed to save API key', 'error');
        saveApiKeyBtn.textContent = 'Save Key';
    }

    saveApiKeyBtn.disabled = false;
}

// ── Chat ──
async function sendMessage() {
    const query = queryInput.value.trim();
    if (!query || isGenerating) return;

    // Hide welcome screen
    welcomeScreen.style.display = 'none';

    // Add user message
    addMessage('user', query);

    // Clear input
    queryInput.value = '';
    queryInput.style.height = 'auto';

    // Show loading
    isGenerating = true;
    sendBtn.disabled = true;
    setStatus('Thinking...');
    const loadingEl = addLoadingMessage();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        const data = await response.json();

        // Remove loading
        loadingEl.remove();

        if (response.ok) {
            addMessage('assistant', data.answer, data.intent, data.sources);
        } else {
            addMessage('assistant', `❌ **Error:** ${data.error}`);
        }

    } catch (error) {
        loadingEl.remove();
        addMessage('assistant', '❌ **Connection Error**\n\nCould not reach the server. Please make sure the Flask server is running.');
    }

    isGenerating = false;
    sendBtn.disabled = false;
    setStatus('Ready');
}

function addMessage(role, content, intent = null, sources = []) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const avatar = role === 'user' ? '👤' : '🎓';

    let intentBadge = '';
    if (intent && intent !== 'error') {
        const intentLabels = {
            topic_explanation: '📚 Topic Explanation',
            comparison: '📊 Comparison',
            question_solving: '📝 Question Solving',
            roadmap: '📈 Study Roadmap',
            summary: '📋 Summary',
        };
        intentBadge = `<span class="intent-badge ${intent}">${intentLabels[intent] || intent}</span>`;
    }

    let sourcesTags = '';
    if (sources && sources.length > 0) {
        sourcesTags = `
            <div class="source-tags">
                ${sources.map(s => `<span class="source-tag">📄 ${s.name} (p.${s.page})</span>`).join('')}
            </div>
        `;
    }

    const parsedContent = role === 'assistant' ? marked.parse(content) : escapeHtml(content);

    messageEl.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            ${intentBadge}
            ${role === 'user' ? `<p>${parsedContent}</p>` : parsedContent}
            ${sourcesTags}
        </div>
    `;

    messagesEl.appendChild(messageEl);
    scrollToBottom();
}

function addLoadingMessage() {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.innerHTML = `
        <div class="message-avatar">🎓</div>
        <div class="message-content">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    messagesEl.appendChild(messageEl);
    scrollToBottom();
    return messageEl;
}

async function clearChat() {
    try {
        await fetch('/clear-history', { method: 'POST' });
    } catch (e) {
        // Ignore
    }
    messagesEl.innerHTML = '';
    welcomeScreen.style.display = 'flex';
    showNotification('🗑 Chat history cleared', 'info');
}

// ── Utilities ──
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function setStatus(text) {
    statusText.textContent = text;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Create a temporary notification
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 0.85rem;
        font-family: 'Inter', sans-serif;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        max-width: 360px;
        backdrop-filter: blur(12px);
        border: 1px solid;
    `;

    const colors = {
        success: { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
        error: { bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.3)', text: '#f87171' },
        info: { bg: 'rgba(108, 99, 255, 0.12)', border: 'rgba(108, 99, 255, 0.3)', text: '#8b83ff' },
    };

    const c = colors[type] || colors.info;
    notif.style.background = c.bg;
    notif.style.borderColor = c.border;
    notif.style.color = c.text;
    notif.textContent = message;

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}
