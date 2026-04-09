import React, { useState, useEffect } from 'react';
import { api, Note, Persona } from '../services/api';

interface Props {
    note: Note;
}

const NoteUtilities: React.FC<Props> = ({ note }) => {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [isDrafting, setIsDrafting] = useState<number | null>(null);

    useEffect(() => {
        const fetchUtilities = async () => {
            try {
                // Fetch Suggestions
                const sugData = await api.get<any[]>(`/api/references/suggest?note_id=${note.id}`);
                setSuggestions(sugData);

                // Fetch Personas for drafting
                const personaData = await api.get<Persona[]>('/api/framework/personas');
                setPersonas(personaData);
            } catch (err) {
                console.error('Failed to fetch note utilities:', err);
            }
        };
        fetchUtilities();
    }, [note.id]);

    const handleDraft = async (personaId: number) => {
        setIsDrafting(personaId);
        try {
            const resp = await api.post<any>(`/api/framework/draft-message?note_id=${note.id}&persona_id=${personaId}`, {});
            setDrafts(prev => ({ ...prev, [personaId]: resp.draft }));
        } catch (err) {
            console.error('Failed to draft message:', err);
            alert('Failed to draft message');
        } finally {
            setIsDrafting(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '16px' }}>
                    Reference Suggestions
                </h3>
                {suggestions.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No relevant references found.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {suggestions.map((sug, idx) => (
                            <div key={idx} style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{sug.reference.title}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Score: {Math.round(sug.score * 100)}%</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {sug.reference.body}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '16px' }}>
                    Persona Follow-ups
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {personas.map(persona => (
                        <div key={persona.id} style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{persona.name}</span>
                                <button 
                                    className="btn-secondary" 
                                    style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                    onClick={() => handleDraft(persona.id)}
                                    disabled={isDrafting === persona.id}
                                >
                                    {isDrafting === persona.id ? 'Drafting...' : 'Draft Message'}
                                </button>
                            </div>
                            {drafts[persona.id] && (
                                <div style={{ 
                                    marginTop: '8px', 
                                    padding: '12px', 
                                    background: 'rgba(56, 189, 248, 0.05)', 
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    lineHeight: '1.5',
                                    color: 'var(--text-main)',
                                    border: '1px solid var(--border)'
                                }}>
                                    {drafts[persona.id]}
                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn-secondary" style={{ fontSize: '0.65rem' }} onClick={() => navigator.clipboard.writeText(drafts[persona.id])}>Copy</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default NoteUtilities;
