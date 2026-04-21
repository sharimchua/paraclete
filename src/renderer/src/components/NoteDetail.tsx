import React, { useEffect, useState } from 'react'
import { api, Note, Person, Group } from '../services/api'
import { useNavbar } from './NavbarContext'
import ReactMarkdown from 'react-markdown'
import NoteAuthoring from './NoteAuthoring'
import NoteUtilities from './NoteUtilities'
import ConfirmationModal from './ConfirmationModal'
import { toast } from './ToastProvider'

interface Props {
  noteId: number
  onBack: () => void
}

const NoteDetail: React.FC<Props> = ({ noteId, onBack }) => {
  const { setNavActions } = useNavbar()
  const [note, setNote] = useState<Note | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const noteData = await api.get<Note>(`/notes/${noteId}`)
      setNote(noteData)

      if (noteData.person_id) {
        const p = await api.get<Person>(`/persons/${noteData.person_id}`)
        setPerson(p)
      }
      if (noteData.group_id) {
        const g = await api.get<Group>(`/groups/${noteData.group_id}`)
        setGroup(g)
      }
      setLoading(false)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load note details')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    return () => setNavActions([])
  }, [noteId])

  useEffect(() => {
    if (!isEditing && note) {
      setNavActions([
        {
          label: 'Draft Message',
          variant: 'secondary',
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent('navigate', {
                detail: {
                  view: 'message-authoring',
                  noteId: note.id,
                  personId: note.person_id,
                  groupId: note.group_id
                }
              })
            )
          }
        },
        { label: 'Edit Note', onClick: () => setIsEditing(true) },
        { label: 'Delete', variant: 'danger', onClick: () => setShowDeleteConfirm(true) }
      ])
    } else {
      setNavActions([])
    }
  }, [isEditing, note, setNavActions])

  const handleDelete = async () => {
    try {
      await api.delete(`/notes/${noteId}`)
      onBack()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete note')
    } finally {
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="loader" />
  if (!note) return <div>Note not found.</div>

  if (isEditing) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '16px' }}>
          <button className="btn-secondary" onClick={() => setIsEditing(false)}>
            &lsaquo; Back to View
          </button>
        </div>
        <NoteAuthoring
          noteId={noteId}
          onComplete={() => {
            setIsEditing(false)
            fetchData()
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 380px',
        gap: '32px',
        alignItems: 'flex-start',
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%'
      }}
    >
      <div className="card" style={{ padding: '40px' }}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '24px'
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--primary)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}
              >
                {note.stage}
              </span>
              <h1
                style={{ fontSize: '2.8rem', fontWeight: 800, marginTop: '8px', lineHeight: '1.2' }}
              >
                {note.title}
              </h1>
            </div>
            <div style={{ textAlign: 'right', minWidth: '200px' }}>
              <div
                style={{
                  fontSize: '1rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  marginBottom: '8px'
                }}
              >
                {note.date}
              </div>
              {person && (
                <div
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>With</span>
                  <span
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('navigate', {
                          detail: { view: 'persons', personId: person.id }
                        })
                      )
                    }}
                    style={{
                      fontWeight: 600,
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    {person.name}
                  </span>
                </div>
              )}
              {group && (
                <div
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-main)',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Group</span>
                  <span
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('navigate', {
                          detail: { view: 'groups', groupId: group.id }
                        })
                      )
                    }}
                    style={{
                      fontWeight: 600,
                      color: 'var(--secondary)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    {group.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {note.tags && note.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
              {note.tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    background: 'rgba(157, 129, 255, 0.1)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(157, 129, 255, 0.2)',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {tag.key && <span style={{ opacity: 0.7, fontWeight: 400 }}>{tag.key}:</span>}
                  {tag.value}
                </span>
              ))}
            </div>
          )}

          {note.session_brief && (
            <div
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border)',
                borderLeft: '4px solid var(--primary)',
                padding: '24px 32px',
                marginTop: '32px',
                borderRadius: '12px'
              }}
            >
              <h3
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--primary)',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  marginBottom: '12px'
                }}
              >
                Pre-Session Briefing
              </h3>
              <div
                className="markdown-brief"
                style={{
                  fontSize: '0.95rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6'
                }}
              >
                <ReactMarkdown>{note.session_brief}</ReactMarkdown>
              </div>
            </div>
          )}

          <div
            style={{ borderTop: '1px solid var(--border)', paddingTop: '40px', marginTop: '40px' }}
          >
            <div
              className="markdown-content"
              style={{
                fontSize: '1.15rem',
                lineHeight: '1.8',
                color: 'var(--text-main)',
                maxWidth: '900px'
              }}
            >
              <ReactMarkdown>
                {note.cleaned_text || note.raw_capture || 'No content.'}
              </ReactMarkdown>
            </div>
          </div>

          {note.raw_capture && note.cleaned_text && (
            <details
              style={{
                marginTop: '64px',
                borderTop: '1px solid var(--border)',
                paddingTop: '32px'
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                  fontWeight: 500
                }}
              >
                View Raw Internal Capture
              </summary>
              <div
                style={{
                  marginTop: '20px',
                  padding: '24px',
                  background: 'var(--bg-deep)',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono, monospace)',
                  border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {note.raw_capture}
              </div>
            </details>
          )}
        </div>
      </div>

      <aside style={{ position: 'sticky', top: '24px', height: 'fit-content' }}>
        <div
          style={{
            padding: '24px',
            background: 'var(--bg-deep)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}
        >
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              marginBottom: '24px',
              color: 'var(--text-main)',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '12px'
            }}
          >
            AI ASSISTANT
          </h2>
          <NoteUtilities note={note} />
        </div>
      </aside>

      {showDeleteConfirm && (
        <ConfirmationModal
          title="Delete Note?"
          message="Are you sure you want to delete this note? This action cannot be undone."
          variant="danger"
          confirmLabel="Delete Forever"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

export default NoteDetail
