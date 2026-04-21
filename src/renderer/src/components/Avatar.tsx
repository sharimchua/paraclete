import React from 'react'

// NOTE: PLANT_TYPES and PLANT_COLORS are exported from avatarConstants.ts to avoid
// Fast Refresh configuration issues with mixed component and constant exports.

interface AvatarProps {
  avatarLogo?: string
  name: string
  size?: number
  style?: React.CSSProperties
}

export const Avatar: React.FC<AvatarProps> = ({ avatarLogo, name, size = 150, style }) => {
  const isBuiltIn = avatarLogo && avatarLogo.startsWith('plant:')

  // Parse plant string if built-in (format: 'plant:type:color')
  let plantType = 'fern'
  let plantColor = '#4ade80'
  if (isBuiltIn) {
    const parts = avatarLogo.split(':')
    if (parts.length === 3) {
      plantType = parts[1]
      plantColor = parts[2]
    }
  }

  const baseStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: isBuiltIn ? '#f8fafc' : 'linear-gradient(135deg, var(--primary), var(--secondary))',
    color: 'var(--bg-deep)',
    fontSize: `${size * 0.4}px`,
    fontWeight: 700,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    flexShrink: 0,
    ...style
  }

  if (avatarLogo && !isBuiltIn) {
    return (
      <div style={baseStyle}>
        <img
          src={avatarLogo}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            // Fallback to initial if image fails to load
            e.currentTarget.style.display = 'none'
            if (e.currentTarget.parentElement) {
              e.currentTarget.parentElement.innerText = name.charAt(0).toUpperCase()
            }
          }}
        />
      </div>
    )
  }

  if (isBuiltIn) {
    // High quality deep plant SVG representations
    const renderPlantSvg = (): React.ReactElement => {
      const svgProps = {
        width: '85%',
        height: '85%',
        viewBox: '0 0 100 100',
        xmlns: 'http://www.w3.org/2000/svg'
      }

      const darkStroke = 'rgba(15, 23, 42, 0.8)' // Deep slate border for strong contrast

      switch (plantType) {
        case 'fern':
          return (
            <svg {...svgProps}>
              <path d="M50 90 L50 15" stroke={darkStroke} strokeWidth="6" strokeLinecap="round" />
              <path
                d="M50 75 Q75 60 90 40 Q75 45 50 55"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 75 Q25 60 10 40 Q25 45 50 55"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 55 Q75 45 85 25 Q65 30 50 40"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 55 Q25 45 15 25 Q35 30 50 40"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 35 Q65 25 70 10 Q55 20 50 25"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 35 Q35 25 30 10 Q45 20 50 25"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </svg>
          )

        case 'cactus':
          return (
            <svg {...svgProps}>
              <path
                d="M30 35 L30 55 Q30 65 45 65"
                fill="none"
                stroke={darkStroke}
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M30 35 L30 55 Q30 65 45 65"
                fill="none"
                stroke={plantColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M70 25 L70 45 Q70 55 55 55"
                fill="none"
                stroke={darkStroke}
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M70 25 L70 45 Q70 55 55 55"
                fill="none"
                stroke={plantColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="35"
                y="15"
                width="30"
                height="75"
                rx="15"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
              />
              <line
                x1="45"
                y1="20"
                x2="45"
                y2="85"
                stroke={darkStroke}
                strokeWidth="3"
                opacity="0.3"
                strokeLinecap="round"
              />
              <line
                x1="55"
                y1="20"
                x2="55"
                y2="85"
                stroke={darkStroke}
                strokeWidth="3"
                opacity="0.3"
                strokeLinecap="round"
              />
              <path
                d="M35 30 L30 25 M65 40 L70 35 M35 60 L30 55"
                stroke={darkStroke}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="50" cy="15" r="9" fill="#f43f5e" stroke={darkStroke} strokeWidth="3" />
              <circle cx="50" cy="15" r="4" fill="#fbbf24" stroke="none" />
            </svg>
          )

        case 'succulent':
          return (
            <svg {...svgProps}>
              <path
                d="M50 50 L20 15 Q50 -5 80 15 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L80 85 Q50 105 20 85 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L15 80 Q-5 50 15 20 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L85 20 Q105 50 85 80 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M50 50 L35 15 Q50 5 65 15 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L65 85 Q50 95 35 85 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L15 65 Q5 50 15 35 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <path
                d="M50 50 L85 35 Q95 50 85 65 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <circle
                cx="50"
                cy="50"
                r="12"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3"
              />
              <circle cx="50" cy="50" r="4" fill={darkStroke} opacity="0.3" />
            </svg>
          )

        case 'monstera':
          return (
            <svg {...svgProps}>
              <path
                d="M50 95 Q40 60 50 30"
                stroke={darkStroke}
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M50 95 C10 85 -5 30 50 5 C105 30 90 85 50 95 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 95 Q40 60 50 30"
                stroke="#f8fafc"
                strokeWidth="2"
                fill="none"
                opacity="0.5"
              />
              <circle cx="30" cy="40" r="7" fill="#f8fafc" stroke={darkStroke} strokeWidth="3" />
              <circle cx="22" cy="65" r="5" fill="#f8fafc" stroke={darkStroke} strokeWidth="3" />
              <circle cx="70" cy="40" r="7" fill="#f8fafc" stroke={darkStroke} strokeWidth="3" />
              <circle cx="78" cy="65" r="5" fill="#f8fafc" stroke={darkStroke} strokeWidth="3" />
            </svg>
          )

        case 'bamboo':
          return (
            <svg {...svgProps}>
              <rect
                x="25"
                y="10"
                width="14"
                height="80"
                rx="4"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
              <line x1="25" y1="30" x2="39" y2="30" stroke={darkStroke} strokeWidth="3" />
              <line x1="25" y1="55" x2="39" y2="55" stroke={darkStroke} strokeWidth="3" />

              <rect
                x="48"
                y="25"
                width="16"
                height="70"
                rx="4"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
              <line x1="48" y1="45" x2="64" y2="45" stroke={darkStroke} strokeWidth="3" />
              <line x1="48" y1="70" x2="64" y2="70" stroke={darkStroke} strokeWidth="3" />

              <rect
                x="74"
                y="40"
                width="12"
                height="55"
                rx="4"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
              <line x1="74" y1="60" x2="86" y2="60" stroke={darkStroke} strokeWidth="3" />

              <path
                d="M39 30 Q50 20 60 25"
                fill="none"
                stroke={plantColor}
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M39 30 Q50 20 60 25"
                fill="none"
                stroke={darkStroke}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.8"
              />

              <path
                d="M64 45 Q80 35 90 45"
                fill="none"
                stroke={plantColor}
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M64 45 Q80 35 90 45"
                fill="none"
                stroke={darkStroke}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.8"
              />

              <path
                d="M25 55 Q10 50 5 65"
                fill="none"
                stroke={plantColor}
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M25 55 Q10 50 5 65"
                fill="none"
                stroke={darkStroke}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.8"
              />
            </svg>
          )

        case 'bonsai':
          return (
            <svg {...svgProps}>
              <path
                d="M50 90 Q65 70 50 50 Q30 30 25 40 M50 50 Q75 40 85 50"
                fill="none"
                stroke={darkStroke}
                strokeWidth="16"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M50 90 Q65 70 50 50 Q30 30 25 40 M50 50 Q75 40 85 50"
                fill="none"
                stroke="#78350f"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <ellipse
                cx="25"
                cy="35"
                rx="22"
                ry="14"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
              <ellipse
                cx="80"
                cy="45"
                rx="20"
                ry="12"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
              <ellipse
                cx="55"
                cy="25"
                rx="25"
                ry="16"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
            </svg>
          )

        case 'spider-plant':
          return (
            <svg {...svgProps}>
              <path
                d="M50 95 Q15 60 5 80"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 95 Q85 60 95 80"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 95 Q20 30 10 50"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 95 Q80 30 90 50"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 95 Q40 5 50 5"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 95 Q60 5 70 15"
                fill="none"
                stroke={plantColor}
                strokeWidth="10"
                strokeLinecap="round"
              />

              <path
                d="M50 95 Q15 60 5 80 M50 95 Q85 60 95 80 M50 95 Q20 30 10 50 M50 95 Q80 30 90 50 M50 95 Q40 5 50 5 M50 95 Q60 5 70 15"
                fill="none"
                stroke={darkStroke}
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              <circle
                cx="50"
                cy="90"
                r="10"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="3.5"
              />
            </svg>
          )

        case 'snake-plant':
          return (
            <svg {...svgProps}>
              <path
                d="M25 95 Q10 45 20 10 Q30 45 35 95 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M75 95 Q90 45 80 10 Q70 45 65 95 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M40 95 Q30 35 45 5 Q55 35 50 95 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M60 95 Q70 35 55 5 Q45 35 50 95 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M42 30 L48 25 L41 20 M58 35 L52 30 L59 25 M32 40 L28 35 L33 30 M68 45 L72 40 L67 35"
                stroke="#ffffff"
                strokeWidth="3"
                fill="none"
                opacity="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )

        case 'aloe':
          return (
            <svg {...svgProps}>
              <path
                d="M50 95 L20 40 Q25 45 35 55 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 95 L80 40 Q75 45 65 55 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M50 95 L5 60 Q15 65 25 75 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 95 L95 60 Q85 65 75 75 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M50 95 L30 20 Q40 35 45 55 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M50 95 L70 20 Q60 35 55 55 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />

              <path
                d="M50 95 L50 10 Q55 35 55 55 Z"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </svg>
          )

        case 'ficus':
          return (
            <svg {...svgProps}>
              <rect
                x="44"
                y="50"
                width="12"
                height="35"
                rx="3"
                fill="#78350f"
                stroke={darkStroke}
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="35"
                r="28"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
              />

              <circle cx="38" cy="28" r="12" fill="#ffffff" opacity="0.25" />
              <circle cx="65" cy="40" r="10" fill="#ffffff" opacity="0.25" />
              <circle cx="55" cy="20" r="8" fill="#ffffff" opacity="0.25" />
            </svg>
          )

        default:
          return (
            <svg {...svgProps}>
              <circle
                cx="50"
                cy="50"
                r="40"
                fill={plantColor}
                stroke={darkStroke}
                strokeWidth="4"
              />
            </svg>
          )
      }
    }

    return (
      <div style={{ ...baseStyle, border: `3px solid ${plantColor}40` }}>{renderPlantSvg()}</div>
    )
  }

  // Default to Initial
  return <div style={baseStyle}>{name ? name.charAt(0).toUpperCase() : '?'}</div>
}
