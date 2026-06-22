import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function IntroAnimation({ onComplete }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => {
      if (onComplete) onComplete();
    }, 1500);

    return () => { 
      clearTimeout(t1); 
      clearTimeout(t2); 
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ 
        opacity: 0, 
        scale: 1.05, 
        filter: 'blur(20px)',
        transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, ' + (localStorage.getItem('theme') === 'light' ? '#f8fafc' : '#06060a') + ')',
      }}
      aria-hidden="true"
    >
      {/* Background orbs */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute',
          top: '20%', left: '15%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, var(--accent-text) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(100px)',
          opacity: 0.3,
          animation: 'introOrb1 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '10%', right: '10%',
          width: 450, height: 450,
          background: 'radial-gradient(circle, var(--accent-2) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(100px)',
          opacity: 0.25,
          animation: 'introOrb2 10s ease-in-out infinite',
        }} />
      </div>

      {/* Logo Container */}
      <div style={{
        transform: phase >= 1 ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'all 0.6s cubic-bezier(0.23, 1, 0.32, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        <div style={{
          width: 100, height: 100,
          position: 'relative',
          filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))',
        }}>
          <img 
            src="/AskiFy_Logo.png" 
            alt="AskiFy" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
        </div>

        <div style={{ overflow: 'hidden' }}>
          <h1 style={{
            fontFamily: "var(--font)",
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, var(--text-1) 0%, var(--text-3) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            transform: phase >= 2 ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.1s',
          }}>
            AskiFy
          </h1>
        </div>

        <p style={{
          fontFamily: "var(--font)",
          fontSize: '0.85rem',
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-4)',
          margin: 0,
          opacity: phase >= 2 ? 1 : 0,
          transform: phase >= 2 ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.2s',
        }} className="shimmer-text">
          Professional AI Assistant
        </p>
      </div>

      {/* Minimal Progress Bar */}
      <div style={{
        width: 180, height: 3,
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 10,
        marginTop: 48,
        overflow: 'hidden',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'opacity 0.3s ease',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          width: phase >= 2 ? '100%' : '10%',
          transition: 'width 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
          boxShadow: '0 0 15px var(--accent)',
        }} />
      </div>

      <style>{`
        .shimmer-text {
          background: linear-gradient(90deg, var(--text-4) 0%, var(--text-2) 50%, var(--text-4) 100%);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          animation: shimmer 2s linear infinite;
        }

        @keyframes shimmer {
          to { background-position: 200% center; }
        }

        @keyframes introOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, 30px) scale(1.1); }
        }

        @keyframes introOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, -20px) scale(1.15); }
        }
      `}</style>

    </motion.div>
  );
}