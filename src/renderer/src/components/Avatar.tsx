import React from 'react';

// Definitions for built-in SVG plants
export const PLANT_TYPES = [
    'fern', 'cactus', 'succulent', 'monstera', 'bamboo',
    'bonsai', 'spider-plant', 'snake-plant', 'aloe', 'ficus'
];

export const PLANT_COLORS = [
    '#4ade80', // green
    '#60a5fa', // blue
    '#f472b6', // red/pink
    '#fbbf24', // yellow/orange
    '#a78bfa', // purple
    '#2dd4bf'  // teal
];

interface AvatarProps {
    avatarLogo?: string;
    name: string;
    size?: number;
    style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = ({ avatarLogo, name, size = 150, style }) => {
    const isBuiltIn = avatarLogo && avatarLogo.startsWith('plant:');

    // Parse plant string if built-in (format: 'plant:type:color')
    let plantType = 'fern';
    let plantColor = '#4ade80';
    if (isBuiltIn) {
        const parts = avatarLogo.split(':');
        if (parts.length === 3) {
            plantType = parts[1];
            plantColor = parts[2];
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
    };

    if (avatarLogo && !isBuiltIn) {
        return (
            <div style={baseStyle}>
                <img
                    src={avatarLogo}
                    alt={name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                        // Fallback to initial if image fails to load
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                            e.currentTarget.parentElement.innerText = name.charAt(0).toUpperCase();
                        }
                    }}
                />
            </div>
        );
    }

    if (isBuiltIn) {
        // Simplified flat plant SVG representations
        const renderPlantSvg = () => {
            const svgProps = {
                width: "60%",
                height: "60%",
                viewBox: "0 0 100 100",
                fill: plantColor,
                xmlns: "http://www.w3.org/2000/svg"
            };

            switch (plantType) {
                case 'fern':
                    return <svg {...svgProps}><path d="M50 10 Q60 30 70 50 Q60 70 50 90 Q40 70 30 50 Q40 30 50 10 Z" /><path d="M50 90 L50 10" stroke="#fff" strokeWidth="2"/></svg>;
                case 'cactus':
                    return <svg {...svgProps}><rect x="35" y="20" width="30" height="70" rx="15" /><rect x="20" y="40" width="15" height="30" rx="7.5" /><rect x="65" y="50" width="15" height="20" rx="7.5" /></svg>;
                case 'succulent':
                    return <svg {...svgProps}><circle cx="50" cy="50" r="30" /><circle cx="35" cy="35" r="20" fillOpacity="0.8" /><circle cx="65" cy="35" r="20" fillOpacity="0.8" /><circle cx="50" cy="70" r="20" fillOpacity="0.8" /></svg>;
                case 'monstera':
                    return <svg {...svgProps}><path d="M50 10 C80 10 90 40 70 70 C50 100 30 70 10 40 C30 10 50 10 50 10 Z" /><circle cx="70" cy="40" r="5" fill="#f8fafc" /><circle cx="30" cy="50" r="8" fill="#f8fafc" /></svg>;
                case 'bamboo':
                    return <svg {...svgProps}><rect x="40" y="10" width="8" height="80" /><rect x="52" y="20" width="8" height="70" /><path d="M48 30 L60 20 M40 50 L25 45 M52 60 L70 55" stroke={plantColor} strokeWidth="4" strokeLinecap="round"/></svg>;
                case 'bonsai':
                    return <svg {...svgProps}><path d="M40 90 Q50 60 45 40 Q60 30 70 40" stroke="#8B4513" strokeWidth="8" fill="none" /><circle cx="45" cy="35" r="20" /><circle cx="70" cy="40" r="15" /></svg>;
                case 'spider-plant':
                    return <svg {...svgProps}><path d="M50 90 Q30 50 10 60 M50 90 Q20 40 20 20 M50 90 Q40 20 50 10 M50 90 Q60 20 80 20 M50 90 Q70 50 90 60" stroke={plantColor} strokeWidth="6" fill="none" strokeLinecap="round"/></svg>;
                case 'snake-plant':
                    return <svg {...svgProps}><path d="M50 90 Q40 50 45 10 Q50 50 55 10 Q60 50 50 90" /><path d="M30 90 Q25 60 35 30 Q40 60 30 90" /><path d="M70 90 Q75 60 65 30 Q60 60 70 90" /></svg>;
                case 'aloe':
                    return <svg {...svgProps}><polygon points="50,90 40,20 50,10 60,20" /><polygon points="45,90 20,40 25,35 35,45" /><polygon points="55,90 80,40 75,35 65,45" /></svg>;
                case 'ficus':
                    return <svg {...svgProps}><rect x="45" y="60" width="10" height="30" fill="#8B4513" /><circle cx="50" cy="40" r="30" /></svg>;
                default:
                    return <svg {...svgProps}><circle cx="50" cy="50" r="40" /></svg>;
            }
        };

        return (
            <div style={{...baseStyle, border: `2px solid ${plantColor}40`}}>
                {renderPlantSvg()}
            </div>
        );
    }

    // Default to Initial
    return (
        <div style={baseStyle}>
            {name ? name.charAt(0).toUpperCase() : '?'}
        </div>
    );
};
