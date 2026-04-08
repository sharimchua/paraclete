import React, { useEffect, useState } from 'react';
import { api, Note, Person, Group } from '../services/api';

interface Props {
    noteId: number;
    onBack: () => void;
}

const NoteDetail: React.FC<Props> = ({ noteId, onBack }) => {
    const [note, setNote] = useState<Note | null>(null);
    const [person, setPerson] = useState<Person | null>(null);
    const [group, setGroup] = useState<Group | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editText, setEditText] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const noteData = await api.get<Note>(`/notes/${noteId}`);
            setNote(noteData);
            setEditTitle(noteData.title);
            setEditText(noteData.cleaned_text || noteData.raw_capture || '');

            if (noteData.person_id) {
                const p = await api.get<Person>(`/persons/${noteData.person_id}`);
                setPerson(p);
            }
            if (noteData.group_id) {
                const g = await api.get<Group>(`/groups/${noteData.group_id}`);
                setGroup(g);
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            alert('Failed to load note details');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [noteId]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.patch(`/notes/${noteId}`, { 
                title: editTitle, 
                cleaned_text: editText 
            });
            setIsEditing(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Failed to update note');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
            try {
                await api.delete(`/notes/${noteId}`);
                onBack();
            } catch (err) {
                console.error(err);
                alert('Failed to delete note');
            }
        }
    };

    if (loading) return <div className="loader" />;
    if (!note) return <div>Note not found.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>
                            {isEditing ? 'Cancel Edit' : 'Edit Note'}
                        </button>
                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={handleDelete}>Delete</button>
                    </div>
                </div>

                {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Title</label>
                            <input 
                                className="input-field" 
                                value={editTitle} 
                                onChange={e => setEditTitle(e.target.value)} 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Content</label>
                            <textarea 
                                className="input-field" 
                                style={{ minHeight: '300px', lineHeight: '1.6' }}
                                value={editText} 
                                onChange={e => setEditText(e.target.value)} 
                                required 
                            />
                        </div>
                        <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-end' }}>Save Changes</button>
                    </form>
                ) : (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                            <div>
                                <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {note.stage}
                                </span>
                                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '4px' }}>{note.title}</h1>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{note.date}</div>
                                {person && <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--primary)' }}>Person: {person.name}</div>}
                                {group && <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--secondary)' }}>Group: {group.name}</div>}
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '32px' }}>
                            <div style={{ 
                                whiteSpace: 'pre-wrap', 
                                fontSize: '1.1rem', 
                                lineHeight: '1.8', 
                                color: 'var(--text-main)',
                                maxWidth: '800px'
                            }}>
                                {note.cleaned_text || note.raw_capture || 'No content.'}
                            </div>
                        </div>

                        {note.raw_capture && note.cleaned_text && (
                            <details style={{ marginTop: '48px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>View Raw Capture</summary>
                                <div style={{ 
                                    marginTop: '16px', 
                                    padding: '20px', 
                                    background: 'var(--bg-deep)', 
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-secondary)',
                                    fontFamily: 'monospace'
                                }}>
                                    {note.raw_capture}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NoteDetail;
