'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTokenPair } from '@/contexts/TokenPairContext';

export function TokenPairSelector() {
  const { selectedPair, availablePairs, setSelectedPair, isLoading } = useTokenPair();
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const selectedPairData = availablePairs.find(p => p.symbol === selectedPair);

  const handleSelect = async (symbol: string) => {
    const pair = availablePairs.find(p => p.symbol === symbol);
    if (!pair || !pair.available) {
      return; // Don't allow selection of unavailable pairs
    }

    if (symbol === selectedPair) {
      setIsOpen(false);
      return;
    }

    setIsChanging(true);
    try {
      await setSelectedPair(symbol);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to change pair:', error);
      alert('Failed to change token pair. Please try again.');
    } finally {
      setIsChanging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-2 bg-[#000000]/60 border-2 border-[#00E5FF] rounded-lg">
        <span className="text-sm text-[#00E5FF]">Loading pairs...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isChanging}
        className="px-4 py-2 bg-[#000000]/60 border-2 border-[#00E5FF] rounded-lg hover:bg-[#000000]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="text-sm font-bold text-[#00E5FF]">
          {isChanging ? 'Changing...' : selectedPairData?.display || selectedPair}
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className="absolute top-full left-0 mt-2 z-50 bg-[#0a0a0a] border-4 border-[#00E5FF] rounded-xl shadow-[6px_6px_0_0_#000000] min-w-[200px] max-h-[400px] overflow-y-auto"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="p-2 space-y-1">
                {availablePairs.map((pair) => (
                  <motion.button
                    key={pair.symbol}
                    onClick={() => handleSelect(pair.symbol)}
                    disabled={!pair.available || isChanging}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors relative group ${pair.symbol === selectedPair
                        ? 'bg-[#00E5FF]/20 border-2 border-[#00E5FF]'
                        : pair.available
                          ? 'hover:bg-[#000000]/60 border-2 border-transparent hover:border-[#00E5FF]/50'
                          : 'opacity-50 cursor-not-allowed border-2 border-transparent'
                      }`}
                    whileHover={pair.available ? { x: -2, y: -2 } : {}}
                    whileTap={pair.available ? { scale: 0.98 } : {}}
                    title={pair.available ? undefined : 'Coming soon'}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-bold ${pair.symbol === selectedPair
                            ? 'text-[#00E5FF]'
                            : pair.available
                              ? 'text-white'
                              : 'text-white/50'
                          }`}
                      >
                        {pair.display}
                      </span>
                      {pair.symbol === selectedPair && (
                        <span className="text-[#00E5FF]">✓</span>
                      )}
                    </div>
                    {!pair.available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                        <span className="text-xs text-[#00E5FF] font-bold">Coming Soon</span>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
