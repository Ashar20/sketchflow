'use client';

import React from 'react';
import type { CardComponentProps } from 'nextstepjs';

const CARD_BG = '#0a0a0a';
const BORDER = '#00E5FF';
const TEXT = '#e5e5e5';
const TEXT_MUTED = '#a3a3a3';
const BUTTON_PRIMARY_BG = '#00E5FF';
const BUTTON_PRIMARY_TEXT = '#0a0a0a';
const BUTTON_SECONDARY_BG = 'rgba(255,255,255,0.1)';
const BUTTON_SECONDARY_TEXT = '#e5e5e5';

export function OnboardingCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  return (
    <div
      style={{
        backgroundColor: CARD_BG,
        color: TEXT,
        borderRadius: '0.75rem',
        border: `3px solid ${BORDER}`,
        boxShadow: `0 0 20px rgba(0, 229, 255, 0.2), 4px 4px 0 #000`,
        padding: '1.25rem',
        maxWidth: '32rem',
        minWidth: '16rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          gap: '0.75rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: TEXT,
            margin: 0,
          }}
        >
          {step.title}
        </h2>
        {step.icon && (
          <span style={{ fontSize: '1.5rem' }}>{step.icon}</span>
        )}
      </div>

      <div
        style={{
          marginBottom: '1rem',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          color: TEXT,
        }}
      >
        {step.content}
      </div>

      <div
        style={{
          marginBottom: '1rem',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '9999px',
          height: '6px',
        }}
      >
        <div
          style={{
            backgroundColor: BORDER,
            height: '6px',
            borderRadius: '9999px',
            width: `${((currentStep + 1) / totalSteps) * 100}%`,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.75rem',
        }}
      >
        <button
          type="button"
          onClick={prevStep}
          style={{
            padding: '0.5rem 1rem',
            fontWeight: '600',
            color: BUTTON_SECONDARY_TEXT,
            backgroundColor: BUTTON_SECONDARY_BG,
            border: `2px solid ${BORDER}`,
            borderRadius: '0.5rem',
            cursor: 'pointer',
            display: step.showControls ? 'block' : 'none',
          }}
          disabled={currentStep === 0}
        >
          Previous
        </button>
        <span style={{ color: TEXT_MUTED, whiteSpace: 'nowrap' }}>
          {currentStep + 1} of {totalSteps}
        </span>
        {currentStep === totalSteps - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: '600',
              color: BUTTON_PRIMARY_TEXT,
              backgroundColor: BUTTON_PRIMARY_BG,
              border: `2px solid ${BORDER}`,
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: step.showControls ? 'block' : 'none',
            }}
          >
            Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={nextStep}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: '600',
              color: BUTTON_PRIMARY_TEXT,
              backgroundColor: BUTTON_PRIMARY_BG,
              border: `2px solid ${BORDER}`,
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: step.showControls ? 'block' : 'none',
            }}
          >
            Next
          </button>
        )}
      </div>

      {arrow}

      {skipTour != null && currentStep < totalSteps - 1 && (
        <button
          type="button"
          onClick={skipTour}
          style={{
            marginTop: '1rem',
            fontSize: '0.75rem',
            width: '100%',
            padding: '0.5rem 1rem',
            fontWeight: '500',
            color: TEXT_MUTED,
            backgroundColor: 'transparent',
            border: `1px solid ${TEXT_MUTED}`,
            borderRadius: '0.5rem',
            cursor: 'pointer',
            display: step.showSkip ? 'block' : 'none',
          }}
        >
          Skip Tour
        </button>
      )}
    </div>
  );
}
