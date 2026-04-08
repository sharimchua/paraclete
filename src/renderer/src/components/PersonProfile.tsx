import React, { useEffect, useState } from 'react';
import { api, Person, Note } from '../services/api';

interface Props {
    personId: number;
    onBack: () => void;
    onNewNote: (id: number) => void;
}

const PersonProfile: React.FC<Props> = ({ personId, onBack, onNewNote }) => {
    const [person, setPerson] = useState<Person | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editContact, setEditContact] = useState('');

    useEffect(() => {
        // Fetch person details and notes tied to them
        Promise.all([
            api.get<Person>(`/persons/${personId}`),
            api.get<any[]>(`/notes/`)
        ]).then(([personData, allNotes]) => {
            setPerson(personData);
            setEditName(personData.name);
            setEditContact(personData.contact_method || '');
            setNotes(allNotes.filter(n => n.person_id === personId));
            setLoading(false);
        }).catch(err => {
            console.error(err);
            alert(`Error loading person profile: ${err instanceof Error ? err.message : String(err)}`);
            setLoading(false);
        });
    }, [personId]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.patch(`/persons/${personId}`, { name: editName, contact_method: editContact });
            setIsEditing(false);
            api.get<Person>(`/persons/${personId}`).then(data => setPerson(data));
        } catch (err) {
            console.error(err);
            alert('Failed to update practitioner');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this practitioner? All their notes will remain but will be unlinked.')) {
            try {
                await api.delete(`/persons/${personId}`);
                onBack();
            } catch (err) {
                console.error(err);
                alert('Failed to delete practitioner');
            }
        }
    };

    if (loading) return <div className="loader" />;
    if (!person) return <div>Person not found.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <button onClick={onBack} className="btn-secondary" style={{ padding: '4px 12px' }}>&lsaquo; Back</button>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-primary" onClick={() => onNewNote(personId)}>+ New Note</button>
                        <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'Cancel' : 'Edit'}</button>
                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={handleDelete}>Delete</button>
                    </div>
                </div>

                {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Name</label>
                            <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} required />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Contact Method</label>
                            <input className="input-field" value={editContact} onChange={e => setEditContact(e.target.value)} />
                        </div>
                        <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-end' }}>Save Changes</button>
                    </form>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                         <div style={{ 
                            width: '80px', 
                            height: '80px', 
                            background: 'linear-gradient(135deg, var(--primary), var(--secondary))', 
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2rem',
                            color: 'var(--bg-deep)',
                            fontWeight: 700
                        }}>
                            {person.name.charAt(0)}
                        </div>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>{person.name}</h1>
                            <p style={{ color: 'var(--text-secondary)' }}>{person.contact_method || 'No contact method specified'}</p>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3>Session History</h3>
                    {notes.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: 'var(--text-muted)' }}>No notes found for this person.</p>
                            <button className="btn-primary" style={{ marginTop: '16px' }}>+ New Note</button>
                        </div>
                    ) : (
                        notes.map(note => (
                            <div key={note.id} className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{note.date}</span>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)' }}>{note.stage.toUpperCase()}</span>
                                </div>
                                <h4 style={{ fontSize: '1.1rem' }}>{note.title}</h4>
                                <p style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {note.cleaned_text || note.raw_capture || 'No content yet.'}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="card">
                        <h4 style={{ marginBottom: '16px' }}>Universal Tags</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {person.tags.map(tag => (
                                <span key={tag.id} style={{ 
                                    fontSize: '0.75rem', 
                                    padding: '4px 10px', 
                                    background: 'var(--primary-faded)', 
                                    color: 'var(--primary)',
                                    borderRadius: '100px'
                                }}>
                                    {tag.key ? `${tag.key}: ` : ''}{tag.value}
                                </span>
                            ))}
                            <button style={{ 
                                fontSize: '0.75rem', 
                                padding: '4px 10px', 
                                background: 'transparent', 
                                border: '1px dashed var(--border)', 
                                borderRadius: '100px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)'
                            }}>+ Add Tag</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonProfile;
