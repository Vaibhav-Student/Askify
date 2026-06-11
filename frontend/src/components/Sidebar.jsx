import { deleteDocument, clearHistory } from '../api';
import { FileText, RotateCcw, Trash2, X } from './Icons';

export default function Sidebar({
  onClearChat,
  sidebarOpen,
  onCloseSidebar,
  showNotification,
  chatHistory = [],
  onSwitchSession,
  onDeleteSession,
  documents = [],
  totalChunks = 0,
  loadDocuments,
}) {
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

  async function handleClearChat() {
    try {
      await clearHistory();
      onClearChat?.();
      showNotification('Chat history cleared', 'info');
    } catch {
      showNotification('Failed to clear chat', 'error');
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
                    <div className="sb-doc-info">
                      <span className="sb-doc-filename">{doc.name}</span>
                      <span className="sb-doc-meta">{doc.size_formatted}</span>
                    </div>
                    <button className="sb-doc-action" onClick={() => handleDelete(doc.name)} title="Delete Document">
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
          <div className="sb-section sb-history">
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
          <button className="sb-primary-btn" onClick={handleClearChat}>
            <RotateCcw size={15} />
            <span>New Session</span>
          </button>
        </div>
      </aside>
    </>
  );
}
