import { useState, useRef, useEffect, useMemo } from 'react';
import Lenis from 'lenis';
import Message, { LoadingMessage } from './Message';
import { Menu, Send, BookOpen, BarChart3, FileText, TrendingUp, ClipboardList, Sparkles, Sun, Moon, X, UploadCloud, Plus, Folder, Edit2 } from './Icons';
import { uploadFile, deleteDocument } from '../api';
import { UploadEngine, UploadStatus, isSmallFile } from '../uploadEngine';
import { checkUnsupportedFeature } from '../featureGuard';
import { AI_TOOLS } from '../config/toolsData';

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
    } else if (firstChar === '📚' || trimmed.startsWith('**Answer:**')) {
      hasAnswer = true;
      const answerBody = (firstChar === '📚' ? rest : trimmed)
        .replace(/^\*\*Answer:\*\*\s*/i, '')
        .replace(/^Answer:\s*/i, '')
        .trim();
      cleanContent = answerBody;
    }
  }

  if (!hasAnswer) {
    // Extremely robust fallback: if the model didn't output the 📚 symbol,
    // or we have raw content, we must display the response so the user is never left with an empty screen.
    // If there are no steps or no emojis at all, the entire rawText is the answer.
    if (steps.length === 0) {
      cleanContent = rawText;
    } else {
      // If there are step emojis but no 📚 symbol, let's treat the text of the last part as the answer,
      // or fall back to displaying the whole rawText as a robust backup.
      cleanContent = rawText;
    }
  }

  // Double-clean any leading answer marker from the beginning
  cleanContent = cleanContent
    .replace(/^\s*(\*\*)?Answer:(\*\*)?\s*/gi, '')
    .trim();

  return { cleanContent, steps };
}

const ICON_MAP = {
  BookOpen: <BookOpen size={16} />,
  BarChart3: <BarChart3 size={16} />,
  FileText: <FileText size={16} />,
  TrendingUp: <TrendingUp size={16} />,
  ClipboardList: <ClipboardList size={16} />,
  Sparkles: <Sparkles size={16} />
};

const DEFAULT_CHIPS = [
  { id: 'explain', label: 'Explain Topic', iconName: 'BookOpen', query: 'Explain ', tooltip: 'Get a clear, structured explanation of any topic with examples' },
  { id: 'compare', label: 'Compare', iconName: 'BarChart3', query: 'Compare ', tooltip: 'Compare two or more concepts side by side with a detailed table' },
  { id: 'solve', label: 'Solve Question', iconName: 'FileText', query: 'Solve: ', tooltip: 'Get step-by-step solutions to homework and practice problems' },
  { id: 'roadmap', label: 'Study Plan', iconName: 'TrendingUp', query: 'Create a study roadmap for ', tooltip: 'Generate a personalized study plan with milestones and timelines' },
  { id: 'summarize', label: 'Summarize', iconName: 'ClipboardList', query: 'Summarize ', tooltip: 'Get concise summaries of long documents or complex topics' },
  { id: 'gencode', label: 'GenCode', iconName: 'Sparkles', query: 'Generate clean, efficient code for ', tooltip: 'Generate production-ready code snippets in any language' },
  { id: 'brainstorm', label: 'Brainstorm', iconName: 'Sparkles', query: 'Brainstorm creative ideas for ', tooltip: 'Generate creative ideas, outlines, and mind maps for projects' },
  { id: 'keyconcepts', label: 'Key Concepts', iconName: 'Sparkles', query: 'Identify and explain the key concepts of ', tooltip: 'Extract and explain the most important concepts from any topic' },
  { id: 'quiz', label: 'Practice Quiz', iconName: 'Sparkles', query: 'Create a practice quiz for ', tooltip: 'Generate practice questions with answers and explanations' }
];

const ALLOWED_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt', 'md'
];

const VIDEO_MAX_DURATION = 600; // 10 minutes in seconds

const LOADING_PHASES = [
  { emoji: '🧠', text: 'Thinking...' },
  { emoji: '🔍', text: 'Analyzing...' },
  { emoji: '⚡', text: 'Processing...' },
  { emoji: '🤖', text: 'Generating...' },
  { emoji: '📝', text: 'Formatting...' },
  { emoji: '✨', text: 'Finalizing...' },
];

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
  setActiveDocForViewer
}) {
  const [query, setQuery] = useState('');
  const [selectedChip, setSelectedChip] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingChip, setEditingChip] = useState(null);
  const [chips, setChips] = useState(() => {
    const saved = localStorage.getItem('study_chips');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse study chips', e);
      }
    }
    return DEFAULT_CHIPS;
  });

  useEffect(() => {
    localStorage.setItem('study_chips', JSON.stringify(chips));
  }, [chips]);
  const [showAddChip, setShowAddChip] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipQuery, setNewChipQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showKnowledgePopup, setShowKnowledgePopup] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const textareaRef = useRef(null);
  const prewarmTimeoutRef = useRef(null);



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

  // Chips loaded inline via state initializer

  const lastMessageCountRef = useRef(messages.length);

  // Initialize Lenis smooth scroll on the conversation container
  useEffect(() => {
    const container = document.querySelector('.conversation');
    if (!container) return;

    const lenis = new Lenis({
      wrapper: container,
      content: container.querySelector('.conversation-inner'),
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      autoRaf: true,
    });

    window.lenis = lenis;

    return () => {
      lenis.destroy();
      window.lenis = null;
    };
  }, []);

  useEffect(() => {
    const container = document.querySelector('.conversation');
    if (!container) return;

    const currentCount = messages.length;
    const isNewMessage = currentCount !== lastMessageCountRef.current;
    lastMessageCountRef.current = currentCount;

    // Check if user is close to the bottom (within 120px)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    if (isNewMessage || isAtBottom) {
      if (window.lenis) {
        window.lenis.scrollTo(messagesEndRef.current, {
          duration: 0.8,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
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
    }
  }, [messages]);

  // Chips managed via chips state directly

  function updateQueueItem(id, updates) {
    setUploadQueue(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item)),
    );
  }

  function removeQueueItem(id) {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  }



  async function handleFiles(files) {
    const fileArray = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showNotification(`File type .${ext} is not supported.`, 'error');
        return false;
      }
      return true;
    });

    if (fileArray.length === 0) return;

    // Create all queue entries up-front so the panel appears immediately
    const entries = fileArray.map(file => {
      const fileName = file.webkitRelativePath || file.name;
      const queueId  = `${fileName}-${Date.now()}-${Math.random()}`;
      return { file, fileName, queueId };
    });

    setShowKnowledgePopup(true);

    setUploadQueue(prev => [
      ...prev,
      ...entries.map(({ fileName, queueId }) => ({
        id:       queueId,
        name:     fileName,
        size:     fileArray.find(f => (f.webkitRelativePath || f.name) === fileName)?.size ?? 0,
        progress: 0,
        status:   UploadStatus.PENDING,
        uploadId: null,
      })),
    ]);

    // Upload all files in parallel
    await Promise.allSettled(
      entries.map(async ({ file, queueId }) => {
        if (isSmallFile(file)) {
          updateQueueItem(queueId, { status: UploadStatus.UPLOADING });
          try {
            await uploadFile(file);
            updateQueueItem(queueId, { status: UploadStatus.COMPLETE, progress: 1 });
            showNotification(`✓ ${file.name} ready`, 'success');
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
                showNotification(result.message || `✓ ${file.name} ready`, 'success');
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
      }),
    );
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

    let assistantMsg = { role: 'assistant', content: '', rawContent: '', steps: [], intent: '', sources: [] };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          provider: 'nvidia',
          model: AI_TOOLS[0].models[0].id,
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
      let pendingUpdate = null;

      // Use requestAnimationFrame for smooth updates
      const flushPendingUpdate = () => {
        if (pendingUpdate) {
          setMessages(pendingUpdate);
          pendingUpdate = null;
        }
      };

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
              // Update at most every 100ms for smooth rendering
              if (now - lastUpdateTime > 100 || !cleanContent) {
                lastUpdateTime = now;
                pendingUpdate = (prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                };
                // Schedule flush on next frame
                requestAnimationFrame(flushPendingUpdate);
              }
              // Don't override loading animation status
            }

            if (data.done) {
              // Flush any pending update immediately
              if (pendingUpdate) {
                flushPendingUpdate();
              }
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
        model: AI_TOOLS[0].models[0].id,
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
      const updated = chips.map(c => 
        c.id === editingChip.id ? { ...c, label: newChipLabel.trim(), query: newChipQuery.trim() } : c
      );
      setChips(updated);
      showNotification(`Template "${newChipLabel.trim()}" updated!`, 'success');
      
      // If the edited template was currently selected, update it
      if (selectedChip?.id === editingChip.id) {
        setSelectedChip({
          ...selectedChip,
          label: newChipLabel.trim(),
          query: newChipQuery.trim()
        });
      }
    } else {
      // Adding new chip
      const newChip = { 
        id: `custom-${Date.now()}`,
        label: newChipLabel.trim(), 
        query: newChipQuery.trim(),
        iconName: 'Sparkles'
      };
      const updated = [...chips, newChip];
      setChips(updated);
      showNotification(`New template "${newChipLabel.trim()}" added!`, 'success');
    }
    
    handleCloseAddChip();
  }

  return (
    <main 
      className={`main-content ${studyHubOpen ? 'study-hub-open' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}
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
          className={`sidebar-toggle-float ${sidebarOpen ? 'sidebar-open-toggle-shift' : ''}`}
          title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
          onClick={onToggleSidebar}
          aria-label="Toggle Sidebar"
        >
          <Menu size={18} />
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
              <p className="welcome-sub">Ask anything — explanations, comparisons, solutions, study plans.</p>
              
              <div className="welcome-grid">
                {chips.map((chip) => (
                  <div key={chip.id} className="welcome-card-wrapper" style={{ position: 'relative' }}>
                    <button className="welcome-card" title={chip.tooltip} onClick={() => handleChip(chip)}>
                      <span className="welcome-card-icon">{ICON_MAP[chip.iconName] || <Sparkles size={16} />}</span>
                      <span className="welcome-card-label">{chip.label}</span>
                    </button>
                    <button 
                        className="chip-edit-float" 
                        title="Edit template"
                        onClick={(e) => { e.stopPropagation(); handleStartEditChip(chip); }}
                      >
                        <Edit2 size={10} />
                      </button>
                  </div>
                ))}
                <div className="welcome-card-wrapper" style={{ position: 'relative' }}>
                    <button className="welcome-card add-chip-card" title="Create your own custom prompt template" onClick={() => setShowAddChip(true)}>
                      <span className="welcome-card-icon"><Sparkles size={16} /></span>
                      <span className="welcome-card-label">+ New Box</span>
                    </button>
                  </div>
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
                isTyping={isGenerating && msg.role === 'assistant' && i === messages.length - 1}
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
              {chips.map((chip) => (
                <div key={chip.id} className="chip-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="chip" onClick={() => handleChip(chip)}>
                    {ICON_MAP[chip.iconName] || <Sparkles size={16} />} {chip.label}
                  </button>
                  <button 
                      className="chip-edit-btn" 
                      title="Edit"
                      onClick={(e) => { e.stopPropagation(); handleStartEditChip(chip); }}
                    >
                      <Edit2 size={10} />
                    </button>
                </div>
              ))}
              <button className="chip add-chip-btn" onClick={() => setShowAddChip(true)}>
                + Add
              </button>
            </div>
          )}
          


          {(documents.length > 0 || uploadQueue.length > 0) && (
            <div className="composer-knowledge-badge-container">
              <button 
                type="button"
                className="composer-knowledge-badge"
                onClick={() => setShowKnowledgePopup(!showKnowledgePopup)}
              >
                <FileText size={12} />
                <span>
                  {documents.length > 0 
                    ? `${documents.length} document${documents.length !== 1 ? 's' : ''} indexed${uploadQueue.length > 0 ? ` (${uploadQueue.length} uploading)` : ''}`
                    : `Uploading ${uploadQueue.length} document${uploadQueue.length !== 1 ? 's' : ''}...`
                  }
                </span>
              </button>
              
              {showKnowledgePopup && (
                <>
                  <div className="knowledge-popup-overlay" onClick={() => setShowKnowledgePopup(false)} />
                  <div className="composer-knowledge-popup">
                    <div className="knowledge-popup-header">
                      <span>Indexed Materials</span>
                      <span className="knowledge-chunks-badge">{totalChunks} chunks</span>
                    </div>
                    <div className="knowledge-popup-list">
                      {uploadQueue.map(item => {
                        const ext  = item.name.split('.').pop().toUpperCase();
                        const shortName = getShortDocumentName(item.name);
                        return (
                            <div key={item.id} title={item.name} className={`knowledge-popup-item uploading status-${item.status.toLowerCase()}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="doc-type-badge" data-ext={ext.toLowerCase()}>{ext}</span>
                                <span className="doc-popup-name" style={{ flex: 1 }}>{shortName}</span>
                                <span className="upload-item-percent" style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-text)' }}>
                                  {Math.round(item.progress * 100)}%
                                </span>
                              </div>
                              <div className="upload-progress-bar" style={{ height: '3px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div className="upload-progress-fill" style={{ width: `${item.progress * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', transition: 'width 0.3s ease' }} />
                              </div>
                            </div>
                          );
                      })}
                      {documents.map(doc => {
                        const ext  = doc.name.split('.').pop().toUpperCase();
                        const shortName = getShortDocumentName(doc.name);
                        return (
                          <div key={doc.name} title={doc.name} className="knowledge-popup-item">
                              <span className="doc-type-badge" data-ext={ext.toLowerCase()}>{ext}</span>
                              <span className="doc-popup-name">{shortName}</span>
                              <button
                                  type="button"
                                  className="doc-popup-remove"
                                  title="Remove"
                                  onClick={() => handleDeleteDocument(doc.name)}
                                >
                                  <X size={10} />
                                </button>
                            </div>
                          );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="composer-box">
            <button 
                type="button" 
                className="composer-upload-btn"
                title="Upload study materials"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={14} />
              </button>

            
            <input 
              type="file" 
              ref={fileInputRef} 
              multiple 
              hidden 
              accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.md"
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
                  <span className="chip-icon">{ICON_MAP[selectedChip.iconName] || <Sparkles size={16} />}</span>
                  <span className="chip-label">{selectedChip.label}</span>
                  <button 
                      className="chip-close" 
                      title="Remove template"
                      onClick={() => setSelectedChip(null)}
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
                title="Send"
                onClick={() => handleSend()} 
                disabled={isGenerating || (!query.trim() && !selectedChip)} 
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
