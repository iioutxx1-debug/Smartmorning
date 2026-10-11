import React from 'react';

interface SmartMorningIconProps {
  className?: string;
  size?: number;
}

export const SmartMorningIcon: React.FC<SmartMorningIconProps> = ({
  className = '',
  size = 44,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="SmartMorning Icon"
    >
      <defs>
        <linearGradient id="sm_sky_grad" x1="60" y1="0" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2A7AE2" />
          <stop offset="65%" stopColor="#76B9FA" />
          <stop offset="100%" stopColor="#FDE68A" />
        </linearGradient>
        <linearGradient id="sm_sun_grad" x1="60" y1="36" x2="60" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="sm_wave1" x1="0" y1="68" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="sm_wave2" x1="0" y1="78" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id="sm_wave3" x1="0" y1="90" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#152C5B" />
          <stop offset="100%" stopColor="#0F1E3D" />
        </linearGradient>
        <clipPath id="sm_rounded_rect">
          <rect x="0" y="0" width="120" height="120" rx="28" />
        </clipPath>
      </defs>

      <g clipPath="url(#sm_rounded_rect)">
        {/* Sky Background */}
        <rect x="0" y="0" width="120" height="120" fill="url(#sm_sky_grad)" />

        {/* Subtle Sunrise Rays */}
        <g opacity="0.35" stroke="#FEF08A" strokeWidth="2.5" strokeLinecap="round">
          <line x1="60" y1="20" x2="60" y2="30" />
          <line x1="34" y1="28" x2="41" y2="36" />
          <line x1="86" y1="28" x2="79" y2="36" />
          <line x1="20" y1="46" x2="30" y2="50" />
          <line x1="100" y1="46" x2="90" y2="50" />
        </g>

        {/* Golden Rising Sun */}
        <circle cx="60" cy="64" r="23" fill="url(#sm_sun_grad)" />

        {/* Back Mountain / Wave */}
        <path
          d="M-5 74 C25 63, 48 80, 78 69 C98 62, 112 70, 125 73 L125 125 L-5 125 Z"
          fill="url(#sm_wave1)"
        />

        {/* Middle Mountain / Wave */}
        <path
          d="M-5 84 C28 92, 56 72, 92 82 C106 86, 116 83, 125 80 L125 125 L-5 125 Z"
          fill="url(#sm_wave2)"
        />

        {/* Deep Navy Foreground Wave */}
        <path
          d="M-5 95 C30 86, 72 103, 125 90 L125 125 L-5 125 Z"
          fill="url(#sm_wave3)"
        />
      </g>
    </svg>
  );
};
