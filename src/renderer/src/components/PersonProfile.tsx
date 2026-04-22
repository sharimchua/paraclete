import React, { useEffect, useState, useCallback } from 'react'
import { api, Person, Note, Message } from '../services/api'
import { useNavbar } from '../hooks/useNavbar'
import TagSelectionModal from './TagSelectionModal'
import ReactMarkdown from 'react-markdown'
import { Avatar } from './Avatar'
import { AvatarSelector } from './AvatarSelector'
import FrameworkAnalysisControls from './FrameworkAnalysisControls'

interface Props {
  personId: number
  onBack: () => void
  onSelectNote: (noteId: number) => void
  onStartNote: (personId: number) => void
}

const PersonProfile: React.FC<Props> = ({ personId, onBack, onSelectNote, onStartNote }) => {
  const { setNavActions } = useNavbar()
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [person, setPerson] = useState<Person | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editContact, setEditContact] = useState('')
  const [editAvatarLogo, setEditAvatarLogo] = useState('')
  const [showTagModal, setShowTagModal] = useState(false)

  const fetchData = useCallback((): void => {
    Promise.all([
      api.get<Person>(`/persons/${personId}`),
      api.get<Note[]>(`/notes/?person_id=${personId}`),
      api.get<Message[]>(`/api/messages/?person_id=${personId}`),
      api.get<{ count: number }>(`/api/framework/pending-count?person_id=${personId}`)
    ])
      .then(([personData, personNotes, personMessages, pendingData]) => {
        setPerson(personData)
        setEditName(personData.name)
        setEditContact(personData.contact_method || '')
        setEditAvatarLogo(personData.avatar_logo || '')
        setNotes(personNotes)
        setMessages(personMessages)
        setPendingCount(pendingData.count)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        alert(`Error loading person profile: ${err instanceof Error ? err.message : String(err)}`)
        setLoading(false)
      })
  }, [personId])

  const handleUpdate = useCallback(
    async (e?: React.FormEvent): Promise<void> => {
      if (e) e.preventDefault()
      try {
        await api.patch(`/persons/${personId}`, {
          name: editName,
          contact_method: editContact,
          avatar_logo: editAvatarLogo
        })
        setIsEditing(false)
        fetchData()
      } catch (err) {
        console.error(err)
        alert('Failed to update person')
      }
    },
    [personId, editName, editContact, editAvatarLogo, fetchData]
  )

  const handleDelete = useCallback(async (): Promise<void> => {
    if (
      window.confirm(
        'Are you sure you want to delete this person? All their notes will remain but will be unlinked.'
      )
    ) {
      try {
        await api.delete(`/persons/${personId}`)
        onBack()
      } catch (err) {
        console.error(err)
        alert('Failed to delete person')
      }
    }
  }, [personId, onBack])

  useEffect(() => {
    fetchData()

    const handleWsMessage = (e: Event): void => {
      const { event } = (e as CustomEvent).detail
      if (event === 'framework_proposals_updated') {
        fetchData()
      }
    }

    window.addEventListener('refresh-profile', fetchData)
    window.addEventListener('global-ws-message', handleWsMessage as EventListener)
    return () => {
      window.removeEventListener('refresh-profile', fetchData)
      window.removeEventListener('global-ws-message', handleWsMessage as EventListener)
      setNavActions([])
    }
  }, [fetchData, setNavActions])

  useEffect(() => {
    if (isEditing) {
      setNavActions([
        { label: 'Save Changes', onClick: () => handleUpdate() },
        { label: 'Cancel', variant: 'secondary', onClick: () => setIsEditing(false) }
      ])
    } else {
      setNavActions([
        {
          label: '+ Create Session Note',
          onClick: () => onStartNote(personId)
        },
        { isSeparator: true },
        {
          label: 'Edit Profile',
          onClick: () => {
            setIsEditing(true)
            if (person) {
              setEditName(person.name)
              setEditContact(person.contact_method || '')
              setEditAvatarLogo(person.avatar_logo || '')
            }
          }
        },
        { label: 'Delete', variant: 'danger', onClick: handleDelete }
      ])
    }
  }, [isEditing, person, setNavActions, personId, onStartNote, handleDelete, handleUpdate])

  const handleSelectTag = async (tagId: number): Promise<void> => {
    try {
      await api.post('/tags/link', {
        entity_type: 'person',
        entity_id: personId,
        tag_id: tagId
      })
      setShowTagModal(false)
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Failed to link tag')
    }
  }

  if (loading) return <div className="loader" />
  if (!person) return <div>Person not found.</div>

  const noteStats = {
    total: notes.length,
    earliest:
      notes.length > 0 ? [...notes].sort((a, b) => a.date.localeCompare(b.date))[0].date : null,
    latest:
      notes.length > 0 ? [...notes].sort((a, b) => b.date.localeCompare(a.date))[0].date : null
  }

  const calculateTenure = (): string => {
    if (!noteStats.earliest || !noteStats.latest) return 'N/A'
    const first = new Date(noteStats.earliest)
    const last = new Date(noteStats.latest)
    const today = new Date()
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000
    const isActive = today.getTime() - last.getTime() <= oneMonthMs
    const end = isActive ? today : last

    const diffMs = end.getTime() - first.getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30.44)
    const years = Math.floor(months / 12)

    if (years > 0) return `${years}y ${months % 12}m`
    if (months > 0) return `${months} month${months > 1 ? 's' : ''}`
    return `${days} day${days !== 1 ? 's' : ''}`
  }

  const isActive = noteStats.latest
    ? new Date().getTime() - new Date(noteStats.latest).getTime() <= 30 * 24 * 60 * 60 * 1000
    : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="card">
        {isEditing ? (
          <form
            onSubmit={handleUpdate}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)'
                }}
              >
                Name
              </label>
              <input
                className="input-field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)'
                }}
              >
                Contact Method
              </label>
              <input
                className="input-field"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)'
                }}
              >
                Avatar/Logo
              </label>
              <AvatarSelector value={editAvatarLogo} onChange={setEditAvatarLogo} />
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <Avatar
                avatarLogo={person.avatar_logo}
                name={person.name}
                size={80}
                style={{ borderRadius: '20px' }}
              />
              <div style={{ flexGrow: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}
                >
                  <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>{person.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {person.contact_method || 'No contact method specified'}
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '24px',
                      textAlign: 'right',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 8px',
                          borderRadius: '20px',
                          background: isActive
                            ? 'rgba(34, 197, 94, 0.1)'
                            : 'rgba(239, 68, 68, 0.1)',
                          color: isActive ? '#22c55e' : '#ef4444',
                          fontWeight: 800,
                          marginBottom: '8px',
                          display: 'inline-block'
                        }}
                      >
                        {isActive ? '● ACTIVE' : '○ INACTIVE'}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}
                      >
                        Tenure
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{calculateTenure()}</div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}
                      >
                        Outreach
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>
                        {messages.length}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}
                      >
                        Total Notes
                      </div>
                      <div
                        style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}
                      >
                        {noteStats.total}
                      </div>
                    </div>
                    {pendingCount > 0 && (
                      <div
                        style={{ cursor: 'pointer' }}
                        onClick={() => window.dispatchEvent(new CustomEvent('open-paraclete'))}
                      >
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--primary)',
                            textTransform: 'uppercase',
                            fontWeight: 700
                          }}
                        >
                          Analysis Queue
                        </div>
                        <div
                          style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}
                        >
                          {pendingCount}
                        </div>
                      </div>
                    )}
                    <div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}
                      >
                        Last Session
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                        {noteStats.latest || 'Never'}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  {(person.tags || []).map((tag) => (
                    <span
                      key={tag.id}
                      className="tag-pill"
                      style={{
                        background: 'var(--primary-faded)',
                        color: 'var(--primary)',
                        border: 'none'
                      }}
                    >
                      {tag.key ? `${tag.key}: ` : ''}
                      {tag.value}
                    </span>
                  ))}
                  <button
                    className="tag-pill"
                    style={{
                      border: '1px dashed var(--border)',
                      background: 'none',
                      cursor: 'pointer'
                    }}
                    onClick={() => setShowTagModal(true)}
                  >
                    + Add Tag
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      marginRight: '8px'
                    }}
                  >
                    PERSONA:
                  </span>
                  {person.persona ? (
                    <span
                      className="tag-pill"
                      style={{
                        background: 'var(--secondary-faded)',
                        color: 'var(--secondary)',
                        border: 'none'
                      }}
                    >
                      👤 {person.persona.name}
                    </span>
                  ) : person.inherited_persona ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="tag-pill"
                        style={{
                          background: 'rgba(56, 189, 248, 0.05)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          opacity: 0.8
                        }}
                      >
                        👤 Inherited: {person.inherited_persona.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic'
                        }}
                      >
                        (From Group)
                      </span>
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontStyle: 'italic',
                        color: 'var(--text-muted)'
                      }}
                    >
                      Core Default
                    </span>
                  )}
                  <button
                    className="tag-pill"
                    style={{
                      border: '1px dashed var(--border)',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      marginLeft: 'auto'
                    }}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('trigger-link-persona', {
                          detail: {
                            type: 'person',
                            id: personId,
                            existingPersonaIds: person.persona ? [person.persona.id] : []
                          }
                        })
                      )
                    }
                  >
                    {person.persona ? 'Change linked persona' : '+ Link custom persona'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Practice Insights</h3>
        </div>
        <div style={{ maxWidth: '400px' }}>
          <FrameworkAnalysisControls personId={personId} title="Targeted Framework Analysis" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Session History</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing last 20 sessions
          </span>
        </div>

        {notes.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No notes found for this person.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {notes.slice(0, 20).map((note) => (
              <div
                key={note.id}
                className="card"
                style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                onClick={() => onSelectNote(note.id)}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
                >
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {note.date}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--primary)',
                      fontWeight: 700
                    }}
                  >
                    {note.stage.toUpperCase()}
                  </span>
                </div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{note.title}</h4>
                <div
                  style={{
                    marginTop: '12px',
                    maxHeight: '120px',
                    overflow: 'hidden',
                    maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)'
                  }}
                >
                  <div
                    className="markdown-content"
                    style={{
                      fontSize: '0.9rem',
                      color:
                        note.cleaned_text || note.raw_capture
                          ? 'var(--text-secondary)'
                          : 'var(--primary)',
                      fontStyle: note.cleaned_text || note.raw_capture ? 'normal' : 'italic'
                    }}
                  >
                    <ReactMarkdown>
                      {note.cleaned_text ||
                        note.raw_capture ||
                        (note.session_brief
                          ? `**Briefing:** ${note.session_brief}`
                          : 'No content yet.')}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Communication History</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Outreach & Follow-ups
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
            <p>No messages recorded for this person.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.slice(0, 10).map((msg) => (
              <div
                key={msg.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderLeft: msg.status === 'draft' ? '4px solid #fbbf24' : '4px solid #4ade80'
                }}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('navigate', {
                      detail: { view: 'message-authoring', messageId: msg.id }
                    })
                  )
                }
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
                >
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {msg.date || msg.created_at?.split('T')[0] || 'N/A'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background:
                        msg.status === 'draft'
                          ? 'rgba(251, 191, 36, 0.1)'
                          : 'rgba(74, 222, 128, 0.1)',
                      color: msg.status === 'draft' ? '#fbbf24' : '#4ade80',
                      fontWeight: 800
                    }}
                  >
                    {msg.status.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.9rem',
                    opacity: 0.8,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {msg.draft_text || msg.sent_text || 'No content drafted...'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTagModal && (
        <TagSelectionModal
          title={`Tag ${person.name}`}
          existingTagIds={(person.tags || []).map((t) => t.id as number)}
          onClose={() => setShowTagModal(false)}
          onSelect={handleSelectTag}
        />
      )}
    </div>
  )
}

export default PersonProfile
