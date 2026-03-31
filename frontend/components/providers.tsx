'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextStepProvider, NextStepReact } from 'nextstepjs';
import { TokenPairProvider } from '@/contexts/TokenPairContext';
import { OnboardingCard } from '@/components/onboarding/OnboardingCard';
import { onboardingSteps } from '@/lib/onboarding/predictTourSteps';
import { initFcl } from '@/lib/flow/fclConfig';
import { FlowWalletProvider } from '@/contexts/FlowWalletContext';

const ONBOARDING_SEEN_KEY = 'sketchflow-predict-onboarding-seen';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initFcl();
  }, []);

  const markOnboardingSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <FlowWalletProvider>
        <TokenPairProvider>
          <NextStepProvider>
            <NextStepReact
              steps={onboardingSteps}
              cardComponent={OnboardingCard}
              onComplete={markOnboardingSeen}
              onSkip={markOnboardingSeen}
            >
              {children}
            </NextStepReact>
          </NextStepProvider>
        </TokenPairProvider>
      </FlowWalletProvider>
    </QueryClientProvider>
  );
}
