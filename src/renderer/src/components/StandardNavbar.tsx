import React from 'react'
import { Action } from '../contexts/NavbarContext'
import { useNavbar } from '../hooks/useNavbar'

interface StandardNavbarProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  actions?: Action[]
  customContent?: React.ReactNode
}

const StandardNavbar: React.FC<StandardNavbarProps> = ({
  title: propTitle,
  showBack,
  onBack,
  actions: propsActions = [],
  customContent: propCustomContent
}) => {
  const { navActions, title: contextTitle, customContent: contextCustomContent } = useNavbar()

  // Prioritize dynamic title from context if available
  const displayTitle = contextTitle || propTitle
  const activeCustomContent = contextCustomContent || propCustomContent

  // Merge props actions with context actions, prioritizing props for now if they exist
  // but the plan suggests context will be the primary source.
  const allActions = [...navActions, ...propsActions]

  return (
    <header
      className="header"
      style={{
        height: '64px',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        zIndex: 100,
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden'
        }}
      >
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Go Back"
            className="btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '32px',
              background: 'rgba(255,255,255,0.03)',
              flexShrink: 0
            }}
          >
            <span style={{ fontSize: '1.2rem', marginTop: '-2px' }}>&lsaquo;</span> Back
          </button>
        )}
        <h2
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {displayTitle}
        </h2>
      </div>

      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          height: '100%',
          padding: '0 10px 0 20px'
        }}
      >
        {activeCustomContent}

        {activeCustomContent && allActions.length > 0 && (
          <div
            style={{
              width: '1px',
              height: '24px',
              background: 'var(--border)',
              margin: '0 10px 0 24px',
              opacity: 0.5,
              flexShrink: 0
            }}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flex: '0 0 auto',
          justifyContent: 'flex-end'
        }}
      >
        {allActions.map((action, i) => {
          if (action.isSeparator) {
            return (
              <div
                key={i}
                style={{
                  width: '1px',
                  height: '24px',
                  background: 'var(--border)',
                  margin: '0 4px',
                  opacity: 0.5
                }}
              />
            )
          }
          return (
            <button
              key={i}
              className={
                action.variant === 'secondary'
                  ? 'btn-secondary'
                  : action.variant === 'danger'
                    ? 'btn-danger'
                    : 'btn-primary'
              }
              onClick={action.onClick}
              disabled={action.disabled}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                height: '34px',
                opacity: action.disabled ? 0.5 : 1
              }}
            >
              {action.label}
            </button>
          )
        })}
      </div>
    </header>
  )
}

export default StandardNavbar
