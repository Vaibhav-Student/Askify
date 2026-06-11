import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import IntroAnimation from './components/IntroAnimation';
import StudyHub from './components/StudyHub';
import { NotificationContainer, useNotification } from './components/Notification';
import { fetchDocuments } from './api';
import './App.css';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const { notifications, showNotification } = useNotification();
  
  // Study Hub States
  const [studyHubOpen, setStudyHubOpen] = useState(false);
  const [activeDocForViewer, setActiveDocForViewer] = useState(null);

  const handleIntroComplete = useCallback(() => setShowIntro(false), []);

  // Theme State
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        setChatHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

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
    <>
      <div className="animated-bg">
        <div className="orb-1"></div>
        <div className="orb-2"></div>
      </div>
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
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
    </>
  );
}
