import React, { useState, useEffect } from 'react';

const Logo: React.FC<{ 
  className?: string; 
  isThinking?: boolean; 
  isLlmReady?: boolean;
  isWarming?: boolean;
}> = ({ className, isThinking, isLlmReady, isWarming }) => {
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    setIsRendered(true);
  }, []);

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
      <rect 
          x="6" y="2" width="8" rx="4" 
          fill="url(#logo-grad-practitioner)" 
          style={{
              height: isRendered ? 28 : 0,
              transition: 'height 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
              animation: isThinking ? 'pulse-stem 2s infinite ease-in-out' : 'none'
          }}
      />
      <rect 
          x="18" y="2" width="8" rx="4" 
          fill="url(#logo-grad-ai)" 
          style={{
              height: isLlmReady ? 15 : (isWarming ? 8 : 0),
              transition: 'height 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              animation: isWarming ? 'warmup-ai 1.8s infinite ease-in-out' : (isThinking ? 'bounce-ai 1.2s infinite ease-in-out' : 'none'),
              opacity: (isLlmReady || isWarming) ? 1 : 0,
              transformOrigin: 'top center'
          }}
      />
      <style>{`
          @keyframes pulse-stem {
              0%, 100% { opacity: 1; filter: brightness(1); }
              50% { opacity: 0.8; filter: brightness(1.2); }
          }
          @keyframes bounce-ai {
              0%, 100% { height: 15px; filter: brightness(1); }
              50% { height: 28px; filter: brightness(1.4); }
          }
          @keyframes warmup-ai {
              0%, 100% { height: 8px; filter: brightness(0.8) saturate(0.6); opacity: 0.6; }
              50% { height: 15px; filter: brightness(1.2) saturate(1.2); opacity: 1; }
          }
      `}</style>
    </svg>
  );
};

export default Logo;
