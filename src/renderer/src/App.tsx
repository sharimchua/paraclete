import React, { useState, useEffect } from 'react'
import SetupScreen from './components/SetupScreen'
import PersonList from './components/PersonList'
import PersonProfile from './components/PersonProfile'
import NoteAuthoring from './components/NoteAuthoring'
import GroupList from './components/GroupList'
import GroupProfile from './components/GroupProfile'
import NoteDetail from './components/NoteDetail'
import Dashboard from './components/Dashboard'
import AdminPanel from './components/AdminPanel'
import TagManagement from './components/TagManagement'
import NotesList from './components/NotesList'
import ReferenceLibrary from './components/ReferenceLibrary'
import MessagesList from './components/MessagesList'
import MessageAuthoring from './components/MessageAuthoring'
import PracticeFramework from './components/PracticeFramework'
import Logo from './components/Logo'
import ParacletePanel from './components/ParacletePanel'
import StandardNavbar from './components/StandardNavbar'
import { NavbarProvider } from './components/NavbarContext'
import { api } from './services/api'
import PersonaSelectionModal from './components/PersonaSelectionModal'
import EntitySelectionModal from './components/EntitySelectionModal'
import ConfirmationModal from './components/ConfirmationModal'
import ReformatModal from './components/ReformatModal'

const App: React.FC = () => {
  const [isSetup, setIsSetup] = useState<boolean | null>(null)
  const [currentView, setCurrentView] = useState<string>('dashboard')
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const [initialNoteDate, setInitialNoteDate] = useState<string | null>(null)
  const [viewHistory, setViewHistory] = useState<string[]>(['dashboard'])
  const [personaLinkingTarget, setPersonaLinkingTarget] = useState<{
    type: 'person' | 'group'
    id: number
    existingPersonaIds: number[]
  } | null>(null)
  const [showContactSelection, setShowContactSelection] = useState(false)
  const [isParacletePanelOpen, setIsParacletePanelOpen] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isLlmReady, setIsLlmReady] = useState(false)
  const [isWarming, setIsWarming] = useState(false)

  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false)
  const [pendingProposalsCount, setPendingProposalsCount] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const [selectionContext, setSelectionContext] = useState<{
    selectedText: string
    fullContext: string
    elementId: string
  } | null>(null)
  const [isReformatModalOpen, setIsReformatModalOpen] = useState(false)

  const fetchProposalsCount = async (): Promise<void> => {
    try {
      const proposals = await api.get<any[]>('/api/framework/proposals?status=pending')
      setPendingProposalsCount(proposals.length)
    } catch (err) {
      console.error('Failed to fetch proposals count:', err)
    }
  }

  useEffect(() => {
    // Query if setup is complete
    window.electron.ipcRenderer.invoke('check-setup-status').then((result: boolean) => {
      setIsSetup(result)
    })

    // Listener for setup completion
    window.electron.ipcRenderer.on('setup-complete', () => {
      setIsSetup(true)
    })

    const handleLinkPersona = (e: CustomEvent): void => {
      setPersonaLinkingTarget(e.detail)
    }
    window.addEventListener(
      'trigger-link-persona' as EventListener,
      handleLinkPersona as EventListener
    )

    const handleNavigate = (e: CustomEvent): void => {
      const { view, personId, groupId, noteId, date, messageId } = e.detail
      navigateTo(view, personId, groupId, noteId, date, false, messageId)
    }
    window.addEventListener('navigate' as EventListener, handleNavigate as EventListener)

    const handleTriggerMessageModal = (): void => setShowContactSelection(true)
    window.addEventListener(
      'trigger-message-modal' as EventListener,
      handleTriggerMessageModal as EventListener
    )

    const handleThinking = (e: CustomEvent): void => setIsThinking(e.detail)
    window.addEventListener('paraclete-thinking' as EventListener, handleThinking as EventListener)

    const socket = new WebSocket('ws://127.0.0.1:8000/ws')
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'llm_start') {
          if (data.data?.type === 'warmup') {
            setIsWarming(true)
          } else {
            setIsThinking(true)
          }
        } else if (data.event === 'llm_finish' || data.event === 'llm_error') {
          setIsThinking(false)
          if (data.data?.type === 'warmup') {
            setIsWarming(false)
            setIsLlmReady(true)
            window.dispatchEvent(
              new CustomEvent('paraclete-toast', {
                detail: {
                  message: 'Neural Engine Online. Paraclete Core is ready.',
                  type: 'success'
                }
              })
            )
          }
        } else if (data.event === 'background_jobs') {
          const jobs = data.data || []
          const isAnyJobRunning = jobs.some((j: any) => j.status === 'running')
          const isAnalysisActive = jobs.some(
            (j: any) =>
              (j.status === 'running' || j.status === 'pending') &&
              (j.name.includes('Analyze') || j.name.includes('Synthesis'))
          )

          setIsAnalysisRunning(isAnalysisActive)
          if (isAnyJobRunning) setIsThinking(true)
        } else if (data.event === 'framework_proposals_updated') {
          fetchProposalsCount()
        }
        window.dispatchEvent(new CustomEvent('global-ws-message', { detail: data }))
      } catch (e) {
        console.error('Core WS Error:', e)
      }
    }

    // Initial data fetch
    fetchProposalsCount()

    return () => {
      window.removeEventListener('trigger-link-persona' as any, handleLinkPersona)
      window.removeEventListener('navigate' as any, handleNavigate)
      window.removeEventListener('trigger-message-modal' as any, handleTriggerMessageModal)
      window.removeEventListener('paraclete-thinking' as any, handleThinking)
      socket.close()
    }
  }, [])

  useEffect(() => {
    const handleSelection = (e?: any) => {
      // If the modal is already open, don't change the context
      if (isReformatModalOpen) return

      // Ignore if clicking the trigger itself or its icons (only for MouseEvents)
      if (e && e.type === 'mouseup' && (e.target as HTMLElement)?.closest('.rewrite-trigger')) {
        return
      }

      const selection = window.getSelection()
      const text = selection?.toString() || ''

      if (text.trim().length > 50) {
        const activeElement = document.activeElement as HTMLTextAreaElement
        if (
          activeElement &&
          activeElement.tagName === 'TEXTAREA' &&
          activeElement.dataset.paracleteType
        ) {
          setSelectionContext({
            selectedText: text,
            fullContext: activeElement.value,
            elementId: activeElement.id
          })
          return
        }
      }
      setSelectionContext(null)
    }

    document.addEventListener('selectionchange', handleSelection)
    document.addEventListener('mouseup', handleSelection)

    return () => {
      document.removeEventListener('selectionchange', handleSelection)
      document.removeEventListener('mouseup', handleSelection)
    }
  }, [isReformatModalOpen])

  const navigateTo = (
    view: string,
    personId: number | null = null,
    groupId: number | null = null,
    noteId: number | null = null,
    date: string | null = null,
    resetHistory: boolean = false,
    messageId: number | null = null,
    ignoreDirty: boolean = false
  ) => {
    const performNavigation = () => {
      setCurrentView(view)
      setSelectedPersonId(personId)
      setSelectedGroupId(groupId)
      setSelectedNoteId(noteId)
      setSelectedMessageId(messageId)
      setInitialNoteDate(date)
      setIsDirty(false)
      setPendingNavigation(null)
      setShowDiscardConfirm(false)

      if (resetHistory) {
        setViewHistory([view])
      } else {
        setViewHistory((prev) => {
          if (prev[prev.length - 1] === view) return prev
          return [...prev, view]
        })
      }
    }

    if (isDirty && !ignoreDirty && view !== currentView) {
      setPendingNavigation(() => performNavigation)
      setShowDiscardConfirm(true)
    } else {
      performNavigation()
    }
  }

  const goBack = (ignoreDirty: boolean = false) => {
    const performBack = () => {
      setIsDirty(false)
      setShowDiscardConfirm(false)
      setPendingNavigation(null)

      if (viewHistory.length <= 1) {
        setCurrentView('dashboard')
        setSelectedPersonId(null)
        setSelectedGroupId(null)
        setSelectedNoteId(null)
        setViewHistory(['dashboard'])
        return
      }

      const newHistory = [...viewHistory]
      newHistory.pop()
      const previousView = newHistory[newHistory.length - 1]

      setViewHistory(newHistory)
      setCurrentView(previousView)

      if (
        previousView === 'dashboard' ||
        previousView === 'notes' ||
        previousView === 'tags' ||
        previousView === 'admin' ||
        previousView === 'messages' ||
        (previousView === 'persons' && !selectedPersonId) ||
        (previousView === 'groups' && !selectedGroupId)
      ) {
        setSelectedPersonId(null)
        setSelectedGroupId(null)
        setSelectedNoteId(null)
        setSelectedMessageId(null)
        setInitialNoteDate(null)
      }
    }

    if (isDirty && !ignoreDirty) {
      setPendingNavigation(() => performBack)
      setShowDiscardConfirm(true)
    } else {
      performBack()
    }
  }

  if (isSetup === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw',
          height: '100vh',
          backgroundColor: '#020617'
        }}
      >
        <div className="loader" />
      </div>
    )
  }

  if (!isSetup) {
    return <SetupScreen />
  }

  const startNewNote = (personId?: number, groupId?: number, date?: string) => {
    navigateTo('new-note', personId || null, groupId || null, null, date || null)
  }

  const renderContent = () => {
    if (currentView === 'new-note') {
      return (
        <NoteAuthoring
          personId={selectedPersonId || undefined}
          groupId={selectedGroupId || undefined}
          initialDate={initialNoteDate || undefined}
          onComplete={() => goBack(true)}
          setIsDirty={setIsDirty}
        />
      )
    }

    if (currentView === 'note-detail' && selectedNoteId) {
      return <NoteDetail noteId={selectedNoteId} onBack={goBack} />
    }

    if (currentView === 'dashboard') {
      return (
        <Dashboard
          onSelectNote={(id) => {
            navigateTo('note-detail', selectedPersonId, selectedGroupId, id)
          }}
          onStartNote={(date, pid, gid) => {
            startNewNote(pid, gid, date)
          }}
        />
      )
    }

    if (currentView === 'persons') {
      if (selectedPersonId) {
        return (
          <PersonProfile
            personId={selectedPersonId}
            onBack={() => setSelectedPersonId(null)}
            onSelectNote={(id) => {
              navigateTo('note-detail', selectedPersonId, null, id)
            }}
            onStartNote={(id) => startNewNote(id)}
          />
        )
      }
      return <PersonList onSelectPerson={(id) => setSelectedPersonId(id)} />
    }

    if (currentView === 'groups') {
      if (selectedGroupId) {
        return (
          <GroupProfile
            groupId={selectedGroupId}
            onBack={() => setSelectedGroupId(null)}
            onSelectPerson={(id) => {
              setSelectedPersonId(id)
            }}
            onSelectNote={(id) => {
              navigateTo('note-detail', null, selectedGroupId, id)
            }}
            onStartNote={(pid, gid) => startNewNote(pid || undefined, gid)}
          />
        )
      }
      return <GroupList onSelectGroup={(id) => setSelectedGroupId(id)} />
    }

    if (currentView === 'notes') {
      return (
        <NotesList
          onSelectNote={(id) => {
            navigateTo('note-detail', null, null, id)
          }}
        />
      )
    }

    if (currentView === 'admin') {
      return <AdminPanel />
    }

    if (currentView === 'tags') {
      return <TagManagement />
    }

    if (currentView === 'references') {
      return <ReferenceLibrary />
    }

    if (currentView === 'framework') {
      return <PracticeFramework />
    }

    if (currentView === 'messages') {
      return (
        <MessagesList
          onSelectMessage={(id) =>
            navigateTo('message-authoring', null, null, null, null, false, id)
          }
        />
      )
    }

    if (currentView === 'message-authoring') {
      return (
        <MessageAuthoring
          messageId={selectedMessageId || undefined}
          noteId={selectedNoteId || undefined}
          personId={selectedPersonId || undefined}
          groupId={selectedGroupId || undefined}
          initialDate={initialNoteDate || undefined}
          onComplete={() => goBack(true)}
          onViewNote={(id) => navigateTo('note-detail', null, null, id)}
          setIsDirty={setIsDirty}
        />
      )
    }

    return <div>View {currentView} coming soon.</div>
  }

  const getHeaderProps = () => {
    const showBack = viewHistory.length > 1
    let title = currentView.toUpperCase()

    if (currentView === 'message-authoring') title = 'MESSAGE COMPOSER'
    else if (currentView === 'messages') title = 'MESSAGE HISTORY'
    else if (currentView === 'new-note') title = 'SESSION WORKFLOW'
    else if (currentView === 'note-detail') title = 'NOTE DETAIL'
    else if (selectedPersonId) title = 'PERSON PROFILE'
    else if (selectedGroupId) title = 'GROUP PROFILE'

    return { title, showBack, onBack: goBack }
  }

  return (
    <NavbarProvider>
      <div className="app-container">
        <aside className="sidebar">
          <div
            className="logo-area"
            onClick={() => setIsParacletePanelOpen(true)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              overflow: 'visible',
              minHeight: '48px',
              padding: '0 16px'
            }}
          >
            <div style={{ flexShrink: 0, display: 'flex' }}>
              <Logo isThinking={isThinking} isLlmReady={isLlmReady} isWarming={isWarming} />
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.2rem',
                letterSpacing: '2px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}
            >
              PARACLETE
            </h1>

            {selectionContext && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsReformatModalOpen(true)
                }}
                className="btn-primary rewrite-trigger"
                style={{
                  padding: 0,
                  borderRadius: '8px',
                  marginLeft: '6px',
                  animation: 'slideFromLeft 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  minWidth: '32px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: 'none',
                  flexShrink: 0
                }}
                title="Rewrite highlighted text"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            )}
          </div>

          <nav className="nav-section">
            <div
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('dashboard', null, null, null, null, true)
              }}
            >
              Dashboard
            </div>
            <div
              className={`nav-item ${currentView === 'persons' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('persons', null, null, null, null, true)
              }}
            >
              Persons
            </div>
            <div
              className={`nav-item ${currentView === 'groups' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('groups', null, null, null, null, true)
              }}
            >
              Groups
            </div>
            <div
              className={`nav-item ${currentView === 'notes' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('notes', null, null, null, null, true)
              }}
            >
              Notes
            </div>
            <div
              className={`nav-item ${currentView === 'messages' || currentView === 'message-authoring' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('messages', null, null, null, null, true)
              }}
            >
              Messages
            </div>
            <div
              className={`nav-item ${currentView === 'references' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('references', null, null, null, null, true)
              }}
            >
              References
            </div>
            <div
              className={`nav-item ${currentView === 'framework' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('framework', null, null, null, null, true)
              }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Framework</span>
              {pendingProposalsCount > 0 && (
                <span
                  style={{
                    background: '#f59e0b',
                    color: '#0f172a',
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontWeight: 900,
                    minWidth: '18px',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  {pendingProposalsCount}
                </span>
              )}
              {isAnalysisRunning && (
                <div className="thinking-dots" style={{ scale: '0.5', marginRight: '-10px' }}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
            </div>
          </nav>

          <div
            className="sidebar-footer"
            style={{
              marginTop: 'auto',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '16px'
            }}
          >
            <div
              className={`nav-item ${currentView === 'tags' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('tags', null, null, null, null, true)
              }}
              style={{ opacity: 0.8 }}
            >
              <span style={{ marginRight: '8px' }}>🏷️</span> Tags
            </div>
            <div
              className={`nav-item ${currentView === 'admin' ? 'active' : ''}`}
              onClick={() => {
                navigateTo('admin', null, null, null, null, true)
              }}
              style={{ opacity: 0.8 }}
            >
              <span style={{ marginRight: '8px' }}>⚙️</span> Admin
            </div>
          </div>
        </aside>

        <main className="main-content">
          <StandardNavbar {...getHeaderProps()} />

          <div className="content-area">{renderContent()}</div>
        </main>
        <ParacletePanel
          isOpen={isParacletePanelOpen}
          onClose={() => setIsParacletePanelOpen(false)}
        />

        {/* Global Modals */}
        <div id="modal-root">
          {personaLinkingTarget && (
            <PersonaSelectionModal
              title={`Link Persona to ${personaLinkingTarget.type === 'person' ? 'Individual' : 'Group'}`}
              existingPersonaIds={personaLinkingTarget.existingPersonaIds}
              onClose={() => setPersonaLinkingTarget(null)}
              onSelect={async (personaId) => {
                try {
                  await api.post('/api/framework/link', {
                    persona_id: personaId,
                    entity_type: personaLinkingTarget.type,
                    entity_id: personaLinkingTarget.id
                  })
                  setPersonaLinkingTarget(null)
                  // Dispatch refresh event
                  window.dispatchEvent(new CustomEvent('refresh-profile'))
                } catch (err) {
                  console.error(err)
                  alert('Failed to link persona')
                }
              }}
            />
          )}

          {showContactSelection && (
            <EntitySelectionModal
              title="New Outreach"
              subtitle="Select a contact to start drafting a message."
              allowGeneral={false}
              onClose={() => setShowContactSelection(false)}
              onSelect={(target) => {
                navigateTo(
                  'message-authoring',
                  target.type === 'person' ? target.id : null,
                  target.type === 'group' ? target.id : null
                )
                setShowContactSelection(false)
              }}
            />
          )}
          {showDiscardConfirm && (
            <ConfirmationModal
              title="Unsaved Changes"
              message="You have unsaved work that will be lost if you navigate away. Do you wish to continue?"
              confirmLabel="Discard Changes"
              cancelLabel="Stay Here"
              variant="danger"
              onConfirm={() => {
                if (pendingNavigation) pendingNavigation()
              }}
              onCancel={() => {
                setShowDiscardConfirm(false)
                setPendingNavigation(null)
              }}
            />
          )}

          {isReformatModalOpen && selectionContext && (
            <ReformatModal
              selectedText={selectionContext.selectedText}
              fullContext={selectionContext.fullContext}
              personId={selectedPersonId || undefined}
              groupId={selectedGroupId || undefined}
              onClose={() => {
                setIsReformatModalOpen(false)
                setSelectionContext(null)
              }}
              onApply={(newText) => {
                // Find the element and replace the selection
                const el = document.getElementById(
                  selectionContext.elementId
                ) as HTMLTextAreaElement
                if (el) {
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const val = el.value
                  const newVal = val.substring(0, start) + newText + val.substring(end)

                  // We need to trigger a change event for React to pick it up
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                  )?.set
                  nativeInputValueSetter?.call(el, newVal)
                  const event = new Event('input', { bubbles: true })
                  el.dispatchEvent(event)

                  setIsDirty(true)
                }
                setIsReformatModalOpen(false)
                setSelectionContext(null)
              }}
            />
          )}
        </div>
        <style>{`
                    @keyframes popIn {
                        from { transform: scale(0); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                    @keyframes slideFromLeft {
                        from { transform: translateX(-15px); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `}</style>
      </div>
    </NavbarProvider>
  )
}

export default App
