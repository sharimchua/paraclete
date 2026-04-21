import React, { useState } from 'react'
import { Avatar } from './Avatar'
import { PLANT_TYPES, PLANT_COLORS } from './avatarConstants'

interface AvatarSelectorProps {
  value: string
  onChange: (value: string) => void
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({ value, onChange }) => {
  const [prevValue, setPrevValue] = useState(value)
  const [mode, setMode] = useState<'url' | 'plant'>(value.startsWith('plant:') ? 'plant' : 'url')

  if (value !== prevValue) {
    setPrevValue(value)
    setMode(value.startsWith('plant:') ? 'plant' : 'url')
  }

  // Extract current plant state if applicable
  let currentPlantType = PLANT_TYPES[0]
  let currentPlantColor = PLANT_COLORS[0]

  if (value.startsWith('plant:')) {
    const parts = value.split(':')
    if (parts.length === 3) {
      currentPlantType = parts[1]
      currentPlantColor = parts[2]
    }
  }

  const handlePlantSelect = (type: string, color: string): void => {
    onChange(`plant:${type}:${color}`)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--bg-card)',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border)'
      }}
    >
      <div style={{ display: 'flex', gap: '16px' }}>
        <button
          type="button"
          className={`btn-secondary ${mode === 'url' ? 'active' : ''}`}
          style={{
            flex: 1,
            background: mode === 'url' ? 'var(--primary-faded)' : 'transparent',
            color: mode === 'url' ? 'var(--primary)' : 'var(--text)'
          }}
          onClick={() => setMode('url')}
        >
          Custom URL
        </button>
        <button
          type="button"
          className={`btn-secondary ${mode === 'plant' ? 'active' : ''}`}
          style={{
            flex: 1,
            background: mode === 'plant' ? 'var(--primary-faded)' : 'transparent',
            color: mode === 'plant' ? 'var(--primary)' : 'var(--text)'
          }}
          onClick={() => {
            setMode('plant')
            if (!value.startsWith('plant:')) {
              handlePlantSelect(currentPlantType, currentPlantColor)
            }
          }}
        >
          Plant Theme
        </button>
      </div>

      {mode === 'url' && (
        <div>
          <input
            type="url"
            className="input-field"
            placeholder="https://example.com/avatar.png"
            value={value.startsWith('plant:') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
          />
          {value && !value.startsWith('plant:') && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
              <Avatar avatarLogo={value} name="Preview" size={100} />
            </div>
          )}
        </div>
      )}

      {mode === 'plant' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                display: 'block'
              }}
            >
              Color
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PLANT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handlePlantSelect(currentPlantType, color)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: color,
                    border:
                      currentPlantColor === color
                        ? '3px solid var(--text)'
                        : '2px solid transparent',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                display: 'block'
              }}
            >
              Plant Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {PLANT_TYPES.map((type) => (
                <div
                  key={type}
                  onClick={() => handlePlantSelect(type, currentPlantColor)}
                  style={{
                    cursor: 'pointer',
                    border:
                      currentPlantType === type
                        ? `2px solid ${currentPlantColor}`
                        : '2px solid transparent',
                    borderRadius: '8px',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: currentPlantType === type ? `${currentPlantColor}10` : 'transparent'
                  }}
                >
                  <Avatar avatarLogo={`plant:${type}:${currentPlantColor}`} name={type} size={48} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
