import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';

const App: React.FC = () => {
    const [isSetup, setIsSetup] = useState<boolean | null>(null);

    useEffect(() => {
        // Query if setup is complete
        window.electron.ipcRenderer.invoke('check-setup-status').then((result: boolean) => {
            setIsSetup(result);
        });
        
        // Listener for setup completion
        window.electron.ipcRenderer.on('setup-complete', () => {
            setIsSetup(true);
        });
    }, []);

    if (isSetup === null) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                backgroundColor: '#0f172a'
            }}>
                <div className="loader" style={{
                    width: '48px',
                    height: '48px',
                    border: '5px solid #1e293b',
                    borderBottomColor: '#38bdf8',
                    borderRadius: '50%',
                    display: 'inline-block',
                    boxSizing: 'border-box',
                    animation: 'rotation 1s linear infinite'
                }} />
            </div>
        ); 
    }

    if (!isSetup) {
        return <SetupScreen />;
    }

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
            <h1 style={{ fontWeight: 700, fontSize: '2.5rem', marginBottom: '1rem' }}>Paraclete</h1>
            <p style={{ color: '#94a3b8' }}>Welcome to your personal practice OS.</p>
            <div style={{
                marginTop: '40px',
                padding: '20px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '12px',
                color: '#38bdf8',
                fontSize: '0.9rem'
            }}>
                Successfully configured local Gemma 4 MoE environment.
            </div>
        </div>
    );
};

export default App;
