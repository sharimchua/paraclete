import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';
import PersonList from './components/PersonList';
import PersonProfile from './components/PersonProfile';
import NoteAuthoring from './components/NoteAuthoring';
import GroupList from './components/GroupList';
import GroupProfile from './components/GroupProfile';
import NoteDetail from './components/NoteDetail';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/AdminPanel';
import TagManagement from './components/TagManagement';
import NotesList from './components/NotesList';
import ReferenceLibrary from './components/ReferenceLibrary';
import PracticeFramework from './components/PracticeFramework';
import Logo from './components/Logo';
import ParacletePanel from './components/ParacletePanel';
import StandardNavbar from './components/StandardNavbar';
import MessagesList from './components/MessagesList';
import MessageAuthoring from './components/MessageAuthoring';
import PersonaSelectionModal from './components/PersonaSelectionModal';
import EntitySelectionModal from './components/EntitySelectionModal';
import { api } from './services/api';

const App: React.FC = () => {
    const [isSetup, setIsSetup] = useState<boolean | null>(null);
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
    const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
    const [initialNoteDate, setInitialNoteDate] = useState<string | null>(null);
    const [viewHistory, setViewHistory] = useState<string[]>(['dashboard']);
    const [personaLinkingTarget, setPersonaLinkingTarget] = useState<{ type: 'person' | 'group', id: number, existingPersonaIds: number[] } | null>(null);
    const [showContactSelection, setShowContactSelection] = useState(false);
    const [isParacletePanelOpen, setIsParacletePanelOpen] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isLlmReady, setIsLlmReady] = useState(false);
    const [isWarming, setIsWarming] = useState(false);

    const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
    const [pendingProposalsCount, setPendingProposalsCount] = useState(0);

    const fetchProposalsCount = async () => {
        try {
            const proposals = await api.get<any[]>('/api/framework/proposals?status=pending');
            setPendingProposalsCount(proposals.length);
        } catch (err) {
            console.error('Failed to fetch proposals count:', err);
        }
    };

    useEffect(() => {
        // Query if setup is complete
        window.electron.ipcRenderer.invoke('check-setup-status').then((result: boolean) => {
            setIsSetup(result);
        });
        
        // Listener for setup completion
        window.electron.ipcRenderer.on('setup-complete', () => {
            setIsSetup(true);
        });

        const handleLinkPersona = (e: any) => {
            setPersonaLinkingTarget(e.detail);
        };
        window.addEventListener('trigger-link-persona' as any, handleLinkPersona);

        const handleNavigate = (e: any) => {
            const { view, personId, groupId, noteId, date, messageId } = e.detail;
            navigateTo(view, personId, groupId, noteId, date, false, messageId);
        };
        window.addEventListener('navigate' as any, handleNavigate);

        const handleTriggerMessageModal = () => setShowContactSelection(true);
        window.addEventListener('trigger-message-modal' as any, handleTriggerMessageModal);

        const handleThinking = (e: any) => setIsThinking(e.detail);
        window.addEventListener('paraclete-thinking' as any, handleThinking);

        const socket = new WebSocket('ws://127.0.0.1:8000/ws');
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'llm_start') {
                    if (data.data?.type === 'warmup') {
                        setIsWarming(true);
                    } else {
                        setIsThinking(true);
                    }
                } else if (data.event === 'llm_finish' || data.event === 'llm_error') {
                    setIsThinking(false);
                    if (data.data?.type === 'warmup') {
                        setIsWarming(false);
                        setIsLlmReady(true);
                        window.dispatchEvent(new CustomEvent('paraclete-toast', { 
                            detail: { 
                                message: 'Neural Engine Online. Paraclete Core is ready.', 
                                type: 'success' 
                            } 
                        }));
                    }
                } else if (data.event === 'background_jobs') {
                    const jobs = data.data || [];
                    const isAnyJobRunning = jobs.some((j: any) => j.status === 'running');
                    const isAnalysisActive = jobs.some((j: any) => 
                        (j.status === 'running' || j.status === 'pending') && 
                        (j.name.includes('Analyze') || j.name.includes('Synthesis'))
                    );
                    
                    setIsAnalysisRunning(isAnalysisActive);
                    if (isAnyJobRunning) setIsThinking(true);
                } else if (data.event === 'framework_proposals_updated') {
                    fetchProposalsCount();
                }
                window.dispatchEvent(new CustomEvent('global-ws-message', { detail: data }));
            } catch (e) {
                console.error('Core WS Error:', e);
            }
        };

        const checkLLM = async () => {
            try {
                const res = await fetch('http://127.0.0.1:8000/llm/status');
                if (res.ok) {
                    const data = await res.json();
                    if (data.is_ready) setIsLlmReady(true);
                }
            } catch (e) {}
        };
        checkLLM();
        fetchProposalsCount();

        return () => {
            window.removeEventListener('trigger-link-persona' as any, handleLinkPersona);
            window.removeEventListener('navigate' as any, handleNavigate);
            window.removeEventListener('trigger-message-modal' as any, handleTriggerMessageModal);
            window.removeEventListener('paraclete-thinking' as any, handleThinking);
            socket.close();
        };
    }, []);

    const navigateTo = (
        view: string, 
        personId: number | null = null, 
        groupId: number | null = null, 
        noteId: number | null = null, 
        date: string | null = null, 
        resetHistory: boolean = false,
        messageId: number | null = null
    ) => {
        setCurrentView(view);
        setSelectedPersonId(personId);
        setSelectedGroupId(groupId);
        setSelectedNoteId(noteId);
        setSelectedMessageId(messageId);
        setInitialNoteDate(date);
        
        if (resetHistory) {
            setViewHistory([view]);
        } else {
            // Only push to history if it's different (simple prevent duplicates)
            setViewHistory(prev => {
                if (prev[prev.length - 1] === view) return prev;
                return [...prev, view];
            });
        }
    };

    const goBack = () => {
        if (viewHistory.length <= 1) {
            // If we can't go back, at least return to dashboard
            setCurrentView('dashboard');
            setSelectedPersonId(null);
            setSelectedGroupId(null);
            setSelectedNoteId(null);
            setViewHistory(['dashboard']);
            return;
        }
        
        const newHistory = [...viewHistory];
        newHistory.pop(); // Remove current view
        const previousView = newHistory[newHistory.length - 1];
        
        setViewHistory(newHistory);
        setCurrentView(previousView);
        
        // Reset specific context if moving away from detail views
        if (previousView === 'dashboard' || previousView === 'notes' || previousView === 'tags' || previousView === 'admin' || 
           previousView === 'messages' || (previousView === 'persons' && !selectedPersonId) || (previousView === 'groups' && !selectedGroupId)) {
            setSelectedPersonId(null);
            setSelectedGroupId(null);
            setSelectedNoteId(null);
            setSelectedMessageId(null);
            setInitialNoteDate(null);
        }
    };

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

    const startNewNote = (personId?: number, groupId?: number, date?: string) => {
        navigateTo('new-note', personId || null, groupId || null, null, date || null);
    };


    const renderContent = () => {
        if (currentView === 'new-note') {
            return (
                <NoteAuthoring 
                    personId={selectedPersonId || undefined} 
                    groupId={selectedGroupId || undefined}
                    initialDate={initialNoteDate || undefined}
                    onComplete={() => goBack()} 
                />
            );
        }

        if (currentView === 'note-detail' && selectedNoteId) {
            return (
                <NoteDetail 
                    noteId={selectedNoteId} 
                    onBack={goBack} 
                />
            );
        }

        if (currentView === 'dashboard') {
            return <Dashboard 
                onSelectNote={(id) => {
                    navigateTo('note-detail', selectedPersonId, selectedGroupId, id);
                }} 
                onStartNote={(date, pid, gid) => {
                    startNewNote(pid, gid, date);
                }}
            />;
        }

        if (currentView === 'persons') {
            if (selectedPersonId) {
                return (
                    <PersonProfile 
                        personId={selectedPersonId} 
                        onBack={() => setSelectedPersonId(null)} 
                        onSelectNote={(id) => {
                            navigateTo('note-detail', selectedPersonId, null, id);
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
                            setSelectedPersonId(id);
                        }}
                        onSelectNote={(id) => {
                            navigateTo('note-detail', null, selectedGroupId, id);
                        }}
                    />
                );
            }
            return <GroupList onSelectGroup={(id) => setSelectedGroupId(id)} />;
        }

        if (currentView === 'notes') {
            return (
                <NotesList onSelectNote={(id) => {
                    navigateTo('note-detail', null, null, id);
                }} />
            );
        }

        if (currentView === 'admin') {
            return <AdminPanel />;
        }

        if (currentView === 'tags') {
            return <TagManagement />;
        }

        if (currentView === 'references') {
            return <ReferenceLibrary />;
        }

        if (currentView === 'framework') {
            return <PracticeFramework />;
        }

        if (currentView === 'messages') {
            return (
                <MessagesList 
                    onSelectMessage={(id) => navigateTo('message-authoring', null, null, null, null, false, id)} 
                />
            );
        }

        if (currentView === 'message-authoring') {
            return (
                <MessageAuthoring 
                    messageId={selectedMessageId || undefined} 
                    noteId={selectedNoteId || undefined}
                    personId={selectedPersonId || undefined}
                    groupId={selectedGroupId || undefined}
                    initialDate={initialNoteDate || undefined}
                    onComplete={() => goBack()}
                    onViewNote={(id) => navigateTo('note-detail', null, null, id)}
                />
            );
        }

        return <div>View {currentView} coming soon.</div>;
    };

    const getHeaderProps = () => {
        const showBack = viewHistory.length > 1;
        let title = currentView.toUpperCase();
        let actions: any[] = [];

        if (currentView === 'message-authoring') title = 'MESSAGE COMPOSER';
        else if (currentView === 'messages') title = 'MESSAGE HISTORY';
        else if (currentView === 'new-note') title = 'SESSION WORKFLOW';
        else if (currentView === 'note-detail') title = 'NOTE DETAIL';
        else if (selectedPersonId) title = 'PERSON PROFILE';
        else if (selectedGroupId) title = 'GROUP PROFILE';

        if (currentView === 'messages') {
            actions.push({
                label: '+ Create Message',
                onClick: () => window.dispatchEvent(new CustomEvent('trigger-message-modal'))
            });
        } else if (currentView === 'persons' && !selectedPersonId) {
            actions.push({
                label: '+ Add Person',
                onClick: () => window.dispatchEvent(new CustomEvent('trigger-create-person'))
            });
        } else if (currentView === 'persons' && selectedPersonId) {
            actions.push({
                label: '+ New Note',
                onClick: () => startNewNote(selectedPersonId || undefined)
            });
        } else if (currentView === 'groups' && !selectedGroupId) {
            actions.push({
                label: '+ Add Group',
                onClick: () => window.dispatchEvent(new CustomEvent('trigger-create-group'))
            });
        } else if (currentView === 'groups' && selectedGroupId) {
            actions.push({
                label: '+ New Note',
                onClick: () => startNewNote(undefined, selectedGroupId || undefined)
            });
        }

        return { title, showBack, onBack: goBack, actions };
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div 
                    className="logo-area" 
                    onClick={() => setIsParacletePanelOpen(true)}
                    style={{ cursor: 'pointer' }}
                >
                    <div onClick={() => setCurrentView('dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Logo isThinking={isThinking} isLlmReady={isLlmReady} isWarming={isWarming} />
                        <h1 style={{ 
                            margin: 0, 
                            fontSize: '1.2rem', 
                            letterSpacing: '2px',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>PARACLETE</h1>
                    </div>
                </div>
                
                <nav className="nav-section">
                    <div 
                        className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                        onClick={() => { navigateTo('dashboard', null, null, null, null, true); }}
                    >
                        Dashboard
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'persons' ? 'active' : ''}`}
                        onClick={() => { navigateTo('persons', null, null, null, null, true); }}
                    >
                        Persons
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'groups' ? 'active' : ''}`}
                        onClick={() => { navigateTo('groups', null, null, null, null, true); }}
                    >
                        Groups
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'notes' ? 'active' : ''}`}
                        onClick={() => { navigateTo('notes', null, null, null, null, true); }}
                    >
                        Notes
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'messages' || currentView === 'message-authoring' ? 'active' : ''}`}
                        onClick={() => { navigateTo('messages', null, null, null, null, true); }}
                    >
                        Messages
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'references' ? 'active' : ''}`}
                        onClick={() => { navigateTo('references', null, null, null, null, true); }}
                    >
                        References
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'framework' ? 'active' : ''}`}
                        onClick={() => { navigateTo('framework', null, null, null, null, true); }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                        <span>Framework</span>
                        {pendingProposalsCount > 0 && (
                            <span style={{ 
                                background: '#f59e0b', 
                                color: '#0f172a', 
                                fontSize: '0.7rem', 
                                padding: '1px 6px', 
                                borderRadius: '6px',
                                fontWeight: 900,
                                minWidth: '18px',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                                {pendingProposalsCount}
                            </span>
                        )}
                        {isAnalysisRunning && (
                            <div className="thinking-dots" style={{ scale: '0.5', marginRight: '-10px' }}>
                                <span></span><span></span><span></span>
                            </div>
                        )}
                    </div>
                </nav>

                <div className="sidebar-footer" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <div 
                        className={`nav-item ${currentView === 'tags' ? 'active' : ''}`}
                        onClick={() => { navigateTo('tags', null, null, null, null, true); }}
                        style={{ opacity: 0.8 }}
                    >
                        <span style={{ marginRight: '8px' }}>🏷️</span> Tags
                    </div>
                    <div 
                        className={`nav-item ${currentView === 'admin' ? 'active' : ''}`}
                        onClick={() => { navigateTo('admin', null, null, null, null, true); }}
                        style={{ opacity: 0.8 }}
                    >
                        <span style={{ marginRight: '8px' }}>⚙️</span> Admin
                    </div>
                </div>
            </aside>


            <main className="main-content">
                <StandardNavbar {...getHeaderProps()} />
                
                <div className="content-area">
                    {renderContent()}
                </div>
            </main>
            <ParacletePanel isOpen={isParacletePanelOpen} onClose={() => setIsParacletePanelOpen(false)} />
            
            {/* Global Modals */}
            <div id="modal-root">
                {personaLinkingTarget && (
                    <PersonaSelectionModal 
                        title={`Link Persona to ${personaLinkingTarget.type === 'person' ? 'Individual' : 'Group'}`}
                        existingPersonaIds={personaLinkingTarget.existingPersonaIds}
                        onClose={() => setPersonaLinkingTarget(null)}
                        onSelect={async (personaId) => {
                            try {
                                await api.post('/api/framework/link', {
                                    persona_id: personaId,
                                    entity_type: personaLinkingTarget.type,
                                    entity_id: personaLinkingTarget.id
                                });
                                setPersonaLinkingTarget(null);
                                // Dispatch refresh event
                                window.dispatchEvent(new CustomEvent('refresh-profile'));
                            } catch (err) {
                                console.error(err);
                                alert('Failed to link persona');
                            }
                        }}
                    />
                )}

                {showContactSelection && (
                    <EntitySelectionModal
                        title="New Outreach"
                        subtitle="Select a contact to start drafting a message."
                        allowGeneral={false}
                        onClose={() => setShowContactSelection(false)}
                        onSelect={(target) => {
                            navigateTo('message-authoring', 
                                target.type === 'person' ? target.id : null,
                                target.type === 'group' ? target.id : null
                            );
                            setShowContactSelection(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
