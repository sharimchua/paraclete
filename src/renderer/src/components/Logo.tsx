import React from 'react';

const Logo: React.FC<{ className?: string; isThinking?: boolean }> = ({ className, isThinking }) => {
  return (
    <svg 
        width="32" 
        height="32" 
        viewBox="0 0 32 32" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{
            filter: isThinking ? 'drop-shadow(0 0 8px var(--primary))' : 'none',
            transition: 'all 0.3s ease'
        }}
    >
      <defs>
        <linearGradient id="logo-grad-practitioner" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="logo-grad-ai" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {/* The Practitioner - Constant Stem */}
      <rect 
          x="6" y="2" width="8" height="28" rx="4" 
          fill="url(#logo-grad-practitioner)" 
          style={{
              animation: isThinking ? 'pulse-stem 2s infinite ease-in-out' : 'none'
          }}
      />
      {/* The AI - Moved up to form the 'P' loop shape while remaining beside */}
      <rect 
          x="18" y="2" width="8" height="15" rx="4" 
          fill="url(#logo-grad-ai)" 
          style={{
              animation: isThinking ? 'float-ai 1.5s infinite ease-in-out' : 'none'
          }}
      />
      <style>{`
          @keyframes pulse-stem {
              0% { opacity: 1; }
              50% { opacity: 0.7; }
              100% { opacity: 1; }
          }
          @keyframes float-ai {
              0% { transform: translateY(0); }
              50% { transform: translateY(-4px); filter: brightness(1.2); }
              100% { transform: translateY(0); }
          }
      `}</style>
    </svg>
  );
};

export default Logo;
