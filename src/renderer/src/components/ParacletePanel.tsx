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
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '380px',
            height: '70vh',
            maxHeight: '800px',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            zIndex: 2000,
            overflow: 'hidden',
            animation: 'slideIn 0.3s ease-out'
        }}>
            <header style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '20px' }}>
                        <Logo />
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        Paraclete Panel
                    </span>
                </div>
                <button 
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                    &times;
                </button>
            </header>

            <div style={{
                display: 'flex',
                padding: '0 10px',
                background: 'rgba(0,0,0,0.2)',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                {(['jobs', 'forensics', 'chat'] as const).map(tab => (
                    <div 
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '10px 15px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
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
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {activeTab === 'jobs' && renderJobs()}
                {activeTab === 'forensics' && renderForensics()}
                {activeTab === 'chat' && (
                    <div style={{ opacity: 0.5, textAlign: 'center', marginTop: '40px', fontSize: '0.8rem' }}>
                        Interactive Chat coming later in Phase 2.
                    </div>
                )}
            </div>

            <footer style={{ 
                padding: '12px 20px', 
                borderTop: '1px solid rgba(255,255,255,0.05)', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ 
                        width: '6px', height: '6px', borderRadius: '3px', 
                        background: isThinking ? 'var(--primary)' : '#22c55e',
                        boxShadow: isThinking ? '0 0 8px var(--primary)' : 'none'
                    }} />
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>
                        {isThinking ? 'PARACLETE IS THINKING...' : 'PARACLETE READY'}
                    </span>
                </div>
                <button 
                    onClick={() => setEvents([])}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', cursor: 'pointer' }}
                >
                    CLEAR LOGS
                </button>
            </footer>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.1); opacity: 0.2; }
                    100% { transform: scale(1); opacity: 0.5; }
                }
                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .paraclete-trigger:hover {
                    transform: scale(1.05);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.4);
                    border-color: var(--primary);
                }
            `}</style>
        </div>
    );
};

export default ParacletePanel;
