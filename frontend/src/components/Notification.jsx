import { useState, useCallback } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export function useNotification() {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((message, type = 'info') => {
    const id = Date.now();
    // Unsupported-feature notices stay visible a bit longer
    const duration = type === 'info' ? 6000 : 4000;
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, duration);
  }, []);

  return { notifications, showNotification };
}

const TOAST_STYLES = {
  success: {
    bg: 'rgba(34, 197, 94, 0.1)',
    border: 'rgba(34, 197, 94, 0.2)',
    text: '#4ade80',
    icon: '✓',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.2)',
    text: '#f87171',
    icon: '✕',
  },
  info: {
    bg: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.2)',
    text: '#a5b4fc',
    icon: 'ℹ',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.2)',
    text: '#fbbf24',
    icon: '⚠',
  },
};

export function NotificationContainer({ notifications }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      {notifications.map((n) => {
        const c = TOAST_STYLES[n.type] || TOAST_STYLES.info;
        return (
          <div
            key={n.id}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              fontSize: '0.82rem',
              fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
              fontWeight: 500,
              maxWidth: 380,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${c.border}`,
              background: c.bg,
              color: c.text,
              animation: 'slideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'auto',
              letterSpacing: '0.01em',
            }}
          >
            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{c.icon}</span>
            <span>{n.message}</span>
          </div>
        );
      })}
    </div>
  );
}

