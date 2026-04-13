import React, { useState, useEffect, useRef } from 'react';
import { api, Note, Person, Group, Message } from '../services/api';

interface MessageAuthoringProps {
    messageId?: number;
    noteId?: number;
    personId?: number;
    groupId?: number;
    initialDate?: string;
    onComplete: () => void;
    onViewNote?: (noteId: number) => void;
    setIsDirty?: (dirty: boolean) => void;
}

const MessageAuthoring: React.FC<MessageAuthoringProps> = ({ 
    messageId, 
    noteId, 
    personId, 
    groupId, 
    initialDate,
    onComplete,
    onViewNote,
    setIsDirty
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
                let currentMessage = { ...message };

                if (messageId) {
                    const existing = await api.get<Message>(`/api/messages/${messageId}`);
                    currentMessage = { ...existing };
                    setMessage(existing);
                }

                const nid = noteId || currentMessage.note_id;
                const pid = personId || currentMessage.person_id;
                const gid = groupId || currentMessage.group_id;

                if (nid) {
                    const n = await api.get<Note>(`/notes/${nid}`);
                    setNoteContext(n);
                }
                
                if (pid) {
                    const p = await api.get<Person>(`/persons/${pid}`);
                    setPersonContext(p);
                } else if (gid) {
                    const g = await api.get<Group>(`/groups/${gid}`);
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

    const handleDelete = async () => {
        if (!message.id) return;
        
        const confirmed = window.confirm("Are you sure you want to delete this message? This action cannot be undone.");
        if (!confirmed) return;
        
        try {
            await api.delete(`/api/messages/${message.id}`);
            if (setIsDirty) setIsDirty(false);
            onComplete();
        } catch (err) {
            console.error('Failed to delete message:', err);
            alert('Failed to delete message.');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const data = {
                ...message,
                note_id: noteId || message.note_id || noteContext?.id || null,
                person_id: personId || message.person_id || personContext?.id || null,
                group_id: groupId || message.group_id || groupContext?.id || null,
            };

            if (message.id) {
                await api.patch<Message>(`/api/messages/${message.id}`, data);
            } else {
                const created = await api.post<Message>('/api/messages/', data);
                setMessage(created);
            }
            if (setIsDirty) setIsDirty(false);
            onComplete();
        } catch (err) {
            console.error('Failed to save message:', err);
            alert('Failed to save message.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateDraft = async () => {
        let msgId = message.id;
        if (!msgId) {
            try {
                const created = await api.post<Message>('/api/messages/', {
                    ...message,
                    note_id: noteId || message.note_id || noteContext?.id || null,
                    person_id: personId || message.person_id || personContext?.id || null,
                    group_id: groupId || message.group_id || groupContext?.id || null
                });
                setMessage(created);
                msgId = created.id;
            } catch (err) {
                console.error('Initial save for draft failed:', err);
                return;
            }
        }

        if (message.draft_text && message.draft_text.trim().length > 0) {
            const confirmOverwrite = window.confirm("You already have an existing draft. Starting a new AI draft will overwrite your current progress. Do you wish to continue?");
            if (!confirmOverwrite) return;
        }

        setIsIterating(true);
        try {
            const res = await api.post<{ draft_text: string }>(`/api/messages/${msgId}/iterate`, {
                feedback: "Draft a professional follow-up based on the available context.",
            });
            setMessage(prev => ({ ...prev, draft_text: res.draft_text }));
            if (setIsDirty) setIsDirty(true);
        } catch (err) {
            console.error('Drafting failed:', err);
        } finally {
            setIsIterating(false);
        }
    };

    const handleIterate = async () => {
        if (!message.id) {
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
            if (setIsDirty) setIsDirty(true);
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

    const copyFormattedMessage = async () => {
        const text = message.draft_text || '';
        if (!text) return;

        // Simple markdown to HTML conversion for common email formatting
        let html = text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^\- (.*$)/gim, '<li>$1</li>')
            .trim();
        
        // Wrap lists
        html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
        
        // Wrap paragraphs
        html = html.split('\n\n').map(p => {
            if (p.startsWith('<h') || p.startsWith('<ul')) return p;
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('\n');

        const finalHtml = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; color: #1f2937; line-height: 1.6;">${html}</div>`;

        try {
            const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
            const textBlob = new Blob([text], { type: 'text/plain' });
            const data = [new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })];
            await navigator.clipboard.write(data);
            
            // Visual feedback
            const btn = document.getElementById('copy-email-btn');
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                btn.style.borderColor = 'var(--primary)';
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.style.borderColor = 'var(--border)';
                }, 2000);
            }
        } catch (err) {
            console.error('Copy failed:', err);
            await navigator.clipboard.writeText(text);
            alert('Copied as plain text (Formated copy blocked by browser/environment)');
        }
    };

    if (loading) return <div className="loader" />;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="toolbar">
                <div style={{ width: '250px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Message Composer</h2>
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
                        onChange={(e) => {
                            setMessage({ ...message, date: e.target.value });
                            if (setIsDirty) setIsDirty(true);
                        }}
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
                    {message.id && (
                        <button 
                            className="btn-secondary" 
                            onClick={handleDelete}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: '8px', 
                                fontSize: '0.8rem',
                                color: 'var(--error, #f43f5e)',
                                borderColor: 'var(--error, #f43f5e)',
                                opacity: 0.8
                            }}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '24px', flexGrow: 1, marginTop: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <textarea
                            ref={textareaRef}
                            placeholder={message.is_inbound ? "Enter the message you received..." : "Draft your message here..."}
                            value={message.draft_text || ''}
                            onChange={(e) => {
                                setMessage({ ...message, draft_text: e.target.value });
                                if (setIsDirty) setIsDirty(true);
                            }}
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
                                color: 'var(--text-main)',
                                transition: 'all 0.2s ease'
                            }}
                        />

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
                    {!message.is_inbound && (
                        <div className="card" style={{ padding: '20px', border: '1px solid var(--primary-faded)', background: 'var(--primary-faded-more)' }}>
                            <button 
                                className="btn-primary" 
                                onClick={handleGenerateDraft}
                                disabled={isIterating}
                                style={{ 
                                    width: '100%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: '8px', 
                                    opacity: isIterating ? 0.7 : 1,
                                    cursor: isIterating ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isIterating ? 'Working...' : '✨ Perform AI Draft'}
                            </button>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                                Generates a fresh professional draft using the source context and history.
                            </p>
                        </div>
                    )}

                    <div className="card" style={{ padding: '20px' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px' }}>Contact</h4>
                        <div style={{ 
                            padding: '12px', 
                            border: '1px solid var(--border)', 
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            background: 'var(--bg-surface-elevated)'
                        }}>
                            {personContext ? (
                                <>
                                    <span style={{ fontSize: '1.2rem' }}>👤</span>
                                    <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{personContext.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Person</div>
                                </div>
                            </>
                        ) : groupContext ? (
                            <>
                                <span style={{ fontSize: '1.2rem' }}>👥</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{groupContext.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Group</div>
                                </div>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No Contact Assigned</div>
                        )}
                    </div>
                </div>

                    <div className="card" style={{ padding: '20px', borderLeft: noteContext ? '3px solid var(--primary)' : '3px solid var(--text-muted)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Source Note</h4>
                            {noteContext && onViewNote && (
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => onViewNote(noteContext.id)}
                                    style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                                >
                                    View Note &rsaquo;
                                </button>
                            )}
                        </div>
                        
                        {noteContext ? (
                            <>
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
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: '12px 0' }}>
                                No source note associated with this message.
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ padding: '20px' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px' }}>Export Actions</h4>
                        <button 
                            id="copy-email-btn"
                            className="btn-secondary" 
                            onClick={copyFormattedMessage}
                            style={{ 
                                width: '100%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px',
                                background: 'rgba(255,255,255,0.02)',
                                padding: '10px'
                            }}
                        >
                            <span>📋</span> Copy as Formatted Email
                        </button>
                    </div>

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
