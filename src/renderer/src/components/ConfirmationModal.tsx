import React from 'react'

interface ConfirmationModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel
}) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div
        className="modal-content card"
        style={{ maxWidth: '450px', width: '90%', padding: '32px' }}
      >
        <h3
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            marginBottom: '12px',
            color: variant === 'danger' ? '#ef4444' : 'var(--text-primary)'
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: '0.95rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
            marginBottom: '32px'
          }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn-primary"
            onClick={onConfirm}
            style={variant === 'danger' ? { background: '#ef4444' } : {}}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
