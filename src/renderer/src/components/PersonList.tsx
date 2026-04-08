import React, { useEffect, useState } from 'react';
import { api, Person } from '../services/api';

interface Props {
    onSelectPerson: (id: number) => void;
}

const PersonList: React.FC<Props> = ({ onSelectPerson }) => {
    const [persons, setPersons] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newContact, setNewContact] = useState('');

    const fetchPersons = () => {
        setLoading(true);
        api.get<Person[]>('/persons/')
            .then(data => {
                setPersons(data);
                setLoading(false);
                setError(null);
            })
            .catch(err => {
                console.error(err);
                setError(`Failed to fetch persons: ${err instanceof Error ? err.message : String(err)}`);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchPersons();

        const handleTriggerCreate = () => setShowCreateModal(true);
        window.addEventListener('trigger-create-person', handleTriggerCreate);
        return () => window.removeEventListener('trigger-create-person', handleTriggerCreate);
    }, []);

    const handleCreatePerson = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/persons/', { name: newName, contact_method: newContact });
            setShowCreateModal(false);
            setNewName('');
            setNewContact('');
            fetchPersons();
        } catch (err) {
            console.error(err);
            alert('Failed to create practitioner');
        }
    };

    if (loading && persons.length === 0) return <div className="loader" />;
    if (error) return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="error-text" style={{ marginBottom: '16px' }}>{error}</div>
            <button className="btn-secondary" onClick={fetchPersons}>Retry Connection</button>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Redundant header buttons removed to favor context-aware top bar */}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {persons.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>No persons found. Start by adding one from the top bar!</p>
                    </div>
                ) : (
                    persons.map(person => (
                        <div key={person.id} className="card" style={{ cursor: 'pointer' }} onClick={() => onSelectPerson(person.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ 
                                    width: '48px', 
                                    height: '48px', 
                                    background: 'var(--primary-faded)', 
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.2rem',
                                    color: 'var(--primary)',
                                    fontWeight: 600
                                }}>
                                    {person.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '1.1rem' }}>{person.name}</h4>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{person.contact_method || 'No contact info'}</p>
                                </div>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {person.tags.map(tag => (
                                    <span key={tag.id} className="tag-pill">
                                        {tag.key ? `${tag.key}: ` : ''}{tag.value}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ width: '400px' }}>
                        <h3>Add New Practitioner</h3>
                        <form onSubmit={handleCreatePerson} style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Full Name</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={newName} 
                                    onChange={e => setNewName(e.target.value)} 
                                    required 
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Contact Method (Optional)</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={newContact} 
                                    onChange={e => setNewContact(e.target.value)}
                                    placeholder="e.g. Email, Signal, Phone"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Add Practitioner</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PersonList;
