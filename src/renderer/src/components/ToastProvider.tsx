import React, { useState, useEffect, useCallback } from 'react';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeToast, setActiveToast] = useState<Toast | null>(null);

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { id, message, type };
        setActiveToast(newToast);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            setActiveToast(prev => prev?.id === id ? null : prev);
        }, 5000);
    }, []);

    useEffect(() => {
        const handleToast = (e: any) => {
            addToast(e.detail.message, e.detail.type);
        };
        window.addEventListener('paraclete-toast' as any, handleToast);
        return () => window.removeEventListener('paraclete-toast' as any, handleToast);
    }, [addToast]);

    return (
        <div className={`paraclete-app ${activeToast ? 'has-active-toast' : ''}`}>
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
                        onClick={() => setActiveToast(null)}
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
                            transformOrigin: 'center center',
                            animation: 'toastCardSwap 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>
                           {activeToast.type === 'error' ? '⚠️ Alert' : '✨ Assistant'}
                        </div>
                        <div style={{ lineHeight: '1.4' }}>
                            {activeToast.message}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes toastCardSwap {
                    0% { transform: scale(0.9) translateY(-10px); opacity: 0; filter: blur(10px); }
                    100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
                }

                @keyframes logoCardFadeOut {
                    0% { transform: scale(1); opacity: 1; filter: blur(0); }
                    100% { transform: scale(0.95); opacity: 0; filter: blur(8px); }
                }

                /* Container for the logo area to allow card overlay */
                .logo-area {
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    min-height: 48px; /* Ensure space for the replacement card */
                    z-index: 1;
                }

                /* The "Card" base that always exists but becomes visible/styled when toast active */
                .has-active-toast .logo-area::before {
                    content: '';
                    position: absolute;
                    inset: -8px -4px;
                    background: var(--bg-surface-elevated);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    z-index: -1;
                    animation: toastCardSwap 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                .has-active-toast .logo-area-content {
                    animation: logoCardFadeOut 0.3s ease-out forwards;
                    pointer-events: none;
                }
                
                .has-active-toast .nav-section {
                    transform: translateY(16px);
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .nav-section {
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }

                /* Ensure the toast stays perfectly within the card bounds */
                .integrated-toast-container {
                    perspective: 1000px;
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
