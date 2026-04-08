import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';
import PersonList from './components/PersonList';
import PersonProfile from './components/PersonProfile';
import NoteAuthoring from './components/NoteAuthoring';
import GroupList from './components/GroupList';
import GroupProfile from './components/GroupProfile';

const App: React.FC = () => {
    const [isSetup, setIsSetup] = useState<boolean | null>(null);
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

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

    const startNewNote = (personId?: number, groupId?: number) => {
        setSelectedPersonId(personId || null);
        setSelectedGroupId(groupId || null);
        setCurrentView('new-note');
    };

    const renderContent = () => {
        if (currentView === 'new-note') {
            return (
                <NoteAuthoring 
                    personId={selectedPersonId || undefined} 
                    groupId={selectedGroupId || undefined}
                    onComplete={() => setCurrentView('dashboard')} 
                />
            );
        }

        if (currentView === 'dashboard') {
            return (
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
            );
        }

        if (currentView === 'persons') {
            if (selectedPersonId) {
                return (
                    <PersonProfile 
                        personId={selectedPersonId} 
                        onBack={() => setSelectedPersonId(null)} 
                    />
                );
            }
            return <PersonList onSelectPerson={(id) => setSelectedPersonId(id)} />;
        }

        if (currentView === 'groups') {
            if (selectedGroupId) {
                return (
                    <GroupProfile 
                        groupId={selectedGroupId} 
                        onBack={() => setSelectedGroupId(null)} 
                        onSelectPerson={(id) => {
                            setCurrentView('persons');
                            setSelectedPersonId(id);
                        }}
                    />
                );
            }
            return <GroupList onSelectGroup={(id) => setSelectedGroupId(id)} />;
        }

        if (currentView === 'notes') {
            return (
                <div className="card">
                    <h3>Notes Lifecycle</h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Prepare, Capture, and Clean your sessions.</p>
                </div>
            );
        }

        return <div>View {currentView} coming soon.</div>;
    };

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
                        onClick={() => { setCurrentView('dashboard'); setSelectedPersonId(null); }}
                    >
                        Dashboard
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'persons' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('persons'); setSelectedPersonId(null); setSelectedGroupId(null); }}
                    >
                        Persons
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'groups' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('groups'); setSelectedPersonId(null); setSelectedGroupId(null); }}
                    >
                        Groups
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'notes' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('notes'); setSelectedPersonId(null); setSelectedGroupId(null); }}
                    >
                        Recent Notes
                    </div>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{
                        currentView === 'new-note' ? 'SESSION WORKFLOW' :
                        selectedPersonId ? 'PERSON PROFILE' : 
                        selectedGroupId ? 'GROUP PROFILE' : currentView.toUpperCase()
                    }</h2>
                    
                    {/* Context-aware buttons */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {currentView === 'persons' && !selectedPersonId && (
                            <button className="btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('trigger-create-person'))}>
                                + Add Person
                            </button>
                        )}
                        
                        {currentView === 'persons' && selectedPersonId && (
                            <button className="btn-primary" onClick={() => startNewNote(selectedPersonId)}>
                                + New Note
                            </button>
                        )}

                        {currentView === 'groups' && !selectedGroupId && (
                            <button className="btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('trigger-create-group'))}>
                                + Add Group
                            </button>
                        )}

                        {currentView === 'groups' && selectedGroupId && (
                            <button className="btn-primary" onClick={() => startNewNote(undefined, selectedGroupId)}>
                                + New Note
                            </button>
                        )}
                    </div>
                </header>
                
                <div className="content-area">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default App;
