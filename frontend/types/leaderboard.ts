export interface LeaderboardEntry {
  positionId: number;
  userAddress: string;
  amount: string;
  leverage: number;
  pnl: string;
  openTimestamp: number;
  closeTimestamp: number;
  accuracy: number;
  txHash: string;
}

export interface LeaderboardResponse {
  positions: LeaderboardEntry[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface UserStats {
  userAddress: string;
  totalPositions: number;
  totalPnL: string;
  averagePnL: string;
  winRate: number;
  positions: LeaderboardEntry[];
}

export interface ClosedPositionsResponse {
  positions: LeaderboardEntry[];
  total: number;
}
