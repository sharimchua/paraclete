import React, { useEffect, useState } from 'react';
import { api, Group, Person, Note } from '../services/api';

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
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [showAddMember, setShowAddMember] = useState(false);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            api.get<Group>(`/groups/${groupId}`),
            api.get<Person[]>('/persons/'),
            api.get<Note[]>('/notes/')
        ]).then(([groupData, personsData, notesData]) => {
            setGroup(groupData);
            setEditName(groupData.name);
            setEditDesc(groupData.description || '');
            setAllPersons(personsData);
            setGroupNotes(notesData.filter(n => n.group_id === groupId));
            setLoading(false);
        }).catch(err => {
            console.error(err);
            alert(`Error loading group profile: ${err instanceof Error ? err.message : String(err)}`);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchData();
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

    if (loading && !group) return <div className="loader" />;
    if (!group) return <div>Group not found.</div>;

    const availablePersons = allPersons.filter(p => !group.members.some(m => m.id === p.id));

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
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>{group.name}</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{group.description || 'No description'}</p>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Group Members ({group.members.length})</h3>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => setShowAddMember(true)}>+ Add Member</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {group.members.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>No members in this group yet.</p>
                        ) : (
                            group.members.map(member => (
                                <div key={member.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ cursor: 'pointer' }} onClick={() => onSelectPerson(member.id)}>
                                        <h4 style={{ fontSize: '1rem' }}>{member.name}</h4>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{member.contact_method || 'No contact'}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveMember(member.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}
                                        title="Remove from group"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <h3 style={{ marginTop: '24px' }}>Group Session History</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {groupNotes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No notes linked specifically to this group.</p>
                        ) : (
                            groupNotes.map(note => (
                                <div key={note.id} className="card" style={{ cursor: 'pointer' }} onClick={() => onSelectNote(note.id)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{note.date}</span>
                                        <span className="tag-pill" style={{ background: 'var(--primary-faded)', color: 'var(--primary)' }}>{note.stage}</span>
                                    </div>
                                    <h4 style={{ fontSize: '1.1rem' }}>{note.title}</h4>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="card">
                        <h4>Group Tags</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                            {group.tags.map(tag => (
                                <span key={tag.id} className="tag-pill">{tag.value}</span>
                            ))}
                            <button className="tag-pill" style={{ border: '1px dashed var(--border)', background: 'none' }}>+ Tag</button>
                        </div>
                    </div>
                </div>
            </div>

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
