import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api, Message } from '../services/api'
import { useNavbar } from '../hooks/useNavbar'

interface MessagesListProps {
  onSelectMessage: (id: number) => void
}

const MessagesList: React.FC<MessagesListProps> = ({ onSelectMessage }) => {
  const { setNavActions } = useNavbar()
  const [messages, setMessages] = useState<Message[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'archived'>('all')

  const fetchMessages = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const result = await api.getMessages()
      setMessages(result)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMessages()

    setNavActions([
      {
        label: '+ Create Message',
        onClick: () => window.dispatchEvent(new CustomEvent('trigger-message-modal'))
      }
    ])

    return () => setNavActions([])
  }, [fetchMessages, setNavActions])

  // ⚡ Bolt: Memoize filtered messages and hoist `searchTerm.toLowerCase()` to avoid O(N) string operations on every render
  const filteredMessages = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase()
    return messages.filter((m) => {
      const matchesSearch =
        (m.draft_text || '').toLowerCase().includes(lowerSearch) ||
        (m.person?.name || '').toLowerCase().includes(lowerSearch) ||
        (m.group?.name || '').toLowerCase().includes(lowerSearch)

      const matchesFilter = filter === 'all' || m.status === filter

      return matchesSearch && matchesFilter
    })
  }, [messages, searchTerm, filter])

  return (
    <div className="messages-list-container" style={{ padding: '24px' }}>
      <div
        className="list-header"
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}
      >
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            width: '100%',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search messages..."
              style={{ flex: 1, maxWidth: '400px', margin: 0 }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="search-input"
              style={{ width: '180px', margin: 0 }}
              value={filter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setFilter(e.target.value as 'all' | 'draft' | 'sent' | 'archived')
              }
            >
              <option value="all">All Status</option>
              <option value="draft">Drafts</option>
              <option value="sent">Sent</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
          <div className="loader" />
        </div>
      ) : filteredMessages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px', opacity: 0.5 }}>
          No messages found matching your criteria.
        </div>
      ) : (
        <div
          className="messages-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '20px'
          }}
        >
          {filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className="message-card"
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'transform 0.2s, background-color 0.2s'
              }}
              onClick={() => onSelectMessage(msg.id)}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}
              >
                <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                  {msg.person?.name
                    ? `👤 ${msg.person.name}`
                    : msg.group?.name
                      ? `👥 ${msg.group.name}`
                      : 'No Contact Assigned'}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor:
                      msg.status === 'sent'
                        ? 'rgba(74, 222, 128, 0.2)'
                        : msg.status === 'draft'
                          ? 'rgba(251, 191, 36, 0.2)'
                          : 'rgba(148, 163, 184, 0.2)',
                    color:
                      msg.status === 'sent'
                        ? '#4ade80'
                        : msg.status === 'draft'
                          ? '#fbbf24'
                          : '#94a6b8',
                    textTransform: 'uppercase'
                  }}
                >
                  {msg.status}
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.95rem',
                  opacity: 0.8,
                  lineHeight: '1.5',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  minHeight: '6rem'
                }}
              >
                {msg.draft_text || msg.sent_text || 'Empty message content...'}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '16px',
                  fontSize: '0.8rem',
                  opacity: 0.5
                }}
              >
                <span>📅 {msg.date || msg.created_at?.split('T')[0] || 'N/A'}</span>
                {msg.note && (
                  <span style={{ color: 'var(--primary)', opacity: 0.8 }}>
                    🔗 {msg.note.title.substring(0, 24)}...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MessagesList
