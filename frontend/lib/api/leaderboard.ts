import type {
  LeaderboardResponse,
  UserStats,
  ClosedPositionsResponse,
} from '@/types/leaderboard';

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Fetch leaderboard data from backend
 */
export async function getLeaderboard(
  limit: number = 100,
  offset: number = 0,
  sortBy: 'pnl' | 'timestamp' = 'pnl'
): Promise<LeaderboardResponse> {
  const url = new URL(`${DEFAULT_BACKEND_URL}/api/leaderboard`);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());
  url.searchParams.set('sort', sortBy);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch leaderboard: ${response.status}`
    );
  }

  return response.json();
}

/**
 * Fetch user statistics from backend
 */
export async function getUserStats(
  address: string
): Promise<UserStats> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid Ethereum address');
  }

  const url = `${DEFAULT_BACKEND_URL}/api/leaderboard/user/${address}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch user stats: ${response.status}`
    );
  }

  return response.json();
}

/**
 * Fetch closed positions from backend
 */
export async function getClosedPositions(
  limit: number = 100,
  offset: number = 0,
  user?: string
): Promise<ClosedPositionsResponse> {
  const url = new URL(`${DEFAULT_BACKEND_URL}/api/positions/closed`);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());
  if (user) {
    url.searchParams.set('user', user);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch closed positions: ${response.status}`
    );
  }

  return response.json();
}

/**
 * Fetch leaderboard statistics (total traders, volume, etc.)
 */
export async function getLeaderboardStats(): Promise<{
  totalTraders: number;
  totalVolume: string;
  positionsToday: number;
  avgWinRate: number;
}> {
  const url = `${DEFAULT_BACKEND_URL}/api/leaderboard/stats`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch leaderboard stats: ${response.status}`
    );
  }

  return response.json();
}
