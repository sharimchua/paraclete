import React, { useEffect, useState, useCallback } from 'react'
import { Avatar } from './Avatar'
import { AvatarSelector } from './AvatarSelector'

import { api, Person } from '../services/api'
import { useNavbar } from '../hooks/useNavbar'

interface Props {
  onSelectPerson: (id: number) => void
}

const PersonList: React.FC<Props> = ({ onSelectPerson }) => {
  const { setNavActions } = useNavbar()
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAvatarLogo, setNewAvatarLogo] = useState('')
  const [filterText, setFilterText] = useState('')

  const fetchPersons = useCallback((): void => {
    api
      .get<Person[]>('/persons/')
      .then((data) => {
        setPersons(data)
        setLoading(false)
        setError(null)
      })
      .catch((err) => {
        console.error(err)
        setError(`Failed to fetch persons: ${err instanceof Error ? err.message : String(err)}`)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchPersons()

    setNavActions([
      {
        label: '+ Add Person',
        onClick: () => setShowCreateModal(true)
      }
    ])

    return () => setNavActions([])
  }, [fetchPersons, setNavActions])

  const handleCreatePerson = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      await api.post('/persons/', {
        name: newName,
        contact_method: newContact,
        avatar_logo: newAvatarLogo
      })
      setShowCreateModal(false)
      setNewName('')
      setNewContact('')
      setNewAvatarLogo('')
      fetchPersons()
    } catch (err) {
      console.error(err)
      alert('Failed to create person')
    }
  }

  const filteredPersons = persons.filter(
    (p) =>
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      p.contact_method?.toLowerCase().includes(filterText.toLowerCase()) ||
      p.tags.some((t) => t.value.toLowerCase().includes(filterText.toLowerCase()))
  )

  if (loading && persons.length === 0) return <div className="loader" />
  if (error)
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div className="error-text" style={{ marginBottom: '16px' }}>
          {error}
        </div>
        <button className="btn-secondary" onClick={fetchPersons}>
          Retry Connection
        </button>
      </div>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search people by name, contact, or tag..."
          aria-label="Search people by name, contact, or tag..."
          className="input-field"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ paddingLeft: '40px', background: 'var(--bg-surface)' }}
        />
        <div
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0.5
          }}
        >
          🔍
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}
      >
        {filteredPersons.length === 0 ? (
          <div
            className="card"
            style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}
          >
            <p style={{ color: 'var(--text-secondary)' }}>
              {persons.length === 0
                ? 'No persons found. Start by adding one from the top bar!'
                : 'No matches found for your search.'}
            </p>
          </div>
        ) : (
          filteredPersons.map((person) => (
            <div
              key={person.id}
              className="card"
              style={{ cursor: 'pointer', position: 'relative' }}
              onClick={() => onSelectPerson(person.id)}
            >
              {person.groups && person.groups.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    display: 'flex',
                    gap: '4px',
                    background: 'var(--bg-card)',
                    padding: '4px',
                    borderRadius: '24px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                  title={person.groups.map((g) => g.name).join(', ')}
                >
                  {person.groups.slice(0, 3).map((g) => (
                    <Avatar
                      key={g.id}
                      avatarLogo={g.avatar_logo}
                      name={g.name}
                      size={24}
                      style={{ border: '2px solid var(--bg-card)' }}
                    />
                  ))}
                  {person.groups.length > 3 && (
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--secondary-faded)',
                        color: 'var(--secondary)',
                        fontSize: '0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold'
                      }}
                    >
                      +{person.groups.length - 3}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Avatar avatarLogo={person.avatar_logo} name={person.name} size={48} />
                <div>
                  <h4 style={{ fontSize: '1.1rem' }}>{person.name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {person.contact_method || 'No contact info'}
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {person.tags.map((tag) => (
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
            <h3>Add New Person</h3>
            <form
              onSubmit={handleCreatePerson}
              style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                  Contact Method (Optional)
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="e.g. Email, Signal, Phone"
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
                  Add Person
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PersonList
