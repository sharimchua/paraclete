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
    const [activeTab, setActiveTab] = useState<'core' | 'personas' | 'custom' | 'proposals'>('core');
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [customRecords, setCustomRecords] = useState<any[]>([]);
    const [selectedCustomRecord, setSelectedCustomRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreatePersona, setShowCreatePersona] = useState(false);
    const [consolidatedView, setConsolidatedView] = useState<{title: string, text: string} | null>(null);
    
    // New Persona State
    const [newPersonaName, setNewPersonaName] = useState('');
    const [newPersonaDesc, setNewPersonaDesc] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch everything, but don't let one fail the whole page
            const [coreRes, personaRes, customRes, proposalRes] = await Promise.allSettled([
                api.get<PractiseFramework>('/api/framework/core'),
                api.get<Persona[]>('/api/framework/personas'),
                api.get<any[]>('/api/framework/custom'),
                api.get<FrameworkProposal[]>('/api/framework/proposals?status=pending')
            ]);

            if (coreRes.status === 'fulfilled') setCore(coreRes.value);
            if (personaRes.status === 'fulfilled') setPersonas(personaRes.value);
            if (customRes.status === 'fulfilled') setCustomRecords(customRes.value);
            if (proposalRes.status === 'fulfilled') setProposals(proposalRes.value);

            if (personaRes.status === 'rejected') console.error('Failed to fetch personas:', personaRes.reason);
            if (customRes.status === 'rejected') console.error('Failed to fetch custom frameworks:', customRes.reason);
        } catch (err) {
            console.error('Failed to fetch framework data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);


    const resolveProposal = async (id: number, approved: boolean, targetPersonaId?: number, isCore?: boolean, personId?: number, groupId?: number) => {
        try {
            await api.post(`/api/framework/proposals/${id}/resolve`, { 
                approved,
                override_persona_id: targetPersonaId,
                override_person_id: personId,
                override_group_id: groupId,
                override_is_core: isCore
            });
            setProposals(prev => prev.filter(p => p.id !== id));
            if (approved) fetchData();
        } catch (err) {
            console.error('Failed to resolve proposal:', err);
        }
    };

    const rejectAllProposals = async () => {
        if (!window.confirm(`Are you sure you want to reject all ${proposals.length} pending proposals?`)) return;
        try {
            await api.post('/api/framework/proposals/reject-all', {});
            setProposals([]);
            alert('All proposals rejected.');
        } catch (err) {
            console.error('Failed to reject all proposals:', err);
            alert('Failed to reject all proposals.');
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
                    onClick={() => { setActiveTab('personas'); setSelectedPersonaId(null); setSelectedCustomRecord(null); }}
                    style={{ border: 'none', background: 'none', padding: '12px 24px', cursor: 'pointer', borderRadius: '8px 8px 0 0', fontWeight: activeTab === 'personas' ? 700 : 400 }}
                >
                    Personas
                </button>
                <button 
                    className={`nav-item ${activeTab === 'custom' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('custom'); setSelectedPersonaId(null); setSelectedCustomRecord(null); }}
                    style={{ border: 'none', background: 'none', padding: '12px 24px', cursor: 'pointer', borderRadius: '8px 8px 0 0', fontWeight: activeTab === 'custom' ? 700 : 400 }}
                >
                    Custom
                </button>
                <button 
                    className={`nav-item ${activeTab === 'proposals' ? 'active' : ''}`} 
                    onClick={() => { setActiveTab('proposals'); setSelectedPersonaId(null); setSelectedCustomRecord(null); }}
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
                            {personas.map(p => (
                                <div 
                                    key={p.id} 
                                    className="card" 
                                    onClick={() => setSelectedPersonaId(p.id)}
                                    style={{ padding: '24px', cursor: 'pointer', border: '1px solid var(--border-color)', position: 'relative', height: '100%' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                        <div style={{ 
                                            width: '40px', 
                                            height: '40px', 
                                            background: '#e0f2fe', // Fallback light blue
                                            borderRadius: '8px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontSize: '1.2rem', 
                                            color: '#0369a1' 
                                        }}>
                                            👤
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{p.name}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Professional Persona</p>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.4rem' }}>
                                        {p.description || "No description provided."}
                                    </p>
                                    
                                    <div style={{ background: 'rgba(56, 189, 248, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '8px', textTransform: 'uppercase' }}>Active Patterns</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {(p.framework as any)?.items?.slice(0, 3).map((item: any) => (
                                                <div key={item.id} style={{ background: 'white', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                    {item.aspect}: {(item.value || '').slice(0, 20)}...
                                                </div>
                                            ))}
                                            {((p.framework as any)?.items?.length || 0) > 3 && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                                                    +{((p.framework as any)?.items?.length || 0) - 3} more
                                                </div>
                                            )}
                                            {((p.framework as any)?.items?.length || 0) === 0 && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No baseline overrides</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); setSelectedPersonaId(p.id); }}>Manage</button>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ fontSize: '0.8rem' }} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConsolidatedView({ title: `${p.name} Consolidated`, text: "Loading..." });
                                                api.get<{consolidated_text: string}>(`/api/framework/consolidated/persona/${p.id}`).then(res => {
                                                    setConsolidatedView({ title: `${p.name} Practice Style`, text: res.consolidated_text });
                                                });
                                            }}
                                        >
                                            👁️
                                        </button>
                                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); handleDeletePersona(p.id); }}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                            {personas.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🎭</div>
                                    <h3>No Personas Defined</h3>
                                    <p>Create personas to represent different professional contexts or styles of practice.</p>
                                    <button className="btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowCreatePersona(true)}>Create Your First Persona</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'custom' && !selectedCustomRecord && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="card" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                <strong>Stakeholder Frameworks:</strong> Unique professional styles automatically extracted for specific clients or groups.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                            {customRecords.map(record => (
                                <div 
                                    key={`${record.type}-${record.id}`} 
                                    className="card" 
                                    onClick={() => setSelectedCustomRecord(record)}
                                    style={{ padding: '24px', cursor: 'pointer', border: '1px solid var(--border-color)', position: 'relative' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                        <div style={{ width: '40px', height: '40px', background: record.type === 'person' ? '#dcfce7' : '#fef9c3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                            {record.type === 'person' ? '👤' : '👥'}
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{record.name}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{record.type === 'person' ? 'Client' : 'Stakeholder Group'}</p>
                                        </div>
                                    </div>

                                    {/* Summary of Overrides */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '8px', textTransform: 'uppercase' }}>Custom Overrides</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {record.framework?.items?.slice(0, 3).map((item: any) => (
                                                <div key={item.id} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                    {item.aspect}: {item.value.slice(0, 20)}...
                                                </div>
                                            ))}
                                            {(record.framework?.items?.length || 0) > 3 && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                                                    +{(record.framework?.items?.length || 0) - 3} more
                                                </div>
                                            )}
                                            {(record.framework?.items?.length || 0) === 0 && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No custom overrides</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); setSelectedCustomRecord(record); }}>Manage</button>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ fontSize: '0.8rem' }} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConsolidatedView({ title: `${record.name} Consolidated`, text: "Loading..." });
                                                api.get<{consolidated_text: string}>(`/api/framework/consolidated/${record.type}/${record.id}`).then(res => {
                                                    setConsolidatedView({ title: `${record.name} Practice Style`, text: res.consolidated_text });
                                                });
                                            }}
                                        >
                                            👁️ Style View
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {customRecords.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    No stakeholder-specific frameworks yet. These will appear as the AI extracts unique patterns for specific clients or groups.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'custom' && selectedCustomRecord && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setSelectedCustomRecord(null)}>← Back to List</button>
                            <h2 style={{ margin: 0 }}>Custom Style: {selectedCustomRecord.name}</h2>
                        </div>
                        
                        <div className="card" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                <strong>Custom Overrides:</strong> These settings specifically apply when interacting with {selectedCustomRecord.name}.
                            </p>
                        </div>

                        {selectedCustomRecord.framework ? (
                            <>
                                <FrameworkSection 
                                    title="Tone & Idioms" 
                                    description={`Stylistic markers unique to ${selectedCustomRecord.name}.`}
                                    value={selectedCustomRecord.framework.tone_idioms || ''} 
                                    onSave={async (val) => {
                                        await api.patch(`/api/framework/frameworks/${selectedCustomRecord.framework.id}`, { ...selectedCustomRecord.framework, tone_idioms: val });
                                        fetchData();
                                    }}
                                />
                                <FrameworkSection 
                                    title="Formatting Preferences" 
                                    description={`How ${selectedCustomRecord.name} expects information to be presented.`}
                                    value={selectedCustomRecord.framework.formatting_preferences || ''} 
                                    onSave={async (val) => {
                                        await api.patch(`/api/framework/frameworks/${selectedCustomRecord.framework.id}`, { ...selectedCustomRecord.framework, formatting_preferences: val });
                                        fetchData();
                                    }}
                                />
                                <FrameworkSection 
                                    title="Principles & Tenets" 
                                    description={`The ground rules for this specific stakeholder relationship.`}
                                    value={selectedCustomRecord.framework.principles_tenets || ''} 
                                    onSave={async (val) => {
                                        await api.patch(`/api/framework/frameworks/${selectedCustomRecord.framework.id}`, { ...selectedCustomRecord.framework, principles_tenets: val });
                                        fetchData();
                                    }}
                                />
                                <FrameworkSection 
                                    title="Common Phrasing" 
                                    description={`Vocabulary or signatures specific to ${selectedCustomRecord.name}.`}
                                    value={selectedCustomRecord.framework.common_phrasing || ''} 
                                    onSave={async (val) => {
                                        await api.patch(`/api/framework/frameworks/${selectedCustomRecord.framework.id}`, { ...selectedCustomRecord.framework, common_phrasing: val });
                                        fetchData();
                                    }}
                                />
                            </>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                                <p style={{ color: 'var(--text-muted)' }}>No framework record found.</p>
                            </div>
                        )}
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
                                Review AI-generated suggestions to evolve your professional style. Items with higher <strong>Weight</strong> were observed more frequently across your practice history.
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {proposals.length > 0 && (
                                    <button 
                                        className="btn-secondary" 
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', borderColor: '#ef4444' }}
                                        onClick={async () => {
                                            if (!window.confirm(`Are you sure you want to reject all ${proposals.length} pending proposals?`)) return;
                                            setLoading(true);
                                            try {
                                                await api.post('/api/framework/proposals/reject-all', {});
                                                await fetchData();
                                            } catch (err) {
                                                console.error('Failed to reject all proposals:', err);
                                                alert('Failed to reject all.');
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                    >
                                        🗑️ Reject All
                                    </button>
                                )}
                            </div>
                        </div>

                        {proposals.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                                <p style={{ color: 'var(--text-muted)' }}>No new proposals. Try running an analysis job!</p>
                            </div>
                        ) : (() => {
                            const weights = proposals.map(p => p.observation_count || 1);
                            const minWeight = Math.min(...weights);
                            const maxWeight = Math.max(...weights);
                            
                            const getWeightColor = (weight: number) => {
                                if (maxWeight === minWeight) return 'var(--primary)';
                                const normalized = (weight - minWeight) / (maxWeight - minWeight);
                                // Hue: 120 (Green) to 0 (Red)
                                const hue = Math.max(0, 120 - (normalized * 120));
                                return `hsl(${hue}, 70%, 50%)`;
                            };

                            return [...proposals].sort((a, b) => (b.observation_count || 1) - (a.observation_count || 1)).map(proposal => {
                                const weight = proposal.observation_count || 1;
                                const weightColor = getWeightColor(weight);
                                
                                return (
                                    <div key={proposal.id} className="card" style={{ borderLeft: `4px solid ${weightColor}`, display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: '16px', right: '16px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Weight</div>
                                            <div style={{ 
                                                background: weight > 1 ? weightColor : 'var(--bg-deep)', 
                                                color: weight > 1 ? 'white' : 'var(--text-secondary)',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '1rem',
                                                border: `1px solid ${weight > 1 ? weightColor : 'var(--border)'}`,
                                                boxShadow: weight > 5 ? `0 0 10px ${weightColor}44` : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minWidth: '40px'
                                            }}>
                                                {weight}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: '80px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: weightColor }}>{proposal.aspect}</span>
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
                                                <p style={{ fontSize: '1.1rem', fontWeight: 500, margin: '0 0 12px 0', maxWidth: '90%', lineHeight: '1.4' }}>{proposal.value}</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    <span>Source: <strong>{proposal.source_context || `${proposal.source_type} #${proposal.source_id}`}</strong></span>
                                                    {proposal.source_owner && (
                                                        <span>Owner: <strong>{proposal.source_owner}</strong></span>
                                                    )}
                                                    {proposal.source_date && (
                                                        <span>Date: <strong>{proposal.source_date}</strong></span>
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
                                                    value={proposal.is_core ? 'core' : (proposal.person_id ? `person-${proposal.person_id}` : (proposal.group_id ? `group-${proposal.group_id}` : (proposal.persona_id || 'core')))}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const updated = proposals.map(p => {
                                                            if (p.id === proposal.id) {
                                                                if (val === 'core') return { ...p, is_core: true, persona_id: undefined, person_id: undefined, group_id: undefined };
                                                                if (val.startsWith('person-')) return { ...p, is_core: false, persona_id: undefined, person_id: parseInt(val.split('-')[1]), group_id: undefined };
                                                                if (val.startsWith('group-')) return { ...p, is_core: false, persona_id: undefined, person_id: undefined, group_id: parseInt(val.split('-')[1]) };
                                                                return { ...p, is_core: false, persona_id: parseInt(val), person_id: undefined, group_id: undefined };
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
                                                    <optgroup label="Source Entity Attachments">
                                                        {proposal.person_id && <option value={`person-${proposal.person_id}`}>Client: (Source)</option>}
                                                        {proposal.group_id && <option value={`group-${proposal.group_id}`}>Group: (Source)</option>}
                                                    </optgroup>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => resolveProposal(proposal.id, false)}>Reject</button>
                                                <button className="btn-primary" onClick={() => resolveProposal(proposal.id, true, proposal.persona_id, proposal.is_core, proposal.person_id, proposal.group_id)}>Approve & Apply</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
            </div>

            {/* Consolidated View Modal */}
            {consolidatedView && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '12px', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0 }}>{consolidatedView.title}</h2>
                            <button className="btn-secondary" onClick={() => setConsolidatedView(null)}>Close</button>
                        </div>
                        <div style={{ background: 'var(--bg-deep)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.6' }}>
                            {consolidatedView.text}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PracticeFramework;
