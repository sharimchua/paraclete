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
            
            <div className={`integrated-toast-container ${activeToast && !isExiting ? 'is-active' : ''}`}>
                <div 
                    className="toast-card"
                    onClick={() => setIsExiting(true)}
                    style={{
                        width: '240px',
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: '0.9rem',
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
                            <Logo isThinking={false} isLlmReady={true} />
                        </div>
                        <span>{activeToast?.type === 'error' ? 'Paraclete Alert' : 'Paraclete'}</span>
                    </div>
                    <div style={{ lineHeight: '1.4' }}>
                        {activeToast?.message || ''}
                    </div>
                </div>
            </div>

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
                    transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.0s ease-out;
                    transition-delay: 0.5s; /* Delay when flipping back in */
                    transform-origin: center center;
                    transform: rotateX(0deg);
                    opacity: 1;
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                }

                .has-active-toast .logo-area-content {
                    transition: transform 1.0s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease-out;
                    transition-delay: 0s;
                    transform: rotateX(90deg) scale(0.8);
                    opacity: 0;
                    pointer-events: none;
                }

                 .integrated-toast-container {
                    perspective: 1200px;
                    z-index: 10000;
                    position: fixed;
                    top: 24px;
                    left: 16px;
                    pointer-events: none;
                }

                .toast-card {
                    transform-origin: top center;
                    transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.0s ease-out;
                    transform: rotateX(-90deg) scale(0.85);
                    opacity: 0;
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                    pointer-events: none;
                }

                .is-active .toast-card {
                    transform: rotateX(0deg) scale(1);
                    opacity: 1;
                    transition-delay: 0.3s; 
                    pointer-events: auto;
                }

                .has-active-toast .nav-section {
                    transform: translateY(16px);
                    transition: transform 1.0s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .nav-section {
                    transition: transform 1.0s cubic-bezier(0.16, 1, 0.3, 1);
                    transition-delay: 0.2s;
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
