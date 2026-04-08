import React, { useState, useEffect } from 'react';

const SetupScreen: React.FC = () => {
    const [status, setStatus] = useState<string>('Initializing...');
    const [progress, setProgress] = useState<number>(0);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        // Listen for setup progress from main process
        window.electron.ipcRenderer.on('setup-status', (_, data: { status: string, progress: number, log?: string }) => {
            setStatus(data.status);
            setProgress(data.progress);
            if (data.log) {
                setLogs(prev => [...prev.slice(-100), data.log!]);
            }
        });

        // Trigger setup if needed
        window.electron.ipcRenderer.send('start-setup');

        return () => {
            // Need to handle listener cleanup properly in @electron-toolkit
        };
    }, []);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '600px',
                padding: '40px',
                borderRadius: '24px',
                background: 'rgba(30, 41, 59, 0.5)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '20px', fontWeight: 700 }}>Paraclete Setup</h1>
                <p style={{ color: '#94a3b8', marginBottom: '40px' }}>Configuring your private workspace. This happens only once.</p>
                
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500 }}>{status}</span>
                    <span style={{ color: '#38bdf8' }}>{Math.round(progress)}%</span>
                </div>
                
                <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#1e293b',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    marginBottom: '30px'
                }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        backgroundColor: '#38bdf8',
                        transition: 'width 0.3s ease-out',
                        boxShadow: '0 0 10px #38bdf8'
                    }} />
                </div>

                <div style={{
                    backgroundColor: '#020617',
                    borderRadius: '12px',
                    padding: '16px',
                    height: '150px',
                    overflowY: 'auto',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    color: '#64748b',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                    {logs.map((log, i) => (
                        <div key={i} style={{ marginBottom: '4px' }}>{`> ${log}`}</div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SetupScreen;
