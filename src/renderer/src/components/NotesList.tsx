import React, { useEffect, useState } from 'react';
import { api, Note } from '../services/api';

interface Props {
    onSelectNote: (id: number) => void;
}

const NotesList: React.FC<Props> = ({ onSelectNote }) => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchNotes = async (searchTerm: string = '') => {
        setLoading(true);
        try {
            const data = await api.get<Note[]>(`/notes/?limit=20&search=${encodeURIComponent(searchTerm)}`);
            setNotes(data);
        } catch (err) {
            console.error('Failed to fetch notes', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchNotes(search);
        }, 300); // Debounce search
        
        return () => clearTimeout(timeoutId);
    }, [search]);

    return (
        <div className="card" style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <input 
                    type="text" 
                    placeholder="Search notes content or titles..." 
                    className="form-control"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px' }}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {loading ? (
                    <div className="loader" />
                ) : notes.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                        {search ? 'No notes match your search.' : 'No notes found.'}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                        {notes.map(note => (
                            <div 
                                key={note.id} 
                                onClick={() => onSelectNote(note.id)}
                                style={{ 
                                    padding: '16px', 
                                    background: 'var(--bg-surface)', 
                                    borderRadius: '10px',
                                    borderLeft: `4px solid ${note.stage === 'Clean' ? 'var(--primary)' : 'var(--secondary)'}`,
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                                className="clickable-card"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{note.title}</h4>
                                    <span style={{ 
                                        fontSize: '0.65rem', 
                                        fontWeight: 800, 
                                        textTransform: 'uppercase',
                                        background: 'var(--primary-faded)',
                                        color: 'var(--primary)',
                                        padding: '2px 8px',
                                        borderRadius: '12px'
                                    }}>{note.stage}</span>
                                </div>

                                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                    {note.person && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            👤 {note.person.name}
                                        </div>
                                    )}
                                    {note.group && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            👥 {note.group.name}
                                        </div>
                                    )}
                                </div>

                                <div style={{ 
                                    fontSize: '0.8rem', 
                                    color: 'var(--text-secondary)', 
                                    display: '-webkit-box', 
                                    WebkitLineClamp: 2, 
                                    WebkitBoxOrient: 'vertical', 
                                    overflow: 'hidden',
                                    lineHeight: '1.4',
                                    marginBottom: '10px'
                                }}>
                                    {note.cleaned_text || note.raw_capture}
                                </div>

                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                    {new Date(note.date + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesList;
