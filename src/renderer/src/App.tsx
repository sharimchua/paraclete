import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';

const App: React.FC = () => {
    const [isSetup, setIsSetup] = useState<boolean | null>(null);
    const [currentView, setCurrentView] = useState<string>('dashboard');

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
                width: '100vw',
                height: '100vh',
                backgroundColor: '#020617'
            }}>
                <div className="loader" />
            </div>
        ); 
    }

    if (!isSetup) {
        return <SetupScreen />;
    }

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="logo-area">
                    <div className="logo-icon"></div>
                    <span className="app-name">Paraclete</span>
                </div>
                
                <nav className="nav-section">
                    <div 
                        className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setCurrentView('dashboard')}
                    >
                        Dashboard
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'persons' ? 'active' : ''}`}
                        onClick={() => setCurrentView('persons')}
                    >
                        Persons
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'groups' ? 'active' : ''}`}
                        onClick={() => setCurrentView('groups')}
                    >
                        Groups
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'notes' ? 'active' : ''}`}
                        onClick={() => setCurrentView('notes')}
                    >
                        Recent Notes
                    </div>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{currentView.toUpperCase()}</h2>
                    <button className="btn-primary">+ New Note</button>
                </header>
                
                <div className="content-area">
                    {currentView === 'dashboard' && (
                        <div className="dashboard-grid" style={{ display: 'grid', gap: '24px' }}>
                            <div className="card">
                                <h3 style={{ marginBottom: '8px' }}>Welcome back</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>You have 0 scheduled sessions today.</p>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div className="card">
                                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '12px' }}>Quick Stats</h4>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>0 Persons</div>
                                </div>
                                <div className="card">
                                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '12px' }}>Recent Notes</h4>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No notes yet.</div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {currentView === 'persons' && (
                        <div className="card">
                            <h3>Persons Library</h3>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Manage your practitioners and clients here.</p>
                        </div>
                    )}

                    {currentView === 'notes' && (
                        <div className="card">
                            <h3>Notes Lifecycle</h3>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Prepare, Capture, and Clean your sessions.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;
