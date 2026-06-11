import { useState, useEffect } from 'react';

const ANIMATION_DURATION = 2800;

export default function IntroAnimation({ onComplete }) {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 100);
        const t2 = setTimeout(() => setPhase(2), 1200);
        const t3 = setTimeout(() => setPhase(3), 2200);
        const t4 = setTimeout(() => {
            if (onComplete) onComplete();
        }, ANIMATION_DURATION);

        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }, [onComplete]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                transition: 'all 1.2s cubic-bezier(0.23, 1, 0.32, 1)',
                opacity: phase >= 3 ? 0 : 1,
                transform: phase >= 3 ? 'scale(1.1)' : 'scale(1)',
                filter: phase >= 3 ? 'blur(20px)' : 'none',
                pointerEvents: phase >= 3 ? 'none' : 'auto',
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
                transition: 'all 1s cubic-bezier(0.23, 1, 0.32, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 24,
            }}>
                <div style={{
                    width: 120, height: 120,
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
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        background: 'linear-gradient(135deg, var(--text-1) 0%, var(--text-3) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0,
                        transform: phase >= 2 ? 'translateY(0)' : 'translateY(100%)',
                        transition: 'transform 0.8s cubic-bezier(0.23, 1, 0.32, 1) 0.2s',
                    }}>
                        AskiFy
                    </h1>
                </div>

                <p style={{
                    fontFamily: "var(--font)",
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'var(--text-4)',
                    margin: 0,
                    opacity: phase >= 2 ? 1 : 0,
                    transform: phase >= 2 ? 'translateY(0)' : 'translateY(10px)',
                    transition: 'all 0.8s cubic-bezier(0.23, 1, 0.32, 1) 0.4s',
                    position: 'relative',
                }} className="shimmer-text">
                    Professional AI Assistant
                </p>
            </div>

            {/* Minimal Progress Bar */}
            <div style={{
                width: 200, height: 3,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 10,
                marginTop: 64,
                overflow: 'hidden',
                opacity: phase >= 1 && phase < 3 ? 1 : 0,
                transition: 'opacity 0.5s ease',
                border: '1px solid rgba(255, 255, 255, 0.05)',
            }}>
                <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                    width: phase >= 2 ? '100%' : '20%',
                    transition: 'width 1.5s cubic-bezier(0.65, 0, 0.35, 1)',
                    boxShadow: '0 0 15px var(--accent)',
                }} />
            </div>

            <style>{`
                .shimmer-text {
                    background: linear-gradient(90deg, var(--text-4) 0%, var(--text-2) 50%, var(--text-4) 100%);
                    background-size: 200% auto;
                    color: transparent;
                    -webkit-background-clip: text;
                    animation: shimmer 3s linear infinite;
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

        </div>
    );
}
