import React, { useState } from 'react'
import { api } from '../services/api'

interface ReformatModalProps {
  selectedText: string
  fullContext: string
  personId?: number
  groupId?: number
  onClose: () => void
  onApply: (newText: string) => void
}

const ReformatModal: React.FC<ReformatModalProps> = ({
  selectedText,
  fullContext,
  personId,
  groupId,
  onClose,
  onApply
}) => {
  const [prompt, setPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState('')

  const handleReformat = async (): Promise<void> => {
    if (!prompt.trim()) return
    setIsProcessing(true)
    try {
      const res = await api.post<{ result: string }>('/api/paraclete/reformat', {
        selected_text: selectedText,
        full_context: fullContext,
        prompt: prompt,
        person_id: personId,
        group_id: groupId
      })
      setResult(res.result)
    } catch (err) {
      console.error('Reformat failed:', err)
      alert('Failed to reformat text.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 3000,
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
          maxWidth: '700px',
          background: 'var(--bg-deep)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}
      >
        <header
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>AI REWRITE</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '1.5rem'
            }}
          >
            &times;
          </button>
        </header>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600
              }}
            >
              Target Selection
            </label>
            <div
              style={{
                padding: '12px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                fontSize: '0.9rem',
                maxHeight: '120px',
                overflowY: 'auto',
                borderLeft: '2px solid var(--primary)',
                fontStyle: 'italic',
                opacity: 0.8
              }}
            >
              &quot;{selectedText}&quot;
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600
              }}
            >
              Your Instruction
            </label>
            <textarea
              autoFocus
              placeholder="e.g. 'Make this section more concise', 'Turn this into a bulleted list', 'Explain this for a layperson'..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) handleReformat()
              }}
              style={{
                width: '100%',
                height: '80px',
                padding: '12px',
                borderRadius: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  color: 'var(--primary)',
                  fontWeight: 600
                }}
              >
                Paraclete Proposal
              </label>
              <div
                style={{
                  padding: '16px',
                  background: 'var(--primary-faded)',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--primary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.5'
                }}
              >
                {result}
              </div>
            </div>
          )}
        </div>

        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'rgba(255,255,255,0.01)'
          }}
        >
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {!result ? (
            <button
              className="btn-primary"
              onClick={handleReformat}
              disabled={isProcessing || !prompt.trim()}
            >
              {isProcessing ? 'Processing...' : 'Generate Suggestion'}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => onApply(result)}
              style={{ background: 'var(--success, #22c55e)' }}
            >
              Apply Change
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

export default ReformatModal
