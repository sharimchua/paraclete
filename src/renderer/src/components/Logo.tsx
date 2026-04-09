import React from 'react';

const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg 
        width="32" 
        height="32" 
        viewBox="0 0 32 32" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={className}
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
      <rect x="6" y="2" width="8" height="28" rx="4" fill="url(#logo-grad-practitioner)" />
      {/* The AI - Moved up to form the 'P' loop shape while remaining beside */}
      <rect x="18" y="2" width="8" height="15" rx="4" fill="url(#logo-grad-ai)" />
    </svg>
  );
};

export default Logo;
