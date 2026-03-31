'use client';

import { ReactNode } from 'react';

interface NoiseEffectProps {
  children: ReactNode;
  opacity?: number;
  className?: string;
  blendMode?: 'overlay' | 'multiply' | 'screen' | 'soft-light' | 'hard-light' | 'normal';
}

export function NoiseEffect({ 
  children, 
  opacity = 0.15, 
  className = '',
  blendMode = 'overlay'
}: NoiseEffectProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {/* Noise overlay */}
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'url(/noise-2.gif)',
          backgroundRepeat: 'repeat',
          backgroundSize: '150px 150px',
          opacity: opacity,
          mixBlendMode: blendMode,
          zIndex: 9999,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// Full-screen noise overlay variant - use this in layout for global effect
export function NoiseOverlay({ 
  opacity = 0.12,
  blendMode = 'overlay'
}: { 
  opacity?: number;
  blendMode?: 'overlay' | 'multiply' | 'screen' | 'soft-light' | 'hard-light' | 'normal';
}) {
  return (
    <div 
      className="pointer-events-none fixed inset-0"
      style={{
        backgroundImage: 'url(/noise-2.gif)',
        backgroundRepeat: 'repeat',
        backgroundSize: '150px 150px',
        opacity: opacity,
        mixBlendMode: blendMode,
        zIndex: 9999,
      }}
      aria-hidden="true"
    />
  );
}
