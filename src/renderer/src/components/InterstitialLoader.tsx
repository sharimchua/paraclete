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
            background: 'rgba(2, 6, 23, 0.8)',
            backdropFilter: 'blur(24px)',
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'all' : 'none',
            transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            color: 'white'
        }}>
            {/* Animated Core */}
            <div style={{ position: 'relative', width: '200px', height: '200px', marginBottom: '48px' }}>
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    border: '2px solid var(--primary)',
                    borderRadius: '50%',
                    opacity: 0.2,
                    animation: 'pulse 3s infinite'
                }} />
                <div style={{
                    position: 'absolute',
                    inset: '20px',
                    border: '1px solid var(--secondary)',
                    borderRadius: '50%',
                    opacity: 0.3,
                    animation: 'pulse 3s infinite reverse'
                }} />
                <div style={{
                    position: 'absolute',
                    inset: '40px',
                    background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
                    borderRadius: '50%',
                    filter: 'blur(10px)',
                    opacity: 0.5,
                }} />
                <div style={{
                    position: 'absolute',
                    inset: '60px',
                    background: 'var(--primary)',
                    borderRadius: '50%',
                    boxShadow: '0 0 40px var(--primary)',
                    animation: 'core-glow 2s infinite alternate ease-in-out'
                }} />
                
                {/* Orbiting Elements */}
                {[0, 72, 144, 216, 288].map((angle, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: '8px',
                            height: '8px',
                            background: 'var(--primary)',
                            borderRadius: '50%',
                            boxShadow: '0 0 10px var(--primary)',
                            transform: `rotate(${angle}deg) translate(100px) rotate(-${angle}deg)`,
                            animation: `orbit 10s infinite linear`
                        }}
                    />
                ))}
            </div>

            <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 24px' }}>
                <h2 style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 800, 
                    letterSpacing: '4px', 
                    textTransform: 'uppercase',
                    marginBottom: '12px',
                    background: 'linear-gradient(135deg, white 0%, var(--primary) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    {title}
                </h2>
                <p style={{ 
                    color: 'var(--text-secondary)', 
                    fontSize: '0.95rem', 
                    marginBottom: '32px',
                    opacity: 0.8
                }}>
                    {subtitle}
                </p>

                <div style={{
                    height: '24px',
                    fontSize: '0.8rem',
                    color: 'var(--primary)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '1px',
                    opacity: 0.7,
                    transition: 'all 0.4s ease'
                }}>
                    {tasks[currentTaskIndex]}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulse {
                    0% { transform: scale(0.9); opacity: 0.1; }
                    50% { transform: scale(1.1); opacity: 0.4; }
                    100% { transform: scale(0.9); opacity: 0.1; }
                }
                @keyframes core-glow {
                    from { transform: scale(1); box-shadow: 0 0 20px var(--primary); }
                    to { transform: scale(1.1); box-shadow: 0 0 60px var(--primary), 0 0 100px var(--secondary-faded, rgba(129, 140, 248, 0.4)); }
                }
                @keyframes orbit {
                    from { transform: rotate(0deg) translate(100px) rotate(0deg); }
                    to { transform: rotate(360deg) translate(100px) rotate(-360deg); }
                }
            `}} />
        </div>
    );
};

export default InterstitialLoader;
