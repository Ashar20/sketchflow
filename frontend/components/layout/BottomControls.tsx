'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { WalletIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

type PositionStatus = 'idle' | 'trading' | 'awaiting_settlement' | 'closed';

interface BottomControlsProps {
  selectedMinute: number | null;
  hasPoints: boolean;
  onClear: () => void;
  isConnected?: boolean;
  batchPnL?: number | null;
  /** Native wallet balance (FLOW), formatted for display */
  walletBalanceFlow?: string;
  walletBalanceLoading?: boolean;
  /** Status shown in the right slot (replaces "Draw" / "+Nm" when active) */
  isOpeningPosition?: boolean;
  positionStatus?: PositionStatus;
  statusMessageIndex?: number;
  timeRemaining?: number | null;
  /** Backend + client configured for sponsored payer (user does not pay network fees) */
  feeSponsorshipActive?: boolean;
}

const TRADING_MESSAGES = ['Trading...', 'Future booming...', 'Position active...'] as const;

export function BottomControls({
  selectedMinute,
  hasPoints,
  onClear,
  isConnected = false,
  batchPnL = null,
  walletBalanceFlow = '0.0000',
  walletBalanceLoading = false,
  isOpeningPosition = false,
  positionStatus = 'idle',
  statusMessageIndex = 0,
  timeRemaining = null,
  feeSponsorshipActive = false,
}: BottomControlsProps) {
  const showStatus = isOpeningPosition || positionStatus !== 'idle';
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-40"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="relative bg-[#000000]/95 backdrop-blur-xl border-t-4 border-[#00E5FF] shadow-[0_-4px_0_0_#0a0a0a]">
        <div className="px-2 py-2 sm:px-4 sm:py-5">
          <div className="max-w-7xl mx-auto">
            {/* Single row: Wallet, Profit, Status/+Nm/Draw, Clear */}
            <div className="flex items-center justify-between gap-1 sm:gap-2 md:gap-4 w-full flex-nowrap overflow-x-auto">
              {/* Left: Wallet & Profit */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Wallet pill - pixel look */}
                <motion.div
                  className="min-w-0 shrink-0 flex items-center gap-1 sm:gap-2"
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg border-2 sm:border-3 border-[#00E5FF] bg-[#000000]/50 shadow-[2px_2px_0_0_#00E5FF] sm:shadow-[3px_3px_0_0_#00E5FF]">
                    <WalletIcon className="w-6 h-6 sm:w-8 sm:h-8 text-[#00E5FF] shrink-0" aria-hidden />
                    <span className="font-mono text-xs sm:text-sm md:text-base text-gray-200 tracking-tight truncate">
                      {isConnected ? (walletBalanceLoading ? '...' : walletBalanceFlow) : '0.0000'} FLOW
                    </span>
                  </div>
                  {feeSponsorshipActive && (
                    <span
                      className="font-mono text-[9px] sm:text-xs text-emerald-400/90 border border-emerald-500/40 rounded px-1 py-0.5 sm:px-1.5 whitespace-nowrap shrink-0 leading-tight"
                      title="Sponsor pays network fees (gasless). You still sign once per open to authorize stake from your vault."
                    >
                      <span className="sm:hidden">no fee</span>
                      <span className="hidden sm:inline">fees sponsored</span>
                    </span>
                  )}
                </motion.div>

                {/* Profit pill - pixel look */}
                <motion.div
                  className="min-w-0 shrink-0"
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg border-2 sm:border-3 border-[#00E5FF] bg-[#000000]/50 shadow-[2px_2px_0_0_#00E5FF] sm:shadow-[3px_3px_0_0_#00E5FF]">
                    <CurrencyDollarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-[#00E5FF] shrink-0" aria-hidden />
                    <span
                      className={`font-mono text-xs sm:text-sm md:text-base tracking-tight truncate ${batchPnL !== null
                        ? batchPnL >= 0
                          ? 'text-emerald-300'
                          : 'text-red-300'
                        : 'text-[#00E5FF]'
                        }`}
                    >
                      {batchPnL !== null
                        ? `${batchPnL >= 0 ? '+' : ''}${batchPnL.toFixed(2)}`
                        : '+0.00'}
                    </span>
                  </div>
                </motion.div>
              </div>

              {/* Right: Status (Opening/Trading/Settlement/PnL) or +Nm or Draw & Clear */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Status: opening, trading, awaiting settlement, or closed PnL */}
                {showStatus ? (
                  <motion.div
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 bg-[#0a0a0a]/80 border-2 border-[#00E5FF] rounded-lg shadow-[2px_2px_0_0_#00E5FF] min-w-0"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500 }}
                  >
                    <motion.span
                      className="text-[#00E5FF] shrink-0"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                        strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17.25V21h3.75M21 3l-9.4 9.4a2.25 2.25 0 01-3.183 0l-2.358-2.362A2.251 2.251 0 003 12.94" />
                      </svg>
                    </motion.span>
                    <span className="text-xs sm:text-sm font-bold text-[#00E5FF] truncate">
                      {isOpeningPosition && 'Opening position...'}
                      {!isOpeningPosition && positionStatus === 'trading' && (
                        <>
                          {TRADING_MESSAGES[statusMessageIndex % TRADING_MESSAGES.length]}
                          {timeRemaining !== null && timeRemaining > 0 && (
                            <span className="ml-1 text-[#00E5FF]/80">({timeRemaining}s)</span>
                          )}
                        </>
                      )}
                      {!isOpeningPosition && positionStatus === 'awaiting_settlement' && 'Awaiting settlement...'}
                      {!isOpeningPosition && positionStatus === 'closed' && batchPnL !== null && (
                        <span className={batchPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                          PnL: {batchPnL >= 0 ? '+' : ''}{batchPnL.toFixed(4)} ETH
                        </span>
                      )}
                    </span>
                  </motion.div>
                ) : selectedMinute && hasPoints ? (
                  <motion.div
                    className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-2 bg-[#00E5FF]/20 border-2 border-[#00E5FF] rounded-full"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500 }}
                  >
                    <motion.span
                      className="text-[#00E5FF] text-xs sm:text-sm"
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      ●
                    </motion.span>
                    <span className="text-xs sm:text-sm font-bold text-[#00E5FF] whitespace-nowrap">
                      +{selectedMinute}m
                    </span>
                  </motion.div>
                ) : (
                  <span className="text-xs sm:text-sm text-[#00E5FF]/60 font-medium hidden sm:inline">
                    Draw ↑
                  </span>
                )}

                {/* Clear Button */}
                <AnimatePresence>
                  {hasPoints && (
                    <motion.button
                      onClick={onClear}
                      className="px-2 sm:px-5 py-1.5 sm:py-2.5 bg-red-500 border-2 sm:border-3 border-[#0a0a0a] rounded-lg text-white text-xs sm:text-sm font-bold shadow-[2px_2px_0_0_#0a0a0a] sm:shadow-[4px_4px_0_0_#0a0a0a] shrink-0"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ x: -2, y: -2, boxShadow: '6px 6px 0 0 #0a0a0a' }}
                      whileTap={{ x: 2, y: 2, boxShadow: '2px 2px 0 0 #0a0a0a' }}
                    >
                      <span className="hidden sm:inline">Clear</span>
                      <span className="sm:hidden">✕</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
