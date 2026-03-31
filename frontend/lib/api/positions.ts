const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function isValidWalletAddress(address: string): boolean {
  if (!address?.startsWith('0x')) return false;
  const hex = address.slice(2);
  if (!/^[a-fA-F0-9]+$/i.test(hex)) return false;
  return hex.length === 16 || hex.length === 40;
}

/** Position from contract (open or closed) */
export interface PositionDetail {
  positionId?: number;
  user: string;
  amount: string | bigint;
  leverage: number;
  openTimestamp: string | bigint;
  predictionCommitmentId: string;
  isOpen: boolean;
  pnl: string | bigint;
  actualPriceCommitmentId: string;
  closeTimestamp: string | bigint;
}

export interface UserPositionsResponse {
  success: boolean;
  userAddress: string;
  positionIds: number[];
  stats: {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalPnl: string;
  };
}

export interface PositionResponse {
  success: boolean;
  position: PositionDetail;
}

/**
 * Fetch all position IDs for a user (open + closed on-chain)
 */
export async function getUserPositionIds(address: string): Promise<UserPositionsResponse> {
  if (!address || !isValidWalletAddress(address)) {
    throw new Error('Invalid wallet address (use a 0x-prefixed Flow or EVM address)');
  }
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/positions/user/${address}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch user positions: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch a single position by ID (from contract)
 */
export async function getPosition(
  positionId: number,
  options?: { includeAnalytics?: boolean; includePredictions?: boolean }
): Promise<PositionResponse> {
  const params = new URLSearchParams();
  if (options?.includeAnalytics === false) params.set('includeAnalytics', 'false');
  if (options?.includePredictions === true) params.set('includePredictions', 'true');
  const qs = params.toString();
  const url = `${DEFAULT_BACKEND_URL}/api/position/${positionId}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Position not found');
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch position: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch open positions for a user (position IDs then details)
 */
export async function getOpenPositionsForUser(address: string): Promise<PositionDetail[]> {
  const { positionIds } = await getUserPositionIds(address);
  if (positionIds.length === 0) return [];
  const results = await Promise.all(
    positionIds.slice(0, 50).map((id) =>
      getPosition(id, { includeAnalytics: false, includePredictions: false })
        .then((r) => ({ id, position: r.position }))
        .catch(() => null)
    )
  );
  const withId = results.filter(
    (r): r is { id: number; position: PositionDetail } => r !== null && r.position.isOpen
  );
  return withId.map(({ id, position }) => ({ ...position, positionId: id }));
}
