import React, { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { AvatarSelector } from './AvatarSelector'

import { api, Group } from '../services/api'
import { useNavbar } from './NavbarContext'

interface Props {
  onSelectGroup: (id: number) => void
}

const GroupList: React.FC<Props> = ({ onSelectGroup }) => {
  const { setNavActions } = useNavbar()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newAvatarLogo, setNewAvatarLogo] = useState('')

  const fetchGroups = () => {
    setLoading(true)
    api
      .get<Group[]>('/groups/')
      .then((data) => {
        setGroups(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setError(`Failed to fetch groups: ${err instanceof Error ? err.message : String(err)}`)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchGroups()

    setNavActions([
      {
        label: '+ Add Group',
        onClick: () => setShowCreateModal(true)
      }
    ])

    return () => setNavActions([])
  }, [])

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/groups/', {
        name: newGroupName,
        description: newGroupDesc,
        avatar_logo: newAvatarLogo
      })
      setShowCreateModal(false)
      setNewGroupName('')
      setNewGroupDesc('')
      setNewAvatarLogo('')
      fetchGroups()
    } catch (err) {
      console.error(err)
      alert('Failed to create group')
    }
  }

  if (loading && groups.length === 0) return <div className="loader" />
  if (error) return <div className="error-text">{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Redundant header buttons removed to favor context-aware top bar */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}
      >
        {groups.length === 0 ? (
          <div
            className="card"
            style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}
          >
            <p style={{ color: 'var(--text-secondary)' }}>
              No groups found. Manage your people by groups.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectGroup(group.id)}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Avatar avatarLogo={group.avatar_logo} name={group.name} size={48} />
                  <h4 style={{ fontSize: '1.2rem' }}>{group.name}</h4>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {group.members?.length || 0} members
                </span>
              </div>
              <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {group.description || 'No description'}
              </p>

              <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(group.tags || []).map((tag) => (
                  <span key={tag.id} className="tag-pill">
                    {tag.key ? `${tag.key}: ` : ''}
                    {tag.value}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ width: '400px' }}>
            <h3>Create New Group</h3>
            <form
              onSubmit={handleCreateGroup}
              style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Group Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Description
                </label>
                <textarea
                  className="input-field"
                  style={{ minHeight: '80px' }}
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Avatar / Logo
                </label>
                <AvatarSelector value={newAvatarLogo} onChange={setNewAvatarLogo} />
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
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupList
