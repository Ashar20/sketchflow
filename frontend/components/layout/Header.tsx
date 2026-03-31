'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useNextStep } from 'nextstepjs';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';
import { ConnectWalletButton } from './ConnectWalletButton';

interface HeaderProps {
  showStatus?: boolean;
  statusText?: string;
}

export function Header({ showStatus, statusText }: HeaderProps) {
  const pathname = usePathname();
  const { startNextStep } = useNextStep();
  const isPredictPage = pathname === '/predict';

  return (
    <motion.header
      className="sticky top-0 z-50 backdrop-blur-xl  bg-[#00E5FF] shadow-[0_4px_0_0_#0a0a0a]"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="px-4  max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <motion.div
              className="relative"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute inset-0 rounded-lg bg-[#00E5FF]/40 blur-lg opacity-60 group-hover:opacity-100 transition-opacity" />
              <h1 className="text-4xl font-venite px-2 bg-black sm:px-4 md:px-6 py-2 sm:py-2 md:py-2 font-bold text-[#00E5FF]">
                SF
              </h1>
            </motion.div>
            <div className="flex flex-col">
              <motion.h1
                className="relative font-venite text-xl sm:text-2xl font-black tracking-[0.15em] text-black"
                whileHover={{ scale: 1.02 }}
              >
                SKETCH FLOW
              </motion.h1>
              <span className="text-[10px] -mt-1 font-bold text-black uppercase tracking-wider">
                Draw Your Futures
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center md:gap-10 gap-4 uppercase italic font-venite">
            <Link href="/predict" className="border-b-2 border-black text-sm font-bold text-black/80 hover:text-red-700 transition-colors">
              Play
            </Link>
            <Link href="/leaderboard" className="border-b-2 border-black text-sm font-bold text-black/80 hover:text-red-700 transition-colors">
              Leaderboard
            </Link>
            <Link href="/history" className="border-b-2 border-black text-sm font-bold text-black/80 hover:text-red-700 transition-colors">
              History
            </Link>
            <Link href="/pitch" className="border-b-2 border-black text-sm font-bold text-black/80 hover:text-red-700 transition-colors">
              Pitch
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isPredictPage && (
              <motion.button
                type="button"
                onClick={() => startNextStep(predictTourId)}
                className="p-2 rounded-lg border-2 border-black text-black/80 hover:text-black hover:bg-black/10 transition-colors"
                aria-label="Show onboarding tour"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <QuestionMarkCircleIcon className="w-6 h-6" />
              </motion.button>
            )}
            <ConnectWalletButton />

            {/* Status badge */}
            {showStatus && statusText && (
              <motion.div
                className="flex items-center gap-2 px-3 py-1.5 bg-[#00E5FF]/20 border-2 border-[#00E5FF] rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                <motion.div
                  className="w-2 h-2 rounded-full bg-[#00E5FF]"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1]
                  }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                <span className="text-xs font-bold text-[#00E5FF]">
                  {statusText}
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
