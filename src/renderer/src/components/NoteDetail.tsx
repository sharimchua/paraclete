import React, { useEffect, useState } from 'react';
import { api, Note, Person, Group } from '../services/api';
import ReactMarkdown from 'react-markdown';
import NoteAuthoring from './NoteAuthoring';


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

    const fetchData = async () => {
        setLoading(true);
        try {
            const noteData = await api.get<Note>(`/notes/${noteId}`);
            setNote(noteData);

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

    if (isEditing) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '16px' }}>
                    <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                        &lsaquo; Back to View
                    </button>
                </div>
                <NoteAuthoring 
                    noteId={noteId} 
                    onComplete={() => {
                        setIsEditing(false);
                        fetchData();
                    }} 
                />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                            Edit Note
                        </button>
                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={handleDelete}>Delete</button>
                    </div>
                </div>

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

                    {note.session_brief && (
                        <div style={{ 
                            background: 'rgba(56, 189, 248, 0.03)', 
                            borderLeft: '4px solid var(--primary)', 
                            padding: '24px 32px', 
                            marginTop: '24px', 
                            borderRadius: '0 12px 12px 0' 
                        }}>
                            <h3 style={{ 
                                fontSize: '0.8rem', 
                                color: 'var(--primary)', 
                                fontWeight: 700, 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.1em',
                                marginBottom: '16px'
                            }}>
                                PRE-SESSION BRIEFING
                            </h3>
                            <div className="markdown-brief" style={{ 
                                fontSize: '1rem', 
                                color: 'var(--text-secondary)',
                                lineHeight: '1.6'
                            }}>
                                <ReactMarkdown>{note.session_brief}</ReactMarkdown>
                            </div>
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '32px' }}>
                            <div className="markdown-content" style={{ 
                            fontSize: '1.1rem', 
                            lineHeight: '1.8', 
                            color: 'var(--text-main)',
                            maxWidth: '800px'
                        }}>
                            <ReactMarkdown>{note.cleaned_text || note.raw_capture || 'No content.'}</ReactMarkdown>
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
            </div>
        </div>
    );
};

export default NoteDetail;
