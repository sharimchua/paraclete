import React, { useState, useEffect, useMemo } from 'react'
import { api, Tag } from '../services/api'

interface Props {
  onClose: () => void
  onSelect: (tagId: number) => void
  existingTagIds: number[]
  title: string
}

const TagSelectionModal: React.FC<Props> = ({ onClose, onSelect, existingTagIds, title }) => {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Tag[]>('/tags/')
      .then((data) => {
        setAllTags(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  const filteredTags = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase()
    return allTags.filter((tag) => {
      if (tag.id === undefined) return false
      const isNotAlreadyUsed = !existingTagIds.includes(tag.id)
      const matchesSearch =
        tag.value.toLowerCase().includes(lowerSearchTerm) ||
        (tag.key && tag.key.toLowerCase().includes(lowerSearchTerm))
      return isNotAlreadyUsed && matchesSearch
    })
  }, [allTags, existingTagIds, searchTerm])

  return (
    <div className="modal-overlay">
      <div
        className="modal-content card"
        style={{ width: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <header style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{title}</h3>
        </header>

        <div style={{ marginBottom: '16px' }}>
          <input
            className="input-field"
            placeholder="Search tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {loading ? (
            <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              Loading tags...
            </p>
          ) : filteredTags.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              {searchTerm ? 'No matching tags found.' : 'No available tags to add.'}
            </p>
          ) : (
            filteredTags.map((tag) => {
              if (tag.id === undefined) return null
              return (
                <div
                  key={tag.id}
                  className="card"
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.9rem'
                  }}
                  onClick={() => tag.id !== undefined && onSelect(tag.id)}
                >
                  <span>
                    {tag.key && (
                      <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>
                        {tag.key}:
                      </span>
                    )}
                    <span style={{ fontWeight: 500 }}>{tag.value}</span>
                  </span>
                  <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>Add +</span>
                </div>
              )
            })
          )}
        </div>

        <footer style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

export default TagSelectionModal
