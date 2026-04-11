import React, { useState, useEffect, useCallback } from 'react';
import Logo from './Logo';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeToast, setActiveToast] = useState<Toast | null>(null);
    const [isExiting, setIsExiting] = useState(false);

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { id, message, type };
        setIsExiting(false);
        setActiveToast(newToast);
    }, []);

    useEffect(() => {
        // Handle auto-dismiss
        if (!activeToast || isExiting) return undefined;
        const timer = setTimeout(() => {
            setIsExiting(true);
        }, 5000);
        return () => clearTimeout(timer);
    }, [activeToast, isExiting]);

    useEffect(() => {
        // Handle unmount after exit animation
        if (!isExiting) return undefined;
        
        const timer = setTimeout(() => {
            setActiveToast(null);
            setIsExiting(false);
        }, 500); // 500ms allows the flip to finish
        
        return () => clearTimeout(timer);
    }, [isExiting]);

    useEffect(() => {
        const handleToast = (e: any) => {
            addToast(e.detail.message, e.detail.type);
        };
        window.addEventListener('paraclete-toast' as any, handleToast);
        return () => window.removeEventListener('paraclete-toast' as any, handleToast);
    }, [addToast]);

    return (
        <div className={`paraclete-app ${activeToast && !isExiting ? 'has-active-toast' : ''}`}>
            {children}
            
            {activeToast && (
                <div 
                    className="integrated-toast-container"
                    style={{
                        position: 'fixed',
                        top: '24px',
                        left: '16px', // Align with sidebar padding
                        width: '228px', // Sidebar (260) - padding (16*2)
                        zIndex: 10000,
                        pointerEvents: 'auto',
                    }}
                >
                    <div 
                        onClick={() => setIsExiting(true)}
                        className="toast-card"
                        style={{
                            background: 'rgba(15, 23, 42, 0.98)',
                            backdropFilter: 'blur(16px)',
                            border: `1px solid ${
                                activeToast.type === 'success' ? '#22c55e' : 
                                activeToast.type === 'error' ? '#ef4444' : 'var(--primary)'
                            }`,
                            padding: '16px',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>
                           <div style={{ width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                               <Logo isThinking={false} />
                           </div>
                           <span>{activeToast.type === 'error' ? 'Paraclete Alert' : 'Paraclete'}</span>
                        </div>
                        <div style={{ lineHeight: '1.4' }}>
                            {activeToast.message}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* Container for the logo area to allow card overlay */
                .logo-area {
                    position: relative;
                    min-height: 48px; /* Ensure space for the replacement card */
                    z-index: 1;
                    perspective: 1200px; /* Enable 3D space */
                    transform-style: preserve-3d;
                }

                .logo-area-content {
                    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-in;
                    transition-delay: 0.15s; /* Delay when flipping back in so toast can flip out first */
                    transform-origin: center center;
                    transform: rotateX(0deg);
                    opacity: 1;
                }

                /* When toast is active, flip the logo up and fade it backwards */
                .has-active-toast .logo-area-content {
                    transition-delay: 0s; /* No delay when flipping out */
                    transform: rotateX(90deg) scale(0.9);
                    opacity: 0;
                    pointer-events: none;
                }

                /* The Toast Container provides its own 3D space */
                .integrated-toast-container {
                    perspective: 1200px;
                    z-index: 10000;
                }

                /* The Toast Card itself */
                .toast-card {
                    transform-origin: top center;
                    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out;
                    transition-delay: 0s; /* No delay when flipping out */
                    /* Base state is flipped OUT (hidden state) */
                    transform: rotateX(-90deg) scale(0.9);
                    opacity: 0;
                }

                /* When toast is active, flip it IN */
                .has-active-toast .toast-card {
                    transform: rotateX(0deg) scale(1);
                    opacity: 1;
                    /* Add a slight delay so it flips in AFTER the logo flips out */
                    transition-delay: 0.15s; 
                }

                .has-active-toast .nav-section {
                    transform: translateY(16px);
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .nav-section {
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    transition-delay: 0.1s; /* Slight delay when retracting to avoid clipping */
                }
            `}</style>
        </div>
    );
};

export const toast = {
    success: (message: string) => window.dispatchEvent(new CustomEvent('paraclete-toast', { detail: { message, type: 'success' } })),
    error: (message: string) => window.dispatchEvent(new CustomEvent('paraclete-toast', { detail: { message, type: 'error' } })),
    info: (message: string) => window.dispatchEvent(new CustomEvent('paraclete-toast', { detail: { message, type: 'info' } })),
};

export default ToastProvider;
