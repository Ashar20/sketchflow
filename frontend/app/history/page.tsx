'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatWeiLike18 } from '@/lib/formatWeiLike';
import {
  DocumentTextIcon,
  LockClosedIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  StarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Header, Footer } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { getClosedPositions, getUserStats } from '@/lib/api/leaderboard';
import { getOpenPositionsForUser } from '@/lib/api/positions';
import type { LeaderboardEntry, UserStats } from '@/types/leaderboard';
import type { PositionDetail } from '@/lib/api/positions';
import { useFlowWallet } from '@/hooks/useFlowWallet';
import { flowscanTxUrl, flowscanAccountUrl } from '@/lib/flow/addresses';

type SortBy = 'pnl' | 'timestamp';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
  },
};

export default function HistoryPage() {
  const { ready, authenticated, address, isWalletLoading, authError, login } =
    useFlowWallet();
  const isConnected = ready && authenticated && !!address && !isWalletLoading;
  const [sortBy, setSortBy] = useState<SortBy>('timestamp');
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
  const [positions, setPositions] = useState<LeaderboardEntry[]>([]);
  const [openPositions, setOpenPositions] = useState<PositionDetail[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openLoading, setOpenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Sort and filter positions
  const sortedPositions = useMemo(() => {
    const sorted = [...positions];
    if (sortBy === 'pnl') {
      sorted.sort((a, b) => {
        const pnlA = parseFloat(a.pnl || '0') / 1e18;
        const pnlB = parseFloat(b.pnl || '0') / 1e18;
        return pnlB - pnlA;
      });
    } else {
      sorted.sort((a, b) => b.closeTimestamp - a.closeTimestamp);
    }
    return sorted;
  }, [positions, sortBy]);

  // Calculate aggregated stats
  const aggregatedStats = useMemo(() => {
    if (positions.length === 0) {
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgPnL: 0,
      };
    }

    const pnls = positions.map(p => {
      if (!p.pnl || p.pnl === '0' || p.pnl === '') {
        return 0;
      }
      try {
        const ethValue = formatWeiLike18(String(p.pnl));
        const num = parseFloat(ethValue);
        return isNaN(num) ? 0 : num;
      } catch (error) {
        console.warn('Failed to convert PnL:', p.pnl, error);
        const num = parseFloat(p.pnl) / 1e18;
        return isNaN(num) ? 0 : num;
      }
    });

    const totalPnL = pnls.reduce((sum, pnl) => sum + pnl, 0);
    const winningTrades = pnls.filter(pnl => pnl > 0).length;
    const winRate = positions.length > 0 ? (winningTrades / positions.length) * 100 : 0;
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
    const avgPnL = positions.length > 0 ? totalPnL / positions.length : 0;

    return {
      totalPnL,
      winRate,
      totalTrades: positions.length,
      bestTrade,
      worstTrade,
      avgPnL,
    };
  }, [positions]);

  // Fetch closed positions (from DB / leaderboard)
  const fetchUserPositions = async () => {
    if (!address || !isConnected) {
      setPositions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getClosedPositions(limit, offset, address);
      setPositions(response.positions);
      setTotal(response.total);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch user positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trade history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch open positions (from contract via backend)
  const fetchOpenPositions = async () => {
    if (!address || !isConnected) return;
    try {
      setOpenLoading(true);
      const open = await getOpenPositionsForUser(address);
      setOpenPositions(open);
    } catch (err) {
      console.error('Failed to fetch open positions:', err);
      setOpenPositions([]);
    } finally {
      setOpenLoading(false);
    }
  };

  // Fetch user stats
  const fetchUserStats = async () => {
    if (!address || !isConnected) {
      setUserStats(null);
      return;
    }

    try {
      const stats = await getUserStats(address);
      setUserStats(stats);
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (isConnected && address) {
      fetchUserPositions();
      fetchOpenPositions();
      fetchUserStats();
    } else {
      setLoading(false);
      setOpenPositions([]);
    }
  }, [address, isConnected, limit, offset]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected || !address) return;

    const interval = setInterval(() => {
      fetchUserPositions();
      fetchOpenPositions();
      fetchUserStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, address]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  const formatPnL = (pnl: string | number, isAlreadyInEth: boolean = false) => {
    let num: number;
    if (typeof pnl === 'string') {
      if (!pnl || pnl === '0' || pnl === '') {
        return '$0.00';
      }
      if (isAlreadyInEth) {
        num = parseFloat(pnl);
      } else {
        try {
          const ethValue = formatWeiLike18(String(pnl));
          num = parseFloat(ethValue);
          if (isNaN(num)) {
            num = parseFloat(pnl) / 1e18;
          }
        } catch (error) {
          num = parseFloat(pnl) / 1e18;
        }
      }
    } else {
      num = pnl;
    }

    if (isNaN(num) || !isFinite(num)) {
      return '$0.00';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: string | bigint) => {
    try {
      const ethValue = formatWeiLike18(String(amount));
      return parseFloat(ethValue).toFixed(4);
    } catch {
      const s = typeof amount === 'bigint' ? amount.toString() : amount;
      return (parseFloat(s) / 1e18).toFixed(4);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <NoiseEffect opacity={0.6} className="flex-1 px-4 py-10">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.h1
              className="text-4xl md:text-6xl font-venite font-bold text-[#00E5FF] mb-4 flex items-center justify-center gap-3"
              style={{ textShadow: '4px 4px 0 #000000' }}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <DocumentTextIcon className="w-10 h-10 md:w-14 md:h-14 shrink-0" />
              TRADE HISTORY
              <DocumentTextIcon className="w-10 h-10 md:w-14 md:h-14 shrink-0" />
            </motion.h1>
            <p className="text-lg text-white/70">
              Your complete trading history and performance
            </p>
            {lastUpdated && (
              <p className="text-sm text-white/50 mt-2">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            {isConnected && address && (
              <a
                href={flowscanAccountUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-xs font-mono text-[#00E5FF]/80 hover:bg-[#00E5FF]/20 hover:text-[#00E5FF] transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View on Flowscan
              </a>
            )}
          </motion.div>

          {/* Connect Wallet Prompt */}
          {!isConnected && (
            <motion.div
              className="mb-8 p-6 rounded-xl border-4 border-[#00E5FF] bg-gradient-to-r from-[#000000]/80 to-[#0a0a0a]/80 shadow-[6px_6px_0_0_#00E5FF]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <LockClosedIcon className="w-14 h-14 text-[#00E5FF] shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold text-[#00E5FF]">Connect Your Wallet</h3>
                    <p className="text-white/60">Connect your wallet to view your trade history</p>
                  </div>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
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
                      className="text-xs text-amber-300/95 font-venite leading-snug border border-amber-400/40 rounded-lg px-2 py-1.5 bg-black/60 text-center sm:text-end"
                    >
                      {authError}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats Cards */}
          {isConnected && address && (
            <motion.div
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {[
                { label: 'Total PnL', value: formatPnL(aggregatedStats.totalPnL, true), Icon: CurrencyDollarIcon },
                { label: 'Win Rate', value: `${aggregatedStats.winRate.toFixed(1)}%`, Icon: ChartBarIcon },
                { label: 'Total Trades', value: aggregatedStats.totalTrades.toString(), Icon: ChartBarIcon },
                { label: 'Best Trade', value: formatPnL(aggregatedStats.bestTrade, true), Icon: StarIcon },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="p-4 bg-[#000000]/60 border-3 border-[#00E5FF] rounded-xl shadow-[4px_4px_0_0_#00E5FF]"
                  whileHover={{ y: -4, boxShadow: '6px 6px 0 0 #00E5FF' }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i }}
                >
                  <div className="mb-2">
                    <stat.Icon className="w-8 h-8 text-[#00E5FF]" />
                  </div>
                  <div className={`text-2xl font-bold ${stat.label === 'Total PnL' && aggregatedStats.totalPnL < 0 ? 'text-red-400' : 'text-[#00E5FF]'}`}>
                    {stat.value}
                  </div>
                  <div className="text-xs text-white/60">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Sort Controls */}
          {isConnected && address && (
            <motion.div
              className="flex justify-center gap-2 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {(['timestamp', 'pnl'] as SortBy[]).map((sort) => (
                <motion.button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm border-3 transition-all ${sortBy === sort
                    ? 'bg-[#00E5FF] text-[#000000] border-[#0a0a0a] shadow-[3px_3px_0_0_#0a0a0a]'
                    : 'bg-[#000000]/60 text-[#00E5FF] border-[#00E5FF]/50 hover:border-[#00E5FF]'
                    }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="flex items-center gap-2">
                    {sort === 'pnl' ? (
                      <>
                        <CurrencyDollarIcon className="w-4 h-4" />
                        By PnL
                      </>
                    ) : (
                      <>
                        <ClockIcon className="w-4 h-4" />
                        Recent
                      </>
                    )}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Error State */}
          {error && (
            <motion.div
              className="mb-8 p-4 bg-red-500/20 border-2 border-red-500 rounded-xl text-red-400"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="font-bold">Error loading trade history</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={fetchUserPositions}
                className="mt-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Retry
              </button>
            </motion.div>
          )}

          {/* Open Positions (in progress) */}
          {isConnected && address && (openLoading || openPositions.length > 0) && (
            <motion.div
              className="mb-8 rounded-2xl border-4 border-[#00E5FF] bg-[#0a0a0a]/90 overflow-hidden shadow-[8px_8px_0_0_#000000]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="px-6 py-4 bg-[#000000]/80 border-b-3 border-[#00E5FF] flex items-center justify-between">
                <span className="text-sm font-bold text-[#00E5FF]">Open positions</span>
                <span className="text-xs text-[#00E5FF]/70">Settles in ~1 min; then appears below</span>
              </div>
              {openLoading ? (
                <div className="p-6 text-center text-white/60">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#00E5FF]" />
                  <p className="mt-2 text-sm">Loading open positions...</p>
                </div>
              ) : (
                <div className="divide-y divide-[#00E5FF]/20">
                  {openPositions.map((pos) => {
                    const openTs = typeof pos.openTimestamp === 'bigint' ? Number(pos.openTimestamp) : Number(pos.openTimestamp);
                    return (
                      <div
                        key={pos.positionId ?? openTs}
                        className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[#000000]/30 transition-colors"
                      >
                        <div className="md:col-span-2 flex items-center gap-2">
                          <span className="font-mono text-white/80">#{pos.positionId}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50">
                            Open
                          </span>
                        </div>
                        <div className="md:col-span-2 flex items-center text-sm text-white/80">
                          Opened {formatDate(openTs)}
                        </div>
                        <div className="md:col-span-2 flex items-center text-white/80">
                          {formatAmount(pos.amount)} ETH
                        </div>
                        <div className="md:col-span-2 flex items-center text-white/80">
                          {pos.leverage}x
                        </div>
                        <div className="md:col-span-4 flex items-center text-white/50 text-sm">
                          PnL after settlement
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Closed Positions Table */}
          {isConnected && address && (
            <motion.div
              className="rounded-2xl border-4 border-[#00E5FF] bg-[#0a0a0a]/90 overflow-hidden shadow-[8px_8px_0_0_#000000]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              {/* Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-[#000000]/80 border-b-3 border-[#00E5FF] text-sm font-bold text-[#00E5FF]">
                <div className="col-span-1 text-center">ID</div>
                <div className="col-span-2 text-center">Date</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1 text-center">Leverage</div>
                <div className="col-span-2 text-right">PnL</div>
                <div className="col-span-2 text-center">Accuracy</div>
                <div className="col-span-2 text-center">Tx Hash</div>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="p-8 text-center text-white/60">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
                  <p className="mt-2">Loading trade history...</p>
                </div>
              )}

              {/* Empty State (no closed and no open) */}
              {!loading && !error && sortedPositions.length === 0 && openPositions.length === 0 && !openLoading && (
                <div className="p-8 text-center text-white/60">
                  <p className="text-xl mb-2">No trades yet</p>
                  <p className="text-sm">Start trading to see your history here! Open positions appear above until they settle.</p>
                </div>
              )}

              {/* Table Body */}
              {!loading && sortedPositions.length > 0 && (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <AnimatePresence>
                    {sortedPositions.map((position) => {
                      const pnlNum = parseFloat(position.pnl || '0') / 1e18;
                      const isPositive = pnlNum >= 0;
                      return (
                        <motion.div
                          key={position.positionId}
                          variants={itemVariants}
                          transition={{ duration: 0.4, ease: "easeInOut" }}
                          className={`grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-5 border-b border-[#00E5FF]/20 transition-all ${hoveredPosition === position.positionId ? 'bg-[#000000]/40' : ''
                            }`}
                          onMouseEnter={() => setHoveredPosition(position.positionId)}
                          onMouseLeave={() => setHoveredPosition(null)}
                          whileHover={{ x: 4 }}
                        >
                          {/* Mobile Layout */}
                          <div className="md:hidden space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-bold text-[#00E5FF]">Position #{position.positionId}</div>
                                <div className="text-xs text-white/50">{formatDate(position.closeTimestamp)}</div>
                              </div>
                              <div className="text-right">
                                <div className={`text-lg font-bold ${isPositive ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                                  {formatPnL(position.pnl)}
                                </div>
                                <div className="text-xs text-white/50">{formatAmount(position.amount)} ETH</div>
                              </div>
                            </div>
                            <div className="flex justify-between text-sm text-white/70">
                              <span>Leverage: {position.leverage}x</span>
                              <span>Accuracy: {((position.accuracy ?? 0) * 100).toFixed(1)}%</span>
                            </div>
                            {position.txHash && (
                              <a
                                href={flowscanTxUrl(position.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-[#00E5FF]/70 font-mono hover:text-[#00E5FF] transition-colors"
                              >
                                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                {formatAddress(position.txHash)}
                              </a>
                            )}
                          </div>

                          {/* Desktop Layout */}
                          <div className="hidden md:contents">
                            <div className="col-span-1 flex items-center justify-center">
                              <span className="text-white/80 font-mono">#{position.positionId}</span>
                            </div>
                            <div className="col-span-2 flex items-center justify-center">
                              <span className="text-white/80 text-sm">{formatDate(position.closeTimestamp)}</span>
                            </div>
                            <div className="col-span-2 flex items-center justify-end">
                              <span className="text-white/80">{formatAmount(position.amount)} ETH</span>
                            </div>
                            <div className="col-span-1 flex items-center justify-center">
                              <span className="text-white/80">{position.leverage}x</span>
                            </div>
                            <div className="col-span-2 flex items-center justify-end">
                              <span className={`font-bold text-lg ${isPositive ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                                {formatPnL(position.pnl)}
                              </span>
                            </div>
                            <div className="col-span-2 flex items-center justify-center">
                              <span className="text-white/80">{((position.accuracy ?? 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="col-span-2 flex items-center justify-center">
                              {position.txHash ? (
                                <a
                                  href={flowscanTxUrl(position.txHash)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-[#00E5FF] hover:text-[#00E5FF]/70 text-sm font-mono transition-colors"
                                  title="View on Flowscan"
                                >
                                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                  </svg>
                                  {formatAddress(position.txHash)}
                                </a>
                              ) : (
                                <span className="text-white/50 text-sm">-</span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Pagination */}
              {!loading && total > limit && (
                <div className="px-6 py-4 border-t border-[#00E5FF]/20 flex justify-between items-center">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-4 py-2 bg-[#000000]/60 text-[#00E5FF] rounded-lg border-2 border-[#00E5FF]/50 disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#00E5FF]"
                  >
                    Previous
                  </button>
                  <span className="text-white/60">
                    Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="px-4 py-2 bg-[#000000]/60 text-[#00E5FF] rounded-lg border-2 border-[#00E5FF]/50 disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#00E5FF]"
                  >
                    Next
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* User Stats Card */}
          {isConnected && address && userStats && (
            <motion.div
              className="mt-8 p-6 rounded-xl border-4 border-[#00E5FF] bg-gradient-to-r from-[#000000]/80 to-[#0a0a0a]/80 shadow-[6px_6px_0_0_#00E5FF]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <ChartBarIcon className="w-14 h-14 text-[#00E5FF] shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold text-[#00E5FF]">Your Statistics</h3>
                    <div className="text-white/80 space-y-1">
                      <p>Total Positions: {userStats.totalPositions}</p>
                      <p>Total PnL: {formatPnL(userStats.totalPnL, false)}</p>
                      <p>Average PnL: {formatPnL(userStats.averagePnL, false)}</p>
                      <p>Win Rate: {userStats.winRate.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </NoiseEffect>

      <Footer />
    </div>
  );
}
