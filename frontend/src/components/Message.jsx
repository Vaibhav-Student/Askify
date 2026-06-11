import { marked } from 'marked';
import { useMemo, useState, useEffect, useRef } from 'react';
import { BookOpen, BarChart3, FileText, TrendingUp, ClipboardList, Copy, Check, Edit2, Trash2 } from './Icons';

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

export default function Message({ role, content, intent, sources, steps = [], onEdit, onDelete, onSourceClick }) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [stepsExpanded, setStepsExpanded] = useState(true); // Default expanded for visibility of agent features
  const bodyRef = useRef(null);

  const parsedContent = useMemo(() => {
    return role === 'assistant' ? marked.parse(content) : escapeHtml(content);
  }, [content, role]);

  useEffect(() => {
    if (!bodyRef.current || role !== 'assistant') return;

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
      button.addEventListener('click', (e) => {
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
      });

      pre.insertBefore(header, pre.firstChild);
    });
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

  return (
    <div className={`msg ${role}`}>
      <div className="msg-bubble">
        {!isEditing && (
          <div className="msg-actions">
            {role === 'user' && (
              <button className="msg-action-btn" onClick={() => setIsEditing(true)} title="Edit"><Edit2 size={13} /></button>
            )}
            <button className={`msg-action-btn ${copied ? 'success' : ''}`} onClick={handleCopy} title="Copy message">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {role === 'user' && (
              <button className="msg-action-btn delete" onClick={onDelete} title="Delete"><Trash2 size={13} /></button>
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
            {sources.map((s, i) => (
              <span 
                key={i} 
                className="msg-source-tag clickable" 
                onClick={() => onSourceClick && onSourceClick(s.name, s.page)}
                style={{ cursor: 'pointer' }}
                title="View in Study Hub"
              >
                <FileText size={11} /> {s.name}{s.page ? ` (p.${s.page})` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LoadingMessage() {
  const steps = [
    { emoji: '⚡', text: 'Agent Connecting' },
    { emoji: '🧠', text: 'Thinking' },
    { emoji: '🤖', text: 'Analyzing Context' },
    { emoji: '⚙️', text: 'Invoking Tools' },
    { emoji: '✨', text: 'Generating Output' }
  ];

  const [stepIndex, setStepIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStepIndex(1), 1000),
      setTimeout(() => setStepIndex(2), 2200),
      setTimeout(() => setStepIndex(3), 3600),
      setTimeout(() => setStepIndex(4), 4800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="msg assistant">
      <div className="msg-bubble" style={{ padding: '16px 20px', borderLeft: '3px solid var(--accent)' }}>
        <div className="agent-loading-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div 
            key={stepIndex} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              animation: 'stepFadeIn 0.3s ease-out forwards'
            }}
          >
            <div className="agent-loading-emoji" style={{
              fontSize: '1.2rem',
              animation: 'pulseScale 1.5s infinite ease-in-out',
              display: 'inline-block'
            }}>
              {steps[stepIndex].emoji}
            </div>
            <div className="agent-loading-text" style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-1)',
              fontFamily: 'var(--font)',
              letterSpacing: '0.01em'
            }}>
              {steps[stepIndex].text}{dots}
            </div>
          </div>
          <div className="typing-indicator" style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out' }}></span>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.2s' }}></span>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.4s' }}></span>
          </div>
        </div>
      </div>
    </div>
  );
}
