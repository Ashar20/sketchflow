'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatWeiLike18 } from '@/lib/formatWeiLike';
import type { ComponentType, SVGProps } from 'react';
import {
  TrophyIcon,
  UsersIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ClockIcon,
  UserCircleIcon,
  StarIcon,
  FireIcon,
  PencilSquareIcon,
  SparklesIcon,
  BoltIcon,
  MusicalNoteIcon,
  PaintBrushIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline';
import { Header, Footer, ConnectWalletButton } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { getLeaderboard, getUserStats, getLeaderboardStats } from '@/lib/api/leaderboard';
import type { LeaderboardEntry, UserStats } from '@/types/leaderboard';

type TimeFilter = 'all' | 'monthly' | 'weekly' | 'daily';
type SortBy = 'pnl' | 'timestamp';

interface AggregatedUser {
  address: string;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  bestTrade: number;
  positions: LeaderboardEntry[];
  rank: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
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

// Avatar icons (heroicons) - pick by address
const AVATAR_ICONS: ComponentType<SVGProps<SVGSVGElement>>[] = [
  PencilSquareIcon,
  ChartBarIcon,
  TrophyIcon,
  PaintBrushIcon,
  SparklesIcon,
  FireIcon,
  BoltIcon,
  MusicalNoteIcon,
  StarIcon,
  ChartBarSquareIcon,
  UserCircleIcon,
];

const getAvatarIcon = (address: string): ComponentType<SVGProps<SVGSVGElement>> => {
  const index = parseInt(address.slice(2, 4), 16) % AVATAR_ICONS.length;
  return AVATAR_ICONS[index];
};

// Generate username from address
const getUsername = (address: string): string => {
  const names = ['NyanMaster', 'LineWhisperer', 'CurveKing', 'PatternPro', 'DrawMaster',
    'FuturesWizard', 'TrendRider', 'ChartNinja', 'PredictionPunk', 'LineArtist'];
  const index = parseInt(address.slice(2, 4), 16) % names.length;
  return names[index];
};

export default function LeaderboardPage() {
  const address = undefined as unknown as string | undefined;
  const isConnected = false;
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('pnl');
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [leaderboardStats, setLeaderboardStats] = useState<{
    totalTraders: number;
    totalVolume: string;
    positionsToday: number;
    avgWinRate: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Aggregate positions by user address
  const aggregatedUsers = useMemo(() => {
    const userMap = new Map<string, LeaderboardEntry[]>();

    leaderboardData.forEach((position) => {
      const addr = position.userAddress.toLowerCase();
      if (!userMap.has(addr)) {
        userMap.set(addr, []);
      }
      userMap.get(addr)!.push(position);
    });

    const aggregated: AggregatedUser[] = Array.from(userMap.entries()).map(([address, positions]) => {
      // Convert PnL from wei to ETH for calculations
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
      // Best trade is the maximum PnL (could be negative, so don't clamp to 0)
      const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;

      return {
        address,
        totalPnL,
        winRate,
        totalTrades: positions.length,
        bestTrade,
        positions,
        rank: 0, // Will be set after sorting
      };
    });

    // Sort by total PnL (descending)
    aggregated.sort((a, b) => b.totalPnL - a.totalPnL);

    // Assign ranks
    aggregated.forEach((user, index) => {
      user.rank = index + 1;
    });

    return aggregated;
  }, [leaderboardData]);

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getLeaderboard(limit, offset, sortBy);
      console.log('Leaderboard response:', response);
      console.log('Sample position:', response.positions[0]);
      if (response.positions[0]) {
        console.log('Sample PnL value:', response.positions[0].pnl);
        console.log('Sample PnL formatted:', formatWeiLike18(String(response.positions[0].pnl)));
      }
      setLeaderboardData(response.positions);
      setTotal(response.total);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // Fetch leaderboard statistics
  const fetchLeaderboardStats = async () => {
    try {
      const stats = await getLeaderboardStats();
      setLeaderboardStats(stats);
    } catch (err) {
      console.error('Failed to fetch leaderboard stats:', err);
      // Don't set error state for stats - it's not critical
    }
  };

  // Fetch user stats when wallet is connected
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
      // Don't set error state for user stats - it's optional
    }
  };

  // Initial load
  useEffect(() => {
    fetchLeaderboard();
    fetchLeaderboardStats();
  }, [limit, offset, sortBy]);

  // Fetch user stats when address changes
  useEffect(() => {
    fetchUserStats();
  }, [address, isConnected]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeaderboard();
      fetchLeaderboardStats();
      if (isConnected && address) {
        fetchUserStats();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, address]);

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-[#0a0a0a]';
      case 2:
        return 'bg-gradient-to-r from-gray-300 via-gray-200 to-gray-400 text-[#0a0a0a]';
      case 3:
        return 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 text-white';
      default:
        return 'bg-[#000000] text-[#00E5FF]';
    }
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return <TrophyIcon className="w-6 h-6" aria-hidden />;
      case 2:
        return <StarIcon className="w-6 h-6" aria-hidden />;
      case 3:
        return <FireIcon className="w-6 h-6" aria-hidden />;
      default:
        return `#${rank}`;
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  const formatPnL = (pnl: number | string, isAlreadyInEth: boolean = false) => {
    // PnL can be in wei (string from API) or already in ETH (number from aggregation)
    let num: number;
    if (typeof pnl === 'string') {
      // Handle empty or invalid strings
      if (!pnl || pnl === '0' || pnl === '') {
        return '$0.00';
      }
      // If already in ETH, just parse it
      if (isAlreadyInEth) {
        num = parseFloat(pnl);
      } else {
        // API uses 18-decimal fixed integers (Flow collateral mapped to wei-like scale)
        try {
          const ethValue = formatWeiLike18(String(pnl));
          num = parseFloat(ethValue);
          // Check if conversion resulted in NaN
          if (isNaN(num)) {
            console.warn('PnL format returned NaN for:', pnl);
            num = parseFloat(pnl) / 1e18;
          }
        } catch (error) {
          console.warn('PnL format failed for:', pnl, error);
          // Fallback to direct parsing if formatting fails
          num = parseFloat(pnl) / 1e18;
        }
      }
    } else {
      // If it's already a number, it's already in ETH (from aggregation)
      num = pnl;
    }

    // Handle NaN or invalid numbers
    if (isNaN(num) || !isFinite(num)) {
      console.warn('Invalid PnL value:', pnl, 'converted to:', num);
      return '$0.00';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6, // Allow more decimals for crypto amounts
    }).format(num);
  };

  // Use stats from API (accurate across all data), fallback to calculated if not available
  const stats = useMemo(() => {
    console.log('Calculating stats, leaderboardStats:', leaderboardStats);
    if (leaderboardStats) {
      // Convert totalVolume from wei to ETH
      let totalVolumeEth = 0;
      try {
        totalVolumeEth = parseFloat(formatWeiLike18(String(leaderboardStats.totalVolume)));
      } catch {
        totalVolumeEth = parseFloat(leaderboardStats.totalVolume) / 1e18;
      }

      console.log('Using API stats:', {
        totalTraders: leaderboardStats.totalTraders,
        totalVolume: totalVolumeEth,
        positionsToday: leaderboardStats.positionsToday,
        avgWinRate: leaderboardStats.avgWinRate,
      });

      return {
        totalTraders: leaderboardStats.totalTraders,
        totalVolume: totalVolumeEth,
        positionsToday: leaderboardStats.positionsToday,
        avgWinRate: leaderboardStats.avgWinRate,
      };
    }

    console.log('Falling back to calculated stats from current page');

    // Fallback to calculated stats from current page (less accurate, only shows current page users)
    if (aggregatedUsers.length === 0) {
      return {
        totalTraders: 0,
        totalVolume: 0,
        positionsToday: 0,
        avgWinRate: 0,
      };
    }

    const totalTraders = aggregatedUsers.length;
    const totalVolume = aggregatedUsers.reduce((sum, user) => {
      return sum + user.positions.reduce((posSum, pos) => {
        // Convert amount from wei to ETH
        try {
          return posSum + parseFloat(formatWeiLike18(String(pos.amount)));
        } catch {
          return posSum + parseFloat(pos.amount) / 1e18;
        }
      }, 0);
    }, 0);

    const now = Date.now() / 1000;
    const todayStart = Math.floor(now / 86400) * 86400;
    const positionsToday = leaderboardData.filter(pos => pos.closeTimestamp >= todayStart).length;

    const avgWinRate = aggregatedUsers.reduce((sum, user) => sum + user.winRate, 0) / totalTraders;

    return {
      totalTraders,
      totalVolume,
      positionsToday,
      avgWinRate,
    };
  }, [leaderboardStats, aggregatedUsers, leaderboardData]);

  // Find user's rank
  const userRank = useMemo(() => {
    if (!address || !isConnected) return null;
    const user = aggregatedUsers.find(u => u.address.toLowerCase() === address.toLowerCase());
    return user ? user.rank : null;
  }, [address, isConnected, aggregatedUsers]);

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
              className="flex items-center justify-center gap-3 text-4xl md:text-6xl font-venite font-bold text-[#00E5FF] mb-4"
              style={{ textShadow: '4px 4px 0 #000000' }}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <TrophyIcon className="w-10 h-10 md:w-14 md:h-14 shrink-0" aria-hidden />
              LEADERBOARD
              <TrophyIcon className="w-10 h-10 md:w-14 md:h-14 shrink-0" aria-hidden />
            </motion.h1>
            <p className="text-lg text-white/70">
              Top traders competing to draw the best futures
            </p>
            {lastUpdated && (
              <p className="text-sm text-white/50 mt-2">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {[
              { label: 'Total Traders', value: stats.totalTraders.toLocaleString(), Icon: UsersIcon },
              { label: 'Total Volume', value: formatPnL(stats.totalVolume), Icon: CurrencyDollarIcon },
              { label: 'Positions Today', value: stats.positionsToday.toString(), Icon: ChartBarIcon },
              { label: 'Avg Win Rate', value: `${stats.avgWinRate.toFixed(1)}%`, Icon: TrophyIcon },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="p-4 bg-[#000000]/60 border-3 border-[#00E5FF] rounded-xl shadow-[4px_4px_0_0_#00E5FF]"
                whileHover={{ y: -4, boxShadow: '6px 6px 0 0 #00E5FF' }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * i }}
              >
                <div className="mb-2 text-[#00E5FF]">
                  <stat.Icon className="w-8 h-8" aria-hidden />
                </div>
                <div className="text-2xl font-bold text-[#00E5FF]">{stat.value}</div>
                <div className="text-xs text-white/60">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>

          {/* Sort Controls */}
          <motion.div
            className="flex justify-center gap-2 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {(['pnl', 'timestamp'] as SortBy[]).map((sort) => (
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
                {sort === 'pnl' ? (
                  <>
                    <CurrencyDollarIcon className="w-4 h-4 inline-block mr-1.5 align-middle" aria-hidden />
                    By PnL
                  </>
                ) : (
                  <>
                    <ClockIcon className="w-4 h-4 inline-block mr-1.5 align-middle" aria-hidden />
                    Recent
                  </>
                )}
              </motion.button>
            ))}
          </motion.div>

          {/* Error State */}
          {error && (
            <motion.div
              className="mb-8 p-4 bg-red-500/20 border-2 border-red-500 rounded-xl text-red-400"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="font-bold">Error loading leaderboard</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={fetchLeaderboard}
                className="mt-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Retry
              </button>
            </motion.div>
          )}

          {/* Leaderboard Table */}
          <motion.div
            className="rounded-2xl border-4 border-[#00E5FF] bg-[#0a0a0a]/90 overflow-hidden shadow-[8px_8px_0_0_#000000]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-[#000000]/80 border-b-3 border-[#00E5FF] text-sm font-bold text-[#00E5FF]">
              <div className="col-span-1 text-center">Rank</div>
              <div className="col-span-3">Trader</div>
              <div className="col-span-2 text-right">Total PnL</div>
              <div className="col-span-1 text-center">Win Rate</div>
              <div className="col-span-2 text-center">Trades</div>
              <div className="col-span-2 text-center">Best Trade</div>
              <div className="col-span-1 text-center">Accuracy</div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="p-8 text-center text-white/60">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
                <p className="mt-2">Loading leaderboard...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && aggregatedUsers.length === 0 && (
              <div className="p-8 text-center text-white/60">
                <p className="text-xl mb-2">No positions yet</p>
                <p className="text-sm">Be the first to make a trade!</p>
              </div>
            )}

            {/* Table Body */}
            {!loading && aggregatedUsers.length > 0 && (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <AnimatePresence>
                  {aggregatedUsers.map((trader) => {
                    const isCurrentUser = address && trader.address.toLowerCase() === address.toLowerCase();
                    return (
                      <motion.div
                        key={trader.address}
                        variants={itemVariants}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        className={`grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-5 border-b border-[#00E5FF]/20 transition-all cursor-pointer ${hoveredRank === trader.rank ? 'bg-[#000000]/40' : ''
                          } ${trader.rank <= 3 ? 'bg-gradient-to-r from-[#000000]/20 to-transparent' : ''} ${isCurrentUser ? 'ring-2 ring-[#00E5FF] bg-[#00E5FF]/10' : ''
                          }`}
                        onMouseEnter={() => setHoveredRank(trader.rank)}
                        onMouseLeave={() => setHoveredRank(null)}
                        whileHover={{ x: 4 }}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg ${getRankStyle(trader.rank)}`}>
                                {getRankBadge(trader.rank)}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const AvatarIcon = getAvatarIcon(trader.address);
                                    return <AvatarIcon className="w-8 h-8 text-[#00E5FF]" aria-hidden />;
                                  })()}
                                  <span className="font-bold text-[#00E5FF]">{getUsername(trader.address)}</span>
                                  {isCurrentUser && <span className="text-xs bg-[#00E5FF] text-[#000000] px-2 py-0.5 rounded">You</span>}
                                </div>
                                <span className="text-xs text-white/50 font-mono">{formatAddress(trader.address)}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-bold ${trader.totalPnL >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                                {formatPnL(trader.totalPnL, true)}
                              </div>
                              <div className="text-xs text-white/50">{trader.winRate.toFixed(1)}% Win</div>
                            </div>
                          </div>
                          <div className="flex justify-between text-sm text-white/70">
                            <span>{trader.totalTrades} trades</span>
                            <span>Best: {formatPnL(trader.bestTrade, true)}</span>
                            <span>Avg: {(() => {
                              if (trader.positions.length === 0) return '0';
                              const avg = trader.positions.reduce((sum, p) => sum + (p.accuracy || 0), 0) / trader.positions.length;
                              return avg.toFixed(1);
                            })()}%</span>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden md:contents">
                          <div className="col-span-1 flex items-center justify-center">
                            <motion.span
                              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg ${getRankStyle(trader.rank)}`}
                              whileHover={{ scale: 1.1, rotate: trader.rank <= 3 ? [0, -10, 10, 0] : 0 }}
                              animate={trader.rank === 1 ? { scale: [1, 1.1, 1] } : {}}
                              transition={trader.rank === 1 ? { duration: 1.5, repeat: Infinity } : {}}
                            >
                              {getRankBadge(trader.rank)}
                            </motion.span>
                          </div>
                          <div className="col-span-3 flex items-center gap-3">
                            {(() => {
                              const AvatarIcon = getAvatarIcon(trader.address);
                              return <AvatarIcon className="w-10 h-10 text-[#00E5FF]" aria-hidden />;
                            })()}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#00E5FF]">{getUsername(trader.address)}</span>
                                {isCurrentUser && <span className="text-xs bg-[#00E5FF] text-[#000000] px-2 py-0.5 rounded">You</span>}
                              </div>
                              <div className="text-xs text-white/50 font-mono">{formatAddress(trader.address)}</div>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center justify-end">
                            <span className={`font-bold text-lg ${trader.totalPnL >= 0 ? 'text-[#00E5FF]' : 'text-red-400'}`}>
                              {formatPnL(trader.totalPnL, true)}
                            </span>
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            <span className="text-white/80">{trader.winRate.toFixed(1)}%</span>
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <span className="text-white/80">{trader.totalTrades}</span>
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <span className="text-[#00E5FF]/80">{formatPnL(trader.bestTrade, true)}</span>
                          </div>
                          <div className="col-span-1 flex items-center justify-center">
                            <span className="text-white/80">
                              {(() => {
                                if (trader.positions.length === 0) return '0';
                                const avgAccuracy = trader.positions.reduce((sum, p) => sum + (p.accuracy || 0), 0) / trader.positions.length;
                                return avgAccuracy.toFixed(1);
                              })()}%
                            </span>
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

          {/* Your Rank Card */}
          <motion.div
            className="mt-8 p-6 rounded-xl border-4 border-[#00E5FF] bg-gradient-to-r from-[#000000]/80 to-[#0a0a0a]/80 shadow-[6px_6px_0_0_#00E5FF]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {isConnected && address && userStats ? (
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <UserCircleIcon className="w-14 h-14 text-[#00E5FF] shrink-0" aria-hidden />
                  <div>
                    <h3 className="text-xl font-bold text-[#00E5FF]">Your Ranking</h3>
                    <div className="text-white/80 space-y-1">
                      <p>Rank: {userRank ? `#${userRank}` : 'Not ranked'}</p>
                      <p>Total PnL: {formatPnL(userStats.totalPnL, false)}</p>
                      <p>Win Rate: {userStats.winRate.toFixed(1)}%</p>
                      <p>Total Positions: {userStats.totalPositions}</p>
                    </div>
                  </div>
                </div>
                <ConnectWalletButton />
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <UserCircleIcon className="w-14 h-14 text-[#00E5FF] shrink-0" aria-hidden />
                  <div>
                    <h3 className="text-xl font-bold text-[#00E5FF]">Your Ranking</h3>
                    <p className="text-white/60">Connect your wallet to see your position</p>
                  </div>
                </div>
                <ConnectWalletButton />
              </div>
            )}
          </motion.div>
        </div>
      </NoiseEffect>

      <Footer />
    </div>
  );
}
