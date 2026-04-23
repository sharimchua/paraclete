import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { api } from '../services/api'
import Logo from './Logo'

interface BackgroundJob {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled'
  progress: number
  error?: string
}

interface ParacletePanelProps {
  isOpen: boolean
  onClose: () => void
}

const ParacletePanel: React.FC<ParacletePanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'forensics' | 'chat'>('jobs')
  const [events, setEvents] = useState<
    {
      event: string
      data: { prompt?: string; result?: string; type?: string }
      timestamp: string
    }[]
  >([])
  const [jobs, setJobs] = useState<BackgroundJob[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [isLlmReady, setIsLlmReady] = useState(false)
  const [isWarming, setIsWarming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [shouldRender, setShouldRender] = useState(isOpen)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [llmStatus, setLlmStatus] = useState<{ n_ctx?: number; active_use_case?: string } | null>(
    null
  )
  const [contextUsage, setContextUsage] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initial state will be provided via WebSocket status event on connect (managed in App.tsx)
    // Polling and one-off fetch removed in favor of WebSockets
  }, [])

  const handleSendChat = async (): Promise<void> => {
    if (!chatInput.trim() || isSending) return

    const newMsg = { role: 'user', content: chatInput }
    const updatedMessages = [...chatMessages, newMsg]
    setChatMessages((prev) => [...prev, newMsg])
    setChatInput('')
    setIsSending(true)
    setIsThinking(true)

    console.log(`Sending ${updatedMessages.length} messages to Paraclete:`, updatedMessages)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/paraclete/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages })
      })

      if (!response.body) throw new Error('No body')

      // Get usage from headers if provided
      const usageHeader = response.headers.get('X-Context-Usage')
      if (usageHeader) {
        setContextUsage(parseInt(usageHeader, 10))
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const assistantMsg = { role: 'assistant', content: '' }
      setChatMessages((prev) => [...prev, assistantMsg])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        assistantMsg.content += chunk
        setChatMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { ...assistantMsg }
          return next
        })
      }
    } catch (err) {
      console.error('Chat error:', err)
      setChatMessages((prev) => [
        ...prev,
        { role: 'system', content: 'Failed to communicate with Paraclete.' }
      ])
    } finally {
      setIsSending(false)
    }
  }

  const renderChat = (): React.ReactElement => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            flexGrow: 1,
            overflowY: 'auto',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <style>{`
                    @keyframes typing {
                        0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
                        30% { transform: translateY(-4px); opacity: 1; }
                    }
                `}</style>
          {chatMessages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.3,
                gap: '16px'
              }}
            >
              <div style={{ width: '48px', opacity: 0.5 }}>
                <Logo isThinking={isThinking} isLlmReady={isLlmReady} isWarming={isWarming} />
              </div>
              <span style={{ fontSize: '0.8rem' }}>How can I help with your practice today?</span>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? 'white' : 'inherit',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              {msg.content === '' && msg.role === 'assistant' ? (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '20px' }}>
                  <div
                    className="typing-dot"
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'currentColor',
                      animation: 'typing 1.4s infinite'
                    }}
                  />
                  <div
                    className="typing-dot"
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'currentColor',
                      animation: 'typing 1.4s infinite 0.2s'
                    }}
                  />
                  <div
                    className="typing-dot"
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'currentColor',
                      animation: 'typing 1.4s infinite 0.4s'
                    }}
                  />
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    p: (props) => <p style={{ margin: 0, marginBottom: '8px' }} {...props} />,
                    h1: (props) => (
                      <h1 style={{ fontSize: '1.2rem', margin: '8px 0' }} {...props} />
                    ),
                    h2: (props) => (
                      <h2 style={{ fontSize: '1.1rem', margin: '8px 0' }} {...props} />
                    ),
                    h3: (props) => <h3 style={{ fontSize: '1rem', margin: '8px 0' }} {...props} />,
                    ul: (props) => (
                      <ul style={{ paddingLeft: '20px', margin: '8px 0' }} {...props} />
                    ),
                    ol: (props) => (
                      <ol style={{ paddingLeft: '20px', margin: '8px 0' }} {...props} />
                    ),
                    li: (props) => <li style={{ marginBottom: '4px' }} {...props} />,
                    code: (props) => (
                      <code
                        style={{
                          background: 'rgba(0,0,0,0.2)',
                          padding: '2px 4px',
                          borderRadius: '4px'
                        }}
                        {...props}
                      />
                    )
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'rgba(255,255,255,0.03)',
            padding: '8px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder="Ask Paraclete..."
            style={{
              flexGrow: 1,
              background: 'none',
              border: 'none',
              color: 'white',
              padding: '8px 12px',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
          <button
            onClick={handleSendChat}
            disabled={isSending}
            style={{
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: isSending ? 0.5 : 1
            }}
          >
            {isSending ? '...' : 'SEND'}
          </button>
        </div>
      </div>
    )
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isOpen) {
      setShouldRender(true)
      setIsClosing(false)
    } else {
      setIsClosing(true)
      timer = setTimeout(() => {
        setShouldRender(false)
      }, 400) // Match animation duration
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isOpen])

  const handleClose = (): void => {
    setIsClosing(true)
    setTimeout(onClose, 350)
  }

  const fetchJobs = useCallback(async (): Promise<void> => {
    try {
      const data = await api.get<BackgroundJob[]>('/api/admin/jobs')
      setJobs(data)
    } catch (err) {
      console.error('Failed to fetch jobs', err)
    }
  }, [])

  useEffect(() => {
    const handleWsMessage = (event: Event): void => {
      try {
        const data = (event as CustomEvent).detail

        if (data.event?.startsWith('llm_')) {
          setEvents((prev) => [...prev, { ...data, timestamp: new Date().toLocaleTimeString() }])

          if (data.event === 'llm_status') {
            setLlmStatus(data.data)
            setIsLlmReady(data.data.is_ready)
          }

          if (data.event === 'llm_start') {
            if (data.data?.type === 'warmup') setIsWarming(true)
            else setIsThinking(true)
          }
          if (data.event === 'llm_finish' || data.event === 'llm_error') {
            setIsThinking(false)
            if (data.data?.type === 'warmup') {
              setIsWarming(false)
              setIsLlmReady(true)
            }
          }
        }

        if (data.event === 'background_jobs') {
          setJobs(data.data)
        }
      } catch (err: unknown) {
        console.error(err)
      }
    }

    window.addEventListener('global-ws-message', handleWsMessage)
    fetchJobs()

    return () => {
      window.removeEventListener('global-ws-message', handleWsMessage)
    }
  }, [fetchJobs])

  // Effect to scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, activeTab, isOpen])

  // Effect for Background Jobs / Forensics - only snap to top when NEW data arrives, not on tab switch
  useEffect(() => {
    if (scrollRef.current && (activeTab === 'jobs' || activeTab === 'forensics')) {
      // Only snap to top if we were already near the top (manual scroll preservation)
      if (scrollRef.current.scrollTop < 100) {
        scrollRef.current.scrollTop = 0
      }
    }
  }, [events, jobs, activeTab])

  const renderJobs = (): React.ReactElement => {
    const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>QUEUE STATUS</span>
          <span
            style={{ fontSize: '0.7rem', color: pendingCount > 0 ? 'var(--primary)' : 'inherit' }}
          >
            {pendingCount} ACTIVE JOBS
          </span>
        </div>
        {jobs.length === 0 && (
          <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '20px', fontSize: '0.8rem' }}>
            No background activity.
          </div>
        )}
        {jobs.length > 0 &&
          [...jobs].reverse().map((job) => (
            <div
              key={job.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{job.name}</span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    color:
                      job.status === 'completed'
                        ? '#22c55e'
                        : job.status === 'running'
                          ? '#3b82f6'
                          : '#94a3b8'
                  }}
                >
                  {job.status.toUpperCase()}
                </span>
              </div>
              {job.status === 'running' && (
                <div
                  style={{
                    height: '2px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '1px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${job.progress}%`,
                      background: 'var(--primary)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              )}
              {job.error && (
                <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '4px' }}>
                  {job.error}
                </div>
              )}
            </div>
          ))}
      </div>
    )
  }

  const renderForensics = (): React.ReactElement => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {events.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '40px' }}>
          Waiting for LLM trace...
        </div>
      )}
      {[...events].reverse().map((ev, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(255,255,255,0.02)',
            padding: '10px',
            borderRadius: '8px',
            borderLeft: `2px solid ${
              ev.event === 'llm_start'
                ? '#3b82f6'
                : ev.event === 'llm_finish'
                  ? '#8b5cf6'
                  : ev.event === 'llm_match'
                    ? '#22c55e'
                    : ev.event === 'llm_no_match'
                      ? '#f59e0b'
                      : '#64748b'
            }`
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
              opacity: 0.4,
              fontSize: '0.6rem'
            }}
          >
            <span>{ev.event.toUpperCase()}</span>
            <span>{ev.timestamp}</span>
          </div>
          <div style={{ fontSize: '0.7rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {(() => {
              if (ev.event === 'llm_start') return ev.data.prompt || 'Thinking...'
              if (ev.event === 'llm_finish')
                return typeof ev.data.result === 'string'
                  ? ev.data.result
                  : ev.data.type
                    ? `Finished ${ev.data.type}`
                    : 'Process Complete'

              const displayData = ev.data
              if (typeof displayData === 'object' && displayData !== null) {
                return JSON.stringify(displayData, null, 2)
              }
              return String(displayData)
            })()}
          </div>
        </div>
      ))}
    </div>
  )

  if (!shouldRender) return null

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(2, 6, 23, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1999,
          animation: isClosing ? 'fadeOut 0.3s ease-in forwards' : 'fadeIn 0.3s ease-out forwards',
          pointerEvents: isClosing ? 'none' : 'auto',
          visibility: isClosing && !isOpen ? 'hidden' : 'visible',
          transition: 'visibility 0.3s'
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '1100px',
          maxWidth: '96vw',
          height: '90vh',
          background: 'rgba(15, 23, 42, 0.98)',
          backdropFilter: 'blur(30px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 128px rgba(0,0,0,0.8)',
          zIndex: 2000,
          overflow: 'hidden',
          animation: isClosing
            ? 'paracleteContract 0.4s cubic-bezier(0.7, 0, 0.84, 0) forwards'
            : 'paracleteExpand 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          transformOrigin: '-20% -10%' // Origin at Logo area
        }}
      >
        <header
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '24px' }}>
              <Logo isThinking={isThinking} isLlmReady={isLlmReady} isWarming={isWarming} />
            </div>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}
            >
              Paraclete Global Intelligence
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              fontSize: '1.5rem'
            }}
          >
            &times;
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            padding: '0 20px',
            background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          {(['jobs', 'forensics', 'chat'] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '15px 20px',
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                color: activeTab === tab ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
                borderBottom:
                  activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          style={{
            flexGrow: 1,
            overflowY: 'auto',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {activeTab === 'jobs' && renderJobs()}
          {activeTab === 'forensics' && renderForensics()}
          {activeTab === 'chat' && renderChat()}
        </div>

        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '4px',
                background: isThinking ? 'var(--primary)' : !isLlmReady ? '#f59e0b' : '#22c55e',
                boxShadow: isThinking
                  ? '0 0 12px var(--primary)'
                  : !isLlmReady
                    ? '0 0 8px rgba(245, 158, 11, 0.4)'
                    : '0 0 8px rgba(34, 197, 94, 0.4)'
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>
              {isThinking
                ? 'NEURAL ENGINE ACTIVE'
                : !isLlmReady
                  ? 'WARMING UP NEURAL ENGINE...'
                  : 'PARACLETE CORE STABLE'}
            </span>
          </div>

          {activeTab === 'chat' && (
            <div
              style={{
                flex: 1,
                maxWidth: '400px',
                margin: '0 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              {(() => {
                const CURRENT_CTX_LIMIT = llmStatus?.n_ctx || 32768
                const usagePercent = Math.min((contextUsage / CURRENT_CTX_LIMIT) * 100, 100)
                const isActiveChatModel = llmStatus?.active_use_case === 'chat'
                return (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        opacity: 0.6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>NEURAL CONTEXT</span>
                        <span
                          style={{
                            fontSize: '0.55rem',
                            padding: '1px 4px',
                            background: isActiveChatModel
                              ? 'rgba(34, 197, 94, 0.1)'
                              : 'rgba(245, 158, 11, 0.1)',
                            color: isActiveChatModel ? '#4ade80' : '#fbbf24',
                            borderRadius: '3px',
                            border: `1px solid ${isActiveChatModel ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                          }}
                        >
                          {isActiveChatModel ? 'CHAT SPECIALIST' : 'ANALYSIS ENGINE'}
                        </span>
                      </div>
                      <span>
                        {contextUsage.toLocaleString()} / {CURRENT_CTX_LIMIT.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        height: '3px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${usagePercent}%`,
                          background:
                            usagePercent > 90
                              ? '#ef4444'
                              : usagePercent > 70
                                ? '#f59e0b'
                                : 'var(--primary)',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(() => {
              const handleClear = async (): Promise<void> => {
                if (activeTab === 'forensics') {
                  setEvents([])
                } else if (activeTab === 'jobs') {
                  try {
                    await api.post('/api/admin/jobs/clear', {})
                  } catch (err) {
                    console.error('Failed to clear jobs', err)
                  }
                } else if (activeTab === 'chat') {
                  setChatMessages([])
                }
              }

              return (
                <button
                  onClick={handleClear}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '6px'
                  }}
                >
                  {activeTab === 'jobs'
                    ? 'CLEAR COMPLETED'
                    : activeTab === 'forensics'
                      ? 'CLEAR LOGS'
                      : 'CLEAR CHAT'}
                </button>
              )
            })()}
          </div>
        </footer>

        <style>{`
                    @keyframes paracleteExpand {
                        from { transform: translateX(-50%) scale(0.1); opacity: 0; filter: blur(10px); }
                        to { transform: translateX(-50%) scale(1); opacity: 1; filter: blur(0); }
                    }
                    @keyframes paracleteContract {
                        from { transform: translateX(-50%) scale(1); opacity: 1; filter: blur(0); }
                        to { transform: translateX(-50%) scale(0.05); opacity: 0; filter: blur(20px); }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes fadeOut {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                    @keyframes typing {
                        0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
                        30% { transform: translateY(-4px); opacity: 1; }
                    }
                `}</style>
      </div>
    </>
  )
}

export default ParacletePanel
