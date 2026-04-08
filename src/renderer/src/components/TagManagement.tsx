import React, { useState, useEffect } from 'react';

interface Tag {
    id: number;
    key: string | null;
    value: string;
}

const TagManagement: React.FC = () => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [newTagValue, setNewTagValue] = useState('');
    const [newTagKey, setNewTagKey] = useState('');

    const fetchTags = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8000/tags/');
            if (response.ok) {
                const data = await response.json();
                setTags(data);
            }
        } catch (error) {
            console.error('Error fetching tags:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTags();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this tag? It will be removed from all associated items.')) return;
        
        try {
            const response = await fetch(`http://127.0.0.1:8000/tags/${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setTags(tags.filter(t => t.id !== id));
            }
        } catch (error) {
            console.error('Error deleting tag:', error);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTagValue.trim()) return;

        try {
            const response = await fetch('http://127.0.0.1:8000/tags/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: newTagKey || null, value: newTagValue.trim() }),
            });
            if (response.ok) {
                const newTag = await response.json();
                // If tag already exists, backend returns it. Check if we already have it.
                if (!tags.some(t => t.id === newTag.id)) {
                    setTags([...tags, newTag]);
                }
                setNewTagValue('');
                setNewTagKey('');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
        }
    };

    const filteredTags = tags.filter(tag => 
        tag.value.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (tag.key && tag.key.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Group tags by key for better visualization
    const groupedTags: Record<string, Tag[]> = {};
    filteredTags.forEach(tag => {
        const key = tag.key || 'Uncategorized';
        if (!groupedTags[key]) groupedTags[key] = [];
        groupedTags[key].push(tag);
    });

    return (
        <div className="tag-management animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '32px' }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Tag Management</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Manage taxonomy used across persons, groups, notes, and references.
                    </p>
                </div>
                
                <div className="card" style={{ width: '300px', padding: '16px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Create New Tag</h4>
                    <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input 
                            placeholder="Category (e.g. Skill)" 
                            value={newTagKey}
                            onChange={(e) => setNewTagKey(e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '8px' }}
                        />
                        <input 
                            placeholder="Value (e.g. Python)" 
                            value={newTagValue}
                            onChange={(e) => setNewTagValue(e.target.value)}
                            required
                            style={{ fontSize: '0.8rem', padding: '8px' }}
                        />
                        <button type="submit" className="btn-primary" style={{ padding: '8px', fontSize: '0.8rem' }}>
                            Add Tag
                        </button>
                    </form>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <input 
                        type="text" 
                        placeholder="Search tags..." 
                        className="input-field" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading tags...</div>
                ) : filteredTags.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        {searchTerm ? 'No tags match your search.' : 'No tags found. Create your first one!'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {Object.entries(groupedTags).map(([key, group]) => (
                            <div key={key}>
                                <h5 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '12px', opacity: 0.8, letterSpacing: '0.05em' }}>
                                    {key}
                                </h5>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                    {group.map(tag => (
                                        <div 
                                            key={tag.id} 
                                            className="admin-card"
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                padding: '6px 12px', 
                                                background: 'rgba(255,255,255,0.03)', 
                                                borderRadius: '6px', 
                                                border: '1px solid var(--border)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <span style={{ fontWeight: 500 }}>{tag.value}</span>
                                            <button 
                                                onClick={() => handleDelete(tag.id)}
                                                style={{ 
                                                    background: 'none', 
                                                    border: 'none', 
                                                    color: 'var(--text-muted)', 
                                                    cursor: 'pointer', 
                                                    padding: '2px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'color 0.2s'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                                                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                                title="Delete tag"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TagManagement;
