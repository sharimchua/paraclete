import React, { useState, useEffect, useRef } from 'react';
import { api, Person, Note } from '../services/api';
import ReactMarkdown from 'react-markdown';


interface Props {
    personId?: number;
    groupId?: number;
    onComplete: () => void;
}

type Stage = 'Prepare' | 'Capture' | 'Refine';



const NoteAuthoring: React.FC<Props> = ({ personId, groupId, onComplete }) => {
    const [stage, setStage] = useState<Stage>('Prepare');
    const [person, setPerson] = useState<Person | null>(null);
    const [group, setGroup] = useState<any | null>(null);
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [rawText, setRawText] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentNote, setCurrentNote] = useState<Note | null>(null);
    const [isRefining, setIsRefining] = useState(false);

    const [suggestedDate, setSuggestedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [suggestedTags, setSuggestedTags] = useState<{ key: string, value: string }[]>([]);
    const [selectedTags, setSelectedTags] = useState<{ key: string, value: string }[]>([]);
    const [existingTaxonomy, setExistingTaxonomy] = useState<{ key: string, value: string }[]>([]);
    const [sessionBrief, setSessionBrief] = useState<string>('');
    const [isBriefing, setIsBriefing] = useState(false);
    const [isLlmReady, setIsLlmReady] = useState(true);
    const briefingFetchedFor = useRef<string | null>(null);



    useEffect(() => {
        const identifier = `${personId}-${groupId}`;
        if ((personId || groupId) && briefingFetchedFor.current !== identifier) {
            // Check LLM status first to provide better feedback
            api.get<{ is_ready: boolean }>('/llm/status')
                .then(res => setIsLlmReady(res.is_ready))
                .catch(() => setIsLlmReady(true)); // Fallback if endpoint fails

            briefingFetchedFor.current = identifier;
            setIsBriefing(true);
            api.post<{ result: string }>('/analysis/session-brief', {
                person_id: personId,
                group_id: groupId
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
    }, [personId, groupId]);



    useEffect(() => {
        const loadMainEntity = async () => {
            try {
                if (personId) {
                    const p = await api.get<Person>(`/persons/${personId}`);
                    setPerson(p);
                } else if (groupId) {
                    const g = await api.get<any>(`/groups/${groupId}`);
                    setGroup(g);
                }
            } catch (err) {
                console.error('Failed to load entity:', err);
            } finally {
                setLoading(false);
            }
        };

        const loadBackgroundData = async () => {
            try {
                const [notes, tags] = await Promise.all([
                    api.get<Note[]>(`/notes/`),
                    api.get<any[]>('/tags/')
                ]);
                setExistingTaxonomy(tags);
                if (personId) {
                    setRecentNotes(notes.filter(n => n.person_id === personId).slice(0, 3));
                } else if (groupId) {
                    setRecentNotes(notes.filter(n => n.group_id === groupId).slice(0, 3));
                }
            } catch (err) {
                console.error('Failed to load background data:', err);
            }
        };

        if (personId || groupId) {
            loadMainEntity();
            loadBackgroundData();
        } else {
            setLoading(false);
        }
    }, [personId, groupId]);


    const handleStartRefine = async () => {
        if (!rawText.trim()) return;

        // If we already have a draft for this exact raw text, just show it
        if (currentNote && currentNote.raw_capture === rawText) {
            setStage('Refine');
            return;
        }

        setIsRefining(true);
        setStage('Refine');

        try {
            // Call TRANSIENT analysis (Doesn't save to DB yet)
            const processRes = await api.post<{ result: string }>('/analysis/process', {
                raw_text: rawText,
                person_id: personId,
                group_id: groupId
            });

            // We'll update a local ref/state to hold the transient cleaned text
            // We use the Note type but it's not actually from the DB yet
            setCurrentNote({
                id: 0,
                title: `Session ${suggestedDate}`,
                cleaned_text: processRes.result,
                raw_capture: rawText,
                stage: 'Clean',
                date: suggestedDate,
                tags: []
            } as Note);

            // Extract entities (Transient)
            const metadata = await api.post<any>('/analysis/extract', {
                raw_text: rawText,
                person_id: personId,
                group_id: groupId
            });

            if (metadata.suggestedDate) {
                setSuggestedDate(metadata.suggestedDate);
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

    const handleUpdateNoteText = (val: string) => {
        if (currentNote) {
            setCurrentNote({ ...currentNote, cleaned_text: val });
        }
    };

    const handleSaveNote = async () => {
        setLoading(true);
        try {
            // Safety: Ensure date is correctly formatted or fallback to today
            const finalDate = (suggestedDate && /^\d{4}-\d{2}-\d{2}$/.test(suggestedDate)) 
                ? suggestedDate 
                : new Date().toISOString().split('T')[0];

            // 1. Create the note record
            const note = await api.post<Note>('/notes/', {
                title: currentNote?.title || `Session ${finalDate}`,
                date: finalDate,
                stage: 'Published',
                raw_capture: rawText,
                cleaned_text: currentNote?.cleaned_text || (rawText ? `Draft: ${rawText.substring(0, 100)}...` : ''),
                person_id: personId || null,
                group_id: groupId || null
            });


            // 2. Link tags
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
            console.error('Analysis failed:', err);
            setIsRefining(false);
        } finally {
            setIsRefining(false);
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
                    {/* Spacer for balance */}
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
                                    {s.label}
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
                            if (stage === 'Capture') handleStartRefine();
                        }}
                    >
                        &rsaquo;
                    </button>
                </div>

                <div style={{ width: '120px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        className="btn-primary" 
                        disabled={!rawText.trim()}
                        onClick={handleSaveNote}
                        style={{ padding: '8px 24px', borderRadius: '12px' }}
                    >
                        Save
                    </button>
                </div>
            </div>



            <div style={{ marginTop: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {stage === 'Prepare' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Prepare for Session</h2>
                            {person ? (
                                <p style={{ color: 'var(--text-secondary)' }}>Setting context for <strong>{person.name}</strong>.</p>
                            ) : group ? (
                                <p style={{ color: 'var(--text-secondary)' }}>Setting context for group <strong>{group.name}</strong>.</p>
                            ) : (
                                <p style={{ color: 'var(--text-secondary)' }}>New general session.</p>
                            )}
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
                                                {isLlmReady ? 'Generating Brief...' : 'Warming up AI Engine (Loading 20GB Model)...'}
                                            </p>
                                        </div>

                                    ) : sessionBrief ? (
                                        <div className="markdown-brief" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                                            <ReactMarkdown>{sessionBrief}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p style={{ color: 'var(--primary)' }}>Suggestions will appear here once you have session history. Focus on foundational goals today.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Nav Buttons Removed as per request */}

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
                                <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Extracting metadata, identifying dates, and structuring your notes.</p>
                                <div className="loader" style={{ margin: '32px auto' }} />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Refinement & Structure</h2>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Verify metadata and polish the structured record.</p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        {/* Save button already moved to top nav bar */}
                                    </div>


                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', flexGrow: 1 }}>
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
                                            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Session Date</h4>
                                            <input
                                                type="date"
                                                value={suggestedDate}
                                                onChange={(e) => setSuggestedDate(e.target.value)}
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
