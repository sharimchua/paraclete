import React, { useState, useEffect, useRef } from 'react';

export interface LLMEvent {
    event: 'llm_start' | 'llm_finish' | 'llm_error';
    data: unknown;
}

const DeveloperPanel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [events, setEvents] = useState<LLMEvent[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const socket = new WebSocket('ws://127.0.0.1:8000/ws');

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event?.startsWith('llm_')) {
                    setEvents(prev => [...prev, { ...data, timestamp: new Date().toLocaleTimeString() }]);
                }
            } catch (e) {
                console.error('WS Error:', e);
            }
        };

        return () => socket.close();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events]);

    if (!isOpen) {
        return (
            <div 
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    background: 'var(--primary)',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <span>🛠️</span> Developer Mode
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '400px',
            height: '600px',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            zIndex: 1000,
            overflow: 'hidden'
        }}>
            <header style={{
                padding: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>LLM Forensics</h3>
                <button 
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                >
                    ✕
                </button>
            </header>

            <div 
                ref={scrollRef}
                style={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem'
                }}
            >
                {events.length === 0 && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '40px' }}>
                        Waiting for LLM activity...
                    </div>
                )}
                {events.map((ev, i) => (
                    <div key={i} style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '12px',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${ev.event === 'llm_start' ? '#3b82f6' : ev.event === 'llm_finish' ? '#22c55e' : '#ef4444'}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', opacity: 0.5 }}>
                            <span>{ev.event.toUpperCase()}</span>
                            <span>{ev.timestamp}</span>
                        </div>
                        <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.8)' }}>
                            {ev.event === 'llm_start' ? (
                                <div>
                                    <div style={{ color: 'var(--primary)', marginBottom: '4px' }}>Type: {ev.data.type}</div>
                                    <div style={{ opacity: 0.6 }}>PROMPT:</div>
                                    {ev.data.prompt}
                                </div>
                            ) : ev.event === 'llm_finish' ? (
                                <div>
                                   <div style={{ opacity: 0.6 }}>RESULT:</div>
                                   {typeof ev.data.result === 'string' ? ev.data.result : JSON.stringify(ev.data.result, null, 2)}
                                </div>
                            ) : (
                                <div style={{ color: '#fca5a5' }}>{ev.data}</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <footer style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'right' }}>
                <button 
                    onClick={() => setEvents([])}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', cursor: 'pointer' }}
                >
                    Clear Logs
                </button>
            </footer>
        </div>
    );
};

export default DeveloperPanel;
