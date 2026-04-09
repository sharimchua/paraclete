import React, { useState, useEffect } from 'react';
import { api, Reference, Tag } from '../services/api';

const ReferenceLibrary: React.FC = () => {
    const [references, setReferences] = useState<Reference[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    
    // New Reference State
    const [newRef, setNewRef] = useState({
        title: '',
        body: '',
        source_link: '',
        type: 'Resource' as any,
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

    useEffect(() => {
        const delaySearch = setTimeout(() => {
            fetchReferences();
        }, 300);
        return () => clearTimeout(delaySearch);
    }, [searchTerm]);

    const handleAdd = async () => {
        try {
            await api.post('/api/references/', {
                ...newRef,
                tags: newRef.tags.map(t => t.id)
            });
            setIsAdding(false);
            setNewRef({ title: '', body: '', source_link: '', type: 'Resource', tags: [] });
            fetchReferences();
        } catch (err) {
            console.error('Failed to add reference:', err);
            alert('Error adding reference');
        }
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Reference Library</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Curated knowledge, resources, and clinical guidelines.
                    </p>
                </div>
                <button className="btn-primary" onClick={() => setIsAdding(true)}>+ Add Reference</button>
            </div>

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
                                <option value="Resource">Resource</option>
                                <option value="Protocol">Protocol</option>
                                <option value="Insight">Insight</option>
                                <option value="Principle">Principle</option>
                            </select>
                            <input 
                                type="text" 
                                placeholder="Source Link (URL)" 
                                value={newRef.source_link}
                                onChange={e => setNewRef({...newRef, source_link: e.target.value})}
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {loading ? (
                    <div className="loader" />
                ) : (
                    references.map(ref => (
                        <div key={ref.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <span style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 700, 
                                    textTransform: 'uppercase', 
                                    color: 'var(--primary)',
                                    background: 'rgba(56, 189, 248, 0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '4px'
                                }}>
                                    {ref.type}
                                </span>
                                {ref.source_link && (
                                    <a href={ref.source_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        🔗 Link
                                    </a>
                                )}
                            </div>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: 700 }}>{ref.title}</h3>
                            <p style={{ 
                                fontSize: '0.9rem', 
                                color: 'var(--text-secondary)', 
                                lineHeight: '1.5',
                                display: '-webkit-box',
                                WebkitLineClamp: 4,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {ref.body}
                            </p>
                            <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {ref.tags.map(tag => (
                                    <span key={tag.id} className="tag-pill">{tag.value}</span>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ReferenceLibrary;
