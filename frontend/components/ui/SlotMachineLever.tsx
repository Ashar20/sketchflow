'use client';

import { useState, useCallback } from 'react';
import { SlotMachineText } from './SlotReel';
import './slot-machine-lever.css';
import './slot-reel.css';

interface SlotMachineLeverButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** CSS color for the lever ball (e.g. #dc2626 or theme color) */
  leverColor?: string;
}

export function SlotMachineLeverButton({
  text,
  onClick,
  disabled = false,
  className = '',
  leverColor,
}: SlotMachineLeverButtonProps) {
  const [isPulled, setIsPulled] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const handlePull = useCallback(() => {
    if (disabled || isPulled) return;

    setIsPulled(true);
    setIsSpinning(true);

    // Reset lever after pull animation
    setTimeout(() => {
      setIsPulled(false);
    }, 500);

    // Trigger the action and stop spinning after animation
    setTimeout(() => {
      setIsSpinning(false);
      onClick();
    }, 1500); // Wait for spin animation
  }, [disabled, isPulled, onClick]);

  return (
    <div
      className={`slot-machine-button ${className} ${disabled ? 'disabled' : ''}`}
      style={leverColor ? ({ '--lever-color': leverColor } as React.CSSProperties) : undefined}
    >
      {/* Main button body */}
      <div className="slot-body">
        <div className="slot-window">
          <SlotMachineText
            text={text}
            isSpinning={isSpinning}
            duration={1200}
          />
        </div>
      </div>

      {/* Lever mechanism */}
      <div className={`slot-lever ${isPulled ? 'pulled' : ''}`}>
        <div className="lever-stick-base" />
        <div className="lever-stick" />
        <div
          className="lever-ball"
          onClick={handlePull}
        />
      </div>
    </div>
  );
}

