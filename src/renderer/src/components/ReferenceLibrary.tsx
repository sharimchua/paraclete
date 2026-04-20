import React, { useState, useEffect } from 'react';
import { api, Reference, Tag } from '../services/api';
import { useNavbar } from './NavbarContext';

const ReferenceLibrary: React.FC = () => {
    const { setNavActions } = useNavbar();
    const [references, setReferences] = useState<Reference[]>([]);
    const [proposals, setProposals] = useState<any[]>([]);
    const [view, setView] = useState<'library' | 'proposals'>('library');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingRef, setEditingRef] = useState<Reference | null>(null);
    
    const [newRef, setNewRef] = useState({
        title: '',
        body: '',
        url: '',
        type: 'CONCEPT' as Reference['type'],
        tags: [] as Tag[]
    });

    const fetchReferences = async () => {
        setLoading(true);
        try {
            const data = await api.get<Reference[]>(`/api/references/?search=${encodeURIComponent(searchTerm)}`);
            setReferences(data);
        } catch (err) {
            console.error('Failed to fetch references:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchProposals = async () => {
        setLoading(true);
        try {
            const data = await api.get<any[]>('/api/references/proposals?status=PENDING');
            setProposals(data);
        } catch (err) {
            console.error('Failed to fetch proposals:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (view === 'library') {
            const delaySearch = setTimeout(() => {
                fetchReferences();
            }, 300);

            setNavActions([
                {
                    label: '+ Add Reference',
                    onClick: () => setIsAdding(true)
                }
            ]);

            return () => {
                clearTimeout(delaySearch);
                setNavActions([]);
            };
        } else {
            fetchProposals();
            setNavActions([]);
            return () => {
                setNavActions([]);
            };
        }
    }, [searchTerm, view, setNavActions]);

    const handleAdd = async () => {
        try {
            await api.post('/api/references/', {
                ...newRef,
                tags: newRef.tags.map(t => t.id)
            });
            setIsAdding(false);
            setNewRef({ title: '', body: '', url: '', type: 'CONCEPT', tags: [] });
            fetchReferences();
        } catch (err) {
            console.error('Failed to add reference:', err);
        }
    };

    const handleUpdate = async () => {
        if (!editingRef) return;
        try {
            await api.patch(`/api/references/${editingRef.id}`, {
                title: editingRef.title,
                body: editingRef.body,
                type: editingRef.type,
                url: editingRef.url,
            });
            setEditingRef(null);
            fetchReferences();
        } catch (err) {
            console.error('Failed to update reference:', err);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this reference?')) return;
        try {
            await api.delete(`/api/references/${id}`);
            fetchReferences();
        } catch (err) {
            console.error('Failed to delete reference:', err);
        }
    };

    const acceptProposal = async (propId: number) => {
        try {
            await api.post(`/api/references/proposals/${propId}/accept`, {});
            fetchProposals();
        } catch (err) {
            console.error('Failed to accept proposal:', err);
        }
    };

    const rejectProposal = async (propId: number) => {
        try {
            await api.post(`/api/references/proposals/${propId}/reject`, {});
            fetchProposals();
        } catch (err) {
            console.error('Failed to reject proposal:', err);
        }
    };

    const TypeBadge = ({ type }: { type: string }) => (
        <span style={{ 
            fontSize: '0.65rem', 
            fontWeight: 800, 
            textTransform: 'uppercase', 
            color: 'var(--primary)',
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            letterSpacing: '0.05em'
        }}>
            {type}
        </span>
    );

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Reference Library</h1>
                    <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
                        <button 
                            onClick={() => setView('library')}
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                borderBottom: view === 'library' ? '2px solid var(--primary)' : '2px solid transparent',
                                color: view === 'library' ? 'var(--text-main)' : 'var(--text-muted)',
                                padding: '8px 4px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Knowledge Library
                        </button>
                        <button 
                            onClick={() => setView('proposals')}
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                borderBottom: view === 'proposals' ? '2px solid var(--secondary)' : '2px solid transparent',
                                color: view === 'proposals' ? 'var(--text-main)' : 'var(--text-muted)',
                                padding: '8px 4px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            Pending Proposals
                            {proposals.length > 0 && <span style={{ background: 'var(--secondary)', color: 'white', borderRadius: '10px', padding: '2px 8px', fontSize: '0.65rem' }}>{proposals.length}</span>}
                        </button>
                    </div>
                </div>
            </div>

            {view === 'library' ? (
                <>
                    <div className="card" style={{ marginBottom: '24px' }}>
                        <input 
                            type="text" 
                            placeholder="Search references by title, body, or tags..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '12px 16px', 
                                borderRadius: '8px', 
                                border: '1px solid var(--border)',
                                background: 'var(--bg-deep)',
                                color: 'var(--text-main)',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                        {loading ? (
                            <div style={{ padding: '10% 0', gridColumn: '1 / -1', textAlign: 'center' }}>
                                <div className="loader" style={{ margin: '0 auto 16px' }} />
                                Loading Library...
                            </div>
                        ) : references.length === 0 ? (
                            <div className="card" style={{ gridColumn: '1 / -1', padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <p>No references found. Start by adding one or approving an AI proposal.</p>
                            </div>
                        ) : (
                            references.map(ref => (
                                <div key={ref.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <TypeBadge type={ref.type} />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => setEditingRef(ref)}
                                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(ref.id)}
                                                style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: 700 }}>{ref.title}</h3>
                                    <p style={{ 
                                        fontSize: '0.9rem', 
                                        color: 'var(--text-secondary)', 
                                        lineHeight: '1.5',
                                        flex: 1
                                    }}>
                                        {ref.body}
                                    </p>
                                    <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {ref.tags.map(tag => (
                                            <span key={tag.id} className="tag-pill">{tag.value}</span>
                                        ))}
                                    </div>
                                    {ref.url && (
                                        <div style={{ marginTop: '12px' }}>
                                            <a href={ref.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                                                🔗 Resource Link
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}>Reviewing Proposals...</div>
                    ) : proposals.length === 0 ? (
                        <div className="card" style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <p>No pending reference proposals from AI extraction.</p>
                            <p style={{ fontSize: '0.8rem' }}>Extract concepts from your session notes to see them here.</p>
                        </div>
                    ) : (
                        proposals.map(prop => (
                            <div key={prop.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--secondary)' }}>
                                <div style={{ flex: 1, paddingRight: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{prop.title}</h3>
                                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--bg-deep)', borderRadius: '4px', color: 'var(--secondary)', textTransform: 'uppercase', fontWeight: 700 }}>{prop.type}</span>
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>{prop.body}</p>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Source: <span style={{ color: 'var(--primary)' }}>Draft Note #{prop.source_note_id}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button 
                                        onClick={() => rejectProposal(prop.id)}
                                        className="btn-secondary" 
                                        style={{ padding: '8px 16px' }}
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        onClick={() => acceptProposal(prop.id)}
                                        className="btn-primary" 
                                        style={{ padding: '8px 16px', background: 'var(--secondary)' }}
                                    >
                                        Approve & Add
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Add Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '90%' }}>
                        <h2>New Reference</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                            <input 
                                type="text" 
                                placeholder="Title" 
                                value={newRef.title}
                                onChange={e => setNewRef({...newRef, title: e.target.value})}
                                className="input-field"
                            />
                            <select 
                                value={newRef.type}
                                onChange={e => setNewRef({...newRef, type: e.target.value as any})}
                                className="input-field"
                            >
                                <option value="CONCEPT">CONCEPT</option>
                                <option value="RESOURCE">RESOURCE</option>
                                <option value="TECHNIQUE">TECHNIQUE</option>
                                <option value="PATTERN">PATTERN</option>
                                <option value="TEMPLATE">TEMPLATE</option>
                            </select>
                            <input 
                                type="text" 
                                placeholder="URL (Optional)" 
                                value={newRef.url || ''}
                                onChange={e => setNewRef({...newRef, url: e.target.value})}
                                className="input-field"
                            />
                            <textarea 
                                placeholder="Body Content / Summary" 
                                value={newRef.body}
                                onChange={e => setNewRef({...newRef, body: e.target.value})}
                                className="input-field"
                                style={{ minHeight: '150px' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                <button className="btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleAdd}>Save Reference</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingRef && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '90%' }}>
                        <h2>Edit Reference</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                            <input 
                                type="text" 
                                placeholder="Title" 
                                value={editingRef.title}
                                onChange={e => setEditingRef({...editingRef, title: e.target.value})}
                                className="input-field"
                            />
                            <select 
                                value={editingRef.type}
                                onChange={e => setEditingRef({...editingRef, type: e.target.value as any})}
                                className="input-field"
                            >
                                <option value="CONCEPT">CONCEPT</option>
                                <option value="RESOURCE">RESOURCE</option>
                                <option value="TECHNIQUE">TECHNIQUE</option>
                                <option value="PATTERN">PATTERN</option>
                                <option value="TEMPLATE">TEMPLATE</option>
                            </select>
                            <input 
                                type="text" 
                                placeholder="URL (Optional)" 
                                value={editingRef.url || ''}
                                onChange={e => setEditingRef({...editingRef, url: e.target.value})}
                                className="input-field"
                            />
                            <textarea 
                                placeholder="Body Content / Summary" 
                                value={editingRef.body}
                                onChange={e => setEditingRef({...editingRef, body: e.target.value})}
                                className="input-field"
                                style={{ minHeight: '150px' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                <button className="btn-secondary" onClick={() => setEditingRef(null)}>Cancel</button>
                                <button className="btn-primary" onClick={handleUpdate}>Update Reference</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReferenceLibrary;
