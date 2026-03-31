'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowWallet } from '@/hooks/useFlowWallet';

function formatAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { ready, authenticated, address, isWalletLoading, authError, login } =
    useFlowWallet();
  const [copied, setCopied] = useState(false);

  const connected = ready && authenticated && !!address;
  const displayAddr = address ?? '';

  const handleCopyAddress = async () => {
    if (!displayAddr) return;
    try {
      await navigator.clipboard.writeText(displayAddr);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  if (!ready) {
    return null;
  }

  if (isWalletLoading) {
    return (
      <motion.button
        type="button"
        disabled
        className="relative group px-4 py-2.5 bg-[#000000] border-3 border-[#00E5FF] rounded-lg font-bold text-[#00E5FF] uppercase tracking-wider text-sm shadow-[4px_4px_0_0_#00E5FF] opacity-75 cursor-not-allowed"
        style={{ imageRendering: 'pixelated' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-[#00E5FF] bg-[#00E5FF] flex items-center justify-center">
            <motion.div
              className="w-2 h-2 rounded-sm bg-[#000000]"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            />
          </div>
          <span className="text-xs sm:text-sm">Loading wallet…</span>
        </div>
      </motion.button>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-end gap-2 max-w-[min(100vw-2rem,20rem)]">
        <motion.button
          onClick={login}
          type="button"
          className="relative group px-4 py-2.5 bg-[#00E5FF] border-3 border-[#0a0a0a] rounded-lg font-bold text-[#000000] uppercase tracking-wider text-sm shadow-[4px_4px_0_0_#0a0a0a] transition-all"
          whileHover={{
            x: -2,
            y: -2,
            boxShadow: '6px 6px 0 0 #0a0a0a',
          }}
          whileTap={{
            x: 2,
            y: 2,
            boxShadow: '2px 2px 0 0 #0a0a0a',
          }}
          style={{ imageRendering: 'pixelated' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded border-2 border-[#000000] bg-[#000000] flex items-center justify-center">
              <div className="w-2 h-2 rounded-sm bg-[#00E5FF]" />
            </div>
            <span>Connect</span>
          </div>
        </motion.button>
        {authError && (
          <p
            role="alert"
            className="text-xs text-amber-300/95 text-right font-venite leading-snug border border-amber-400/40 rounded-lg px-2 py-1.5 bg-black/60"
          >
            {authError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <motion.button
        onClick={handleCopyAddress}
        type="button"
        className="relative group px-4 py-2.5 bg-[#000000] border-3 border-[#00E5FF] rounded-lg font-bold text-[#00E5FF] uppercase tracking-wider text-sm shadow-[4px_4px_0_0_#00E5FF]"
        whileHover={{
          x: -2,
          y: -2,
          boxShadow: '6px 6px 0 0 #00E5FF',
        }}
        whileTap={{
          x: 2,
          y: 2,
          boxShadow: '2px 2px 0 0 #00E5FF',
        }}
        style={{ imageRendering: 'pixelated' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-[#00E5FF] bg-[#00E5FF] flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-[#000000]" />
          </div>
          <div className="text-start">
            <span className="text-xs sm:text-sm">
              {displayAddr ? formatAddress(displayAddr) : 'Connected'}
            </span>
            <div className="text-[10px] text-white font-venite">Flow</div>
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1.5 bg-[#00E5FF] border-2 border-[#0a0a0a] rounded-lg shadow-[3px_3px_0_0_#0a0a0a] z-50"
            style={{ imageRendering: 'pixelated' }}
          >
            <span className="text-xs font-bold text-[#000000] uppercase tracking-wider whitespace-nowrap">
              Copied!
            </span>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -mb-1">
              <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#0a0a0a]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
