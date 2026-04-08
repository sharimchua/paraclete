import React, { useEffect, useState } from 'react';
import { api, Person } from '../services/api';

interface Props {
    onSelectPerson: (id: number) => void;
}

const PersonList: React.FC<Props> = ({ onSelectPerson }) => {
    const [persons, setPersons] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<Person[]>('/persons/')
            .then(data => {
                setPersons(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to fetch persons.');
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="loader" />;
    if (error) return <div className="error-text">{error}</div>;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {persons.length === 0 ? (
                <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>No persons found. Start by adding one!</p>
                    <button className="btn-primary" style={{ marginTop: '16px' }}>+ Add Practitioner</button>
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
                                <span key={tag.id} style={{ 
                                    fontSize: '0.75rem', 
                                    padding: '4px 10px', 
                                    background: 'rgba(255,255,255,0.05)', 
                                    borderRadius: '100px',
                                    color: 'var(--text-muted)'
                                }}>
                                    {tag.key ? `${tag.key}: ` : ''}{tag.value}
                                </span>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export default PersonList;
