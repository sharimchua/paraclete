import React, { useState, useEffect } from 'react'
import { api, Person, Group } from '../services/api'

interface EntitySelectionModalProps {
  title: string
  subtitle?: string
  onSelect: (target: { type: 'person' | 'group' | 'none'; id?: number }) => void
  onClose: () => void
  allowGeneral?: boolean
  exclude?: Array<{ type: 'person' | 'group'; id: number }>
}

const EntitySelectionModal: React.FC<EntitySelectionModalProps> = ({
  title,
  subtitle,
  onSelect,
  onClose,
  allowGeneral = true,
  exclude = []
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchTargets = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const [p, g] = await Promise.all([
          api.get<Person[]>('/persons/'),
          api.get<Group[]>('/groups/')
        ])
        setPeople(p)
        setGroups(g)
      } catch (err) {
        console.error('Failed to fetch targets', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchTargets()
  }, [])

  const filteredTargets = [
    ...people.map((p) => ({ ...p, type: 'person' as const })),
    ...groups.map((g) => ({ ...g, type: 'group' as const }))
  ].filter((t) => {
    const isExcluded = exclude.some((e) => e.id === t.id && e.type === t.type)
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase())
    return !isExcluded && matchesSearch
  })

  return (
    <div className="modal-overlay">
      <div
        className="modal-content card"
        style={{
          width: '450px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px'
        }}
      >
        <header
          style={{
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</h3>
            {subtitle && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-secondary"
            style={{ padding: '4px 8px' }}
          >
            &times;
          </button>
        </header>

        <div style={{ marginBottom: '20px' }}>
          <input
            className="input-field"
            placeholder="Search people or groups..."
            aria-label="Search people or groups"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{ width: '100%', padding: '12px' }}
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
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className="loader" style={{ scale: '0.6' }} />
            </div>
          ) : filteredTargets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              {searchQuery ? 'No results found.' : 'No entities available.'}
            </div>
          ) : (
            filteredTargets.map((target) => (
              <div
                key={`${target.type}-${target.id}`}
                className="clickable-card"
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-surface)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--border)'
                }}
                onClick={() => onSelect({ type: target.type, id: target.id })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.2rem' }}>
                    {target.type === 'person' ? '👤' : '👥'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{target.name}</div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase'
                      }}
                    >
                      {target.type}
                    </div>
                  </div>
                </div>
                <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  Select
                </span>
              </div>
            ))
          )}
        </div>

        {allowGeneral && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              background: 'var(--primary-faded)',
              borderRadius: '8px',
              border: '1px dashed var(--primary)',
              display: 'flex',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            onClick={() => onSelect({ type: 'none' })}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
              + Create General Session (No Target)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default EntitySelectionModal
