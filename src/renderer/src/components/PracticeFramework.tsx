import React, { useState, useEffect } from 'react';
import { api, PractiseFramework, Persona, FrameworkProposal } from '../services/api';
import FrameworkAnalysisControls from './FrameworkAnalysisControls';

const FrameworkSection: React.FC<{
    title: string;
    value: string;
    description: string;
    onSave: (newValue: string) => Promise<void>;
}> = ({ title, value, description, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--primary)', margin: 0 }}>{title}</h3>
                {!isEditing ? (
                    <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => { setEditValue(value); setIsEditing(true); }}>Edit</button>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setIsEditing(false)}>Cancel</button>
                        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={async () => {
                            await onSave(editValue);
                            setIsEditing(false);
                        }}>Save</button>
                    </div>
                )}
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{description}</p>
            {isEditing ? (
                <textarea 
                    className="input-field" 
                    value={editValue} 
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{ minHeight: '150px', fontSize: '0.9rem', lineHeight: '1.5' }}
                />
            ) : (
                <div style={{ 
                    whiteSpace: 'pre-wrap', 
                    color: 'var(--text-secondary)', 
                    lineHeight: '1.6', 
                    background: 'var(--bg-deep)', 
                    padding: '12px', 
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    minHeight: '40px'
                }}>
                    {value || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Not defined yet.</span>}
                </div>
            )}
        </div>
    );
};

const PracticeFramework: React.FC = () => {
    const [core, setCore] = useState<PractiseFramework | null>(null);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [proposals, setProposals] = useState<FrameworkProposal[]>([]);
    const [activeTab, setActiveTab] = useState<'core' | 'personas' | 'proposals'>('core');
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreatePersona, setShowCreatePersona] = useState(false);
    
    // New Persona State
    const [newPersonaName, setNewPersonaName] = useState('');
    const [newPersonaDesc, setNewPersonaDesc] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [coreData, personaData, proposalData] = await Promise.all([
                api.get<PractiseFramework>('/api/framework/core'),
                api.get<Persona[]>('/api/framework/personas'),
                api.get<FrameworkProposal[]>('/api/framework/proposals?status=pending')
            ]);
            setCore(coreData);
            setPersonas(personaData);
            setProposals(proposalData);
        } catch (err) {
            console.error('Failed to fetch framework data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);


    const resolveProposal = async (id: number, approved: boolean, targetPersonaId?: number | null, isCore?: boolean) => {
        try {
            await api.post(`/api/framework/proposals/${id}/resolve`, { 
                approved,
                override_persona_id: targetPersonaId,
                override_is_core: isCore
            });
            setProposals(proposals.filter(p => p.id !== id));
            if (approved) fetchData();
        } catch (err) {
            console.error('Failed to resolve proposal:', err);
        }
    };

    const saveCoreSection = async (field: keyof PractiseFramework, value: string) => {
        if (!core) return;
        try {
            await api.patch('/api/framework/core', { ...core, [field]: value });
            fetchData();
        } catch (err) {
            console.error('Failed to save core section:', err);
            alert('Failed to save.');
        }
    };

    const savePersonaFrameworkSection = async (personaId: number, field: keyof PractiseFramework, value: string) => {
        const persona = personas.find(p => p.id === personaId);
        if (!persona || !persona.framework) return;
        try {
            await api.patch(`/api/framework/frameworks/${persona.framework.id}`, { ...persona.framework, [field]: value });
            fetchData();
        } catch (err) {
            console.error('Failed to save persona framework:', err);
            alert('Failed to save.');
        }
    };

    const handleCreatePersona = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/framework/personas', {
                name: newPersonaName,
                description: newPersonaDesc
            });
            setNewPersonaName('');
            setNewPersonaDesc('');
            setShowCreatePersona(false);
            fetchData();
        } catch (err) {
            console.error('Failed to create persona:', err);
            alert('Failed to create persona.');
        }
    };

    const handleDeletePersona = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this persona?')) return;
        try {
            await api.delete(`/api/framework/personas/${id}`);
            if (selectedPersonaId === id) setSelectedPersonaId(null);
            fetchData();
        } catch (err) {
            console.error('Failed to delete persona:', err);
        }
    };

    if (loading) return <div className="loader" />;

    const selectedPersona = selectedPersonaId ? personas.find(p => p.id === selectedPersonaId) : null;

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Practise Framework</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Manage your professional professional style and AI-driven growth.
                    </p>
                </div>
                <div style={{ width: '400px' }}>
                    <FrameworkAnalysisControls title="Full Practice Analysis" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
                <button 
                    className={`nav-item ${activeTab === 'core' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('core'); setSelectedPersonaId(null); }}
                    style={{ border: 'none', background: 'none', padding: '12px 24px', cursor: 'pointer', borderRadius: '8px 8px 0 0', fontWeight: activeTab === 'core' ? 700 : 400 }}
                >
                    Global Core
                </button>
                <button 
                    className={`nav-item ${activeTab === 'personas' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('personas')}
                    style={{ border: 'none', background: 'none', padding: '12px 24px', cursor: 'pointer', borderRadius: '8px 8px 0 0', fontWeight: activeTab === 'personas' ? 700 : 400 }}
                >
                    Personas
                </button>
                <button 
                    className={`nav-item ${activeTab === 'proposals' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('proposals'); setSelectedPersonaId(null); }}
                    style={{ border: 'none', background: 'none', padding: '12px 24px', cursor: 'pointer', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: activeTab === 'proposals' ? 700 : 400 }}
                >
                    Proposals {proposals.length > 0 && <span style={{ background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem' }}>{proposals.length}</span>}
                </button>
            </div>

            <div className="tab-content">
                {activeTab === 'core' && core && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="card" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                <strong>Global Core:</strong> These settings apply to all sessions unless overridden by a specific persona.
                            </p>
                        </div>
                        <FrameworkSection 
                            title="Tone & Idioms" 
                            description="Define your preferred professional tone and specific idioms you use."
                            value={core.tone_idioms || ''} 
                            onSave={(val) => saveCoreSection('tone_idioms', val)}
                        />
                        <FrameworkSection 
                            title="Formatting Preferences" 
                            description="Set how you like your notes, summaries, and messages to be formatted."
                            value={core.formatting_preferences || ''} 
                            onSave={(val) => saveCoreSection('formatting_preferences', val)}
                        />
                        <FrameworkSection 
                            title="Principles & Tenets" 
                            description="The core professional values and rules that guide your practice."
                            value={core.principles_tenets || ''} 
                            onSave={(val) => saveCoreSection('principles_tenets', val)}
                        />
                        <FrameworkSection 
                            title="Common Phrasing" 
                            description="Specific words, signatures, or phrases you frequently use."
                            value={core.common_phrasing || ''} 
                            onSave={(val) => saveCoreSection('common_phrasing', val)}
                        />
                    </div>
                )}

                {activeTab === 'personas' && !selectedPersonaId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn-primary" onClick={() => setShowCreatePersona(true)}>+ Add New Persona</button>
                        </div>

                        {showCreatePersona && (
                            <div className="card" style={{ marginBottom: '24px' }}>
                                <h3>Create New Persona</h3>
                                <form onSubmit={handleCreatePersona} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Name</label>
                                        <input className="input-field" value={newPersonaName} onChange={e => setNewPersonaName(e.target.value)} required placeholder="e.g. Clinical Supervisor, Mentor, etc." />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Description</label>
                                        <textarea className="input-field" value={newPersonaDesc} onChange={e => setNewPersonaDesc(e.target.value)} placeholder="Short description of when to use this persona." />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                        <button type="button" className="btn-secondary" onClick={() => setShowCreatePersona(false)}>Cancel</button>
                                        <button type="submit" className="btn-primary">Create Persona</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                            {personas.map(persona => (
                                <div key={persona.id} className="card" style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--secondary-faded)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>👤</div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{persona.name}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{persona.description}</p>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <div style={{ marginBottom: '4px' }}><strong>Tone:</strong> {persona.framework?.tone_idioms ? `${persona.framework.tone_idioms.substring(0, 60)}...` : 'Inherited'}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => setSelectedPersonaId(persona.id)}>Manage Framework</button>
                                        <button className="btn-secondary" style={{ color: '#ef4444', border: '1px solid #ef4444' }} onClick={() => handleDeletePersona(persona.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'personas' && selectedPersona && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setSelectedPersonaId(null)}>← Back to List</button>
                            <h2 style={{ margin: 0 }}>Managing: {selectedPersona.name}</h2>
                        </div>
                        
                        <div className="card" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                <strong>Persona Overrides:</strong> These settings override the Global Core when this persona is active for a session or person.
                            </p>
                        </div>

                        {selectedPersona.framework ? (
                            <>
                                <FrameworkSection 
                                    title="Tone & Idioms" 
                                    description={`Stylistic overrides for ${selectedPersona.name}.`}
                                    value={selectedPersona.framework.tone_idioms || ''} 
                                    onSave={(val) => savePersonaFrameworkSection(selectedPersona.id, 'tone_idioms', val)}
                                />
                                <FrameworkSection 
                                    title="Formatting Preferences" 
                                    description={`How ${selectedPersona.name} prefers to structure information.`}
                                    value={selectedPersona.framework.formatting_preferences || ''} 
                                    onSave={(val) => savePersonaFrameworkSection(selectedPersona.id, 'formatting_preferences', val)}
                                />
                                <FrameworkSection 
                                    title="Principles & Tenets" 
                                    description={`Specific professional values for the ${selectedPersona.name} context.`}
                                    value={selectedPersona.framework.principles_tenets || ''} 
                                    onSave={(val) => savePersonaFrameworkSection(selectedPersona.id, 'principles_tenets', val)}
                                />
                                <FrameworkSection 
                                    title="Common Phrasing" 
                                    description={`Preferred vocabulary or stylistic markers for ${selectedPersona.name}.`}
                                    value={selectedPersona.framework.common_phrasing || ''} 
                                    onSave={(val) => savePersonaFrameworkSection(selectedPersona.id, 'common_phrasing', val)}
                                />

                                <div style={{ marginTop: '24px' }}>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Targeted Evolution</h3>
                                    <div style={{ maxWidth: '400px' }}>
                                        <FrameworkAnalysisControls personaId={selectedPersona.id} title={`Refine ${selectedPersona.name}`} />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                                <p style={{ color: 'var(--text-muted)' }}>This persona doesn't have a linked framework record. This shouldn't happen.</p>
                                <button className="btn-primary" onClick={async () => {
                                    // Recover by creating one manually if needed
                                    alert("Recovery not implemented yet.");
                                }}>Create Manual Framework</button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'proposals' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Review AI-generated suggestions to evolve your professional style.
                            </p>
                            <button 
                                className="btn-secondary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                                onClick={async () => {
                                    setLoading(true);
                                    try {
                                        await api.post('/api/framework/proposals/synthesize', {});
                                        await fetchData();
                                    } catch (err) {
                                        console.error('Synthesis failed:', err);
                                        alert('Synthesis failed.');
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                            >
                                🪄 Synthesize & De-duplicate
                            </button>
                        </div>

                        {proposals.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                                <p style={{ color: 'var(--text-muted)' }}>No new proposals. Try running an analysis job!</p>
                            </div>
                        ) : (
                            proposals.map(proposal => (
                                <div key={proposal.id} className="card" style={{ borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)' }}>{proposal.aspect}</span>
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    fontWeight: 700, 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    background: proposal.action === 'Add' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                                                    color: proposal.action === 'Add' ? '#22c55e' : 'var(--primary)'
                                                }}>
                                                    {proposal.action.toUpperCase()}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: '1.1rem', fontWeight: 500, margin: '0 0 12px 0' }}>{proposal.value}</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                <span>Source: <strong>{proposal.source_context || `${proposal.source_type} #${proposal.source_id}`}</strong></span>
                                                {proposal.source_owner && (
                                                    <span>Owner: <strong>{proposal.source_owner}</strong></span>
                                                )}
                                                {proposal.source_date && (
                                                    <span>Date: <strong>{proposal.source_date}</strong></span>
                                                )}
                                                {proposal.persona_id && (
                                                    <span>Original Persona: <strong>{personas.find(p => p.id === proposal.persona_id)?.name || 'Unknown'}</strong></span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Target Scope:</label>
                                            <select 
                                                className="input-field" 
                                                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
                                                value={proposal.is_core ? 'core' : (proposal.persona_id || 'core')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const updated = proposals.map(p => {
                                                        if (p.id === proposal.id) {
                                                            if (val === 'core') return { ...p, is_core: true, persona_id: undefined };
                                                            return { ...p, is_core: false, persona_id: parseInt(val) };
                                                        }
                                                        return p;
                                                    });
                                                    setProposals(updated);
                                                }}
                                            >
                                                <option value="core">Global Core</option>
                                                {personas.map(p => (
                                                    <option key={p.id} value={p.id}>Persona: {p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => resolveProposal(proposal.id, false)}>Reject</button>
                                            <button className="btn-primary" onClick={() => resolveProposal(proposal.id, true, proposal.persona_id, proposal.is_core)}>Approve & Apply</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PracticeFramework;
