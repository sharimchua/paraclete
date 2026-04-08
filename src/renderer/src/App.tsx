import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';
import PersonList from './components/PersonList';
import PersonProfile from './components/PersonProfile';
import NoteAuthoring from './components/NoteAuthoring';
import GroupList from './components/GroupList';
import GroupProfile from './components/GroupProfile';
import NoteDetail from './components/NoteDetail';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
    const [isSetup, setIsSetup] = useState<boolean | null>(null);
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

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
                    onComplete={() => {
                        if (selectedPersonId) setCurrentView('persons');
                        else if (selectedGroupId) setCurrentView('groups');
                        else setCurrentView('dashboard');
                    }} 
                />
            );
        }

        if (currentView === 'note-detail' && selectedNoteId) {
            return (
                <NoteDetail 
                    noteId={selectedNoteId} 
                    onBack={() => {
                        setSelectedNoteId(null);
                        if (selectedPersonId) setCurrentView('persons');
                        else if (selectedGroupId) setCurrentView('groups');
                        else setCurrentView('notes');
                    }} 
                />
            );
        }

        if (currentView === 'dashboard') {
            return <Dashboard />;
        }

        if (currentView === 'persons') {
            if (selectedPersonId) {
                return (
                    <PersonProfile 
                        personId={selectedPersonId} 
                        onBack={() => setSelectedPersonId(null)} 
                        onSelectNote={(id) => {
                            setSelectedNoteId(id);
                            setCurrentView('note-detail');
                        }}
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
                        onSelectNote={(id) => {
                            setSelectedNoteId(id);
                            setCurrentView('note-detail');
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {(selectedPersonId || selectedGroupId || currentView === 'note-detail' || currentView === 'new-note') && (
                            <button 
                                onClick={() => {
                                    if (currentView === 'note-detail') {
                                        setSelectedNoteId(null);
                                        // If we came from a profile, stay there (selectedId is still set)
                                        // If not, go back to notes list
                                        if (!selectedPersonId && !selectedGroupId) setCurrentView('notes');
                                    } else if (currentView === 'new-note') {
                                        if (selectedPersonId) setCurrentView('persons');
                                        else if (selectedGroupId) setCurrentView('groups');
                                        else setCurrentView('dashboard');
                                    } else if (selectedPersonId) {
                                        setSelectedPersonId(null);
                                    } else if (selectedGroupId) {
                                        setSelectedGroupId(null);
                                    }
                                }} 
                                className="btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                &lsaquo; Back
                            </button>
                        )}
                        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{
                            currentView === 'new-note' ? 'SESSION WORKFLOW' :
                            currentView === 'note-detail' ? 'NOTE DETAIL' :
                            selectedPersonId ? 'PERSON PROFILE' : 
                            selectedGroupId ? 'GROUP PROFILE' : currentView.toUpperCase()
                        }</h2>
                    </div>
                    
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
