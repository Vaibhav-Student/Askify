import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import IntroAnimation from './components/IntroAnimation';
import StudyHub from './components/StudyHub';
import { NotificationContainer, useNotification } from './components/Notification';
import { fetchDocuments } from './api';
import ErrorBoundary from './components/ErrorBoundary';
import { BookOpen, Sun, Moon } from './components/Icons';
import './App.css';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
    return [];
  });
  const [documents, setDocuments] = useState([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const { notifications, showNotification } = useNotification();
  
  // Study Hub States
  const [studyHubOpen, setStudyHubOpen] = useState(false);
  const [activeDocForViewer, setActiveDocForViewer] = useState(null);

  const handleIntroComplete = useCallback(() => setShowIntro(false), []);

  // Safety fallback: force hide intro after 2.5 seconds (matches IntroAnimation max)
  useEffect(() => {
    if (showIntro) {
      const timer = setTimeout(() => setShowIntro(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showIntro]);



  // Theme State
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);



  // Save history when it changes
  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  const toggleTheme = (e) => {
    if (!document.startViewTransition) {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark');
      return;
    }

    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
    });

    transition.ready.then(() => {
      // Animate new incoming view (only clip path reveal, no translation)
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ]
        },
        {
          duration: 650,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  const loadDocuments = useCallback(async () => {
    try {
      const data = await fetchDocuments();
      setDocuments(data.documents);
      setTotalChunks(data.total_chunks);
    } catch {
      showNotification('Could not load documents', 'error');
    }
  }, [showNotification]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);

  function handleClearChat() {
    if (messages.length > 0) {
      const newSession = {
        id: Date.now(),
        title: messages[0].content.substring(0, 30) + (messages[0].content.length > 30 ? '...' : ''),
        messages: messages,
        timestamp: new Date().toLocaleString(),
      };
      setChatHistory(prev => [newSession, ...prev]);
    }
    setMessages([]);
    setShowWelcome(true);
  }

  function handleSwitchSession(session) {
    setMessages(session.messages);
    setShowWelcome(false);
    setSidebarOpen(false);
  }

  function handleDeleteSession(sessionId) {
    setChatHistory(prev => prev.filter(s => s.id !== sessionId));
  }



  return (
    <ErrorBoundary
      fallback={(error, retry) => (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'var(--bg)',
          color: 'var(--text-1)',
          fontFamily: 'var(--font)',
          textAlign: 'center',
        }}>
          <svg style={{ width: 64, height: 64, color: 'var(--error)', marginBottom: '1.5rem' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '500px', marginBottom: '2rem', lineHeight: 1.6 }}>
            {error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={retry}
            style={{
              padding: '0.875rem 2rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M1 20l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Try Again
          </button>
        </div>
      )}
    >
      <>
        <AnimatePresence>
          {showIntro && (
            <IntroAnimation onComplete={handleIntroComplete} key="intro" />
          )}
        </AnimatePresence>

        {!showIntro && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}
          >
            <div className="animated-bg">
              <div className="orb-1"></div>
              <div className="orb-2"></div>
            </div>
            <div className={`top-action-dock ${studyHubOpen ? 'study-hub-open' : ''}`} aria-label="Workspace controls">
              <button
                  className={`study-hub-toggle ${studyHubOpen ? 'active' : ''}`}
                  title={studyHubOpen ? 'Hide Study Hub' : 'Show Study Hub'}
                  onClick={() => setStudyHubOpen(prev => !prev)}
                  aria-label={studyHubOpen ? 'Hide Study Hub' : 'Show Study Hub'}
                  aria-pressed={studyHubOpen}
                  type="button"
                >
                  <BookOpen size={18} />
                </button>

              <button
                  className="theme-toggle"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  onClick={(e) => toggleTheme(e)}
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                  type="button"
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>
            <Sidebar
              sidebarOpen={sidebarOpen}
              onCloseSidebar={() => setSidebarOpen(false)}
              onClearChat={handleClearChat}
              showNotification={showNotification}
              chatHistory={chatHistory}
              onSwitchSession={handleSwitchSession}
              onDeleteSession={handleDeleteSession}
              documents={documents}
              totalChunks={totalChunks}
              loadDocuments={loadDocuments}
            />
            <ChatArea
              messages={messages}
              setMessages={setMessages}
              showWelcome={showWelcome}
              setShowWelcome={setShowWelcome}
              onOpenSidebar={() => setSidebarOpen(true)}
              onToggleSidebar={() => setSidebarOpen(prev => !prev)}
              sidebarOpen={sidebarOpen}
              showNotification={showNotification}
              introComplete={!showIntro}
              theme={theme}
              toggleTheme={toggleTheme}
              onDocumentsChange={loadDocuments}
              documents={documents}
              totalChunks={totalChunks}
              studyHubOpen={studyHubOpen}
              onToggleStudyHub={() => setStudyHubOpen(prev => !prev)}
              activeDocForViewer={activeDocForViewer}
              setActiveDocForViewer={setActiveDocForViewer}
            />
            <StudyHub
              isOpen={studyHubOpen}
              onClose={() => setStudyHubOpen(false)}
              documents={documents}
              activeDocForViewer={activeDocForViewer}
              setActiveDocForViewer={setActiveDocForViewer}
              showNotification={showNotification}
            />
            <NotificationContainer notifications={notifications} />
          </motion.div>
        )}
      </>
    </ErrorBoundary>
  );
}
