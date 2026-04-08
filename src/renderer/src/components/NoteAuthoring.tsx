import React, { useState, useEffect } from 'react';
import { api, Person, Note } from '../services/api';

interface Props {
    personId?: number;
    onComplete: () => void;
}

type Stage = 'Prepare' | 'Capture' | 'Clean' | 'Publish';

const NoteAuthoring: React.FC<Props> = ({ personId, onComplete }) => {
    const [stage, setStage] = useState<Stage>('Prepare');
    const [person, setPerson] = useState<Person | null>(null);
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [rawText, setRawText] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (personId) {
            Promise.all([
                api.get<Person>(`/persons/${personId}`),
                api.get<Note[]>(`/notes/`) // Filter later
            ]).then(([p, notes]) => {
                setPerson(p);
                setRecentNotes(notes.filter(n => n.person_id === personId).slice(0, 3));
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [personId]);

    const handleSaveCapture = async () => {
        setStage('Clean');
        try {
            const date = new Date().toISOString().split('T')[0];
            await api.post('/notes/', {
                title: `Session ${date}`,
                date: date,
                stage: 'Clean',
                raw_capture: rawText,
                person_id: personId
            });
            // In a real app, we'd wait for AI cleaning to happen here.
            // For now, we just wait a bit to show the "Cleaning" UI.
            setTimeout(() => {
                onComplete();
            }, 2000);
        } catch (err) {
            console.error('Failed to save note:', err);
            setStage('Capture');
            alert('Failed to save note. Please try again.');
        }
    };

    if (loading) return <div className="loader" />;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Stage Progress Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {['Prepare', 'Capture', 'Clean', 'Publish'].map((s) => (
                    <div 
                        key={s}
                        style={{ 
                            flex: 1, 
                            height: '4px', 
                            borderRadius: '2px',
                            background: stage === s || (stage === 'Capture' && s === 'Prepare') || (stage === 'Clean' && ['Prepare', 'Capture'].includes(s)) || (stage === 'Publish' && s !== 'Publish') ? 'var(--primary)' : 'var(--border)',
                            opacity: stage === s ? 1 : 0.3
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
                        <button className="btn-primary" onClick={handleSaveCapture}>Finish & Clean &rsaquo;</button>
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

            {stage === 'Clean' && (
                <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
                    <h3>Cleaning in Progress...</h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Our local AI is structuring your capture. One moment.</p>
                    <div className="loader" style={{ margin: '32px auto' }} />
                    <button className="btn-primary" onClick={() => onComplete()}>Skip for now</button>
                </div>
            )}
        </div>
    );
};

export default NoteAuthoring;
