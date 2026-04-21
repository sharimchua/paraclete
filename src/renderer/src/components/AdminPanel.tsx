import React, { useState, useEffect } from 'react'
import ConfirmationModal from './ConfirmationModal'
import { toast } from './ToastProvider'
import { api } from '../services/api'

const AdminPanel: React.FC = () => {
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | 'idle'
    message: string
  }>({ type: 'idle', message: '' })
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isSavingSetting, setIsSavingSetting] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
    variant?: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/admin/settings')
      const data = await res.json()
      setSettings(data)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  }

  const updateSetting = async (key: string, value: string) => {
    setIsSavingSetting(key)
    try {
      await fetch(
        `http://127.0.0.1:8000/api/admin/settings/${key}?value=${encodeURIComponent(value)}`,
        {
          method: 'POST'
        }
      )
      setSettings((prev) => ({ ...prev, [key]: value }))
    } catch (err) {
      console.error('Failed to update setting:', err)
      toast.error('Failed to save setting.')
    } finally {
      setIsSavingSetting(null)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('http://127.0.0.1:8000/export/')
      if (!response.ok) throw new Error('Export failed')

      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `paraclete-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export data')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setConfirmation({
      title: 'Overwrite Data?',
      message:
        'Warning: Importing data will OVERWRITE all existing data in the application. This action cannot be undone. Are you sure you want to proceed?',
      variant: 'danger',
      onConfirm: () => {
        executeImport(file)
        setConfirmation(null)
      }
    })
    event.target.value = ''
  }

  const executeImport = async (file: File) => {
    setIsImporting(true)
    setImportStatus({ type: 'idle', message: 'Importing...' })

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string
          const data = JSON.parse(content)

          const response = await fetch('http://127.0.0.1:8000/import/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Import failed')
          }

          setImportStatus({
            type: 'success',
            message: 'Data imported successfully! Please restart or refresh the application.'
          })
        } catch (err: any) {
          setImportStatus({ type: 'error', message: `Import failed: ${err.message}` })
        } finally {
          setIsImporting(false)
        }
      }
      reader.readAsText(file)
    } catch (error: any) {
      setImportStatus({ type: 'error', message: `File reading failed: ${error.message}` })
      setIsImporting(false)
    }
  }

  const currentThreshold = parseFloat(settings['framework_similarity_threshold'] || '0.8')
  const extractionLimit = parseInt(settings['framework_extraction_limit'] || '5')

  return (
    <div className="admin-panel animate-in" style={{ paddingBottom: '100px' }}>
      <div className="card" style={{ maxWidth: '800px' }}>
        <header style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Administrative Controls
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage your application data, configuration, and system settings.
          </p>
        </header>

        <div
          className="admin-section"
          style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>👤</span> Practitioner Profile
          </h4>
          <div
            className="admin-card"
            style={{
              padding: '20px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}
          >
            <p
              style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}
            >
              These details inform the AI about who you are, allowing it to personalise drafts and
              references.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  color: 'var(--text-muted)'
                }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={settings['practitioner_name'] || ''}
                onChange={(e) => updateSetting('practitioner_name', e.target.value)}
                placeholder="e.g. Dr. Jane Smith"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  color: 'var(--text-muted)'
                }}
              >
                Preferred Name (How the AI addresses you)
              </label>
              <input
                type="text"
                value={settings['practitioner_preferred_name'] || ''}
                onChange={(e) => updateSetting('practitioner_preferred_name', e.target.value)}
                placeholder="e.g. Jane"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'white'
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  color: 'var(--text-muted)'
                }}
              >
                Bio / Description
              </label>
              <textarea
                value={settings['practitioner_bio'] || ''}
                onChange={(e) => updateSetting('practitioner_bio', e.target.value)}
                placeholder="Briefly describe your approach or background..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'white',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        </div>

        <div
          className="admin-section"
          style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '32px',
            paddingTop: '24px'
          }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>📦</span> Data Portability
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div
              className="admin-card"
              style={{
                padding: '16px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '8px' }}>Export</h5>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px'
                }}
              >
                Download a complete JSON snapshot of your persons, groups, notes, and references.
              </p>
              <button
                className="btn-secondary"
                onClick={handleExport}
                disabled={isExporting}
                style={{ width: '100%' }}
              >
                {isExporting ? 'Exporting...' : 'Generate Export JSON'}
              </button>
            </div>

            <div
              className="admin-card"
              style={{
                padding: '16px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '8px' }}>Import</h5>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px'
                }}
              >
                Restore data from a previously exported JSON file.{' '}
                <strong>Warning: This overwrites current data.</strong>
              </p>
              <label
                className="btn-secondary"
                style={{
                  width: '100%',
                  display: 'inline-block',
                  textAlign: 'center',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  opacity: isImporting ? 0.7 : 1
                }}
              >
                {isImporting ? 'Importing...' : 'Upload Import JSON'}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: 'none' }}
                  disabled={isImporting}
                />
              </label>
            </div>
          </div>

          {importStatus.type !== 'idle' && (
            <div
              style={{
                marginTop: '20px',
                padding: '12px 16px',
                borderRadius: '6px',
                backgroundColor:
                  importStatus.type === 'success'
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${importStatus.type === 'success' ? '#22c55e' : '#ef4444'}`,
                color: importStatus.type === 'success' ? '#4ade80' : '#f87171',
                fontSize: '0.85rem'
              }}
            >
              {importStatus.message}
              {importStatus.type === 'success' && (
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    marginLeft: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 600
                  }}
                >
                  Reload Now
                </button>
              )}
            </div>
          )}
        </div>

        <div
          className="admin-section"
          style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '32px',
            paddingTop: '24px'
          }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>🤖</span> Model Governance
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Analysis Config */}
            <div
              className="admin-card"
              style={{
                padding: '20px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '16px', color: 'var(--primary)' }}>
                Analysis Engine
              </h5>
              <p
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}
              >
                Powers background extractions, framework analysis, and message drafting.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    color: 'var(--text-muted)'
                  }}
                >
                  Model Path
                </label>
                <input
                  type="text"
                  value={settings['llm_analysis_model'] || 'gemma-4-moe.gguf'}
                  onChange={(e) => updateSetting('llm_analysis_model', e.target.value)}
                  placeholder="e.g. gemma-4-moe.gguf"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    color: 'var(--text-muted)'
                  }}
                >
                  Context window (Tokens)
                </label>
                <select
                  value={settings['llm_analysis_ctx'] || '8192'}
                  onChange={(e) => updateSetting('llm_analysis_ctx', e.target.value)}
                >
                  <option value="4096">4,096</option>
                  <option value="8192">8,192 (Default)</option>
                  <option value="16384">16,384</option>
                  <option value="32768">32,768</option>
                </select>
              </div>
            </div>

            {/* Chat Config */}
            <div
              className="admin-card"
              style={{
                padding: '20px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '16px', color: 'var(--primary)' }}>
                Chat Specialist
              </h5>
              <p
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}
              >
                Powers the real-time Paraclete Chat agent in the focus panel.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    color: 'var(--text-muted)'
                  }}
                >
                  Model Path
                </label>
                <input
                  type="text"
                  value={settings['llm_chat_model'] || 'gemma-e4b.gguf'}
                  onChange={(e) => updateSetting('llm_chat_model', e.target.value)}
                  placeholder="e.g. gemma-e4b.gguf"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    color: 'var(--text-muted)'
                  }}
                >
                  Context window (Tokens)
                </label>
                <select
                  value={settings['llm_chat_ctx'] || '32768'}
                  onChange={(e) => updateSetting('llm_chat_ctx', e.target.value)}
                >
                  <option value="8192">8,192</option>
                  <option value="16384">16,384</option>
                  <option value="32768">32,768 (Default)</option>
                  <option value="65536">65,536</option>
                  <option value="131072">131,072 (Ultra)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div
          className="admin-section"
          style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '32px',
            paddingTop: '24px'
          }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>🧠</span> Framework Intelligence
          </h4>
          <div
            className="admin-card"
            style={{
              padding: '20px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600, margin: 0 }}>Framework Similarity Threshold</h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Higher values require a more exact match to merge professional proposals.
                </p>
              </div>
              <span
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '1.1rem',
                  fontWeight: 800
                }}
              >
                {currentThreshold.toFixed(1)}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((val) => (
                <button
                  key={val}
                  onClick={() => updateSetting('framework_similarity_threshold', val.toString())}
                  disabled={isSavingSetting === 'framework_similarity_threshold'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background:
                      Math.abs(currentThreshold - val) < 0.01
                        ? 'var(--primary)'
                        : 'rgba(255,255,255,0.05)',
                    color:
                      Math.abs(currentThreshold - val) < 0.01 ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    flex: '1 0 10%',
                    minWidth: '60px'
                  }}
                >
                  {val.toFixed(1)}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: '8px'
              }}
            >
              <span>Thematic (Loose)</span>
              <span>Strict (Exact)</span>
            </div>
          </div>

          <div
            className="admin-card"
            style={{
              padding: '20px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              marginTop: '16px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600, margin: 0 }}>Extraction Density</h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  How many potential stylistic markers should the AI attempt to extract from each
                  artifact?
                </p>
              </div>
              <span
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: 800
                }}
              >
                {extractionLimit === 3
                  ? 'Minimal'
                  : extractionLimit === 7
                    ? 'Extensive'
                    : 'Moderate'}{' '}
                ({extractionLimit})
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { label: 'Minimal', value: '3' },
                { label: 'Moderate', value: '5' },
                { label: 'Extensive', value: '7' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateSetting('framework_extraction_limit', opt.value)}
                  disabled={isSavingSetting === 'framework_extraction_limit'}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background:
                      extractionLimit === parseInt(opt.value)
                        ? 'var(--primary)'
                        : 'rgba(255,255,255,0.05)',
                    color:
                      extractionLimit === parseInt(opt.value) ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="admin-section"
          style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '32px',
            paddingTop: '24px'
          }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>🔍</span> Forensics Visibility
          </h4>
          <div
            className="admin-card"
            style={{
              padding: '20px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}
          >
            <p
              style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}
            >
              Control which diagnostic signals are broadcast to the Forensics trace panel.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { key: 'forensic_llm_start', label: 'LLM Initiation (Prompt Tracing)', icon: '🚀' },
                {
                  key: 'forensic_llm_finish',
                  label: 'LLM Completion (Output Tracing)',
                  icon: '✅'
                },
                {
                  key: 'forensic_llm_match',
                  label: 'Intelligence: Similarity Matches',
                  icon: '🤝'
                },
                {
                  key: 'forensic_llm_no_match',
                  label: 'Intelligence: Skips / Close-calls',
                  icon: '🚫'
                }
              ].map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item.label}</span>
                  </div>
                  <button
                    onClick={() =>
                      updateSetting(item.key, settings[item.key] === 'true' ? 'false' : 'true')
                    }
                    disabled={isSavingSetting === item.key}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '20px',
                      border: 'none',
                      background:
                        settings[item.key] === 'true' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minWidth: '70px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {(settings[item.key] || 'true') === 'true' ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="admin-section"
          style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '32px',
            paddingTop: '24px'
          }}
        >
          <h4
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ opacity: 0.7 }}>🛠️</span> Maintenance
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div
              className="admin-card"
              style={{
                padding: '16px',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(245, 158, 11, 0.2)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '8px', color: '#fcd34d' }}>
                Reset Analytics Context
              </h5>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px'
                }}
              >
                Clears the "analyzed" flag for all content AND deletes all pending AI proposals.
                Forces a complete re-analysis of your content.
              </p>
              <button
                className="btn-secondary"
                style={{ borderColor: '#f59e0b', color: '#f59e0b', width: '100%' }}
                onClick={() =>
                  setConfirmation({
                    title: 'Reset Analytics?',
                    message:
                      'Are you sure you want to reset all framework analysis? This will delete all pending suggestions and allow you to re-analyze everything from scratch.',
                    onConfirm: async () => {
                      try {
                        const data = await api.post<any>('/admin/reset-framework-analysis', {})
                        toast.success(`Reset flags for ${data.reset_count} items.`)
                      } catch (err) {
                        toast.error('Failed to reset analysis flags.')
                      }
                      setConfirmation(null)
                    }
                  })
                }
              >
                Reset Analysis Flags
              </button>
            </div>

            <div
              className="admin-card"
              style={{
                padding: '16px',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}
            >
              <h5 style={{ fontWeight: 600, marginBottom: '8px', color: '#fca5a5' }}>
                Wipe Framework Rules
              </h5>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px'
                }}
              >
                DANGEROUS: Deletes all Global Core rules, all Persona rules, and all proposals.
                Resets your practice intelligence to zero.
              </p>
              <button
                className="btn-secondary"
                style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%' }}
                onClick={() =>
                  setConfirmation({
                    title: 'Wipe All Rules?',
                    message:
                      'CRITICAL: This will PERMANENTLY DELETE all your framework rules and proposals. This cannot be undone. Are you absolutely sure?',
                    variant: 'danger',
                    onConfirm: async () => {
                      try {
                        const data = await api.post<any>('/admin/wipe-framework', {})
                        toast.success(`Wiped ${data.deleted_items} rules.`)
                      } catch (err) {
                        toast.error('Failed to wipe framework.')
                      }
                      setConfirmation(null)
                    }
                  })
                }
              >
                Wipe All Rules & Proposals
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmation && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          variant={confirmation.variant || 'primary'}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  )
}

export default AdminPanel
