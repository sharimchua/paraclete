import React, { useEffect, useState } from 'react';
import { api, Person, Note } from '../services/api';
import TagSelectionModal from './TagSelectionModal';
import ReactMarkdown from 'react-markdown';
import FrameworkAnalysisControls from './FrameworkAnalysisControls';

interface Props {
    personId: number;
    onBack: () => void;
    onSelectNote: (id: number) => void;
}

const PersonProfile: React.FC<Props> = ({ personId, onBack, onSelectNote }) => {
    const [person, setPerson] = useState<Person | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editContact, setEditContact] = useState('');
    const [showTagModal, setShowTagModal] = useState(false);

    useEffect(() => {
        const fetchAll = () => {
            setLoading(true);
            Promise.all([
                api.get<Person>(`/persons/${personId}`),
                api.get<Note[]>(`/notes/?person_id=${personId}`)
            ]).then(([personData, personNotes]) => {
                setPerson(personData);
                setEditName(personData.name);
                setEditContact(personData.contact_method || '');
                setNotes(personNotes);
                setLoading(false);
            }).catch(err => {
                console.error(err);
                alert(`Error loading person profile: ${err instanceof Error ? err.message : String(err)}`);
                setLoading(false);
            });
        };

        fetchAll();

        window.addEventListener('refresh-profile', fetchAll);
        return () => window.removeEventListener('refresh-profile', fetchAll);
    }, [personId]);

    const refreshPerson = () => {
        api.get<Person>(`/persons/${personId}`).then(data => setPerson(data));
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.patch(`/persons/${personId}`, { name: editName, contact_method: editContact });
            setIsEditing(false);
            refreshPerson();
        } catch (err) {
            console.error(err);
            alert('Failed to update person');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this person? All their notes will remain but will be unlinked.')) {
            try {
                await api.delete(`/persons/${personId}`);
                onBack();
            } catch (err) {
                console.error(err);
                alert('Failed to delete person');
            }
        }
    };

    const handleSelectTag = async (tagId: number) => {
        try {
            await api.post('/tags/link', {
                entity_type: 'person',
                entity_id: personId,
                tag_id: tagId
            });
            setShowTagModal(false);
            refreshPerson();
        } catch (err) {
            console.error(err);
            alert('Failed to link tag');
        }
    };

    if (loading) return <div className="loader" />;
    if (!person) return <div>Person not found.</div>;

    const noteStats = {
        total: notes.length,
        earliest: notes.length > 0 ? [...notes].sort((a, b) => a.date.localeCompare(b.date))[0].date : null,
        latest: notes.length > 0 ? [...notes].sort((a, b) => b.date.localeCompare(a.date))[0].date : null
    };

    const calculateTenure = () => {
        if (!noteStats.earliest || !noteStats.latest) return 'N/A';
        const first = new Date(noteStats.earliest);
        const last = new Date(noteStats.latest);
        const today = new Date();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        const isActive = (today.getTime() - last.getTime()) <= oneMonthMs;
        const end = isActive ? today : last;
        
        const diffMs = end.getTime() - first.getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const months = Math.floor(days / 30.44);
        const years = Math.floor(months / 12);
        
        if (years > 0) return `${years}y ${months % 12}m`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
        return `${days} day${days !== 1 ? 's' : ''}`;
    };

    const isActive = noteStats.latest ? (new Date().getTime() - new Date(noteStats.latest).getTime()) <= (30 * 24 * 60 * 60 * 1000) : false;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
                            <div style={{ flexGrow: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>{person.name}</h1>
                                        <p style={{ color: 'var(--text-secondary)' }}>{person.contact_method || 'No contact method specified'}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '24px', textAlign: 'right', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ 
                                                fontSize: '0.65rem', 
                                                padding: '2px 8px', 
                                                borderRadius: '20px', 
                                                background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                color: isActive ? '#22c55e' : '#ef4444',
                                                fontWeight: 800,
                                                marginBottom: '8px',
                                                display: 'inline-block'
                                            }}>
                                                {isActive ? '● ACTIVE' : '○ INACTIVE'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tenure</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{calculateTenure()}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Notes</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{noteStats.total}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Last Session</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{noteStats.latest || 'Never'}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                    {person.tags.map(tag => (
                                        <span key={tag.id} className="tag-pill" style={{ background: 'var(--primary-faded)', color: 'var(--primary)', border: 'none' }}>
                                            {tag.key ? `${tag.key}: ` : ''}{tag.value}
                                        </span>
                                    ))}
                                    <button 
                                        className="tag-pill" 
                                        style={{ border: '1px dashed var(--border)', background: 'none', cursor: 'pointer' }}
                                        onClick={() => setShowTagModal(true)}
                                    >
                                        + Add Tag
                                    </button>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '8px' }}>PERSONA:</span>
                                    {person.persona ? (
                                        <span className="tag-pill" style={{ background: 'var(--secondary-faded)', color: 'var(--secondary)', border: 'none' }}>
                                            👤 {person.persona.name}
                                        </span>
                                    ) : person.inherited_persona ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="tag-pill" style={{ background: 'rgba(56, 189, 248, 0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)', opacity: 0.8 }}>
                                                👤 Inherited: {person.inherited_persona.name}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>(From Group)</span>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>Core Default</span>
                                    )}
                                    <button 
                                        className="tag-pill" 
                                        style={{ border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
                                        onClick={() => window.dispatchEvent(new CustomEvent('trigger-link-persona', { 
                                            detail: { 
                                                type: 'person', 
                                                id: personId,
                                                existingPersonaIds: person.persona ? [person.persona.id] : []
                                            } 
                                        }))}
                                    >
                                        {person.persona ? 'Change linked persona' : '+ Link custom persona'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Practise Insights</h3>
                </div>
                <div style={{ maxWidth: '400px' }}>
                    <FrameworkAnalysisControls personId={personId} title="Targeted Framework Analysis" />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Session History</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing last 20 sessions</span>
                </div>
                
                {notes.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ color: 'var(--text-muted)' }}>No notes found for this person.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {notes.slice(0, 20).map(note => (
                            <div key={note.id} className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => onSelectNote(note.id)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{note.date}</span>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)', fontWeight: 700 }}>{note.stage.toUpperCase()}</span>
                                </div>
                                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{note.title}</h4>
                                <div style={{ 
                                    marginTop: '12px', 
                                    maxHeight: '120px', 
                                    overflow: 'hidden', 
                                    maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)'
                                }}>
                                    <div className="markdown-content" style={{ 
                                        fontSize: '0.9rem', 
                                        color: note.cleaned_text || note.raw_capture ? 'var(--text-secondary)' : 'var(--primary)', 
                                        fontStyle: note.cleaned_text || note.raw_capture ? 'normal' : 'italic'
                                    }}>
                                        <ReactMarkdown>
                                            {note.cleaned_text || note.raw_capture || (note.session_brief ? `**Briefing:** ${note.session_brief}` : 'No content yet.')}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showTagModal && (
                <TagSelectionModal 
                    title={`Tag ${person.name}`}
                    existingTagIds={person.tags.map(t => t.id)}
                    onClose={() => setShowTagModal(false)}
                    onSelect={handleSelectTag}
                />
            )}
        </div>
    );
};

export default PersonProfile;
