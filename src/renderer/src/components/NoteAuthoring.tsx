import React, { useState, useEffect } from 'react';
import { api, Person, Note } from '../services/api';

interface Props {
    personId?: number;
    groupId?: number;
    onComplete: () => void;
}

type Stage = 'Prepare' | 'Capture' | 'Analyse' | 'Publish';

const NoteAuthoring: React.FC<Props> = ({ personId, groupId, onComplete }) => {
    const [stage, setStage] = useState<Stage>('Prepare');
    const [person, setPerson] = useState<Person | null>(null);
    const [group, setGroup] = useState<any | null>(null);
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [rawText, setRawText] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentNote, setCurrentNote] = useState<Note | null>(null);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [suggestedDate, setSuggestedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [suggestedTags, setSuggestedTags] = useState<{ key: string, value: string }[]>([]);
    const [selectedTags, setSelectedTags] = useState<{ key: string, value: string }[]>([]);
    const [existingTaxonomy, setExistingTaxonomy] = useState<{ key: string, value: string }[]>([]);

    useEffect(() => {
        if (personId) {
            Promise.all([
                api.get<Person>(`/persons/${personId}`),
                api.get<Note[]>(`/notes/`),
                api.get<any[]>('/tags/')
            ]).then(([p, notes, tags]) => {
                setPerson(p);
                setExistingTaxonomy(tags);
                setRecentNotes(notes.filter(n => n.person_id === personId).slice(0, 3));
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });
        } else if (groupId) {
            Promise.all([
                api.get<any>(`/groups/${groupId}`),
                api.get<Note[]>(`/notes/`),
                api.get<any[]>('/tags/')
            ]).then(([g, notes, tags]) => {
                setGroup(g);
                setExistingTaxonomy(tags);
                setRecentNotes(notes.filter(n => n.group_id === groupId).slice(0, 3));
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [personId, groupId]);

    const handleStartAnalyse = async () => {
        setStage('Analyse');
        setIsAnalysing(true);
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

            setIsAnalysing(false);
        } catch (err) {
            console.error('Failed to process note:', err);
            setStage('Capture');
            setIsAnalysing(false);
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

            // 1. Create the note record for real at the very end
            const note = await api.post<Note>('/notes/', {
                title: `Session ${finalDate}`,
                date: finalDate,
                stage: 'Published',
                raw_capture: rawText,
                cleaned_text: currentNote?.cleaned_text || '',
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
            console.error(err);
            alert("Failed to save note.");
        } finally {
            setLoading(false);
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
            {/* Stage Progress Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {['Prepare', 'Capture', 'Analyse', 'Save'].map((s) => (
                    <div
                        key={s}
                        style={{
                            flex: 1,
                            height: '4px',
                            borderRadius: '2px',
                            background: stage === s || (stage === 'Capture' && s === 'Prepare') || (stage === 'Analyse' && ['Prepare', 'Capture'].includes(s)) || (stage === 'Publish' && s !== 'Publish') ? 'var(--primary)' : 'var(--border)',
                            opacity: (stage === s || (stage === 'Analyse' && s === 'Analyse')) ? 1 : 0.3
                        }}
                    />
                ))}
            </div>

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
                            <div className="card" style={{ background: 'var(--primary-faded)', borderColor: 'var(--primary)', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                <p>Suggestions will appear here once you have session history. Focus on foundational goals today.</p>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn-primary" onClick={() => setStage('Capture')}>Enter Capture Mode &rsaquo;</button>
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
                            <button className="btn-primary" onClick={handleStartAnalyse}>Analyse</button>
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

            {stage === 'Analyse' && (
                <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                    {isAnalysing ? (
                        <div className="card" style={{ textAlign: 'center', padding: '64px', margin: 'auto' }}>
                            <h3>AI Analysis in Progress...</h3>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Extracting metadata, identifying dates, and structuring your notes.</p>
                            <div className="loader" style={{ margin: '32px auto' }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Review & Structure</h2>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Verify metadata and polish the structured record.</p>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="btn-secondary" onClick={() => setStage('Capture')}>&lsaquo; Edit Raw</button>
                                    <button className="btn-primary" onClick={handleSaveNote}>Save Session Note &rsaquo;</button>
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
    );
};

export default NoteAuthoring;
