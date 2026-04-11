import React, { useState, useEffect } from 'react';

const Logo: React.FC<{ className?: string; isThinking?: boolean }> = ({ className, isThinking }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Tiny delay to ensure the mount animation fires safely on startup
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
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
      {/* The Practitioner - Constant Stem */}
      <rect 
          x="6" y="2" width="8" rx="4" 
          fill="url(#logo-grad-practitioner)" 
          style={{
              height: isMounted ? 28 : 0,
              transition: 'height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
              animation: isThinking ? 'pulse-stem 2s infinite ease-in-out' : 'none'
          }}
      />
      {/* The AI - Shorter right bar that animates when LLM is active */}
      <rect 
          x="18" y="2" width="8" rx="4" 
          fill="url(#logo-grad-ai)" 
          style={{
              height: isMounted ? 15 : 0,
              transition: 'height 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s', /* Staggered load */
              animation: isThinking ? 'bounce-ai 1.2s infinite ease-in-out' : 'none',
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
      `}</style>
    </svg>
  );
};

export default Logo;
