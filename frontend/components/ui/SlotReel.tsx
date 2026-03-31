'use client';

import { useState, useEffect, useRef } from 'react';
import './slot-reel.css';

// Characters to spin through (like original slot machine)
const SLOT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface SlotReelProps {
  targetChar: string;
  isSpinning: boolean;
  duration?: number;
  delay?: number;
}

function SlotReel({ targetChar, isSpinning, duration = 2000, delay = 0 }: SlotReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chars = SLOT_CHARS.split('');
  const numChars = chars.length;
  const rotate = 360 / numChars;
  const charHeight = 40;
  const translateZ = (charHeight / 2) / Math.tan((rotate / 2 / 180) * Math.PI);

  // Find target index
  const targetIndex = chars.indexOf(targetChar.toUpperCase());
  const finalIndex = targetIndex >= 0 ? targetIndex : 0;

  const [currentDeg, setCurrentDeg] = useState(finalIndex * rotate);

  useEffect(() => {
    if (!containerRef.current) return;

    if (isSpinning) {
      // Calculate target: 5 full spins + land on target
      const spins = 5;
      const targetDeg = (360 * spins) + (finalIndex * rotate);

      // Apply animation after delay
      const timeout = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.1, 0, 0.1, 1)`;
          containerRef.current.style.transform = `rotateX(-${targetDeg}deg)`;
        }
      }, delay);

      // Reset after animation completes
      const resetTimeout = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.transition = 'none';
          setCurrentDeg(finalIndex * rotate);
          containerRef.current.style.transform = `rotateX(-${finalIndex * rotate}deg)`;
        }
      }, delay + duration + 50);

      return () => {
        clearTimeout(timeout);
        clearTimeout(resetTimeout);
      };
    } else {
      // Set to target position
      if (containerRef.current) {
        containerRef.current.style.transition = 'none';
        containerRef.current.style.transform = `rotateX(-${finalIndex * rotate}deg)`;
      }
    }
  }, [isSpinning, finalIndex, rotate, duration, delay]);

  return (
    <div className="slot-reel-wrapper">
      <div
        ref={containerRef}
        className="slot-reel-container"
        style={{
          transform: `rotateX(-${currentDeg}deg)`,
        }}
      >
        {chars.map((char, index) => (
          <div
            key={index}
            className="slot-char font-bold"
            style={{
              transform: `rotateX(${rotate * index}deg) translateZ(${translateZ}px)`,
            }}
          >
            {char}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SlotMachineTextProps {
  text: string;
  isSpinning: boolean;
  onComplete?: () => void;
  duration?: number;
}

export function SlotMachineText({ text, isSpinning, onComplete, duration = 2000 }: SlotMachineTextProps) {
  const chars = text.split('');

  useEffect(() => {
    if (isSpinning) {
      // Call onComplete after all animations finish
      const totalDuration = duration + (chars.length * 150) + 100;
      const timeout = setTimeout(() => {
        onComplete?.();
      }, totalDuration);
      return () => clearTimeout(timeout);
    }
  }, [isSpinning, duration, chars.length, onComplete]);

  return (
    <div className="slot-machine-text">
      {chars.map((char, index) => (
        <div key={index} className="slot-reel-cell">
          <SlotReel
            targetChar={char}
            isSpinning={isSpinning}
            duration={duration}
            delay={index * 150} // Stagger each reel
          />
          {/* Add fence between ALL letters (not after the last one) */}
          {index < chars.length - 1 && (
            <div className="slot-fence" />
          )}
        </div>
      ))}
    </div>
  );
}

