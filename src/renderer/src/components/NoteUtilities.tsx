import React, { useState, useEffect } from 'react';
import { api, Note } from '../services/api';

interface Props {
    note: Note;
}

const NoteUtilities: React.FC<Props> = ({ note }) => {
    const [suggestions, setSuggestions] = useState<any[]>([]);

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const sugData = await api.get<any[]>(`/api/references/suggest?note_id=${note.id}`);
                setSuggestions(sugData);
            } catch (err) {
                console.error('Failed to fetch suggestions:', err);
            }
        };

        fetchSuggestions();
    }, [note.id]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '16px', letterSpacing: '0.1em' }}>
                    Reference Suggestions
                </h3>
                {suggestions.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No relevant references found.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {suggestions.map((sug, idx) => (
                            <div key={idx} style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{sug.title || sug.reference.title}</span>
                                    {sug.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{Math.round(sug.score * 100)}% Match</span>}
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {sug.body || sug.reference.body}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NoteUtilities;
