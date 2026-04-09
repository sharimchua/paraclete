import React from 'react';

interface Action {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
}

interface StandardNavbarProps {
    title: string;
    showBack?: boolean;
    onBack?: () => void;
    actions?: Action[];
    customContent?: React.ReactNode;
}

const StandardNavbar: React.FC<StandardNavbarProps> = ({ 
    title, 
    showBack, 
    onBack, 
    actions = [], 
    customContent 
}) => {
    return (
        <header className="header" style={{
            height: '64px',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            zIndex: 100,
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '200px' }}>
                {showBack && (
                    <button 
                        onClick={onBack} 
                        className="btn-secondary" 
                        style={{ 
                            padding: '4px 10px', 
                            fontSize: '0.8rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            height: '32px',
                            background: 'rgba(255,255,255,0.03)'
                        }}
                    >
                        <span style={{ fontSize: '1.2rem', marginTop: '-2px' }}>&lsaquo;</span> Back
                    </button>
                )}
                <h2 style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 700, 
                    margin: 0, 
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)'
                }}>
                    {title}
                </h2>
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                {customContent}
            </div>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: '200px', justifyContent: 'flex-end' }}>
                {actions.map((action, i) => (
                    <button 
                        key={i}
                        className={action.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}
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
                ))}
            </div>
        </header>
    );
};

export default StandardNavbar;
