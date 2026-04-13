import React, { useState, useEffect } from 'react';

interface InterstitialLoaderProps {
    isOpen: boolean;
    title?: string;
    subtitle?: string;
    tasks?: string[];
}

const InterstitialLoader: React.FC<InterstitialLoaderProps> = ({ 
    isOpen, 
    title = "Processing", 
    subtitle = "Paraclete is structuring your insights",
    tasks = [
        "Initializing Neural Engine...",
        "Normalizing Semantics...",
        "Structuring Clinical Context...",
        "Optimizing Document Graph...",
        "Finalizing Synthesis..."
    ]
}) => {
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            const interval = setInterval(() => {
                setCurrentTaskIndex(prev => (prev + 1) % tasks.length);
            }, 2500);
            return () => clearInterval(interval);
        } else {
            const timeout = setTimeout(() => setIsVisible(false), 500);
            return () => clearTimeout(timeout);
        }
    }, [isOpen, tasks.length]);

    if (!isVisible && !isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 6, 23, 0.9)',
            backdropFilter: 'blur(32px)',
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'all' : 'none',
            transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            color: 'white'
        }}>
            {/* Paraclete Brand Motif - Dynamic Version */}
            <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '64px' }}>
                {/* Glow Background */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '180px',
                    height: '180px',
                    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                    animation: 'pulse-glow 4s infinite ease-in-out'
                }} />

                <svg 
                    width="120" 
                    height="120" 
                    viewBox="0 0 32 32" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                        filter: 'drop-shadow(0 0 20px rgba(99, 102, 241, 0.4))'
                    }}
                >
                    <defs>
                        <linearGradient id="inter-grad-practitioner" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0ea5e9" />
                        </linearGradient>
                        <linearGradient id="inter-grad-ai" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                    </defs>
                    
                    {/* Practitioner Bar - Persistent Growth */}
                    <rect 
                        x="6" y="2" width="8" rx="4" 
                        fill="url(#inter-grad-practitioner)" 
                        style={{
                            animation: 'inter-stem 3s infinite ease-in-out'
                        }}
                    />
                    
                    {/* AI Bar - High Frequency Iteration */}
                    <rect 
                        x="18" y="2" width="8" rx="4" 
                        fill="url(#inter-grad-ai)" 
                        style={{
                            animation: 'inter-ai 1.5s infinite ease-in-out',
                            transformOrigin: 'top center'
                        }}
                    />
                </svg>

                {/* Orbiting Insight Atoms */}
                {[0, 120, 240].map((_, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: '4px',
                            height: '4px',
                            background: i === 0 ? '#38bdf8' : '#818cf8',
                            borderRadius: '50%',
                            boxShadow: `0 0 10px ${i === 0 ? '#38bdf8' : '#818cf8'}`,
                            animation: `orbit-${i} 6s infinite linear`,
                        }}
                    />
                ))}
            </div>

            <div style={{ textAlign: 'center', maxWidth: '440px', padding: '0 32px' }}>
                <h2 style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 900, 
                    letterSpacing: '6px', 
                    textTransform: 'uppercase',
                    marginBottom: '16px',
                    background: 'linear-gradient(to right, #38bdf8, #818cf8)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    {title}
                </h2>
                <p style={{ 
                    color: 'var(--text-secondary)', 
                    fontSize: '0.95rem', 
                    lineHeight: '1.6',
                    marginBottom: '40px',
                    opacity: 0.7
                }}>
                    {subtitle}
                </p>

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{
                        height: '1px',
                        width: '40px',
                        background: 'linear-gradient(to right, transparent, var(--primary), transparent)',
                        marginBottom: '8px'
                    }} />
                    <div style={{
                        height: '24px',
                        fontSize: '0.75rem',
                        color: 'var(--primary)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                        opacity: 0.6,
                        transition: 'all 0.4s ease'
                    }}>
                        {tasks[currentTaskIndex]}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulse-glow {
                    0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(0.9); }
                    50% { opacity: 0.3; transform: translate(-50%, -50%) scale(1.1); }
                }
                @keyframes inter-stem {
                    0%, 100% { height: 28px; filter: brightness(1); }
                    50% { height: 24px; filter: brightness(0.8); }
                }
                @keyframes inter-ai {
                    0%, 100% { height: 18px; filter: brightness(1); transform: translateY(0); }
                    50% { height: 28px; filter: brightness(1.3); transform: translateY(2px); }
                }
                @keyframes orbit-0 {
                    from { transform: rotate(0deg) translate(80px) rotate(0deg); }
                    to { transform: rotate(360deg) translate(80px) rotate(-360deg); }
                }
                @keyframes orbit-1 {
                    from { transform: rotate(120deg) translate(90px) rotate(-120deg); }
                    to { transform: rotate(480deg) translate(90px) rotate(-480deg); }
                }
                @keyframes orbit-2 {
                    from { transform: rotate(240deg) translate(100px) rotate(-240deg); }
                    to { transform: rotate(600deg) translate(100px) rotate(-600deg); }
                }
            `}} />
        </div>
    );
};

export default InterstitialLoader;
