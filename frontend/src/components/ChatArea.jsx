import { useState, useRef, useEffect, useMemo } from 'react';
import Message, { LoadingMessage } from './Message';
import { Menu, Send, BookOpen, BarChart3, FileText, TrendingUp, ClipboardList, Sparkles, Sun, Moon, X, UploadCloud, Plus, Folder, Edit2, Terminal, Activity } from './Icons';
import { AI_TOOLS, getDefaultModel } from '../config/toolsData';
import { uploadFile, deleteDocument } from '../api';
import { UploadEngine, UploadStatus, isSmallFile, formatBytes } from '../uploadEngine';
import { checkUnsupportedFeature } from '../featureGuard';

function parseAgenticStream(rawText) {
  const steps = [];
  let cleanContent = '';
  let hasAnswer = false;

  // Split raw text by lookahead of emojis: ⚡, 🤖, ⚙️, 📝, 📚
  const parts = rawText.split(/(?=⚡|🤖|⚙️|📝|📚)/g);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const firstChar = trimmed[0];
    const rest = trimmed.slice(1).trim();

    if (firstChar === '⚡') {
      steps.push({
        type: 'system',
        icon: '⚡',
        title: 'System Event',
        content: rest.replace(/^\*+|\*+$/g, '').trim()
      });
    } else if (firstChar === '🤖') {
      const titleMatch = rest.match(/^\*\*([^*]+)\*\*/);
      const title = titleMatch ? titleMatch[1].trim() : 'Agent Thinking';
      const body = titleMatch ? rest.slice(titleMatch[0].length).trim() : rest;
      steps.push({
        type: 'thought',
        icon: '🧠',
        title: title.replace(/^\*+|\*+$/g, '').trim(),
        content: body
      });
    } else if (firstChar === '⚙️') {
      const titleMatch = rest.match(/^\*\*([^*]+)\*\*/);
      const title = titleMatch ? titleMatch[1].trim() : 'Tool Call';
      const body = titleMatch ? rest.slice(titleMatch[0].length).trim() : rest;
      steps.push({
        type: 'tool',
        icon: '⚙️',
        title: title.replace(/^\*+|\*+$/g, '').trim(),
        content: body
      });
    } else if (firstChar === '📝') {
      const titleMatch = rest.match(/^\*\*([^*]+)\*\*/);
      const title = titleMatch ? titleMatch[1].trim() : 'Observation';
      const body = titleMatch ? rest.slice(titleMatch[0].length).trim() : rest;
      steps.push({
        type: 'observation',
        icon: '📝',
        title: title.replace(/^\*+|\*+$/g, '').trim(),
        content: body
      });
    } else if (firstChar === '📚') {
      hasAnswer = true;
      const answerBody = rest.replace(/^\*\*Answer:\*\*\s*/i, '').trim();
      cleanContent = answerBody;
    }
  }

  if (!hasAnswer) {
    cleanContent = '';
  }

  return { cleanContent, steps };
}

const DEFAULT_CHIPS = [
  { label: 'Explain Topic', icon: <BookOpen size={16} />, query: 'Explain ' },
  { label: 'Compare', icon: <BarChart3 size={16} />, query: 'Compare ' },
  { label: 'Solve Question', icon: <FileText size={16} />, query: 'Solve: ' },
  { label: 'Study Plan', icon: <TrendingUp size={16} />, query: 'Create a study roadmap for ' },
  { label: 'Summarize', icon: <ClipboardList size={16} />, query: 'Summarize ' },
];

const ALLOWED_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt', 'md',
  'jpg', 'jpeg', 'png', 'webp', 'svg'
];

const VIDEO_MAX_DURATION = 600; // 10 minutes in seconds

export default function ChatArea({
  messages,
  setMessages,
  showWelcome,
  setShowWelcome,
  onOpenSidebar,
  showNotification,
  theme,
  toggleTheme,
  onDocumentsChange,
  documents = [],
  totalChunks = 0,
  onToggleSidebar,
  sidebarOpen,
  introComplete,
  studyHubOpen,
  onToggleStudyHub,
  activeDocForViewer,
  setActiveDocForViewer
}) {
  const [query, setQuery] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [editingChip, setEditingChip] = useState(null);
  const [customChips, setCustomChips] = useState([]);
  const [showAddChip, setShowAddChip] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipQuery, setNewChipQuery] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const prewarmTimeoutRef = useRef(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const folderInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only turn off dragging if we actually leave the viewport/main area
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  const engine = useMemo(() => new UploadEngine({ chunkSize: 2 * 1024 * 1024 }), []);

  useEffect(() => {
    const saved = localStorage.getItem('custom_chips');
    if (saved) {
      try {
        setCustomChips(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse custom chips', e);
      }
    }
  }, []);

  const lastMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const container = document.querySelector('.conversation');
    if (!container) return;

    const currentCount = messages.length;
    const isNewMessage = currentCount !== lastMessageCountRef.current;
    lastMessageCountRef.current = currentCount;

    // Check if user is close to the bottom (within 120px)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    if (isNewMessage || isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showAddChip) {
          handleCloseAddChip();
        } else if (selectedChip) {
          setSelectedChip(null);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showAddChip, selectedChip]);

  useEffect(() => {
    if (messages.length === 0) {
      setIsGenerating(false);
      setStatus('');
    }
  }, [messages]);

  const allChips = useMemo(() => {
    return [...DEFAULT_CHIPS, ...customChips.map(c => ({
      ...c,
      icon: <Sparkles size={16} />,
      isCustom: true
    }))];
  }, [customChips]);

  function updateQueueItem(id, updates) {
    setUploadQueue(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item)),
    );
  }

  function removeQueueItem(id) {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  }



  async function handleFiles(files) {
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showNotification(`File type .${ext} is not supported. Please upload documents or images.`, 'error');
        continue;
      }

      const fileName = file.webkitRelativePath || file.name;
      const queueId = `${fileName}-${Date.now()}`;
      const queueItem = {
        id: queueId,
        name: fileName,
        size: file.size,
        progress: 0,
        status: UploadStatus.PENDING,
        uploadId: null,
      };

      setUploadQueue(prev => [...prev, queueItem]);

      if (isSmallFile(file)) {
        updateQueueItem(queueId, { status: UploadStatus.UPLOADING });
        try {
          await uploadFile(file);
          updateQueueItem(queueId, { status: UploadStatus.COMPLETE, progress: 1 });
          showNotification(`Processed ${file.name}`, 'success');
          onDocumentsChange?.();
          setTimeout(() => removeQueueItem(queueId), 3000);
        } catch (err) {
          updateQueueItem(queueId, { status: UploadStatus.FAILED });
          showNotification(`Error: ${err.message}`, 'error');
        }
      } else {
        try {
          const uploadId = await engine.uploadFile(file, {
            onProgress(progress) {
              updateQueueItem(queueId, { progress });
            },
            onStatusChange(status) {
              updateQueueItem(queueId, { status });
            },
            onComplete(result) {
              updateQueueItem(queueId, { status: UploadStatus.COMPLETE, progress: 1 });
              showNotification(result.message || `Processed ${file.name}`, 'success');
              onDocumentsChange?.();
              setTimeout(() => removeQueueItem(queueId), 3000);
            },
            onError(err) {
              updateQueueItem(queueId, { status: UploadStatus.FAILED });
              showNotification(`Error: ${err.message}`, 'error');
            },
          });
          updateQueueItem(queueId, { uploadId });
        } catch (err) {
          updateQueueItem(queueId, { status: UploadStatus.FAILED });
          showNotification(`Error: ${err.message}`, 'error');
        }
      }
    }
  }
  async function handleDeleteDocument(filename) {
    try {
      await deleteDocument(filename);
      showNotification('Document removed', 'success');
      onDocumentsChange(); // Refresh document list
    } catch (err) {
      showNotification(err.message || 'Failed to remove document', 'error');
    }
  }

  async function handleSend(overrideQuery = null) {
    const textToSend = typeof overrideQuery === 'string' ? overrideQuery : query;
    let finalQuery = textToSend;
    if (selectedChip) {
      const sep = (selectedChip.query.endsWith(' ') || selectedChip.query.endsWith('\n')) ? '' : ' ';
      finalQuery = `${selectedChip.query}${sep}${textToSend}`;
    }
    const trimmed = finalQuery.trim();
    if (!trimmed || isGenerating) return;

    // ── Unsupported Feature Guard ──────────────────────────────────────────
    // Check before any API call so we never burn a round-trip.
    const guardResult = checkUnsupportedFeature(trimmed);
    if (guardResult.detected) {
      const userMsg   = { role: 'user',      content: trimmed };
      const assistMsg = { role: 'assistant', content: guardResult.message, intent: 'unsupported', sources: [] };
      setMessages((prev) => [...prev, userMsg, assistMsg]);
      setQuery('');
      setSelectedChip(null);
      setShowWelcome(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      showNotification(
        `"${guardResult.feature.label}" isn't supported — see the response below.`,
        'info'
      );
      return;
    }
    // ───────────────────────────────────────────────────────────────────────

    const newUserMsg = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, newUserMsg]);
    setQuery('');
    setSelectedChip(null);
    setShowWelcome(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setIsGenerating(true);
    setStatus('Thinking...');

    let assistantMsg = { role: 'assistant', content: '', rawContent: '', steps: [], intent: '', sources: [] };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          provider: 'nvidia',
          model: 'google/gemma-3n-e4b-it',
          api_key: ''
        }),
      });

      if (!response.ok) {
        let errMsg = `Error ${response.status}`;
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch { /* response wasn't JSON */ }
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let lastUpdateTime = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.substring(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.token) {
              accumulatedContent += data.token;
              
              const { cleanContent, steps } = parseAgenticStream(accumulatedContent);
              
              assistantMsg.content = cleanContent;
              assistantMsg.rawContent = accumulatedContent;
              assistantMsg.steps = steps;

              const now = Date.now();
              if (now - lastUpdateTime > 45 || !cleanContent) {
                lastUpdateTime = now;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                });
              }
              setStatus('Generating...');
            }

            if (data.done) {
              const { cleanContent, steps } = parseAgenticStream(accumulatedContent);
              
              assistantMsg = { 
                ...assistantMsg, 
                content: cleanContent, 
                rawContent: accumulatedContent,
                steps: steps,
                intent: data.intent, 
                sources: data.sources || [] 
              };
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = assistantMsg;
                return updated;
              });
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr; // Re-throw real errors (from data.error)
            }
            console.warn('[SSE] Skipping malformed chunk:', jsonStr);
          }
        }
      }
    } catch (err) {
      const isNetworkError = err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch');
      
      const politeMessage = isNetworkError
        ? "We encountered a **Network Error** while reaching the server. We rely on an active internet connection to provide high-fidelity analysis. Please check your connection and then try sending your request again."
        : `We encountered an unexpected issue processing your request: **${err.message}**. Please try again.`;

      // If we already generated some content, append the notice nicely. If not, just show the polite message.
      const newContent = assistantMsg.content 
        ? assistantMsg.content + `\n\n---\n*${politeMessage}*` 
        : politeMessage;

      assistantMsg = { ...assistantMsg, content: newContent, intent: 'error' };
      
      showNotification(isNetworkError ? "Network connection interrupted." : "Request failed.", 'info');

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = assistantMsg;
        return updated;
      });
    }

    setIsGenerating(false);
    setStatus('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleDeleteMessage(index) {
    if (isGenerating) return;
    setMessages(prev => {
      const newMessages = [...prev];
      let deleteCount = 1;
      for (let i = index + 1; i < newMessages.length; i++) {
        if (newMessages[i].role === 'user') break;
        deleteCount++;
      }
      newMessages.splice(index, deleteCount);
      if (newMessages.length === 0) setShowWelcome(true);
      return newMessages;
    });
  }

  async function handleEditMessage(index, newContent) {
    if (isGenerating) return;

    // Remove the message being edited and everything after it
    setMessages(prev => prev.slice(0, index));

    // Resend the new content
    await handleSend(newContent);
  }

  function triggerPrewarm(val) {
    if (!val || val.trim().length < 4) return;
    const fullPrompt = selectedChip ? `${selectedChip.query}${selectedChip.query.endsWith(' ') || selectedChip.query.endsWith('\n') ? '' : ' '}${val}` : val;
    fetch('/api/prewarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: fullPrompt,
        provider: 'nvidia',
        model: 'google/gemma-3n-e4b-it',
        api_key: ''
      })
    }).catch(err => console.debug('Prewarm error:', err));
  }

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

    if (prewarmTimeoutRef.current) clearTimeout(prewarmTimeoutRef.current);
    if (val.trim().length >= 4) {
      prewarmTimeoutRef.current = setTimeout(() => {
        triggerPrewarm(val);
      }, 300);
    }
  }

  function handlePaste(e) {
    const pastedText = e.clipboardData.getData('text');
    triggerPrewarm(pastedText);
  }

  function handleButtonHover() {
    triggerPrewarm(query);
  }

  function handleChip(chip) {
    setSelectedChip(chip);
    textareaRef.current?.focus();
  }

  function handleStartEditChip(chip) {
    setEditingChip(chip);
    setNewChipLabel(chip.label);
    setNewChipQuery(chip.query);
    setShowAddChip(true);
  }

  function handleCloseAddChip() {
    setShowAddChip(false);
    setEditingChip(null);
    setNewChipLabel('');
    setNewChipQuery('');
  }

  function handleAddCustomChip() {
    if (!newChipLabel.trim() || !newChipQuery.trim()) return;
    
    if (editingChip) {
      // Editing existing chip
      const updated = customChips.map(c => 
        c.label === editingChip.label ? { label: newChipLabel.trim(), query: newChipQuery.trim() } : c
      );
      setCustomChips(updated);
      localStorage.setItem('custom_chips', JSON.stringify(updated));
      showNotification(`Template "${newChipLabel.trim()}" updated!`, 'success');
      
      // If the edited template was currently selected, update it
      if (selectedChip?.label === editingChip.label) {
        setSelectedChip({
          label: newChipLabel.trim(),
          query: newChipQuery.trim(),
          icon: selectedChip.icon,
          isCustom: true
        });
      }
    } else {
      // Adding new chip
      const newChip = { label: newChipLabel.trim(), query: newChipQuery.trim() };
      const updated = [...customChips, newChip];
      setCustomChips(updated);
      localStorage.setItem('custom_chips', JSON.stringify(updated));
      showNotification(`New template "${newChipLabel.trim()}" added!`, 'success');
    }
    
    handleCloseAddChip();
  }

  function deleteCustomChip(label) {
    const updated = customChips.filter(c => c.label !== label);
    setCustomChips(updated);
    localStorage.setItem('custom_chips', JSON.stringify(updated));
    if (selectedChip?.label === label) setSelectedChip(null);
    showNotification('Template deleted', 'info');
  }

  return (
    <main 
      className="main-content"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-container">
            <UploadCloud size={48} className="glow-purple spin-pulse" style={{ color: 'var(--accent)' }} />
            <h3>Drop your study materials here</h3>
            <p>Index documents directly into your academic workspace</p>
          </div>
        </div>
      )}

      {/* Floating sidebar toggle */}
      <button
        className="sidebar-toggle-float"
        onClick={onToggleSidebar}
        aria-label="Toggle Sidebar"
        title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
      >
        <Menu size={18} />
      </button>

      {/* Floating Study Hub toggle */}
      <button
        className={`study-hub-toggle ${studyHubOpen ? 'active' : ''}`}
        onClick={onToggleStudyHub}
        aria-label="Toggle Study Hub"
        title={studyHubOpen ? "Hide Study Hub" : "Show Study Hub"}
      >
        <BookOpen size={18} />
      </button>

      {/* Floating theme toggle */}
      <button
        className="theme-toggle"
        onClick={(e) => toggleTheme(e)}
        aria-label="Toggle Theme"
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Navbar hidden but preserved */}
      <header className="topbar" style={{ display: 'none' }}>
        <div className="topbar-left">
          <button className="topbar-menu" onClick={onOpenSidebar} aria-label="Menu">
            <Menu size={20} />
          </button>
          <div className="topbar-brand">
            <img src="/AskiFy_Logo.png" alt="AskiFy" className="topbar-logo" />
          </div>
        </div>
        <div className="topbar-center">
        </div>
        <div className="topbar-status">
        </div>
      </header>

      {/* Conversation */}
      <div className={`conversation ${showWelcome ? 'welcome-mode' : ''} ${showAddChip ? 'modal-open' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="conversation-inner">
          {showWelcome && (
            <div className={`welcome ${introComplete ? 'animate-in' : ''}`}>
              <div className="welcome-badge">
                <Sparkles size={12} style={{ marginRight: '6px' }} />
                AI Academic Assistant
              </div>
              <h2 className="welcome-heading">What can I help you study?</h2>
              <p className="welcome-sub">Upload your materials and ask anything — explanations, comparisons, solutions, study plans.</p>
              
              <div className="welcome-dropzone" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={32} className="dropzone-icon" />
                <span className="dropzone-title">Drag & drop files here to index</span>
                <span className="dropzone-subtitle">Supports PDF, DOC, DOCX, PPTX, XLSX, TXT, MD, JPG, JPEG, PNG, WEBP, SVG (Max 500MB)</span>
              </div>

              <div className="welcome-grid">
                {allChips.map((chip) => (
                  <div key={chip.label} className="welcome-card-wrapper" style={{ position: 'relative' }}>
                    <button className="welcome-card" onClick={() => handleChip(chip)}>
                      <span className="welcome-card-icon">{chip.icon}</span>
                      <span className="welcome-card-label">{chip.label}</span>
                    </button>
                    {chip.isCustom && (
                      <>
                        <button 
                          className="chip-edit-float" 
                          onClick={(e) => { e.stopPropagation(); handleStartEditChip(chip); }}
                          title="Edit template"
                        >
                          <Edit2 size={10} />
                        </button>
                        <button 
                          className="chip-delete-float" 
                          onClick={(e) => { e.stopPropagation(); deleteCustomChip(chip.label); }}
                          title="Delete template"
                        >
                          <X size={10} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                <button className="welcome-card add-chip-card" onClick={() => setShowAddChip(true)}>
                  <span className="welcome-card-icon"><Sparkles size={16} /></span>
                  <span className="welcome-card-label">+ New Box</span>
                </button>
              </div>
            </div>
          )}

          <div className="messages">
            {messages.map((msg, i) => (
              <Message
                key={i}
                role={msg.role}
                content={msg.content}
                intent={msg.intent}
                sources={msg.sources}
                onDelete={() => handleDeleteMessage(i)}
                onEdit={(newContent) => handleEditMessage(i, newContent)}
                onSourceClick={(sourceName) => {
                  setActiveDocForViewer({ name: sourceName, highlightText: msg.content.substring(0, 120) });
                  if (!studyHubOpen) onToggleStudyHub();
                }}
              />
            ))}
            {isGenerating && (!messages.length || messages[messages.length - 1].content === '') && <LoadingMessage />}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="composer">
        <div className={`composer-inner ${introComplete ? 'animate-in' : ''}`}>
          {!showWelcome && !selectedChip && (
            <div className="composer-chips">
              {allChips.map((chip) => (
                <div key={chip.label} className="chip-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="chip" onClick={() => handleChip(chip)}>
                    {chip.icon} {chip.label}
                  </button>
                  {chip.isCustom && (
                    <>
                      <button 
                        className="chip-edit-btn" 
                        onClick={(e) => { e.stopPropagation(); handleStartEditChip(chip); }}
                        title="Edit"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button 
                        className="chip-delete-btn" 
                        onClick={(e) => { e.stopPropagation(); deleteCustomChip(chip.label); }}
                        title="Delete"
                      >
                        <X size={10} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button className="chip add-chip-btn" onClick={() => setShowAddChip(true)}>
                + Add
              </button>
            </div>
          )}
          
          {status && (
            <div className="composer-status">
              <Sparkles size={12} className="status-icon" />
              <span>{status}</span>
            </div>
          )}

          {documents.length > 0 && (
            <div className="composer-knowledge-panel">
              <div className="composer-knowledge-chips">
                {documents.map(doc => (
                  <div key={doc.name} className="knowledge-chip" title={`${doc.name} (${doc.size_formatted})`}>
                    <FileText size={12} />
                    <span className="knowledge-chip-name">{doc.name}</span>
                    <button 
                      className="knowledge-chip-remove" 
                      onClick={() => handleDeleteDocument(doc.name)}
                      title="Remove document"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="composer-knowledge-summary">
                <FileText size={12} />
                <span>{documents.length} documents indexed ({totalChunks} units of knowledge)</span>
              </div>
            </div>
          )}
          
          {uploadQueue.length > 0 && (

            <div className="composer-upload-queue">
              {uploadQueue.map(item => (
                <div key={item.id} className={`composer-upload-item status-${item.status.toLowerCase()}`}>
                  <div className="upload-item-info">
                    <span className="upload-item-name">{item.name}</span>
                    <span className="upload-item-percent">{Math.round(item.progress * 100)}%</span>
                  </div>
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" style={{ width: `${item.progress * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}



          <div className="composer-box">
            <div className="composer-upload-container">
              <button 
                className={`composer-upload-btn ${showUploadMenu ? 'active' : ''}`} 
                onClick={() => setShowUploadMenu(!showUploadMenu)}
                title="Upload"
                type="button"
              >
                <Plus size={16} />
              </button>
              
              {showUploadMenu && (
                <>
                  <div className="upload-menu-overlay" onClick={() => setShowUploadMenu(false)} />
                  <div className="composer-upload-menu">
                    <button onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}>
                      <FileText size={16} />
                      <span>Upload Files</span>
                    </button>
                    <button onClick={() => { folderInputRef.current?.click(); setShowUploadMenu(false); }}>
                      <Folder size={16} />
                      <span>Upload Folder</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              multiple 
              hidden 
              accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.md,.jpg,.jpeg,.png,.webp,.svg"
              onChange={(e) => {
                if (e.target.files.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input 
              type="file" 
              ref={folderInputRef} 
              webkitdirectory="" 
              mozdirectory="" 
              hidden 
              onChange={(e) => {
                if (e.target.files.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {selectedChip && (
              <div className="composer-selected-chip">
                <span className="chip-icon">{selectedChip.icon}</span>
                <span className="chip-label">{selectedChip.label}</span>
                <button 
                  className="chip-close" 
                  onClick={() => setSelectedChip(null)}
                  title="Remove template"
                >
                  <X size={10} />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              placeholder={selectedChip ? "Add details..." : "Ask about your study materials…"}
              rows="1"
              value={query}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
            <button 
              className="send-btn" 
              onClick={() => handleSend()} 
              disabled={isGenerating || (!query.trim() && !selectedChip)} 
              title="Send"
              onMouseEnter={handleButtonHover}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Custom Chip Modal */}
      {showAddChip && (
        <div className="modal-overlay" onClick={handleCloseAddChip}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingChip ? 'Edit Custom Template' : 'Create Custom Template'}</h3>
              <button className="modal-close" onClick={handleCloseAddChip}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Label</label>
                <input 
                  type="text" 
                  placeholder="e.g. Write Code" 
                  value={newChipLabel} 
                  onChange={e => setNewChipLabel(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Prompt Template (Prefix)</label>
                <textarea 
                  placeholder="e.g. Write a clean React component for..."
                  value={newChipQuery} 
                  onChange={e => setNewChipQuery(e.target.value)}
                  style={{ height: '80px', paddingTop: '10px' }}
                />
              </div>
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button 
                  className="modal-submit" 
                  onClick={handleAddCustomChip}
                  disabled={!newChipLabel.trim() || !newChipQuery.trim()}
                  style={{ flex: 1 }}
                >
                  {editingChip ? 'Save Changes' : 'Create Box'}
                </button>
                <button 
                  type="button"
                  className="modal-cancel" 
                  onClick={handleCloseAddChip}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
