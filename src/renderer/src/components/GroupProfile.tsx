import React, { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { AvatarSelector } from './AvatarSelector';
import { api, Group, Person, Note, Message } from '../services/api';
import { useNavbar } from './NavbarContext';
import TagSelectionModal from './TagSelectionModal';
import ReactMarkdown from 'react-markdown';
import FrameworkAnalysisControls from './FrameworkAnalysisControls';

interface Props {
    groupId: number;
    onBack: () => void;
    onSelectPerson: (id: number) => void;
    onSelectNote: (id: number) => void;
    onStartNote: (personId: number | null, groupId: number) => void;
}

const GroupProfile: React.FC<Props> = ({ groupId, onBack, onSelectPerson, onSelectNote, onStartNote }) => {
    const { setNavActions } = useNavbar();
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [group, setGroup] = useState<Group | null>(null);
    const [allPersons, setAllPersons] = useState<Person[]>([]);
    const [groupNotes, setGroupNotes] = useState<Note[]>([]);
    const [groupMessages, setGroupMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editAvatarLogo, setEditAvatarLogo] = useState('');
    const [showAddMember, setShowAddMember] = useState(false);
    const [showTagModal, setShowTagModal] = useState(false);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            api.get<Group>(`/groups/${groupId}`),
            api.get<Person[]>('/persons/'),
            api.get<Note[]>(`/notes/?group_id=${groupId}`),
            api.get<Message[]>(`/api/messages/?group_id=${groupId}`),
            api.get<{ count: number }>(`/api/framework/pending-count?group_id=${groupId}`)
        ]).then(([groupData, personsData, notesData, messagesData, pendingData]) => {
            setGroup(groupData);
            setEditName(groupData.name);
            setEditDesc(groupData.description || '');
            setEditAvatarLogo(groupData.avatar_logo || '');
            setAllPersons(personsData);
            setGroupNotes(notesData);
            setGroupMessages(messagesData);
            setPendingCount(pendingData.count);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            alert(`Error loading group profile: ${err instanceof Error ? err.message : String(err)}`);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchData();
        const handleWsMessage = (e: any) => {
            const { event } = e.detail;
            if (event === 'framework_proposals_updated') {
                fetchData();
            }
        };
        window.addEventListener('refresh-profile', fetchData);
        window.addEventListener('global-ws-message' as any, handleWsMessage);
        return () => {
            window.removeEventListener('refresh-profile', fetchData);
            window.removeEventListener('global-ws-message' as any, handleWsMessage);
            setNavActions([]);
        };
    }, [groupId]);

    useEffect(() => {
        if (isEditing) {
            setNavActions([
                { label: 'Save Changes', onClick: () => handleUpdate() },
                { label: 'Cancel', variant: 'secondary', onClick: () => setIsEditing(false) }
            ]);
        } else {
            setNavActions([
                { 
                    label: '+ Create Session Note', 
                    onClick: () => onStartNote(null, groupId) 
                },
                { isSeparator: true },
                { label: 'Edit Group', onClick: () => setIsEditing(true) },
                { label: 'Delete', variant: 'danger', onClick: handleDelete },
                { isSeparator: true },
                { label: '+ Add Member', onClick: () => setShowAddMember(true) }
            ]);
        }
    }, [isEditing, setNavActions, groupId, onStartNote, editName, editDesc, editAvatarLogo]);

    const handleUpdate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        try {
            await api.patch(`/groups/${groupId}`, { name: editName, description: editDesc, avatar_logo: editAvatarLogo });
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

    const availablePersons = allPersons.filter(p => !(group.members || []).some(m => m.id === p.id));
    
    const noteStats = {
        total: group.aggregated_note_count || 0,
        earliest: group.earliest_note_date ? String(group.earliest_note_date) : null,
        latest: group.latest_note_date ? String(group.latest_note_date) : null
    };

    const calculateTenure = () => {
        if (!noteStats.earliest || !noteStats.latest) return 'N/A';
        const first = new Date(noteStats.earliest);
        const last = new Date(noteStats.latest);
        if (isNaN(first.getTime()) || isNaN(last.getTime())) return 'N/A';
        
        const today = new Date();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        const isActive = (today.getTime() - last.getTime()) <= oneMonthMs;
        const end = isActive ? today : last;
        
        const diffMs = end.getTime() - first.getTime();
        if (diffMs < 0) return '0 days';
        
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

                {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Name</label>
                            <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} required />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Description</label>
                            <textarea className="input-field" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Avatar/Logo</label>
                            <AvatarSelector value={editAvatarLogo} onChange={setEditAvatarLogo} />
                        </div>
                    </form>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexGrow: 1 }}>
                                <Avatar avatarLogo={group.avatar_logo} name={group.name} size={100} style={{ borderRadius: '24px' }} />
                                <div>
                                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>{group.name}</h1>
                                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{group.description || 'No description'}</p>
                                </div>
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
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Outreach</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>{group.aggregated_message_count || 0}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Aggregated Notes</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{noteStats.total}</div>
                                </div>
                                {pendingCount > 0 && (
                                    <div style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('open-paraclete'))}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 700 }}>Analysis Queue</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{pendingCount}</div>
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Latest</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{noteStats.latest || 'Never'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            {(group.tags || []).map(tag => (
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
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Group Members ({(group.members || []).length})</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {(!group.members || group.members.length === 0) ? (
                            <p style={{ color: 'var(--text-muted)' }}>No members in this group yet.</p>
                        ) : (
                            (group.members || []).map(member => (
                                <div key={member.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ cursor: 'pointer', flexGrow: 1 }} onClick={() => onSelectPerson(member.id)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{member.name}</h4>
                                            {member.latest_note_date && (new Date().getTime() - new Date(member.latest_note_date).getTime()) <= (7 * 24 * 60 * 60 * 1000) && (
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }} title="Active this week" />
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{member.contact_method || 'No contact'}</p>
                                        
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Notes</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>{member.note_count || 0}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Messages</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24' }}>{member.message_count || 0}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Latest</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{member.latest_note_date ? String(member.latest_note_date) : 'Never'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveMember(member.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '4px', alignSelf: 'flex-start' }}
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
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Practice Insights</h3>
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
                                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'message-authoring', messageId: msg.id } }))}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{msg.date || msg.created_at?.split('T')[0] || 'N/A'}</span>
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
                    existingTagIds={(group.tags || []).map(t => t.id)}
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
