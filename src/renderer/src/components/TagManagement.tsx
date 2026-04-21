import React, { useState, useEffect } from 'react'
import { useNavbar } from './NavbarContext'

interface Tag {
  id: number
  key: string | null
  value: string
}

const TagManagement: React.FC = () => {
  const { setNavActions } = useNavbar()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [newTagValue, setNewTagValue] = useState('')
  const [newTagKey, setNewTagKey] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchTags = async (): Promise<void> => {
    try {
      const response = await fetch('http://127.0.0.1:8000/tags/')
      if (response.ok) {
        const data = await response.json()
        setTags(data)
      }
    } catch (error) {
      console.error('Error fetching tags:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTags()

    setNavActions([
      {
        label: '+ Create New Tag',
        onClick: () => setShowCreateModal(true)
      }
    ])

    return () => setNavActions([])
  }, [setNavActions])

  const handleDelete = async (id: number): Promise<void> => {
    if (
      !confirm(
        'Are you sure you want to delete this tag? It will be removed from all associated items.'
      )
    )
      return

    try {
      const response = await fetch(`http://127.0.0.1:8000/tags/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setTags(tags.filter((t) => t.id !== id))
      }
    } catch (error) {
      console.error('Error deleting tag:', error)
    }
  }

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newTagValue.trim()) return

    try {
      const response = await fetch('http://127.0.0.1:8000/tags/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newTagKey || null, value: newTagValue.trim() })
      })
      if (response.ok) {
        const newTag = await response.json()
        // If tag already exists, backend returns it. Check if we already have it.
        if (!tags.some((t) => t.id === newTag.id)) {
          setTags([...tags, newTag])
        }
        setNewTagValue('')
        setNewTagKey('')
        setShowCreateModal(false)
      }
    } catch (error) {
      console.error('Error creating tag:', error)
    }
  }

  const filteredTags = tags.filter(
    (tag) =>
      tag.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tag.key && tag.key.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Group tags by key for better visualization
  const groupedTags: Record<string, Tag[]> = {}
  filteredTags.forEach((tag) => {
    const key = tag.key || 'Uncategorized'
    if (!groupedTags[key]) groupedTags[key] = []
    groupedTags[key].push(tag)
  })

  return (
    <div className="tag-management animate-in">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '24px',
          marginBottom: '32px'
        }}
      >
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
            Tag Management
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Manage taxonomy used across persons, groups, notes, and references.
          </p>
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
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            Loading tags...
          </div>
        ) : filteredTags.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            {searchTerm ? 'No tags match your search.' : 'No tags found. Create your first one!'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {Object.entries(groupedTags).map(([key, group]) => (
              <div key={key}>
                <h5
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    textTransform: 'uppercase',
                    marginBottom: '12px',
                    opacity: 0.8,
                    letterSpacing: '0.05em'
                  }}
                >
                  {key}
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {group.map((tag) => (
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
                        onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
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

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ width: '400px' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>
              Create New Tag
            </h4>
            <form
              onSubmit={handleCreate}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Category (Optional)
                </label>
                <input
                  placeholder="e.g. Skill, Role, Industry"
                  className="input-field"
                  value={newTagKey}
                  onChange={(e) => setNewTagKey(e.target.value)}
                  autoFocus
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Used to group related tags
                </p>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Tag Value
                </label>
                <input
                  placeholder="e.g. Python, Lead Designer"
                  className="input-field"
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  required
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '8px'
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TagManagement
