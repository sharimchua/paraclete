import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import Logo from './Logo';

interface BackgroundJob {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
    progress: number;
    error?: string;
}

interface ParacletePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const ParacletePanel: React.FC<ParacletePanelProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'jobs' | 'forensics' | 'chat'>('jobs');
    const [events, setEvents] = useState<any[]>([]);
    const [jobs, setJobs] = useState<BackgroundJob[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchJobs = async () => {
        try {
            const data = await api.get<BackgroundJob[]>('/api/admin/jobs');
            setJobs(data);
        } catch (err) {
            console.error('Failed to fetch jobs', err);
        }
    };

    useEffect(() => {
        const socket = new WebSocket('ws://127.0.0.1:8000/ws');

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.event?.startsWith('llm_')) {
                    setEvents(prev => [...prev, { ...data, timestamp: new Date().toLocaleTimeString() }]);
                    if (data.event === 'llm_start') {
                        setIsThinking(true);
                        window.dispatchEvent(new CustomEvent('paraclete-thinking', { detail: true }));
                    }
                    if (data.event === 'llm_finish') {
                        setIsThinking(false);
                        window.dispatchEvent(new CustomEvent('paraclete-thinking', { detail: false }));
                    }
                } 
                
                if (data.event === 'background_job_update') {
                    fetchJobs();
                }
            } catch (e) {
                console.error('WS Error:', e);
            }
        };

        fetchJobs();
        const pollInterval = setInterval(fetchJobs, 5000);

        return () => {
            socket.close();
            clearInterval(pollInterval);
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events, jobs]);

    const renderJobs = () => {
        const pendingCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>QUEUE STATUS</span>
                    <span style={{ fontSize: '0.7rem', color: pendingCount > 0 ? 'var(--primary)' : 'inherit' }}>
                        {pendingCount} ACTIVE JOBS
                    </span>
                </div>
                {jobs.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '20px', fontSize: '0.8rem' }}>
                        No background activity.
                    </div>
                )}
                {jobs.map((job) => (
                    <div key={job.id} style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{job.name}</span>
                            <span style={{ 
                                fontSize: '0.65rem', 
                                color: job.status === 'completed' ? '#22c55e' : job.status === 'running' ? '#3b82f6' : '#94a3b8' 
                            }}>
                                {job.status.toUpperCase()}
                            </span>
                        </div>
                        {job.status === 'running' && (
                            <div style={{ height: '2px', background: 'rgba(255,255,255,0.1)', borderRadius: '1px', overflow: 'hidden' }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${job.progress}%`, 
                                    background: 'var(--primary)',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        )}
                        {job.error && (
                            <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '4px' }}>
                                {job.error}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const renderForensics = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {events.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '40px' }}>
                    Waiting for LLM trace...
                </div>
            )}
            {events.map((ev, i) => (
                <div key={i} style={{
                    background: 'rgba(255,255,255,0.02)',
                    padding: '10px',
                    borderRadius: '8px',
                    borderLeft: `2px solid ${ev.event === 'llm_start' ? '#3b82f6' : ev.event === 'llm_finish' ? '#22c55e' : '#ef4444'}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', opacity: 0.4, fontSize: '0.6rem' }}>
                        <span>{ev.event.toUpperCase()}</span>
                        <span>{ev.timestamp}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {ev.event === 'llm_start' ? ev.data.prompt : 
                         ev.event === 'llm_finish' ? (typeof ev.data.result === 'string' ? ev.data.result : 'Result Object') : 
                         ev.data}
                    </div>
                </div>
            ))}
        </div>
    );

    if (!isOpen) return null;

    return (
        <>
            <div 
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(2, 6, 23, 0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 1999,
                    animation: 'fadeIn 0.3s ease-out'
                }}
            />
            <div style={{
                position: 'fixed',
                top: '10vh',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '800px',
                maxWidth: '90vw',
                height: '75vh',
                background: 'rgba(15, 23, 42, 0.98)',
                backdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 32px 128px rgba(0,0,0,0.8)',
                zIndex: 2000,
                overflow: 'hidden',
                animation: 'paracleteExpand 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                transformOrigin: '-20% -10%' // Aim towards the sidebar logo area
            }}>
                <header style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '24px' }}>
                            <Logo isThinking={isThinking} />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            Paraclete Global Intelligence
                        </span>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.5rem' }}
                    >
                        &times;
                    </button>
                </header>

                <div style={{
                    display: 'flex',
                    padding: '0 20px',
                    background: 'rgba(0,0,0,0.2)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {(['jobs', 'forensics', 'chat'] as const).map(tab => (
                        <div 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '15px 20px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                color: activeTab === tab ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
                                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                <div 
                    ref={scrollRef}
                    style={{
                        flexGrow: 1,
                        overflowY: 'auto',
                        padding: '32px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {activeTab === 'jobs' && renderJobs()}
                    {activeTab === 'forensics' && renderForensics()}
                    {activeTab === 'chat' && (
                        <div style={{ 
                            flex: 1, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            opacity: 0.5,
                            gap: '20px' 
                        }}>
                            <div style={{ width: '64px', opacity: 0.3 }}>
                                <Logo />
                            </div>
                            <div style={{ fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', lineHeight: 1.6 }}>
                                Interactive Reasoning & Direct Chat is being calibrated.
                            </div>
                        </div>
                    )}
                </div>

                <footer style={{ 
                    padding: '16px 24px', 
                    borderTop: '1px solid rgba(255,255,255,0.05)', 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ 
                            width: '8px', height: '8px', borderRadius: '4px', 
                            background: isThinking ? 'var(--primary)' : '#22c55e',
                            boxShadow: isThinking ? '0 0 12px var(--primary)' : '0 0 8px rgba(34, 197, 94, 0.4)'
                        }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>
                            {isThinking ? 'NEURAL ENGINE ACTIVE' : 'PARACLETE CORE STABLE'}
                        </span>
                    </div>
                    <button 
                        onClick={() => setEvents([])}
                        style={{ 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            color: 'rgba(255,255,255,0.4)', 
                            fontSize: '0.7rem', 
                            cursor: 'pointer',
                            padding: '6px 12px',
                            borderRadius: '6px'
                        }}
                    >
                        CLEAR LOGS
                    </button>
                </footer>

                <style>{`
                    @keyframes paracleteExpand {
                        from { transform: translateX(-50%) scale(0.1); opacity: 0; filter: blur(10px); }
                        to { transform: translateX(-50%) scale(1); opacity: 1; filter: blur(0); }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `}</style>
            </div>
        </>
    );
};

export default ParacletePanel;
