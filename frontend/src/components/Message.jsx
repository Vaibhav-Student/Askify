import { marked } from 'marked';
import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, BarChart3, FileText, TrendingUp, ClipboardList, Copy, Check, Edit2, Trash2 } from './Icons';

/** Convert raw source names like "1_Python_Fundamentals.pdf" → "Python Fundamentals" */
function formatSourceName(name) {
  if (!name) return 'Source';
  // Strip leading order prefix like "1_", "02_", etc.
  let clean = name.replace(/^\d+[_-]/, '');
  // Remove extension
  clean = clean.replace(/\.[^.]+$/, '');
  // Replace underscores/hyphens with spaces
  clean = clean.replace(/[_-]/g, ' ');
  // Title-case
  return clean.replace(/\b\w/g, (c) => c.toUpperCase()).trim() || name;
}

marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function ObservationContent({ content }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200;
  const displayText = expanded ? content : (isLong ? `${content.slice(0, 200)}...` : content);

  return (
    <div className="observation-wrapper">
      <pre className="observation-pre">{displayText}</pre>
      {isLong && (
        <button 
          type="button"
          className="observation-toggle-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : 'Show Full Observation'}
        </button>
      )}
    </div>
  );
}

function stripEmojis(text) {
  if (!text) return '';
  let result = text
    // Strip proper Unicode emoji codepoints
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    // Strip mojibake: Ã followed by high byte (double-encoded UTF-8)
    .replace(/\u00C3[\u0080-\u00FF]/g, '')
    // Strip remaining orphan high bytes from broken encoding
    .replace(/[\u00C0-\u00FF](?![a-zA-Z0-9])/g, ' ')
    // Strip invisible/zero-width chars
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2069\uFEFF]/g, '')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
  return result;
}

export default function Message({ role, content, sources, steps = [], onEdit, onDelete, onSourceClick, isTyping = false }) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [stepsExpanded, setStepsExpanded] = useState(true); // Default expanded for visibility of agent features
  const bodyRef = useRef(null);

  const parsedContent = useMemo(() => {
    return role === 'assistant' ? marked.parse(stripEmojis(content)) : escapeHtml(content);
  }, [content, role]);

  useEffect(() => {
    if (!bodyRef.current || role !== 'assistant') return;

    const buttonsWithListeners = [];

    const preElements = bodyRef.current.querySelectorAll('pre');
    preElements.forEach((pre) => {
      if (pre.querySelector('.code-header')) return;

      const codeElement = pre.querySelector('code');
      let lang = 'code';
      if (codeElement) {
        const langMatch = codeElement.className.match(/language-(\w+)/);
        if (langMatch) {
          lang = langMatch[1];
        }
      }

      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
        <span class="code-lang-name">${lang.toUpperCase()}</span>
        <button type="button" class="code-copy-action-btn">
          <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </button>
      `;

      const button = header.querySelector('.code-copy-action-btn');
      const copyHandler = (e) => {
        e.stopPropagation();
        const textToCopy = codeElement ? codeElement.innerText : pre.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
          button.innerHTML = `
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
          `;
          button.classList.add('copied');
          setTimeout(() => {
            button.innerHTML = `
              <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="12" width="12" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            `;
            button.classList.remove('copied');
          }, 2000);
        });
      };

      button.addEventListener('click', copyHandler);
      buttonsWithListeners.push({ button, handler: copyHandler });

      pre.insertBefore(header, pre.firstChild);
    });

    return () => {
      buttonsWithListeners.forEach(({ button, handler }) => {
        button.removeEventListener('click', handler);
      });
    };
  }, [parsedContent, role]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (editContent.trim() !== content && editContent.trim() !== '') {
      if (onEdit) onEdit(editContent.trim());
    } else {
      setEditContent(content);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(content);
  };

  // Hide empty assistant messages during generation — no extra box
  if (role === 'assistant' && (!content || !content.trim()) && isTyping) {
    return null;
  }

  return (
    <motion.div 
      className={`msg ${role} ${isTyping ? 'typing-focus' : ''}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="msg-bubble">
          {!isEditing && (
            <div className="msg-actions">
              {role === 'user' && (
                  <button className="msg-action-btn" title="Edit" onClick={() => setIsEditing(true)}><Edit2 size={13} /></button>
              )}
              <button className={`msg-action-btn ${copied ? 'success' : ''}`} title={copied ? 'Copied!' : 'Copy message'} onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              {role === 'user' && (
                <button className="msg-action-btn delete" title="Delete" onClick={onDelete}><Trash2 size={13} /></button>
              )}
            </div>
          )}

        {role === 'assistant' && steps && steps.length > 0 && (
          <div className="agent-steps-accordion">
            <button 
              type="button"
              className={`agent-steps-header-btn ${stepsExpanded ? 'expanded' : ''}`}
              onClick={() => setStepsExpanded(!stepsExpanded)}
            >
              <div className="agent-steps-header-title">
                <span className="pulse-dot green" />
                <span>Agent Operations Trace ({steps.length} actions)</span>
              </div>
              <span className="chevron-icon">{stepsExpanded ? '▼' : '▶'}</span>
            </button>
            
            {stepsExpanded && (
              <div className="agent-steps-timeline">
                {steps.map((step, idx) => (
                  <div key={idx} className={`agent-step-item ${step.type}`}>
                    <div className="agent-step-node">
                      <span className="agent-step-icon">{step.icon}</span>
                    </div>
                    <div className="agent-step-content-box">
                      <div className="agent-step-title">{step.title}</div>
                      {step.content && (
                        <div className="agent-step-body">
                          {step.type === 'tool' ? (
                            <pre className="terminal-pre"><code>{step.content}</code></pre>
                          ) : step.type === 'observation' ? (
                            <ObservationContent content={step.content} />
                          ) : (
                            <div className="thought-text">{step.content}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="msg-edit-mode">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="msg-edit-textarea"
              rows={Math.max(2, editContent.split('\n').length)}
              autoFocus
            />
            <div className="msg-edit-actions">
              <button className="btn-save btn-primary" onClick={handleSaveEdit}>Save & Submit</button>
              <button className="btn-cancel btn-secondary" onClick={handleCancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div ref={bodyRef} className="msg-body" dangerouslySetInnerHTML={{ __html: parsedContent }} />
        )}
        {sources && sources.length > 0 && (
          <div className="msg-sources">
            <div className="msg-sources-header">
              <FileText size={11} />
              <span>Sources</span>
            </div>
            <div className="msg-sources-list">
              {sources.map((s, i) => (
                <button
                    key={i}
                    type="button"
                    className="msg-source-card"
                    title={`Open ${s.name} in Study Hub`}
                    onClick={() => onSourceClick && onSourceClick(s.name, s.page)}
                  >
                    <span className="source-num">{i + 1}</span>
                    <FileText size={12} className="source-file-icon" />
                    <span className="source-display-name">{formatSourceName(s.name)}</span>
                    {s.page && <span className="source-page-pill">p.{s.page}</span>}
                  </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function LoadingMessage() {
  const steps = [
    { label: 'Thinking', emoji: '🧠', key: 'thinking' },
    { label: 'Analyzing', emoji: '🔍', key: 'analyzing' },
    { label: 'Generating', emoji: '🤖', key: 'generating' },
    { label: 'Responding', emoji: '💬', key: 'responding' }
  ];

  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStepIndex(1), 1200), // Thinking -> Analyzing
      setTimeout(() => setStepIndex(2), 2600), // Analyzing -> Generating
      setTimeout(() => setStepIndex(3), 4200), // Generating -> Responding
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const currentStep = steps[stepIndex];

  return (
    <motion.div 
      className="msg assistant loading-msg"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="msg-bubble agent-loading-bubble-inline" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 18px',
        borderRadius: '16px',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--text-1)',
        fontSize: '0.88rem',
        fontWeight: 600,
        margin: '8px 0',
        minWidth: '180px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span style={{ 
                fontSize: '1.05rem',
                display: 'inline-block',
                animation: 'pulseScale 1.5s infinite ease-in-out',
                fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', emoji",
                fontVariantEmoji: 'emoji',
              }}>
                {currentStep.emoji}
              </span>
              <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>
                {currentStep.label}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Micro-typing blink animation */}
        <div className="typing-indicator" style={{ display: 'flex', gap: '3px', marginLeft: 'auto' }}>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out' }}></span>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.2s' }}></span>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.4s' }}></span>
        </div>
      </div>
    </motion.div>
  );
}
