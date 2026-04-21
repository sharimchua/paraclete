import React, { useState, useEffect, useCallback } from 'react'
import { api, Note } from '../services/api'
import { toast } from '../services/toastService'

interface Props {
  note: Note
}

interface Suggestion {
  title?: string
  body?: string
  score?: number
  reference?: {
    title: string
    body: string
  }
}

interface Proposal {
  id: number
  title: string
  body: string
}

const NoteUtilities: React.FC<Props> = ({ note }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isExtracting, setIsExtracting] = useState(false)

  const fetchProposals = useCallback(async (): Promise<void> => {
    try {
      const propData = await api.get<Proposal[]>(
        `/api/references/proposals?note_id=${note.id}&status=pending`
      )
      setProposals(propData)

      // If we're extracting and we find proposals, we might want to keep polling or stop
      // based on job status, but for now we'll just check jobs too.
      const jobs = await api.get<{ name: string; status: string }[]>('/api/admin/jobs')
      const myJob = jobs.find(
        (j) =>
          j.name === `Extract Concepts: Note #${note.id}` &&
          (j.status === 'pending' || j.status === 'running')
      )
      setIsExtracting(!!myJob)
    } catch (err) {
      console.error('Failed to fetch proposals:', err)
    }
  }, [note.id])

  useEffect(() => {
    const fetchSuggestions = async (): Promise<void> => {
      try {
        const sugData = await api.get<Suggestion[]>(`/api/references/suggest?note_id=${note.id}`)
        setSuggestions(sugData)
        await fetchProposals()
      } catch (err) {
        console.error('Failed to fetch suggestions:', err)
      }
    }

    fetchSuggestions()

    const handleWebSocketMessage = (e: Event): void => {
      const { event, data } = (e as CustomEvent).detail

      // Check if this message relates to extraction for THIS specific note
      if (event === 'llm_start' && data?.type === 'reference_extraction') {
        setIsExtracting(true)
      }

      if (
        (event === 'llm_finish' || event === 'llm_error') &&
        data?.type === 'reference_extraction'
      ) {
        fetchProposals()
      }
    }

    window.addEventListener('global-ws-message', handleWebSocketMessage as EventListener)
    return () =>
      window.removeEventListener('global-ws-message', handleWebSocketMessage as EventListener)
  }, [note.id, fetchProposals])

  const extractConcepts = async (): Promise<void> => {
    try {
      setIsExtracting(true)
      await api.post(`/api/references/extract-from-note/${note.id}`, {})
      toast.success(`Concept extraction queued in background.`)
    } catch (err: unknown) {
      console.error(err)
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err.response as { data: { detail?: string } })?.data?.detail
          : 'Failed to trigger extraction'
      toast.error(detail || 'Failed to trigger extraction')
      setIsExtracting(false)
    }
  }

  const acceptProposal = async (prop: { id: number }): Promise<void> => {
    try {
      await api.post(`/api/references/proposals/${prop.id}/accept`, {})
      toast.success('Added to Reference Library')

      // Move from proposals to suggestions (or just refresh)
      setProposals((prev) => prev.filter((p) => p.id !== prop.id))
      const sugData = await api.get<Suggestion[]>(`/api/references/suggest?note_id=${note.id}`)
      setSuggestions(sugData)
    } catch (err) {
      console.error(err)
      toast.error('Failed to accept proposal')
    }
  }

  const rejectProposal = async (prop: { id: number }): Promise<void> => {
    try {
      await api.post(`/api/references/proposals/${prop.id}/reject`, {})
      setProposals((prev) => prev.filter((p) => p.id !== prop.id))
      toast.success('Proposal dismissed')
    } catch (err) {
      console.error(err)
      toast.error('Failed to reject proposal')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        className="card"
        style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '24px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}
        >
          <h3
            style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: 'var(--primary)',
              margin: 0,
              letterSpacing: '0.1em'
            }}
          >
            References
          </h3>
          <button
            onClick={extractConcepts}
            className="btn-secondary"
            disabled={isExtracting}
            style={{ fontSize: '0.7rem', padding: '4px 8px', opacity: isExtracting ? 0.5 : 1 }}
          >
            {isExtracting ? '⌛ Extracting...' : '💡 Extract Concepts'}
          </button>
        </div>

        {/* Proposals Section */}
        {proposals.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h4
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--secondary)',
                marginBottom: '12px'
              }}
            >
              Proposed Concepts
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {proposals.map((prop) => (
                <div
                  key={prop.id}
                  style={{
                    padding: '12px',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    borderLeft: '3px solid var(--secondary)',
                    position: 'relative'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{prop.title}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => acceptProposal(prop)}
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          background: 'var(--secondary)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectProposal(prop)}
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {prop.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matches Section */}
        <h4
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '12px'
          }}
        >
          Relevant Library Items
        </h4>
        {suggestions.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No relevant references yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {suggestions.map((sug, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px',
                  background: 'var(--bg-card)',
                  borderRadius: '8px',
                  borderLeft: '3px solid var(--primary)',
                  opacity: 0.8
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {sug.title || sug.reference?.title}
                  </span>
                  {sug.score && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {Math.round(sug.score * 100)}% Match
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {sug.body || sug.reference?.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default NoteUtilities
