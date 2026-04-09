import React, { useState, useEffect } from 'react';
import { api, Persona } from '../services/api';

interface Props {
    title: string;
    existingPersonaIds: number[];
    onClose: () => void;
    onSelect: (personaId: number) => void;
}

const PersonaSelectionModal: React.FC<Props> = ({ title, existingPersonaIds, onClose, onSelect }) => {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get<Persona[]>('/api/framework/personas').then(data => {
            setPersonas(data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const availablePersonas = personas.filter(p => !existingPersonaIds.includes(p.id));

    return (
        <div className="modal-overlay">
            <div className="modal-content card" style={{ maxWidth: '400px', width: '90%' }}>
                <h3 style={{ marginBottom: '20px' }}>{title}</h3>
                
                {loading ? (
                    <div className="loader" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {availablePersonas.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No more personas available.</p>
                        ) : (
                            availablePersonas.map(persona => (
                                <div 
                                    key={persona.id} 
                                    className="card" 
                                    style={{ padding: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onClick={() => onSelect(persona.id)}
                                >
                                    <span>👤 {persona.name}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Link +</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
                
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default PersonaSelectionModal;
