import React, { useEffect, useState } from 'react';
import { api, Group, Person, Note, Message } from '../services/api';
import TagSelectionModal from './TagSelectionModal';
import ReactMarkdown from 'react-markdown';
import FrameworkAnalysisControls from './FrameworkAnalysisControls';

interface Props {
    groupId: number;
    onBack: () => void;
    onSelectPerson: (id: number) => void;
    onSelectNote: (id: number) => void;
}

const GroupProfile: React.FC<Props> = ({ groupId, onBack, onSelectPerson, onSelectNote }) => {
    const [group, setGroup] = useState<Group | null>(null);
    const [allPersons, setAllPersons] = useState<Person[]>([]);
    const [groupNotes, setGroupNotes] = useState<Note[]>([]);
    const [groupMessages, setGroupMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [showAddMember, setShowAddMember] = useState(false);
    const [showTagModal, setShowTagModal] = useState(false);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            api.get<Group>(`/groups/${groupId}`),
            api.get<Person[]>('/persons/'),
            api.get<Note[]>(`/notes/?group_id=${groupId}`),
            api.get<Message[]>(`/api/messages/?group_id=${groupId}`)
        ]).then(([groupData, personsData, notesData, messagesData]) => {
            setGroup(groupData);
            setEditName(groupData.name);
            setEditDesc(groupData.description || '');
            setAllPersons(personsData);
            setGroupNotes(notesData);
            setGroupMessages(messagesData);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            alert(`Error loading group profile: ${err instanceof Error ? err.message : String(err)}`);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchData();
        window.addEventListener('refresh-profile', fetchData);
        return () => window.removeEventListener('refresh-profile', fetchData);
    }, [groupId]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.patch(`/groups/${groupId}`, { name: editName, description: editDesc });
            setIsEditing(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Failed to update group');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this group? This will NOT delete the persons in it.')) {
            try {
                await api.delete(`/groups/${groupId}`);
                onBack();
            } catch (err) {
                console.error(err);
                alert('Failed to delete group');
            }
        }
    };

    const handleAddMember = async (personId: number) => {
        try {
            await api.post(`/groups/${groupId}/members/${personId}`, {});
            setShowAddMember(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Failed to add member');
        }
    };

    const handleRemoveMember = async (personId: number) => {
        if (window.confirm('Remove this person from the group?')) {
            try {
                await api.delete(`/groups/${groupId}/members/${personId}`);
                fetchData();
            } catch (err) {
                console.error(err);
                alert('Failed to remove member');
            }
        }
    };
    
    const handleSelectTag = async (tagId: number) => {
        try {
            await api.post('/tags/link', {
                entity_type: 'group',
                entity_id: groupId,
                tag_id: tagId
            });
            setShowTagModal(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Failed to link tag');
        }
    };

    if (loading && !group) return <div className="loader" />;
    if (!group) return <div>Group not found.</div>;

    const availablePersons = allPersons.filter(p => !group.members.some(m => m.id === p.id));
    
    const noteStats = {
        total: groupNotes.length,
        earliest: groupNotes.length > 0 ? [...groupNotes].sort((a, b) => a.date.localeCompare(b.date))[0].date : null,
        latest: groupNotes.length > 0 ? [...groupNotes].sort((a, b) => b.date.localeCompare(a.date))[0].date : null
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
                        <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'Cancel Edit' : 'Edit Group'}</button>
                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={handleDelete}>Delete</button>
                    </div>
                </div>

                {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} required />
                        <textarea className="input-field" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                        <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-end' }}>Save Changes</button>
                    </form>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flexGrow: 1 }}>
                                <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>{group.name}</h1>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{group.description || 'No description'}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '24px', textAlign: 'right', background: 'rgba(56, 189, 248, 0.03)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
                                <div>
                                    <div style={{ 
                                        fontSize: '0.6rem', 
                                        padding: '2px 8px', 
                                        borderRadius: '20px', 
                                        background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: isActive ? '#22c55e' : '#ef4444',
                                        fontWeight: 800,
                                        marginBottom: '4px'
                                    }}>
                                        {isActive ? '● ACTIVE' : '○ INACTIVE'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tenure</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{calculateTenure()}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Outreach</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>{groupMessages.length}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Notes</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{noteStats.total}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Latest</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{noteStats.latest || 'Never'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            {group.tags.map(tag => (
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
                            {group.persona ? (
                                <span className="tag-pill" style={{ background: 'var(--secondary-faded)', color: 'var(--secondary)', border: 'none' }}>
                                    👤 {group.persona.name}
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>Core Default</span>
                            )}
                            <button 
                                className="tag-pill" 
                                style={{ border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
                                onClick={() => window.dispatchEvent(new CustomEvent('trigger-link-persona', { 
                                    detail: { 
                                        type: 'group', 
                                        id: groupId,
                                        existingPersonaIds: group.persona ? [group.persona.id] : []
                                    } 
                                }))}
                            >
                                {group.persona ? 'Change linked persona' : '+ Link custom persona'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Group Members ({group.members.length})</h3>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => setShowAddMember(true)}>+ Add Member</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {group.members.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No members in this group yet.</p>
                        ) : (
                            group.members.map(member => (
                                <div key={member.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px' }}>
                                    <div style={{ cursor: 'pointer' }} onClick={() => onSelectPerson(member.id)}>
                                        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{member.name}</h4>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{member.contact_method || 'No contact'}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveMember(member.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
                                        title="Remove from group"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Practise Insights</h3>
                        </div>
                        <div style={{ maxWidth: '400px' }}>
                            <FrameworkAnalysisControls groupId={groupId} title="Targeted Framework Analysis" />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Group Session History</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing last 20 sessions</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {groupNotes.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                                <p style={{ color: 'var(--text-muted)' }}>No notes linked specifically to this group.</p>
                            </div>
                        ) : (
                            groupNotes.slice(0, 20).map(note => (
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
                            ))
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Group Communication</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Outreach & Follow-ups</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {groupMessages.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
                                <p>No messages recorded for this group.</p>
                            </div>
                        ) : (
                            groupMessages.slice(0, 10).map(msg => (
                                <div 
                                    key={msg.id} 
                                    className="card" 
                                    style={{ 
                                        cursor: 'pointer', 
                                        borderLeft: msg.status === 'draft' ? '4px solid #fbbf24' : '4px solid #4ade80'
                                    }}
                                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'message-authoring', noteId: msg.id } }))}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{msg.date || msg.created_at.split('T')[0]}</span>
                                        <span style={{ 
                                            fontSize: '0.6rem', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px', 
                                            background: msg.status === 'draft' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                                            color: msg.status === 'draft' ? '#fbbf24' : '#4ade80',
                                            fontWeight: 800
                                        }}>
                                            {msg.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.9rem', 
                                        opacity: 0.8, 
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {msg.draft_text || msg.sent_text || 'No content drafted...'}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {showTagModal && (
                <TagSelectionModal 
                    title={`Tag ${group.name}`}
                    existingTagIds={group.tags.map(t => t.id)}
                    onClose={() => setShowTagModal(false)}
                    onSelect={handleSelectTag}
                />
            )}

            {showAddMember && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ width: '450px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3>Add Member to {group.name}</h3>
                        <div style={{ marginTop: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {availablePersons.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No more people available to add.</p>
                            ) : (
                                availablePersons.map(p => (
                                    <div 
                                        key={p.id} 
                                        className="card" 
                                        style={{ padding: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={() => handleAddMember(p.id)}
                                    >
                                        <span>{p.name}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Add +</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn-secondary" onClick={() => setShowAddMember(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GroupProfile;
