'use client';

import { useEffect, useState } from 'react';
import './nyan-cat.css';

interface NyanCatProps {
  x: number;
  y: number;
  size?: number; // Scale factor, default 0.5 for smaller size
  isMobile?: boolean; // Adjust positioning for mobile
}

export function NyanCat({ x, y, size = 0.5, isMobile = false }: NyanCatProps) {
  const [frame, setFrame] = useState(1);

  // Animate through 6 frames - slower for smoother look
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev % 6) + 1);
    }, 150); // Slower animation

    return () => clearInterval(interval);
  }, []);

  const catWidth = 194 * size;
  const catHeight = 122 * size;
  
  // Position cat so rainbow connects to the pop-tart body (like original Nyan Cat)
  // Pop-tart body starts at ~52px from left edge of cat sprite (at scale 1)
  // Rainbow should end right at the pop-tart body edge
  const popTartBodyStart = 52 * size; // Where pop-tart body begins
  
  // Responsive Y offset: mobile needs less offset due to smaller chart
  const topOffset = isMobile ? catHeight * 0.6 : catHeight * 0.8;

  return (
    <div
      className={`nyan-cat frame${frame}`}
      style={{
        position: 'absolute',
        left: x - popTartBodyStart, // Position so pop-tart body edge is at x (rainbow end)
        top: y - topOffset, // Responsive: 0.6 for mobile, 0.8 for desktop
        transform: `scale(${size})`,
        transformOrigin: 'left center',
        zIndex: 1002, // Above the rainbow
        pointerEvents: 'none',
      }}
    >
      <div className="nyan-tail" />
      <div className="nyan-paws" />
      <div className="nyan-pop-tarts-body">
        <div className="nyan-pop-tarts-body-cream" />
      </div>
      <div className="nyan-head">
        <div className="nyan-face" />
      </div>
    </div>
  );
}

// Rainbow trail that follows a path of points - trails BEHIND the cat with wavy animation
interface RainbowPathTrailProps {
  points: Array<{ x: number; y: number }>;
  catX: number; // Cat's X position - rainbow ends here
  strokeWidth?: number;
}

export function RainbowPathTrail({ points, catX, strokeWidth = 14 }: RainbowPathTrailProps) {
  if (points.length < 2) return null;

  // Rainbow extends exactly to catX where it connects to the pop-tart body
  // Like the original Nyan Cat - rainbow goes right into the body
  const trailPoints = points.filter(p => p.x <= catX);
  
  if (trailPoints.length < 2) return null;

  // Create SVG path from points
  const pathD = trailPoints.reduce((acc, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    return `${acc} L ${point.x} ${point.y}`;
  }, '');

  // Rainbow colors from top to bottom (like original Nyan Cat)
  const rainbowColors = [
    '#ff0000', // Red
    '#ff9900', // Orange  
    '#ffff00', // bright trace
    '#33ff00', // Green
    '#0099ff', // Blue
    '#6633ff', // Purple
  ];

  const bandHeight = strokeWidth / 6;

  return (
    <svg
      className="rainbow-path-trail"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }}
    >
      {/* Wave A - bobs up and down */}
      <g className="rainbow-wave-a">
        {rainbowColors.map((color, index) => (
          <path
            key={`a-${color}`}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={bandHeight}
            strokeLinecap="square"
            strokeLinejoin="round"
            style={{
              transform: `translateY(${(index - 2.5) * bandHeight}px)`,
            }}
          />
        ))}
      </g>
      {/* Wave B - bobs opposite direction for wavy effect */}
      <g className="rainbow-wave-b">
        {rainbowColors.map((color, index) => (
          <path
            key={`b-${color}`}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={bandHeight}
            strokeLinecap="square"
            strokeLinejoin="round"
            style={{
              transform: `translateY(${(index - 2.5) * bandHeight}px)`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
