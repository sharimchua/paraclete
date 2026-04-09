import React, { useState, useEffect, useRef } from 'react';
import { api, Person, Note } from '../services/api';
import ReactMarkdown from 'react-markdown';


interface Props {
    personId?: number;
    groupId?: number;
    noteId?: number; // Added for editing
    onComplete: () => void;
}

type Stage = 'Prepare' | 'Capture' | 'Refine';

const NoteAuthoring: React.FC<Props> = ({ personId, groupId, noteId, onComplete }) => {
    const [stage, setStage] = useState<Stage>('Prepare');
    const [person, setPerson] = useState<Person | null>(null);
    const [group, setGroup] = useState<any | null>(null);
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [rawText, setRawText] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentNote, setCurrentNote] = useState<Note | null>(null);
    const [isRefining, setIsRefining] = useState(false);
    const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);

    const [sessionDate, setSessionDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [suggestedTags, setSuggestedTags] = useState<{ key: string, value: string }[]>([]);
    const [selectedTags, setSelectedTags] = useState<any[]>([]);
    const [existingTaxonomy, setExistingTaxonomy] = useState<any[]>([]);
    const [sessionBrief, setSessionBrief] = useState<string>('');
    const [isBriefing, setIsBriefing] = useState(false);
    const [isLlmReady, setIsLlmReady] = useState(true);
    const briefingFetchedFor = useRef<string | null>(null);

    // Load existing note if noteId is provided
    useEffect(() => {
        if (noteId) {
            setLoading(true);
            api.get<Note>(`/notes/${noteId}`)
                .then(n => {
                    setCurrentNote(n);
                    setRawText(n.raw_capture || '');
                    setTitle(n.title || '');
                    setSessionDate(n.date);
                    setSelectedTags(n.tags || []);
                    if (n.session_brief) setSessionBrief(n.session_brief);
                    
                    // If note has cleaned text already, we might want to skip directly to Refine? 
                    // No, let's start at Prepare to show the persistent brief.
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Failed to load note:', err);
                    setLoading(false);
                });
        }
    }, [noteId]);

    useEffect(() => {
        const identifier = `${personId}-${groupId}-${noteId}`;
        if ((personId || groupId || noteId) && briefingFetchedFor.current !== identifier) {
            // Check LLM status first to provide better feedback
            api.get<{ is_ready: boolean }>('/llm/status')
                .then(res => setIsLlmReady(res.is_ready))
                .catch(() => setIsLlmReady(true)); // Fallback if endpoint fails

            briefingFetchedFor.current = identifier;
            setIsBriefing(true);
            api.post<{ result: string }>('/analysis/session-brief', {
                person_id: personId,
                group_id: groupId,
                note_id: noteId
            }).then(res => {
                setSessionBrief(res.result);
                setIsBriefing(false);
                setIsLlmReady(true);
            }).catch(err => {
                console.error('Briefing failed:', err);
                setIsBriefing(false);
                briefingFetchedFor.current = null; // Allow retry on failure
            });
        }
    }, [personId, groupId, noteId]);

    useEffect(() => {
        const loadMainEntity = async () => {
            try {
                if (personId) {
                    const p = await api.get<Person>(`/persons/${personId}`);
                    setPerson(p);
                } else if (groupId) {
                    const g = await api.get<any>(`/groups/${groupId}`);
                    setGroup(g);
                } else if (noteId && currentNote) {
                    if (currentNote.person_id) {
                         const p = await api.get<Person>(`/persons/${currentNote.person_id}`);
                         setPerson(p);
                    } else if (currentNote.group_id) {
                         const g = await api.get<any>(`/groups/${currentNote.group_id}`);
                         setGroup(g);
                    }
                }
            } catch (err) {
                console.error('Failed to load entity:', err);
            } finally {
                if (!noteId) setLoading(false);
            }
        };

        const loadBackgroundData = async () => {
            try {
                const [notes, tags] = await Promise.all([
                    api.get<Note[]>(`/notes/`),
                    api.get<any[]>('/tags/')
                ]);
                setExistingTaxonomy(tags);
                
                const pid = personId || currentNote?.person_id;
                const gid = groupId || currentNote?.group_id;

                if (pid) {
                    setRecentNotes(notes.filter(n => n.person_id === pid && n.id !== noteId).slice(0, 3));
                } else if (gid) {
                    setRecentNotes(notes.filter(n => n.group_id === gid && n.id !== noteId).slice(0, 3));
                }
            } catch (err) {
                console.error('Failed to load background data:', err);
            }
        };

        if (personId || groupId || noteId) {
            loadMainEntity();
            loadBackgroundData();
        } else {
            setLoading(false);
        }
    }, [personId, groupId, noteId, currentNote?.id]);

    const handleStartRefine = async (force: boolean = false) => {
        if (!rawText.trim()) return;

        // If we already have a draft for this exact raw text, just show it
        if (!force && currentNote && currentNote.raw_capture === rawText && currentNote.cleaned_text) {
            setStage('Refine');
            return;
        }

        setIsRefining(true);
        setStage('Refine');

        try {
            // Call TRANSIENT analysis (Doesn't save to DB yet)
            const processRes = await api.post<{ result: string }>('/analysis/process', {
                raw_text: rawText,
                person_id: personId || currentNote?.person_id,
                group_id: groupId || currentNote?.group_id
            });

            // We'll update a local ref/state to hold the transient cleaned text
            setCurrentNote({
                id: noteId || 0,
                title: title || `Session ${sessionDate}`,
                cleaned_text: processRes.result,
                raw_capture: rawText,
                session_brief: sessionBrief,
                stage: 'Clean',
                date: sessionDate,
                tags: selectedTags
            } as any);

            // Extract entities (Transient)
            const metadata = await api.post<any>('/analysis/extract', {
                raw_text: rawText,
                person_id: personId || currentNote?.person_id,
                group_id: groupId || currentNote?.group_id
            });

            if (metadata.suggestedDate && !noteId) {
                setSessionDate(metadata.suggestedDate);
            }
            if (metadata.tags) {
                setSuggestedTags(metadata.tags);
            }

            setIsRefining(false);
        } catch (err) {
            console.error('Failed to process note:', err);
            setStage('Capture');
            setIsRefining(false);
            alert('Failed to process with AI. Please try again.');
        }
    };

    const handleSuggestTitle = async () => {
        const textToAnalyze = currentNote?.cleaned_text || rawText;
        if (!textToAnalyze) return;

        setIsSuggestingTitle(true);
        try {
            const res = await api.post<{ result: string }>('/analysis/suggest-title', {
                text: textToAnalyze
            });
            setTitle(res.result);
        } catch (err) {
            console.error('Failed to suggest title:', err);
        } finally {
            setIsSuggestingTitle(false);
        }
    };

    const handleUpdateNoteText = (val: string) => {
        if (currentNote) {
            setCurrentNote({ ...currentNote, cleaned_text: val });
        }
    };

    const handleSaveNote = async () => {
        setLoading(true);
        try {
            const finalDate = (sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) 
                ? sessionDate 
                : new Date().toISOString().split('T')[0];

            let note: Note;
            const noteData = {
                title: title || `Session ${finalDate}`,
                date: finalDate,
                stage: stage === 'Refine' ? 'Published' : (stage === 'Capture' ? 'Capture' : 'Prepare'),
                raw_capture: rawText,
                cleaned_text: currentNote?.cleaned_text || (rawText ? `Draft: ${rawText.substring(0, 100)}...` : ''),
                session_brief: sessionBrief,
                person_id: personId || currentNote?.person_id || null,
                group_id: groupId || currentNote?.group_id || null
            };

            if (noteId) {
                note = await api.patch<Note>(`/notes/${noteId}`, noteData);
            } else {
                note = await api.post<Note>('/notes/', noteData);
            }

            // 2. Link tags
            // First, clear old tags if updating? 
            // In a real app we'd need a way to clear them. For now, let's just add new ones.
            // Better: api.post('/tags/link') already handles duplicates gracefully in backend if we implement it.
            for (const tagObj of selectedTags) {
                const tag = await api.post<any>('/tags/', { 
                    key: tagObj.key, 
                    value: tagObj.value 
                });
                await api.post('/tags/link', {
                    tag_id: tag.id,
                    entity_type: 'note',
                    entity_id: note.id
                });
            }

            // 3. Then publish (which triggers embedding)
            await api.post(`/notes/${note.id}/publish`, {});
            onComplete();
        } catch (err) {
            console.error('Save failed:', err);
            setIsRefining(false);
        } finally {
            setIsRefining(false);
        }
    };

    const handleDeleteNote = async () => {
        if (!noteId) return;
        if (window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
            try {
                await api.delete(`/notes/${noteId}`);
                onComplete();
            } catch (err) {
                console.error('Delete failed:', err);
                alert('Failed to delete note.');
            }
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ocr' | 'dictate') => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const endpoint = type === 'ocr' ? '/process/ocr' : '/process/dictate';
            const data = await api.postForm<{ text: string }>(endpoint, formData);
            setRawText(prev => prev + (prev ? "\n\n" : "") + data.text);
        } catch (err) {
            console.error(`${type.toUpperCase()} failed:`, err);
            alert(`${type.toUpperCase()} processing failed. Check Developer Logs.`);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loader" />;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb Pill Navigation & Global Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ width: '120px' }}>
                    {noteId && (
                        <button 
                            className="btn-secondary" 
                            style={{ color: '#ef4444', fontSize: '0.85rem' }}
                            onClick={handleDeleteNote}
                        >
                            Delete Note
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        className="btn-secondary" 
                        style={{ padding: '8px', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={stage === 'Prepare'}
                        onClick={() => {
                            if (stage === 'Capture') setStage('Prepare');
                            if (stage === 'Refine') setStage('Capture');
                        }}
                    >
                        &lsaquo;
                    </button>

                    <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', padding: '6px', borderRadius: '100px', border: '1px solid var(--border)', gap: '4px' }}>
                        {[
                            { id: 'Prepare', label: 'Preparation' },
                            { id: 'Capture', label: 'Capture' },
                            { id: 'Refine', label: 'Refinement' }
                        ].map((s) => {
                            const isActive = stage === s.id;
                            const isDisabled = s.id === 'Refine' && !rawText.trim();
                            
                            return (
                                <div
                                    key={s.id}
                                    onClick={() => !isDisabled ? (s.id === 'Refine' ? handleStartRefine() : setStage(s.id as Stage)) : null}
                                    style={{
                                        padding: '8px 20px',
                                        borderRadius: '100px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        background: isActive ? 'var(--primary)' : 'transparent',
                                        color: isActive ? 'var(--bg-deep)' : (isDisabled ? 'var(--text-muted)' : 'var(--text-main)'),
                                        transition: 'all 0.2s ease',
                                        opacity: isDisabled ? 0.5 : 1
                                    }}
                                >
                                    {isActive && isRefining && s.id === 'Refine' ? 'Processing...' : s.label}
                                </div>
                            );
                        })}
                    </div>

                    <button 
                        className="btn-secondary" 
                        style={{ padding: '8px', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        disabled={stage === 'Refine' || (stage === 'Capture' && !rawText.trim())}
                        onClick={() => {
                            if (stage === 'Prepare') setStage('Capture');
                            if (stage === 'Capture') handleStartRefine(false);
                        }}
                    >
                        &rsaquo;
                    </button>
                </div>

                <div style={{ width: '120px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        className="btn-primary" 
                        disabled={loading || isBriefing}
                        onClick={handleSaveNote}
                        style={{ padding: '8px 24px', borderRadius: '12px' }}
                    >
                        {noteId ? 'Update' : 'Save Draft'}
                    </button>
                </div>
            </div>

            <div style={{ marginTop: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {stage === 'Prepare' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div className="card" style={{ borderLeft: '4px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{noteId ? 'Review Session Context' : 'Prepare for Session'}</h2>
                                {person ? (
                                    <p style={{ color: 'var(--text-secondary)' }}>Context for <strong>{person.name}</strong>.</p>
                                ) : group ? (
                                    <p style={{ color: 'var(--text-secondary)' }}>Context for group <strong>{group.name}</strong>.</p>
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)' }}>General session.</p>
                                )}
                            </div>
                            
                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Session Date</label>
                                <input
                                    type="date"
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className="input-field"
                                    style={{ 
                                        padding: '8px 12px', 
                                        borderRadius: '8px', 
                                        background: 'var(--bg-deep)', 
                                        border: '1px solid var(--border)',
                                        fontSize: '1rem',
                                        width: '180px',
                                        cursor: 'pointer',
                                        colorScheme: 'dark' // Ensures the picker is visible in dark mode
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <h4 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recent Context</h4>
                                {recentNotes.length === 0 ? (
                                    <div className="card" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No previous sessions found.</div>
                                ) : (
                                    recentNotes.map(n => (
                                        <div key={n.id} className="card" style={{ padding: '16px', fontSize: '0.9rem' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>{n.date}</div>
                                            <div style={{ fontWeight: 600 }}>{n.title}</div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <h4 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)' }}>AI Session Brief</h4>
                                <div className="card" style={{ 
                                    background: 'var(--primary-faded)', 
                                    borderColor: 'var(--primary)', 
                                    color: 'var(--text-main)', 
                                    fontSize: '0.9rem',
                                    minHeight: '120px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: isBriefing ? 'center' : 'flex-start'
                                }}>
                                    {isBriefing ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <div className="loader" style={{ scale: '0.5', margin: '0 auto' }} />
                                            <p style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '8px' }}>
                                                {isLlmReady ? 'Generating Brief...' : 'Warming up AI Engine...'}
                                            </p>
                                        </div>

                                    ) : sessionBrief ? (
                                        <div className="markdown-brief" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                                            <ReactMarkdown>{sessionBrief}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p style={{ color: 'var(--primary)' }}>Suggestions will appear here once you have session history.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {stage === 'Capture' && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Capture Mode</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Direct focus scratchpad</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <span>🎤</span> Dictate
                                    <input type="file" hidden accept="audio/*" onChange={(e) => handleFileUpload(e, 'dictate')} />
                                </label>
                                <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <span>📄</span> OCR
                                    <input type="file" hidden accept="image/*" onChange={(e) => handleFileUpload(e, 'ocr')} />
                                </label>
                            </div>

                        </div>

                        <textarea
                            autoFocus
                            placeholder="Start typing your session notes..."
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
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
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>
                )}

                {stage === 'Refine' && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                        {isRefining ? (
                            <div className="card" style={{ textAlign: 'center', padding: '64px', margin: 'auto' }}>
                                <h3>AI Refinement in Progress...</h3>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Extracting metadata and structuring your notes.</p>
                                <div className="loader" style={{ margin: '32px auto' }} />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Refinement & Structure</h2>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Verify metadata and polish the structured record.</p>
                                    </div>
                                    <button 
                                        className="btn-secondary" 
                                        onClick={() => handleStartRefine(true)}
                                        disabled={isRefining || !rawText.trim()}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}
                                    >
                                        <span>🔍</span> {isRefining ? 'Analysing...' : 'Re-Analyse Capture'}
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', flexGrow: 1 }}>
                                    <textarea
                                        value={currentNote?.cleaned_text || ''}
                                        onChange={(e) => handleUpdateNoteText(e.target.value)}
                                        style={{
                                            background: 'var(--bg-surface)',
                                            border: '1px solid var(--primary)',
                                            borderRadius: '12px',
                                            padding: '32px',
                                            fontSize: '1.05rem',
                                            lineHeight: '1.7',
                                            resize: 'none',
                                            outline: 'none',
                                            fontFamily: 'inherit'
                                        }}
                                    />

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                        <div className="card" style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Note Title</h4>
                                                <button 
                                                    className="btn-secondary" 
                                                    style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                                    onClick={handleSuggestTitle}
                                                    disabled={isSuggestingTitle}
                                                >
                                                    {isSuggestingTitle ? 'Suggesting...' : '✨ Suggest Theme'}
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Enter a title..."
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600
                                                }}
                                            />
                                        </div>

                                        {/* Date moved to Prepare stage but kept here for final verification */}
                                        <div className="card" style={{ padding: '20px' }}>
                                            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Session Date</h4>
                                            <input
                                                type="date"
                                                value={sessionDate}
                                                onChange={(e) => setSessionDate(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)',
                                                    fontSize: '0.9rem'
                                                }}
                                            />
                                        </div>

                                        <div className="card" style={{ padding: '20px', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Applied Tags</h4>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {selectedTags.map((t, i) => {
                                                        const exists = existingTaxonomy.some(et => et.value === t.value && et.key === t.key);
                                                        return (
                                                            <div
                                                                key={i}
                                                                style={{
                                                                    background: exists ? 'var(--primary)' : 'transparent',
                                                                    color: exists ? 'white' : 'var(--primary)',
                                                                    border: exists ? 'none' : '1px dashed var(--primary)',
                                                                    padding: '4px 12px',
                                                                    borderRadius: '16px',
                                                                    fontSize: '0.8rem',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px'
                                                                }}
                                                                title={exists ? 'Established Tag' : 'New Tag'}
                                                            >
                                                                <strong>{t.key}:</strong> {t.value}
                                                                <span
                                                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                                                    onClick={() => setSelectedTags(prev => prev.filter(v => v.value !== t.value || v.key !== t.key))}
                                                                >
                                                                    &times;
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {selectedTags.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No tags applied.</span>}
                                                </div>
                                            </div>

                                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '12px', opacity: 0.8 }}>AI Suggestions</h4>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {suggestedTags.filter(st => !selectedTags.some(sel => sel.key === st.key && sel.value === st.value)).map((t, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => setSelectedTags(prev => [...prev, t])}
                                                            style={{
                                                                background: 'var(--primary-faded)',
                                                                color: 'var(--primary)',
                                                                padding: '4px 10px',
                                                                borderRadius: '16px',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                border: '1px dashed var(--primary)'
                                                            }}
                                                        >
                                                            + {t.key}: {t.value}
                                                        </div>
                                                    ))}
                                                    {suggestedTags.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Scanning for clues...</span>}
                                                </div>
                                            </div>

                                            <div style={{ marginTop: 'auto' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Add tag (Key: Value)..."
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = (e.target as HTMLInputElement).value.trim();
                                                            if (val.includes(':')) {
                                                                const [k, v] = val.split(':').map(s => s.trim());
                                                                if (k && v) {
                                                                    setSelectedTags(prev => [...prev, { key: k, value: v }]);
                                                                    (e.target as HTMLInputElement).value = '';
                                                                }
                                                            } else if (val) {
                                                                setSelectedTags(prev => [...prev, { key: 'General', value: val }]);
                                                                (e.target as HTMLInputElement).value = '';
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        fontSize: '0.9rem'
                                                    }}
                                                />
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Use format 'Category: Value'</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NoteAuthoring;
