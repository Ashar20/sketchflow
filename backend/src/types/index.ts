/**
 * Price data from Bybit WebSocket
 */
export interface BybitTickerData {
  topic: string;
  data: {
    lastPrice: string;
    bid1Price: string;
    ask1Price: string;
    timestamp: number;
  };
}

/**
 * Price entry in the buffer
 */
export interface PriceEntry {
  price: number;
  timestamp: number;
  source: string;
}

/**
 * 60-second price window payload for storage
 */
export interface PriceWindowPayload {
  windowStart: number;
  windowEnd: number;
  prices: number[];
  lastPrice: number;
  bid: number;
  ask: number;
  twap: number;
  volatility: number;
}

/**
 * Storage commitment response (MongoDB ObjectId as hex string)
 */
export interface EigenDACommitment {
  commitment: string; // hex string (MongoDB ObjectId)
  batchHeaderHash?: string;
  blobIndex?: number;
}

/**
 * Health metrics
 */
export interface HealthMetrics {
  websocketConnected: boolean;
  lastPriceUpdate: number;
  bufferSize: number;
  lastStorageSubmission: number;
  storageSuccessRate: number;
  totalWindows: number;
}

/**
 * Liquidation calculation request
 */
export interface LiquidationRequest {
  entryPrice: number;
  leverage: number;
  lookbackMinutes: number;
}

/**
 * Liquidation calculation result
 */
export interface LiquidationResult {
  liqPrice: number;
  volatility: number;
  priceRange: {
    min: number;
    max: number;
  };
}

