'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface TokenPair {
  symbol: string;
  display: string;
  available: boolean;
}

interface TokenPairContextType {
  selectedPair: string;
  availablePairs: TokenPair[];
  setSelectedPair: (symbol: string) => Promise<void>;
  isLoading: boolean;
}

const TokenPairContext = createContext<TokenPairContextType | undefined>(undefined);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export function TokenPairProvider({ children }: { children: ReactNode }) {
  const [selectedPair, setSelectedPairState] = useState<string>('FLOWUSDT');
  const [availablePairs, setAvailablePairs] = useState<TokenPair[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available pairs on mount
  useEffect(() => {
    async function fetchPairs() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/token-pairs`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Backend responded with status ${response.status}`);
        }

        const data = await response.json();
        setAvailablePairs(data.pairs || []);

        // Fetch current pair from backend
        try {
          const currentResponse = await fetch(`${BACKEND_URL}/api/token-pairs/current`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (currentResponse.ok) {
            const currentData = await currentResponse.json();
            if (currentData.symbol) {
              setSelectedPairState(currentData.symbol);
            }
          }
        } catch (currentError) {
          console.warn('Failed to fetch current pair, using default:', currentError);
          // Continue with default FLOWUSDT
        }
      } catch (error) {
        console.error('Failed to fetch token pairs from backend:', error);
        console.warn(`Backend URL: ${BACKEND_URL}. Make sure the backend server is running on port 3001.`);
        // Set default pairs if backend is unavailable
        setAvailablePairs([
          { symbol: 'FLOWUSDT', display: 'FLOW/USDT', available: true },
          { symbol: 'BTCUSDT', display: 'BTC/USDT', available: true },
          { symbol: 'ETHUSDT', display: 'ETH/USDT', available: true },
          { symbol: 'AAVEUSDT', display: 'AAVE/USDT', available: true },
          { symbol: 'DOGEUSDT', display: 'DOGE/USDT', available: true },
          { symbol: 'SOLUSDT', display: 'SOL/USDT', available: false },
          { symbol: 'BNBUSDT', display: 'BNB/USDT', available: false },
          { symbol: 'XRPUSDT', display: 'XRP/USDT', available: false },
          { symbol: 'ADAUSDT', display: 'ADA/USDT', available: false },
          { symbol: 'MATICUSDT', display: 'MATIC/USDT', available: false },
          { symbol: 'DOTUSDT', display: 'DOT/USDT', available: false },
        ]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPairs();
  }, []);

  const setSelectedPair = async (symbol: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/token-pairs/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol }),
      });

      if (!response.ok) {
        throw new Error('Failed to select pair');
      }

      setSelectedPairState(symbol);
    } catch (error) {
      console.error('Failed to select pair:', error);
      throw error;
    }
  };

  return (
    <TokenPairContext.Provider
      value={{
        selectedPair,
        availablePairs,
        setSelectedPair,
        isLoading,
      }}
    >
      {children}
    </TokenPairContext.Provider>
  );
}

export function useTokenPair() {
  const context = useContext(TokenPairContext);
  if (context === undefined) {
    throw new Error('useTokenPair must be used within a TokenPairProvider');
  }
  return context;
}
