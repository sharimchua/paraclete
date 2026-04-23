import React, { useState, useEffect, useRef, useCallback } from 'react'
import { api, Person, Note, API_BASE, Group, Tag } from '../services/api'
import ReactMarkdown from 'react-markdown'
import ConfirmationModal from './ConfirmationModal'
import { toast } from '../services/toastService'
import InterstitialLoader from './InterstitialLoader'
import { useNavbar } from '../hooks/useNavbar'

interface Props {
  personId?: number
  groupId?: number
  initialDate?: string
  noteId?: number // Added for editing
  onComplete: () => void
  setIsDirty?: (dirty: boolean) => void
}

type Stage = 'Prepare' | 'Capture' | 'Refine'

const NoteAuthoring: React.FC<Props> = ({
  personId,
  groupId,
  initialDate,
  noteId,
  onComplete,
  setIsDirty
}) => {
  const [stage, setStage] = useState<Stage>('Prepare')
  const [person, setPerson] = useState<Person | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [rawText, setRawText] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentNote, setCurrentNote] = useState<Note | null>(null)
  const [isRefining, setIsRefining] = useState(false)
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false)

  const [sessionDate, setSessionDate] = useState<string>((): string => {
    if (initialDate) return initialDate
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [suggestedTags, setSuggestedTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [existingTaxonomy, setExistingTaxonomy] = useState<Tag[]>([])
  const [sessionBrief, setSessionBrief] = useState<string>('')
  const [isBriefing, setIsBriefing] = useState(false)
  const [isLlmReady, setIsLlmReady] = useState(false)
  const [localNoteId, setLocalNoteId] = useState<number | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(-1)
  const briefingFetchedFor = useRef<string | null>(null)

  // Companion State
  const [companionSessionId, setCompanionSessionId] = useState<string | null>(null)
  const [companionUrl, setCompanionUrl] = useState<string | null>(null)
  const [companionImages, setCompanionImages] = useState<string[]>([])
  const [isCompanionModalOpen, setIsCompanionModalOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [interstitial, setInterstitial] = useState<{
    title: string
    subtitle: string
    tasks?: string[]
  } | null>(null)

  // Load existing note if noteId is provided
  useEffect(() => {
    if (noteId) {
      setLoading(true)
      api
        .get<Note>(`/notes/${noteId}`)
        .then((n) => {
          setCurrentNote(n)
          setRawText(n.raw_capture || '')
          setTitle(n.title || '')
          setSessionDate(n.date)
          setSelectedTags(n.tags || [])
          if (n.session_brief) setSessionBrief(n.session_brief)

          // If note has cleaned text already, we might want to skip directly to Refine?
          // No, let's start at Prepare to show the persistent brief.
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load note:', err)
          setLoading(false)
        })
    }
  }, [noteId])

  useEffect(() => {
    const identifier = `${personId}-${groupId}-${noteId}`
    if ((personId || groupId || noteId) && briefingFetchedFor.current !== identifier) {
      // Check LLM status first to provide better feedback
      // LLM status is now managed globally via WebSockets in App.tsx
      // and broadcast via global-ws-message

      briefingFetchedFor.current = identifier
      setIsBriefing(true)
      api
        .post<{ result: string }>('/analysis/session-brief', {
          person_id: personId,
          group_id: groupId,
          note_id: noteId
        })
        .then((res) => {
          setSessionBrief(res.result)
          setIsBriefing(false)
          setIsLlmReady(true)
        })
        .catch((err) => {
          console.error('Briefing failed:', err)
          setIsBriefing(false)
          briefingFetchedFor.current = null // Allow retry on failure
        })
    }
  }, [personId, groupId, noteId])

  useEffect(() => {
    if (!companionSessionId) return
    const socket = new WebSocket(`${API_BASE.replace('http', 'ws')}/ws`)
    socket.onmessage = (event: MessageEvent): void => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'companion_image' && data.data.session_id === companionSessionId) {
          setCompanionImages((prev) => [...prev, data.data])
        }
      } catch (err) {
        console.error(err)
      }
    }
    return (): void => socket.close()
  }, [companionSessionId])

  const backgroundsLoadedFor = useRef<string | null>(null)

  useEffect(() => {
    // If we don't have enough info yet, don't try to load background data
    // But we might need currentNote.person_id if props are missing
    const pid = personId || currentNote?.person_id
    const gid = groupId || currentNote?.group_id
    
    // We need at least an entity ID or a note ID to justify loading
    if (!pid && !gid && !noteId) {
      if (!loading) setLoading(false)
      return
    }

    const identifier = `${pid}-${gid}-${noteId}`
    if (backgroundsLoadedFor.current === identifier) return

    const loadContexts = async (): Promise<void> => {
      try {
        if (pid && (!person || person.id !== pid)) {
          const p = await api.get<Person>(`/persons/${pid}`)
          setPerson(p)
        } else if (gid && (!group || group.id !== gid)) {
          const g = await api.get<Group>(`/groups/${gid}`)
          setGroup(g)
        }
      } catch (err) {
        console.error('Failed to load entity:', err)
      } finally {
        if (!noteId) setLoading(false)
      }
    }

    const loadBackgroundData = async (): Promise<void> => {
      try {
        const [notes, tags] = await Promise.all([
          api.get<Note[]>(`/notes/`),
          api.get<{ key: string; value: string }[]>('/tags/')
        ])
        setExistingTaxonomy(tags)

        if (pid) {
          setRecentNotes(notes.filter((n) => n.person_id === pid && n.id !== noteId).slice(0, 3))
        } else if (gid) {
          setRecentNotes(notes.filter((n) => n.group_id === gid && n.id !== noteId).slice(0, 3))
        }
        
        backgroundsLoadedFor.current = identifier
      } catch (err) {
        console.error('Failed to load background data:', err)
      }
    }

    loadContexts()
    loadBackgroundData()
  }, [personId, groupId, noteId, currentNote?.person_id, currentNote?.group_id])

  const handleStartRefine = useCallback(
    async (force: boolean = false): Promise<void> => {
      if (!rawText.trim()) return

      // If we already have a draft for this exact raw text, just show it
      if (
        !force &&
        currentNote &&
        currentNote.raw_capture === rawText &&
        currentNote.cleaned_text
      ) {
        setStage('Refine')
        return
      }

      setIsRefining(true)
      setInterstitial({
        title: 'Neural Refinement',
        subtitle: 'Paraclete is normalizing capture text and extracting entities.'
      })
      setStage('Refine')

      try {
        // Call TRANSIENT analysis (Doesn't save to DB yet)
        const processRes = await api.post<{ result: string }>('/analysis/process', {
          raw_text: rawText,
          person_id: personId || currentNote?.person_id,
          group_id: groupId || currentNote?.group_id
        })

        // We'll update a local ref/state to hold the transient cleaned text
        setCurrentNote({
          id: noteId || 0,
          title: title || `Session ${sessionDate}`,
          cleaned_text: processRes.result,
          raw_capture: rawText,
          session_brief: sessionBrief,
          stage: 'Clean',
          date: sessionDate,
          tags: selectedTags
        } as Note)
        if (setIsDirty) setIsDirty(true)

        // Extract entities (Transient)
        const metadata = await api.post<{
          suggestedDate?: string
          tags?: { key: string; value: string }[]
        }>('/analysis/extract', {
          raw_text: rawText,
          person_id: personId || currentNote?.person_id,
          group_id: groupId || currentNote?.group_id
        })

        if (metadata.suggestedDate && !noteId) {
          // If the user hasn't touched the date (it's still 'Today'), allow the AI to suggest it.
          // Otherwise, respect the user's explicit choice.
          const today = new Date().toISOString().split('T')[0]
          if (sessionDate === today) {
            setSessionDate(metadata.suggestedDate)
          }
        }
        if (metadata.tags) {
          setSuggestedTags(metadata.tags)
        }

        setIsRefining(false)
        setInterstitial(null)
      } catch (err) {
        console.error('Failed to process note:', err)
        setStage('Capture')
        setIsRefining(false)
        setInterstitial(null)
        alert('Failed to process with AI. Please try again.')
      }
    },
    [
      rawText,
      currentNote,
      personId,
      groupId,
      noteId,
      title,
      sessionDate,
      sessionBrief,
      selectedTags,
      setIsDirty
    ]
  )

  const handleSuggestTitle = async (): Promise<void> => {
    const textToAnalyze = currentNote?.cleaned_text || rawText
    if (!textToAnalyze) return

    setIsSuggestingTitle(true)
    try {
      const res = await api.post<{ result: string }>('/analysis/suggest-title', {
        text: textToAnalyze
      })
      setTitle(res.result)
    } catch (err) {
      console.error('Failed to suggest title:', err)
    } finally {
      setIsSuggestingTitle(false)
      if (setIsDirty) setIsDirty(true)
    }
  }

  const handleUpdateNoteText = (val: string): void => {
    if (currentNote) {
      setCurrentNote({ ...currentNote, cleaned_text: val })
      if (setIsDirty) setIsDirty(true)
    }
  }

  const handleSaveNote = useCallback(async (): Promise<Note | null> => {
    setLoading(true)
    try {
      const finalDate =
        sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
          ? sessionDate
          : new Date().toISOString().split('T')[0]

      let note: Note
      // Map the UI stage to the DB stage
      // We now default to 'Clean' (Draft) instead of 'Published'
      let dbStage = stage === 'Refine' ? 'Clean' : stage === 'Capture' ? 'Capture' : 'Prepare'

      // If the note was already published, keep it published unless we explicitly change it
      if (currentNote?.stage === 'Published') {
        dbStage = 'Published'
      }

      const noteData = {
        title: title || `Session ${finalDate}`,
        date: finalDate,
        stage: dbStage,
        raw_capture: rawText,
        cleaned_text:
          currentNote?.cleaned_text || (rawText ? `Draft: ${rawText.substring(0, 100)}...` : ''),
        session_brief: sessionBrief,
        person_id: personId || currentNote?.person_id || null,
        group_id: groupId || currentNote?.group_id || null
      }

      if (noteId || localNoteId) {
        const nid = noteId || localNoteId
        note = await api.patch<Note>(`/notes/${nid}`, noteData)
      } else {
        note = await api.post<Note>('/notes/', noteData)
      }

      setLocalNoteId(note.id)
      // 2. Link tags
      // First, clear old tags if updating?
      // In a real app we'd need a way to clear them. For now, let's just add new ones.
      // Better: api.post('/tags/link') already handles duplicates gracefully in backend if we implement it.
      for (const tagObj of selectedTags) {
        const tag = await api.post<{ id: number; key: string; value: string }>('/tags/', {
          key: tagObj.key,
          value: tagObj.value
        })
        await api.post('/tags/link', {
          tag_id: tag.id,
          entity_type: 'note',
          entity_id: note.id
        })
      }

      if (setIsDirty) setIsDirty(false)
      setLoading(false)
      return note
    } catch (err) {
      console.error('Save failed:', err)
      setIsRefining(false)
      setLoading(false)
      return null
    }
  }, [
    sessionDate,
    stage,
    currentNote,
    title,
    rawText,
    sessionBrief,
    personId,
    groupId,
    noteId,
    localNoteId,
    selectedTags,
    setIsDirty
  ])

  const handleDeleteNote = useCallback(async (): Promise<void> => {
    if (!noteId) return
    setShowDeleteConfirm(true)
  }, [noteId])

  const executeDelete = async (): Promise<void> => {
    try {
      await api.delete(`/notes/${noteId}`)
      if (setIsDirty) setIsDirty(false)
      onComplete()
    } catch (err) {
      console.error('Delete failed:', err)
      toast.error('Failed to delete note.')
    } finally {
      setShowDeleteConfirm(false)
    }
  }

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'ocr' | 'dictate'
  ): Promise<void> => {
    if (!e.target.files || e.target.files.length === 0) return
    setLoading(true)
    try {
      const formData = new FormData()
      if (type === 'ocr') {
        for (let i = 0; i < e.target.files.length; i++) {
          formData.append('files', e.target.files[i])
        }
      } else {
        formData.append('file', e.target.files[0])
      }

      const endpoint = type === 'ocr' ? '/process/ocr' : '/process/dictate'
      const data = await api.postForm<{ text: string }>(endpoint, formData)
      setRawText((prev) => prev + (prev ? '\n\n' : '') + data.text)
      if (setIsDirty) setIsDirty(true)
    } catch (err) {
      console.error(`${type.toUpperCase()} failed:`, err)
      alert(`${type.toUpperCase()} processing failed. Check Developer Logs.`)
    } finally {
      setLoading(false)
    }
  }

  const handleStartCompanion = async (): Promise<void> => {
    try {
      const data = await api.post<{ session_id: string; url: string }>('/companion/session', {})
      setCompanionSessionId(data.session_id)
      setCompanionUrl(data.url)
      setIsCompanionModalOpen(true)
    } catch (err) {
      console.error('Failed to start companion:', err)
      alert('Failed to start companion session.')
    }
  }

  const handlePerformCompanionOCR = async (): Promise<void> => {
    if (!companionSessionId || companionImages.length === 0) return
    setInterstitial({
      title: 'Vision Analysis',
      subtitle: 'Synthesizing captured handwriting into structured clinical records.'
    })
    try {
      const data = await api.post<{ text: string }>(
        `/process/ocr/companion?sid=${companionSessionId}`,
        {}
      )
      setRawText((prev) => prev + (prev ? '\n\n' : '') + data.text)
      setCompanionImages([])
      if (setIsDirty) setIsDirty(true)
      setInterstitial(null)
      setIsCompanionModalOpen(false)
    } catch (err) {
      console.error('Companion OCR failed:', err)
      setInterstitial(null)
      alert('OCR processing failed. Check Developer Logs.')
    } finally {
      setLoading(false)
    }
  }

  const { setNavActions, setTitle: setNavbarTitle, setCustomContent } = useNavbar()

  useEffect(() => {
    const baseTitle = noteId ? 'Refining Session' : 'New Session Workflow'
    const entityName = person?.name || group?.name || '...'
    setNavbarTitle(`${baseTitle}: ${entityName}`)

    // Custom content: Stage switcher
    setCustomContent(
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="navbar-date-picker"
        />

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', opacity: 0.5 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn-secondary"
            style={{
              padding: '0',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            disabled={stage === 'Prepare'}
            onClick={() => {
              if (stage === 'Capture') setStage('Prepare')
              if (stage === 'Refine') setStage('Capture')
            }}
          >
            &lsaquo;
          </button>

          <div className="pill-container">
            {(['Prepare', 'Capture', 'Refine'] as Stage[]).map((sid) => {
              const isActive = stage === sid
              const isDisabled = sid === 'Refine' && !rawText.trim()
              const labels = {
                Prepare: '1. Prepare',
                Capture: '2. Capture',
                Refine: '3. Refinement'
              }
              return (
                <div
                  key={sid}
                  onClick={() =>
                    !isDisabled ? (sid === 'Refine' ? handleStartRefine() : setStage(sid)) : null
                  }
                  className={`pill-item ${isActive ? 'active' : ''}`}
                  style={{ opacity: isDisabled ? 0.4 : 1 }}
                >
                  {isActive && isRefining && sid === 'Refine' ? '...' : labels[sid]}
                </div>
              )
            })}
          </div>

          <button
            className="btn-secondary"
            style={{
              padding: '0',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            disabled={stage === 'Refine' || (stage === 'Capture' && !rawText.trim())}
            onClick={() => {
              if (stage === 'Prepare') setStage('Capture')
              if (stage === 'Capture') handleStartRefine(false)
            }}
          >
            &rsaquo;
          </button>
        </div>
      </div>
    )

    setNavActions([
      {
        label: noteId ? 'Update Note' : 'Save Draft',
        onClick: handleSaveNote,
        disabled: loading || isBriefing || (stage === 'Capture' && !rawText.trim())
      },
      ...(noteId
        ? [
            { isSeparator: true },
            { label: 'Delete', variant: 'danger' as const, onClick: handleDeleteNote }
          ]
        : [])
    ])

    return (): void => {
      setNavbarTitle(null)
      setCustomContent(null)
      setNavActions([])
    }
  }, [
    stage,
    noteId,
    person,
    group,
    loading,
    isBriefing,
    rawText,
    sessionDate,
    isRefining,
    setNavbarTitle,
    setCustomContent,
    setNavActions,
    handleSaveNote,
    handleDeleteNote,
    handleStartRefine
  ])

  if (loading) return <div className="loader" />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginTop: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {stage === 'Prepare' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div
              className="card"
              style={{
                borderLeft: '4px solid var(--primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
                  {noteId ? 'Review Session Context' : 'Prepare for Session'}
                </h2>
                {person ? (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Context for <strong>{person.name}</strong>.
                  </p>
                ) : group ? (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Context for group <strong>{group.name}</strong>.
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>General session.</p>
                )}
              </div>

              <div
                style={{
                  textAlign: 'right',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '8px'
                }}
              >
                {/* Date moved to global header */}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4
                  style={{
                    textTransform: 'uppercase',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)'
                  }}
                >
                  Recent Context
                </h4>
                {recentNotes.length === 0 ? (
                  <div className="card" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    No previous sessions found.
                  </div>
                ) : (
                  recentNotes.map((n) => (
                    <div
                      key={n.id}
                      className="card"
                      style={{ padding: '16px', fontSize: '0.9rem' }}
                    >
                      <div
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          marginBottom: '4px'
                        }}
                      >
                        {n.date}
                      </div>
                      <div style={{ fontWeight: 600 }}>{n.title}</div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4
                  style={{
                    textTransform: 'uppercase',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)'
                  }}
                >
                  AI Session Brief
                </h4>
                <div
                  className="card"
                  style={{
                    background: 'var(--primary-faded)',
                    borderColor: 'var(--primary)',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem',
                    minHeight: '120px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: isBriefing ? 'center' : 'flex-start'
                  }}
                >
                  {isBriefing ? (
                    <div style={{ textAlign: 'center' }}>
                      <div className="loader" style={{ scale: '0.5', margin: '0 auto' }} />
                      <p style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '8px' }}>
                        {isLlmReady ? 'Generating Brief...' : 'Warming up AI Engine...'}
                      </p>
                    </div>
                  ) : sessionBrief ? (
                    <div
                      className="markdown-brief"
                      style={{ fontSize: '0.9rem', lineHeight: '1.6' }}
                    >
                      <ReactMarkdown>{sessionBrief}</ReactMarkdown>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--primary)' }}>
                      Suggestions will appear here once you have session history.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'Capture' && (
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Capture Mode</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Direct focus scratchpad
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn-secondary"
                  onClick={handleStartCompanion}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span>📱</span> Phone
                </button>
                <label
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <span>🎤</span> Dictate
                  <input
                    type="file"
                    hidden
                    accept="audio/*"
                    onChange={(e) => handleFileUpload(e, 'dictate')}
                  />
                </label>
                <label
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <span>📄</span> OCR
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'ocr')}
                  />
                </label>
              </div>
            </div>

            <textarea
              id="note-capture-textarea"
              data-paraclete-type="note"
              autoFocus
              placeholder="Start typing your session notes..."
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value)
                if (setIsDirty) setIsDirty(true)
              }}
              style={{
                flexGrow: 1,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '32px',
                fontSize: '1.1rem',
                lineHeight: '1.6',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>
        )}

        {stage === 'Refine' && (
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '24px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Refinement & Structure</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Verify metadata and polish the structured record.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      setLoading(true)
                      await handleSaveNote()
                      setLoading(false)
                      onComplete()
                    }}
                    style={{ padding: '8px 20px', borderRadius: '8px' }}
                  >
                    💾 Save Draft
                  </button>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      setLoading(true)
                      const savedNote = await handleSaveNote()
                      const nid = savedNote?.id || localNoteId || noteId
                      if (nid) {
                        await api.patch(`/notes/${nid}`, { stage: 'Published' })
                        onComplete()
                      }
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    🚀 Finish & Publish
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleStartRefine(true)}
                    disabled={isRefining || !rawText.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px'
                    }}
                  >
                    <span>🔍</span> {isRefining ? 'Analysing...' : 'Re-Analyse Capture'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 340px',
                  gap: '24px',
                  flexGrow: 1
                }}
              >
                <textarea
                  id="note-refine-textarea"
                  data-paraclete-type="note"
                  value={currentNote?.cleaned_text || ''}
                  onChange={(e) => handleUpdateNoteText(e.target.value)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--primary)',
                    borderRadius: '12px',
                    padding: '32px',
                    fontSize: '1.05rem',
                    lineHeight: '1.7',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="card" style={{ padding: '20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}
                    >
                      <h4
                        style={{
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)'
                        }}
                      >
                        Note Title
                      </h4>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                        onClick={handleSuggestTitle}
                        disabled={isSuggestingTitle}
                      >
                        {isSuggestingTitle ? 'Suggesting...' : '✨ Suggest Theme'}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Enter a title..."
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value)
                        if (setIsDirty) setIsDirty(true)
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        fontSize: '0.9rem',
                        fontWeight: 600
                      }}
                    />
                  </div>

                  <div
                    className="card"
                    style={{
                      padding: '20px',
                      flexGrow: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          marginBottom: '12px'
                        }}
                      >
                        Applied Tags
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {selectedTags.map((t, i) => {
                          const exists = existingTaxonomy.some(
                            (et) => et.value === t.value && et.key === t.key
                          )
                          return (
                            <div
                              key={i}
                              style={{
                                background: exists ? 'var(--primary)' : 'transparent',
                                color: exists ? 'white' : 'var(--primary)',
                                border: exists ? 'none' : '1px dashed var(--primary)',
                                padding: '4px 12px',
                                borderRadius: '16px',
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              title={exists ? 'Established Tag' : 'New Tag'}
                            >
                              <strong>{t.key}:</strong> {t.value}
                              <span
                                style={{ cursor: 'pointer', opacity: 0.8 }}
                                aria-label="Remove tag"
                                onClick={() => {
                                  setSelectedTags((prev) =>
                                    prev.filter((v) => v.value !== t.value || v.key !== t.key)
                                  )
                                  if (setIsDirty) setIsDirty(true)
                                }}
                              >
                                &times;
                              </span>
                            </div>
                          )
                        })}
                        {selectedTags.length === 0 && (
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            No tags applied.
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <h4
                        style={{
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          color: 'var(--primary)',
                          marginBottom: '12px',
                          opacity: 0.8
                        }}
                      >
                        AI Suggestions
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {suggestedTags
                          .filter(
                            (st) =>
                              !selectedTags.some(
                                (sel) => sel.key === st.key && sel.value === st.value
                              )
                          )
                          .map((t, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                setSelectedTags((prev) => [...prev, t])
                                if (setIsDirty) setIsDirty(true)
                              }}
                              style={{
                                background: 'var(--primary-faded)',
                                color: 'var(--primary)',
                                padding: '4px 10px',
                                borderRadius: '16px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                border: '1px dashed var(--primary)'
                              }}
                            >
                              + {t.key}: {t.value}
                            </div>
                          ))}
                        {suggestedTags.length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Scanning for clues...
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Add tag (Key: Value)..."
                        value={tagInput}
                        onChange={(e) => {
                          setTagInput(e.target.value)
                          setTagSuggestionIndex(-1)
                        }}
                        onKeyDown={(e) => {
                          const filtered = existingTaxonomy.filter((et) =>
                            `${et.key}: ${et.value}`.toLowerCase().includes(tagInput.toLowerCase())
                          )

                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setTagSuggestionIndex((prev) => Math.min(prev + 1, filtered.length - 1))
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setTagSuggestionIndex((prev) => Math.max(prev - 1, -1))
                          } else if (e.key === 'Enter') {
                            if (tagSuggestionIndex >= 0 && tagSuggestionIndex < filtered.length) {
                              e.preventDefault()
                              const t = filtered[tagSuggestionIndex]
                              if (
                                !selectedTags.some(
                                  (sel) => sel.key === t.key && sel.value === t.value
                                )
                              ) {
                                setSelectedTags((prev) => [...prev, { key: t.key, value: t.value }])
                                if (setIsDirty) setIsDirty(true)
                              }
                              setTagInput('')
                              setTagSuggestionIndex(-1)
                            } else {
                              const val = tagInput.trim()
                              if (val.includes(':')) {
                                const [k, v] = val.split(':').map((s) => s.trim())
                                if (k && v) {
                                  setSelectedTags((prev) => [...prev, { key: k, value: v }])
                                  if (setIsDirty) setIsDirty(true)
                                  setTagInput('')
                                }
                              } else if (val) {
                                setSelectedTags((prev) => [...prev, { key: 'General', value: val }])
                                if (setIsDirty) setIsDirty(true)
                                setTagInput('')
                              }
                            }
                          } else if (e.key === 'Escape') {
                            setTagSuggestionIndex(-1)
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-deep)',
                          fontSize: '0.9rem',
                          color: 'var(--text-main)'
                        }}
                      />
                      {tagInput && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: 0,
                            right: 0,
                            marginBottom: '8px',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            zIndex: 100
                          }}
                        >
                          {existingTaxonomy
                            .filter((et) =>
                              `${et.key}: ${et.value}`
                                .toLowerCase()
                                .includes(tagInput.toLowerCase())
                            )
                            .map((t, i) => (
                              <div
                                key={i}
                                onClick={() => {
                                  if (
                                    !selectedTags.some(
                                      (sel) => sel.key === t.key && sel.value === t.value
                                    )
                                  ) {
                                    setSelectedTags((prev) => [
                                      ...prev,
                                      { key: t.key, value: t.value }
                                    ])
                                    if (setIsDirty) setIsDirty(true)
                                  }
                                  setTagInput('')
                                  setTagSuggestionIndex(-1)
                                }}
                                style={{
                                  padding: '8px 12px',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer',
                                  background:
                                    i === tagSuggestionIndex
                                      ? 'var(--primary-faded)'
                                      : 'transparent',
                                  color:
                                    i === tagSuggestionIndex
                                      ? 'var(--primary)'
                                      : 'var(--text-main)',
                                  borderBottom: '1px solid var(--border-faded)',
                                  display: 'flex',
                                  justifyContent: 'space-between'
                                }}
                              >
                                <span>
                                  <strong>{t.key}:</strong> {t.value}
                                </span>
                                {selectedTags.some(
                                  (sel) => sel.key === t.key && sel.value === t.value
                                ) && <span style={{ opacity: 0.5 }}>✓</span>}
                              </div>
                            ))}
                        </div>
                      )}
                      <div
                        style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}
                      >
                        Use format &apos;Category: Value&apos; or pick from list
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isCompanionModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '800px',
              background: 'var(--bg-deep)',
              border: '1px solid var(--primary)',
              padding: '40px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setIsCompanionModalOpen(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
              <div
                style={{
                  flex: '0 0 280px',
                  textAlign: 'center',
                  background: 'var(--bg-surface)',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px solid var(--border)'
                }}
              >
                <h3 style={{ marginBottom: '16px', fontSize: '1rem', color: 'var(--primary)' }}>
                  Scan with Phone
                </h3>
                <div
                  style={{
                    background: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '224px',
                    minWidth: '224px',
                    margin: '0 auto'
                  }}
                >
                  {companionUrl ? (
                    <img
                      key={companionUrl}
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(companionUrl)}`}
                      alt="QR Code"
                      style={{ display: 'block', width: '200px', height: '200px' }}
                    />
                  ) : (
                    <div className="loader" style={{ scale: '0.5' }} />
                  )}
                </div>
                <div style={{ marginTop: '16px' }}>
                  <p
                    style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}
                  >
                    Scanning this connects your phone to Paraclete.
                  </p>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      wordBreak: 'break-all',
                      color: 'var(--primary)',
                      opacity: 0.8,
                      padding: '8px',
                      background: 'rgba(157, 129, 255, 0.1)',
                      borderRadius: '4px'
                    }}
                  >
                    {companionUrl}
                  </div>
                </div>
              </div>

              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}
                >
                  <h3 style={{ fontSize: '1rem' }}>Captured Pages</h3>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      background: 'var(--primary-faded)',
                      color: 'var(--primary)',
                      padding: '4px 12px',
                      borderRadius: '100px'
                    }}
                  >
                    {companionImages.length} Active
                  </span>
                </div>

                <div
                  style={{
                    flexGrow: 1,
                    background: 'var(--bg-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '12px',
                    padding: '16px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}
                >
                  {companionImages.map((img, i) => (
                    <div
                      key={i}
                      style={{
                        aspectRatio: '3/4',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        background: '#000'
                      }}
                    >
                      <img
                        src={`${API_BASE}${img}`}
                        alt="Capture"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  ))}
                  {companionImages.length === 0 && (
                    <div
                      style={{
                        gridColumn: '1/-1',
                        textAlign: 'center',
                        padding: '40px',
                        color: 'var(--text-muted)'
                      }}
                    >
                      No images captured yet. Scan the code to start.
                    </div>
                  )}
                </div>

                <button
                  className="btn-primary"
                  disabled={companionImages.length === 0 || loading}
                  onClick={handlePerformCompanionOCR}
                  style={{ marginTop: '24px', padding: '12px' }}
                >
                  {loading
                    ? 'Processing...'
                    : `Perform OCR on ${companionImages.length} Page${companionImages.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <InterstitialLoader
        isOpen={!!interstitial}
        title={interstitial?.title}
        subtitle={interstitial?.subtitle}
        tasks={interstitial?.tasks}
      />

      {showDeleteConfirm && (
        <ConfirmationModal
          title="Delete Note?"
          message="Are you sure you want to delete this note? This action cannot be undone."
          variant="danger"
          confirmLabel="Delete Forever"
          onConfirm={executeDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

export default NoteAuthoring
