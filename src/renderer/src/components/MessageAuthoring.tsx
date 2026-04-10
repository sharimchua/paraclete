import React, { useState, useEffect, useRef } from 'react';
import { api, Note, Person, Group, Message } from '../services/api';

interface MessageAuthoringProps {
    messageId?: number;
    noteId?: number;
    personId?: number;
    groupId?: number;
    initialDate?: string;
    onComplete: () => void;
}

const MessageAuthoring: React.FC<MessageAuthoringProps> = ({ 
    messageId, 
    noteId, 
    personId, 
    groupId, 
    initialDate,
    onComplete 
}) => {
    const [message, setMessage] = useState<Partial<Message>>({
        status: 'draft',
        source: 'native',
        is_inbound: false,
        date: initialDate || new Date().toISOString().split('T')[0],
        note_id: noteId,
        person_id: personId,
        group_id: groupId
    });
    
    const [noteContext, setNoteContext] = useState<Note | null>(null);
    const [personContext, setPersonContext] = useState<Person | null>(null);
    const [groupContext, setGroupContext] = useState<Group | null>(null);
    const [allPeople, setAllPeople] = useState<Person[]>([]);
    const [allGroups, setAllGroups] = useState<Group[]>([]);
    
    const [feedback, setFeedback] = useState('');
    const [isIterating, setIsIterating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [highlightedText, setHighlightedText] = useState('');
    const [loading, setLoading] = useState(true);
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const loadContexts = async () => {
            setLoading(true);
            try {
                // Load target options for recipient selection
                const [pList, gList] = await Promise.all([
                    api.get<Person[]>('/persons/'),
                    api.get<Group[]>('/groups/')
                ]);
                setAllPeople(pList);
                setAllGroups(gList);

                let currentMessage = { ...message };

                if (messageId) {
                    const existing = await api.get<Message>(`/api/messages/${messageId}`);
                    currentMessage = { ...existing };
                    setMessage(existing);
                }

                const mid = messageId || currentMessage.id;
                const nid = noteId || currentMessage.note_id;
                const pid = personId || currentMessage.person_id;
                const gid = groupId || currentMessage.group_id;

                if (nid) {
                    const n = await api.get<Note>(`/api/notes/${nid}`);
                    setNoteContext(n);
                }
                
                if (pid) {
                    const p = await api.get<Person>(`/api/persons/${pid}`);
                    setPersonContext(p);
                } else if (gid) {
                    const g = await api.get<Group>(`/api/groups/${gid}`);
                    setGroupContext(g);
                }
            } catch (err) {
                console.error('Failed to load contexts:', err);
            } finally {
                setLoading(false);
            }
        };
        loadContexts();
    }, [messageId, noteId, personId, groupId]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const data = {
                ...message,
                note_id: noteContext?.id || null,
                person_id: personContext?.id || null,
                group_id: groupContext?.id || null,
            };

            if (message.id) {
                await api.patch<Message>(`/api/messages/${message.id}`, data);
            } else {
                const created = await api.post<Message>('/api/messages/', data);
                setMessage(created);
            }
            onComplete();
        } catch (err) {
            console.error('Failed to save message:', err);
            alert('Failed to save message.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateDraft = async () => {
        // Ensure we have a persisted message ID for iteration
        let msgId = message.id;
        if (!msgId) {
            try {
                const created = await api.post<Message>('/api/messages/', {
                    ...message,
                    note_id: noteContext?.id || null,
                    person_id: personContext?.id || null,
                    group_id: groupContext?.id || null
                });
                setMessage(created);
                msgId = created.id;
            } catch (err) {
                console.error('Initial save for draft failed:', err);
                return;
            }
        }

        setIsIterating(true);
        try {
            const res = await api.post<{ draft_text: string }>(`/api/messages/${msgId}/iterate`, {
                feedback: "Draft a professional follow-up based on the available context.",
            });
            setMessage(prev => ({ ...prev, draft_text: res.draft_text }));
        } catch (err) {
            console.error('Drafting failed:', err);
        } finally {
            setIsIterating(false);
        }
    };

    const handleIterate = async () => {
        if (!message.id) {
             // Save first if not exists
             await handleSave();
             return;
        }
        
        setIsIterating(true);
        try {
            const res = await api.post<{ draft_text: string }>(`/api/messages/${message.id}/iterate`, {
                feedback,
                highlighted_text: highlightedText
            });
            setMessage(prev => ({ ...prev, draft_text: res.draft_text }));
            setFeedback('');
            setHighlightedText('');
        } catch (err) {
            console.error('Iteration failed:', err);
        } finally {
            setIsIterating(false);
        }
    };

    const handleTextSelect = () => {
        const selection = window.getSelection()?.toString();
        if (selection) {
            setHighlightedText(selection);
        }
    };

    if (loading) return <div className="loader" />;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="toolbar">
                <div style={{ width: '250px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <button className="btn-secondary" onClick={onComplete}>&lsaquo; Back</button>
                     <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Composer</h2>
                </div>

                <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', padding: '4px', borderRadius: '100px', border: '1px solid var(--border)', gap: '2px' }}>
                    <div
                        onClick={() => setMessage({ ...message, is_inbound: false })}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '100px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: !message.is_inbound ? 'var(--primary)' : 'transparent',
                            color: !message.is_inbound ? 'var(--bg-deep)' : 'var(--text-main)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📤 Outbound
                    </div>
                    <div
                        onClick={() => setMessage({ ...message, is_inbound: true })}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '100px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: message.is_inbound ? 'var(--secondary)' : 'transparent',
                            color: message.is_inbound ? 'var(--bg-deep)' : 'var(--text-main)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📥 Inbound
                    </div>
                </div>

                <div style={{ width: '250px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                    <input
                        type="date"
                        value={message.date || ''}
                        onChange={(e) => setMessage({ ...message, date: e.target.value })}
                        className="input-field"
                        style={{ 
                            padding: '6px 10px', 
                            borderRadius: '8px', 
                            background: 'var(--bg-deep)', 
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            width: '120px',
                            cursor: 'pointer',
                            colorScheme: 'dark'
                        }}
                    />
                    <button 
                        className="btn-primary" 
                        disabled={isSaving}
                        onClick={handleSave}
                        style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '0.8rem' }}
                    >
                        {isSaving ? 'Saving...' : (message.id ? 'Update' : 'Save')}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '24px', flexGrow: 1, marginTop: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <textarea
                            ref={textareaRef}
                            placeholder={message.is_inbound ? "Enter the message you received..." : "Draft your message here..."}
                            value={message.draft_text || ''}
                            onChange={(e) => setMessage({ ...message, draft_text: e.target.value })}
                            onMouseUp={handleTextSelect}
                            style={{
                                flexGrow: 1,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                padding: '32px',
                                fontSize: '1.1rem',
                                lineHeight: '1.6',
                                resize: 'none',
                                outline: 'none',
                                fontFamily: 'inherit',
                                color: 'var(--text-main)'
                            }}
                        />
                        
                        {!message.draft_text && !isIterating && !message.is_inbound && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                pointerEvents: 'none'
                            }}>
                                <button 
                                    className="btn-primary" 
                                    onClick={(e) => { e.stopPropagation(); handleGenerateDraft(); }}
                                    style={{ pointerEvents: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                                >
                                    ✨ Start with AI Draft
                                </button>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '12px' }}>Or simply start typing to manual entry</p>
                            </div>
                        )}

                        {isIterating && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(2, 6, 23, 0.4)',
                                backdropFilter: 'blur(2px)',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10
                            }}>
                                <div className="loader" />
                            </div>
                        )}
                    </div>

                    {!message.is_inbound && (
                        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>AI Interaction</h4>
                                {highlightedText && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                                        Targeting {highlightedText.length} characters
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    className="input-field"
                                    placeholder="Give feedback to refine (e.g. 'Make it more empathetic', 'Include the homework')..."
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && feedback) handleIterate(); }}
                                    style={{ flexGrow: 1, margin: 0 }}
                                />
                                <button 
                                    className="btn-primary" 
                                    onClick={handleIterate}
                                    disabled={isIterating || !feedback}
                                    style={{ padding: '0 20px' }}
                                >
                                    Reflect
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="card" style={{ padding: '20px' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px' }}>Recipient</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select 
                                    className="search-input"
                                    style={{ margin: 0, flex: 1, padding: '8px' }}
                                    value={personContext?.id || ''}
                                    onChange={(e) => {
                                        const p = allPeople.find(x => x.id === parseInt(e.target.value));
                                        setPersonContext(p || null);
                                        setGroupContext(null);
                                    }}
                                >
                                    <option value="">Select Person...</option>
                                    {allPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>— OR —</div>

                            <select 
                                className="search-input"
                                style={{ margin: 0, padding: '8px' }}
                                value={groupContext?.id || ''}
                                onChange={(e) => {
                                    const g = allGroups.find(x => x.id === parseInt(e.target.value));
                                    setGroupContext(g || null);
                                    setPersonContext(null);
                                }}
                            >
                                <option value="">Select Group...</option>
                                {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {noteContext && (
                        <div className="card" style={{ padding: '20px', borderLeft: '3px solid var(--primary)' }}>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Source Note</h4>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{noteContext.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{noteContext.date}</div>
                            <div style={{ 
                                fontSize: '0.85rem', 
                                opacity: 0.8, 
                                lineHeight: '1.5',
                                display: '-webkit-box',
                                WebkitLineClamp: 8,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {noteContext.cleaned_text || noteContext.raw_capture}
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ padding: '20px' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px' }}>Status Lifecycle</h4>
                        <select
                            className="search-input"
                            style={{ margin: 0, width: '100%', padding: '8px' }}
                            value={message.status}
                            onChange={(e: any) => setMessage({ ...message, status: e.target.value })}
                        >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="archived">Archived</option>
                        </select>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                            {message.status === 'draft' ? 'Visible in drafts list' : (message.status === 'sent' ? 'Marked as completed engagement' : 'Hidden from active views')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessageAuthoring;
