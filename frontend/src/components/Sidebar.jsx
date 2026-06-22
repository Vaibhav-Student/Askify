import { useState } from 'react';
import { deleteDocument, clearHistory } from '../api';
import { FileText, RotateCcw, Trash2, X, AlertTriangle } from './Icons';

export function getShortDocumentName(filename) {
  if (!filename) return '';
  let base = filename.replace(/\.[^.]+$/, "");
  base = base.replace(/^\d+[_-]/, "");
  base = base.replace(/[_-]/g, " ").trim();
  if (base.includes(" - ")) {
    const parts = base.split(" - ");
    base = parts[parts.length - 1].trim();
  } else if (base.includes(" -")) {
    const parts = base.split(" -");
    base = parts[parts.length - 1].trim();
  } else if (base.includes("- ")) {
    const parts = base.split("- ");
    base = parts[parts.length - 1].trim();
  }
  return base;
}

export default function Sidebar({
  onClearChat,
  sidebarOpen,
  onCloseSidebar,
  showNotification,
  chatHistory = [],
  onSwitchSession,
  onDeleteSession,
  documents = [],
  loadDocuments,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleDelete(filename) {
    if (!confirm(`Delete "${filename}" and all its indexed chunks?`)) return;
    try {
      await deleteDocument(filename);
      showNotification('Document deleted', 'success');
      loadDocuments?.();
    } catch {
      showNotification('Failed to delete document', 'error');
    }
  }

  async function handleClearSession() {
    setClearing(true);
    try {
      // 1. Clear chat history
      await clearHistory();
      onClearChat?.();

      // 2. Delete all uploaded documents sequentially
      for (const doc of documents) {
        try {
          await deleteDocument(doc.name);
        } catch {
          /* continue even if one fails */
        }
      }
      loadDocuments?.();
      showNotification('Session cleared — chat & documents removed', 'info');
    } catch {
      showNotification('Failed to clear session', 'error');
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      {sidebarOpen && <div className="sb-overlay" onClick={onCloseSidebar} />}
      <aside className={`sb-sidebar ${sidebarOpen ? 'sb-open' : ''}`}>
        {/* Header / Brand */}
        <div className="sb-header">
          <div className="sb-brand">
            <div className="sb-logo-container">
              <img src="/AskiFy_Logo.png" alt="AskiFy" className="sb-logo" />
              <span className="sb-brand-name">AskiFy</span>
            </div>
          </div>
          <button className="sb-mobile-close" onClick={onCloseSidebar}>
            <X size={18} />
          </button>
        </div>

        <div className="sb-content">
          {/* Document Library */}
          <div className="sb-section sb-library">
            <div className="sb-section-title">
              <FileText size={13} />
              <span>History</span>
            </div>

            <div className="sb-doc-container">
              {documents.length === 0 ? (
                <div className="sb-empty-state">
                  <p>No documents indexed yet</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <div className="sb-doc-item" key={doc.name}>
                    <div className="sb-doc-info" title={doc.name}>
                      <span className="sb-doc-filename">{getShortDocumentName(doc.name)}</span>
                      <span className="sb-doc-meta">{doc.size_formatted}</span>
                    </div>
                    <button className="sb-doc-action" title="Delete Document" onClick={() => handleDelete(doc.name)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Chats Section */}
        {chatHistory.length > 0 && (
          <div className="sb-section sb-history" style={{ padding: '0 20px 12px' }}>
            <div className="sb-section-title">
              <RotateCcw size={13} />
              <span>Recent Chats</span>
            </div>
            <div className="sb-history-list">
              {chatHistory.map((session) => (
                <div className="sb-history-item" key={session.id}>
                  <button
                    className="sb-history-link"
                    onClick={() => onSwitchSession(session)}
                  >
                    <span className="sb-history-title">{session.title}</span>
                    <span className="sb-history-date">{session.timestamp}</span>
                  </button>
                  <button
                    className="sb-history-delete"
                    onClick={() => onDeleteSession(session.id)}
                    title="Delete Session"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="sb-footer">
          <button className="sb-primary-btn sb-clear-btn" onClick={() => setShowConfirm(true)}>
            <Trash2 size={15} />
            <span>Clear Session</span>
          </button>
        </div>
      </aside>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-modal">
            <div className="confirm-icon">
              <AlertTriangle size={28} />
            </div>
            <h3 id="confirm-title" className="confirm-title">Clear Session?</h3>
            <p className="confirm-body">
              This will permanently delete your <strong>chat history</strong> and all{' '}
              <strong>uploaded documents</strong>. This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setShowConfirm(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="confirm-danger"
                onClick={handleClearSession}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
