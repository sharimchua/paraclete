import React, { useState, useEffect } from 'react';
import { api, PractiseFramework, Persona, FrameworkProposal, PractiseFrameworkItem, CustomFrameworkRecord } from '../services/api';
import FrameworkAnalysisControls from './FrameworkAnalysisControls';
import ConfirmationModal from './ConfirmationModal';
import EntitySelectionModal from './EntitySelectionModal';
import { useNavbar } from './NavbarContext';
import { toast } from './ToastProvider';

const FrameworkAspectList: React.FC<{
    title: string;
    aspect: string;
    description: string;
    framework: PractiseFramework;
    items: PractiseFrameworkItem[];
    onAdd: (aspect: string, value: string) => void;
    onUpdate: (id: number, value: string) => void;
    onDelete: (id: number) => void;
    onMove: (item: PractiseFrameworkItem) => void;
    hierarchyContext: { type: 'core' | 'persona' | 'custom', name: string, personaId?: number };
}> = ({ title, aspect, description, framework, items, onAdd, onUpdate, onDelete, onMove, hierarchyContext }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [editingId, setEditingId] = useState<number|null>(null);
    const [editValue, setEditValue] = useState('');

    const filteredItems = items.filter(i => i.aspect === aspect);

    return (
        <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '4px 0' }}>{description}</p>
                </div>
                {!isAdding && (
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setIsAdding(true)}>+ Add Rule</button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        {editingId === item.id ? (
                            <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                                <input 
                                    className="input-field" 
                                    value={editValue} 
                                    onChange={e => setEditValue(e.target.value)} 
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && (onUpdate(item.id, editValue), setEditingId(null))}
                                />
                                <button className="btn-primary" style={{ padding: '4px 12px' }} onClick={() => { onUpdate(item.id, editValue); setEditingId(null); }}>Save</button>
                                <button className="btn-secondary" style={{ padding: '4px 12px' }} onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                        ) : (
                            <>
                                <div style={{ fontSize: '0.95rem', flex: 1, cursor: 'pointer' }} onClick={() => { setEditingId(item.id); setEditValue(item.value); }}>
                                    {item.value}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        className="btn-secondary" 
                                        style={{ padding: '4px 8px', fontSize: '0.7rem' }} 
                                        title="Move to different level"
                                        onClick={() => onMove(item)}
                                    >
                                        ⇄ Move
                                    </button>
                                    <button className="btn-danger" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => onDelete(item.id)}>Delete</button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {isAdding && (
                    <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '10px', border: '1px dashed var(--primary)' }}>
                        <input 
                            className="input-field" 
                            placeholder="Type new stylistic rule..." 
                            value={newValue} 
                            onChange={e => setNewValue(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && newValue && (onAdd(aspect, newValue), setNewValue(''), setIsAdding(false))}
                        />
                        <button className="btn-primary" onClick={() => { if (newValue) { onAdd(aspect, newValue); setNewValue(''); setIsAdding(false); } }}>Add</button>
                        <button className="btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
                    </div>
                )}

                {filteredItems.length === 0 && !isAdding && (
                    <div style={{ padding: '24px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        No specific rules defined for this aspect.
                    </div>
                )}
            </div>
        </div>
    );
};

const PracticeFramework: React.FC = () => {
    const { setNavActions } = useNavbar();
    const [core, setCore] = useState<PractiseFramework | null>(null);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [proposals, setProposals] = useState<FrameworkProposal[]>([]);
    const [activeTab, setActiveTab] = useState<'core' | 'personas' | 'custom' | 'proposals'>('core');
    const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
    const [customRecords, setCustomRecords] = useState<CustomFrameworkRecord[]>([]);
    const [selectedCustomRecord, setSelectedCustomRecord] = useState<CustomFrameworkRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreatePersona, setShowCreatePersona] = useState(false);
    const [consolidatedView, setConsolidatedView] = useState<{title: string, text: string, structuredData?: any} | null>(null);
    const [movingItem, setMovingItem] = useState<PractiseFrameworkItem | null>(null);
    const [confirmation, setConfirmation] = useState<{ title: string, message: string, variant?: 'danger' | 'primary', onConfirm: () => void } | null>(null);
    const [showAddCustom, setShowAddCustom] = useState(false);
    
    // New Persona State
    const [newPersonaName, setNewPersonaName] = useState('');
    const [newPersonaDesc, setNewPersonaDesc] = useState('');

    const allItems = [
        ...(core?.items || []),
        ...personas.flatMap(p => p.framework?.items || []),
        ...customRecords.flatMap(r => r.framework?.items || [])
    ];

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
            if (customRes.status === 'fulfilled') {
                setCustomRecords(customRes.value);
                // Update selected custom record if active to ensure UI refreshes (e.g. after move)
                if (selectedCustomRecord) {
                    const updated = customRes.value.find(r => r.id === selectedCustomRecord.id && r.type === selectedCustomRecord.type);
                    setSelectedCustomRecord(updated || null);
                }
            }
            if (proposalRes.status === 'fulfilled') setProposals(proposalRes.value);

            setLoading(false);
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

    useEffect(() => {
        const handleWsMessage = (e: any) => {
            const { event } = e.detail;
            if (event === 'framework_proposals_updated') {
                fetchData();
            }
        };

        window.addEventListener('global-ws-message' as any, handleWsMessage);
        
        // Update Navbar Actions based on active tab and state
        let actions: any[] = [];
        if (activeTab === 'personas' && !selectedPersonaId) {
            actions.push({ label: '+ Add New Persona', onClick: () => setShowCreatePersona(true) });
        } else if (activeTab === 'custom' && !selectedCustomRecord) {
            actions.push({ label: '+ Create Override', onClick: () => setShowAddCustom(true) });
        } else if (activeTab === 'proposals' && proposals.length > 0) {
            actions.push({ label: 'Reject All', variant: 'danger', onClick: rejectAllProposals });
        }
        
        setNavActions(actions);

        return () => {
            window.removeEventListener('global-ws-message' as any, handleWsMessage);
            setNavActions([]);
        };
    }, [activeTab, selectedPersonaId, selectedCustomRecord, proposals.length, setNavActions]);


    const moveFrameworkItem = async (itemId: number, targetType: string, targetId?: number) => {
        try {
            await api.post(`/api/framework/items/${itemId}/move`, { target_type: targetType, target_id: targetId });
            setMovingItem(null);
            fetchData();
        } catch (err: any) {
            console.error('Failed to move item:', err);
            toast.error(`Failed to move item: ${err.message || 'Unknown error'}`);
        }
    };

    const handleAddCustomOverride = async (target: { type: 'person' | 'group' | 'none'; id?: number }) => {
        if (target.type === 'none' || !target.id) {
            setShowAddCustom(false);
            return;
        }

        try {
            const res = await api.post<{status: string, id: number}>(`/api/framework/custom/${target.type}/${target.id}`, {});
            setShowAddCustom(false);
            await fetchData();
            
            // Auto-select the newly created record
            // We need to wait for fetchData to complete so customRecords is updated
            // But we can find it in the response if we really wanted to.
            // For now, let's just let the user find it or we can try to find it in the refreshed list.
            toast.success('Custom override created.');
        } catch (err) {
            console.error('Failed to create custom override:', err);
            toast.error('Failed to create custom override.');
        }
    };

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
        setConfirmation({
            title: 'Reject All Proposals?',
            message: `Are you sure you want to reject all ${proposals.length} pending proposals?`,
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await api.post('/api/framework/proposals/reject-all', {});
                    setProposals([]);
                    toast.success('All proposals rejected.');
                } catch (err) {
                    console.error('Failed to reject all proposals:', err);
                    toast.error('Failed to reject all proposals.');
                }
                setConfirmation(null);
            }
        });
    };

    const createFrameworkItem = async (frameworkId: number, aspect: string, value: string) => {
        try {
            await api.post(`/api/framework/frameworks/${frameworkId}/items`, { aspect, value });
            fetchData();
        } catch (err) {
            console.error('Failed to create item:', err);
        }
    };

    const updateFrameworkItem = async (itemId: number, value: string) => {
        try {
            const item = allItems.find(i => i.id === itemId);
            if (!item) return;
            await api.patch(`/api/framework/items/${itemId}`, { aspect: item.aspect, value });
            fetchData();
        } catch (err) {
            console.error('Failed to update item:', err);
        }
    };

    const deleteFrameworkItem = async (itemId: number) => {
        setConfirmation({
            title: 'Delete Rule',
            message: 'Are you sure you want to delete this rule?',
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await api.delete(`/api/framework/items/${itemId}`);
                    fetchData();
                    toast.success('Rule deleted.');
                } catch (err) {
                    console.error('Failed to delete item:', err);
                    toast.error('Failed to delete rule.');
                }
                setConfirmation(null);
            }
        });
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
            toast.success('Persona created.');
        } catch (err) {
            console.error('Failed to create persona:', err);
            toast.error('Failed to create persona.');
        }
    };

    const handleDeletePersona = async (id: number) => {
        setConfirmation({
            title: 'Delete Persona',
            message: 'Are you sure you want to delete this persona? All associated core rules will be unlinked (but remain in global core).',
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await api.delete(`/api/framework/personas/${id}`);
                    if (selectedPersonaId === id) setSelectedPersonaId(null);
                    fetchData();
                    toast.success('Persona deleted.');
                } catch (err) {
                    console.error('Failed to delete persona:', err);
                    toast.error('Failed to delete persona.');
                }
                setConfirmation(null);
            }
        });
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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {((activeTab === 'personas' && selectedPersonaId) || (activeTab === 'custom' && selectedCustomRecord) || activeTab === 'core') && (
                        <FrameworkAnalysisControls 
                            personaId={selectedPersonaId || (activeTab === 'core' ? undefined : undefined)} 
                            personId={selectedCustomRecord?.type === 'person' ? selectedCustomRecord.id : undefined}
                            groupId={selectedCustomRecord?.type === 'group' ? selectedCustomRecord.id : undefined}
                        />
                    )}
                    {!(activeTab === 'core' || (activeTab === 'personas' && selectedPersonaId) || (activeTab === 'custom' && selectedCustomRecord)) && (
                        <div style={{ width: '400px' }}>
                            <FrameworkAnalysisControls title="Full Practice Analysis" />
                        </div>
                    )}
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
                        {[
                            { id: 'Tone', title: 'Tone & Idioms', desc: 'Typical vocabulary, regionalisms, and emotional tenor.' },
                            { id: 'Formatting', title: 'Formatting & Structure', desc: 'Bullet points usage, greeting styles, and brevity.' },
                            { id: 'Principles', title: 'Principles & Tenets', desc: 'Core philosophical anchors for communication.' },
                            { id: 'Phrasing', title: 'Common Phrasing', desc: 'Specific phrases or sentence starters to use or avoid.' }
                        ].map(section => (
                            <FrameworkAspectList 
                                key={section.id}
                                aspect={section.id}
                                title={section.title}
                                description={section.desc}
                                framework={core}
                                items={core.items || []}
                                onAdd={(asp, val) => createFrameworkItem(core.id, asp, val)}
                                onUpdate={updateFrameworkItem}
                                onDelete={deleteFrameworkItem}
                                onMove={setMovingItem}
                                hierarchyContext={{ type: 'core', name: 'Global' }}
                            />
                        ))}
                    </div>
                )}

                {activeTab === 'personas' && !selectedPersonaId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

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
                                    style={{ padding: '24px', cursor: 'pointer', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                        <div style={{ 
                                            width: '44px', 
                                            height: '44px', 
                                            background: 'var(--primary-faded)', 
                                            borderRadius: '10px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontSize: '1.25rem'
                                        }}>
                                            👤
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{p.name}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Professional Persona</p>
                                        </div>
                                    </div>

                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.4rem', lineHeight: '1.4' }}>
                                        {p.description || "Established professional context and baseline stylistic patterns."}
                                    </p>
                                    
                                    <div style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Baseline Patterns</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {(p.framework as any)?.items?.slice(0, 3).map((item: any) => (
                                                <div key={item.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{item.aspect}:</span> {(item.value || '').slice(0, 20)}...
                                                </div>
                                            ))}
                                            {((p.framework as any)?.items?.length || 0) > 3 && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                                    +{((p.framework as any)?.items?.length || 0) - 3}
                                                </div>
                                            )}
                                            {((p.framework as any)?.items?.length || 0) === 0 && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Use core defaults</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }} onClick={(e) => { e.stopPropagation(); setSelectedPersonaId(p.id); }}>Manage</button>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ fontSize: '0.8rem', padding: '8px' }} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConsolidatedView({ title: `${p.name} Consolidated`, text: "Loading..." });
                                                api.get<{consolidated_text: string, structured_data: any}>(`/api/framework/consolidated/persona/${p.id}`).then(res => {
                                                    setConsolidatedView({ title: `${p.name} Practice Style`, text: res.consolidated_text, structuredData: res.structured_data });
                                                });
                                            }}
                                        >
                                            👁️
                                        </button>
                                        <button className="btn-secondary" style={{ color: '#ef4444', padding: '8px' }} onClick={(e) => { e.stopPropagation(); handleDeletePersona(p.id); }}>🗑️</button>
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
                                    style={{ padding: '24px', cursor: 'pointer', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                        <div style={{ 
                                            width: '44px', 
                                            height: '44px', 
                                            background: record.type === 'person' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(129, 140, 248, 0.1)', 
                                            borderRadius: '10px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontSize: '1.25rem' 
                                        }}>
                                            {record.type === 'person' ? '👤' : '👥'}
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{record.name}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{record.type === 'person' ? 'Client Override' : 'Group Override'}</p>
                                        </div>
                                    </div>

                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.4rem', lineHeight: '1.4' }}>
                                        Targeted stylistic patterns and principles unique to this {record.type}.
                                    </p>

                                    <div style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Overrides</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {record.framework?.items?.slice(0, 3).map((item: any) => (
                                                <div key={item.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{item.aspect}:</span> {item.value.slice(0, 20)}...
                                                </div>
                                            ))}
                                            {(record.framework?.items?.length || 0) > 3 && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                                    +{(record.framework?.items?.length || 0) - 3}
                                                </div>
                                            )}
                                            {(record.framework?.items?.length || 0) === 0 && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No unique overrides</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        <button className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }} onClick={(e) => { e.stopPropagation(); setSelectedCustomRecord(record); }}>Manage</button>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ fontSize: '0.8rem', padding: '8px' }} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConsolidatedView({ title: `${record.name} View`, text: "Loading..." });
                                                const path = record.type === 'person' ? `/api/framework/consolidated/person/${record.id}` : `/api/framework/consolidated/group/${record.id}`;
                                                api.get<{consolidated_text: string, structured_data: any}>(path).then(res => {
                                                    setConsolidatedView({ title: `${record.name} Styles`, text: res.consolidated_text, structuredData: res.structured_data });
                                                });
                                            }}
                                        >
                                            👁️
                                        </button>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ color: '#ef4444', padding: '8px' }} 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setConfirmation({
                                                    title: 'Wipe Custom Rules',
                                                    message: `Are you sure you want to wipe all custom rules for ${record.name}? This action cannot be undone.`,
                                                    variant: 'danger',
                                                    onConfirm: async () => {
                                                        try {
                                                            await api.delete(`/api/framework/frameworks/${record.framework.id}`);
                                                            setSelectedCustomRecord(null);
                                                            fetchData();
                                                            toast.success('Custom framework wiped.');
                                                        } catch (err) {
                                                            console.error('Failed to delete framework:', err);
                                                            toast.error('Failed to wipe framework.');
                                                        }
                                                        setConfirmation(null);
                                                    }
                                                });
                                            }}
                                        >
                                            🗑️
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
                                {[
                                    { id: 'Tone', title: 'Tone & Idioms', desc: 'Stakeholder vocabulary.' },
                                    { id: 'Formatting', title: 'Formatting', desc: 'Rules for this entity.' },
                                    { id: 'Principles', title: 'Principles', desc: 'Specific tenets.' },
                                    { id: 'Phrasing', title: 'Phrasing', desc: 'Targeted phrasings.' }
                                ].map(section => (
                                    <FrameworkAspectList 
                                        key={section.id}
                                        aspect={section.id}
                                        title={section.title}
                                        description={section.desc}
                                        framework={selectedCustomRecord.framework}
                                        items={selectedCustomRecord.framework.items || []}
                                        onAdd={(asp, val) => createFrameworkItem(selectedCustomRecord.framework.id, asp, val)}
                                        onUpdate={updateFrameworkItem}
                                        onDelete={deleteFrameworkItem}
                                        onMove={setMovingItem}
                                        hierarchyContext={{ 
                                            type: 'custom', 
                                            name: selectedCustomRecord.name,
                                            personaId: selectedCustomRecord.persona_id 
                                        }}
                                    />
                                ))}
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
                                {[
                                    { id: 'Tone', title: 'Tone & Idioms', desc: `Stylistic overrides for ${selectedPersona.name}.` },
                                    { id: 'Formatting', title: 'Formatting', desc: `How ${selectedPersona.name} prefers to structure information.` },
                                    { id: 'Principles', title: 'Principles', desc: `Specific professional values for the ${selectedPersona.name} context.` },
                                    { id: 'Phrasing', title: 'Phrasing', desc: `Preferred vocabulary or stylistic markers for ${selectedPersona.name}.` }
                                ].map(section => (
                                    <FrameworkAspectList 
                                        key={section.id}
                                        aspect={section.id}
                                        title={section.title}
                                        description={section.desc}
                                        framework={selectedPersona.framework!}
                                        items={selectedPersona.framework?.items || []}
                                        onAdd={(asp, val) => createFrameworkItem(selectedPersona.framework!.id, asp, val)}
                                        onUpdate={updateFrameworkItem}
                                        onDelete={deleteFrameworkItem}
                                        onMove={setMovingItem}
                                        hierarchyContext={{ type: 'persona', name: selectedPersona.name }}
                                    />
                                ))}

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
                                                    value={proposal.is_core ? 'core' : (proposal.persona_id ? proposal.persona_id.toString() : (proposal.group_id ? `group-${proposal.group_id}` : (proposal.person_id ? `person-${proposal.person_id}` : 'core')))}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const updated = proposals.map(p => {
                                                            if (p.id === proposal.id) {
                                                                if (val === 'core') return { ...p, is_core: true, persona_id: null as any, person_id: null as any, group_id: null as any };
                                                                if (val.startsWith('person-')) {
                                                                    const id = parseInt(val.split('-')[1]);
                                                                    return { ...p, is_core: false, persona_id: null as any, person_id: id, group_id: null as any };
                                                                }
                                                                if (val.startsWith('group-')) {
                                                                    const id = parseInt(val.split('-')[1]);
                                                                    // Try to find group name from possibilities or personas
                                                                    const gName = p.possible_groups?.find(g => g.id === id)?.name;
                                                                    return { ...p, is_core: false, persona_id: null as any, person_id: null as any, group_id: id, group_name: gName || p.group_name };
                                                                }
                                                                // Assume it's a raw persona ID
                                                                const pid = parseInt(val);
                                                                const persName = personas.find(pers => pers.id === pid)?.name;
                                                                return { ...p, is_core: false, persona_id: pid, persona_name: persName || p.persona_name, person_id: null as any, group_id: null as any };
                                                            }
                                                            return p;
                                                        });
                                                        setProposals(updated);
                                                    }}
                                                >
                                                    <option value="core">Global Core</option>
                                                    
                                                    {proposal.persona_id && (
                                                        <optgroup label="Persona Framework (Recommended)">
                                                            <option value={proposal.persona_id}>Persona: {proposal.persona_name || `ID ${proposal.persona_id}`}</option>
                                                        </optgroup>
                                                    )}

                                                    {(proposal.group_id || proposal.person_id) && (
                                                        <optgroup label="Entity Frameworks (Overrides)">
                                                            {proposal.group_id && <option value={`group-${proposal.group_id}`}>Group: {proposal.group_name || `ID ${proposal.group_id}`}</option>}
                                                            {proposal.person_id && <option value={`person-${proposal.person_id}`}>Client: {proposal.person_name || `ID ${proposal.person_id}`}</option>}
                                                        </optgroup>
                                                    )}

                                                    {!proposal.persona_id && personas.length > 0 && (
                                                        <optgroup label="Global Personas">
                                                            {personas.map(p => (
                                                                <option key={p.id} value={p.id}>Persona: {p.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}

                                                    {proposal.possible_groups && proposal.possible_groups.length > 0 && (
                                                        <optgroup label="Member of Groups (Retarget to Group Base)">
                                                            {proposal.possible_groups.map(g => (
                                                                <option key={g.id} value={`group-${g.id}`}>Move to Group: {g.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
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
                <div className="modal-overlay" onClick={() => setConsolidatedView(null)}>
                    <div className="modal-content card" style={{ width: '90%', maxWidth: '900px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{consolidatedView.title}</h2>
                        </div>
                        <div style={{ padding: '32px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', minHeight: '300px' }}>
                            {consolidatedView.structuredData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    {(() => {
                                        const levels = [
                                            { label: 'Global Core', items: consolidatedView.structuredData.core || [] },
                                            { label: `Persona: ${consolidatedView.structuredData.persona?.name}`, items: consolidatedView.structuredData.persona?.items || [] },
                                            ...(consolidatedView.structuredData.groups || []).map((g: any) => ({ label: `Group: ${g.name}`, items: g.items || [] })),
                                            { label: `Individual: ${consolidatedView.structuredData.person?.name}`, items: consolidatedView.structuredData.person?.items || [] }
                                        ].filter(l => l.items && l.items.length > 0);

                                        if (levels.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No rules defined for this context.</div>;

                                        return levels.map((level, idx) => (
                                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-surface)' }}>
                                                <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {level.label}
                                                </div>
                                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {level.items.map((item: any) => (
                                                        <div key={item.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                            <div style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                                                                <span style={{ fontWeight: 700, color: 'var(--primary)', marginRight: '8px' }}>{item.aspect}:</span>
                                                                {item.value}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            ) : (
                                <div style={{ 
                                    background: 'var(--bg-deep)', 
                                    padding: '32px', 
                                    borderRadius: '12px', 
                                    border: '1px solid var(--border)', 
                                    whiteSpace: 'pre-wrap', 
                                    fontFamily: 'var(--font-mono)', 
                                    fontSize: '0.95rem', 
                                    lineHeight: '1.7',
                                    color: 'var(--text-primary)'
                                }}>
                                    {consolidatedView.text}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '16px 32px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface-elevated)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn-primary" onClick={() => setConsolidatedView(null)}>Got it</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Move Item Modal */}
            {movingItem && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(10px)' }}>
                    <div className="card" style={{ width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '0 8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Move Rule</h2>
                            <button className="btn-secondary" style={{ padding: '6px 16px' }} onClick={() => setMovingItem(null)}>Cancel</button>
                        </div>
                        
                        <div style={{ background: 'var(--bg-deep)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Moving Item</div>
                            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{movingItem.value}</div>
                        </div>

                        <div style={{ overflowY: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Target Level:</div>
                                
                                {core && (
                                    <button 
                                        className="btn-secondary" 
                                        style={{ textAlign: 'left', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={() => moveFrameworkItem(movingItem.id, 'core')}
                                    >
                                        <span>🌍 <strong>Global Core</strong></span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Baseline for all context</span>
                                    </button>
                                )}

                                {personas.map(p => (
                                    <button 
                                        key={p.id}
                                        className="btn-secondary" 
                                        style={{ textAlign: 'left', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={() => moveFrameworkItem(movingItem.id, 'persona', p.id)}
                                    >
                                        <span>👤 <strong>{p.name}</strong></span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Persona Level</span>
                                    </button>
                                ))}

                                {customRecords.map(r => (
                                    <button 
                                        key={`${r.type}-${r.id}`}
                                        className="btn-secondary" 
                                        style={{ textAlign: 'left', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={() => moveFrameworkItem(movingItem.id, r.type, r.id)}
                                    >
                                        <span>{r.type === 'person' ? '👤' : '👥'} <strong>{r.name}</strong></span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.type === 'person' ? 'Individual' : 'Group'} Custom</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Modal */}
            {confirmation && (
                <ConfirmationModal 
                    title={confirmation.title}
                    message={confirmation.message}
                    variant={confirmation.variant || 'primary'}
                    onConfirm={confirmation.onConfirm}
                    onCancel={() => setConfirmation(null)}
                />
            )}
            {showAddCustom && (
                <EntitySelectionModal 
                    title="Create Override" 
                    subtitle="Select a person or group to define specific style rules for."
                    onSelect={handleAddCustomOverride}
                    onClose={() => setShowAddCustom(false)}
                    allowGeneral={false}
                    exclude={customRecords.map(r => ({ type: r.type, id: r.id }))}
                />
            )}
        </div>
    );
};

export default PracticeFramework;
