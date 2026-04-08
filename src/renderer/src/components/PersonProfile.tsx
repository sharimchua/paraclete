import React, { useEffect, useState } from 'react';
import { api, Person, Note } from '../services/api';

interface Props {
    personId: number;
    onBack: () => void;
}

const PersonProfile: React.FC<Props> = ({ personId, onBack }) => {
    const [person, setPerson] = useState<Person | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch person details and notes tied to them
        Promise.all([
            api.get<Person>(`/persons/${personId}`), // wait, need this endpoint or just filter
            api.get<Note[]>(`/notes/`) // Filter notes by person_id for now
        ]).then(([personData, allNotes]) => {
            setPerson(personData);
            setNotes(allNotes.filter(n => n.person_id === personId));
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [personId]);

    if (loading) return <div className="loader" />;
    if (!person) return <div>Person not found.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
                <button onClick={onBack} style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: '16px' }}>&lsaquo; Back to list</button>
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
