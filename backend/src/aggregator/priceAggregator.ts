import { EventEmitter } from 'events';
import { PriceEntry, PriceWindowPayload } from '../types/index.js';
import logger from '../utils/logger.js';

export class PriceAggregator extends EventEmitter {
  private priceBuffer: number[] = []; // Exactly 60 prices per window
  private currentWindowStart: number = 0;
  private lastPrice: number = 0;
  private secondTracker: Map<number, number> = new Map(); // second -> price
  private readonly WINDOW_SIZE_SECONDS = 60;
  private readonly EXPECTED_PRICES = 60;
  private windowTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startWindowTimer();
  }

  /**
   * Start timer to process windows at minute boundaries
   */
  private startWindowTimer(): void {
    // Calculate time until next minute boundary
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    const nextMinute = Math.ceil(currentSecond / 60) * 60;
    const msUntilNextMinute = (nextMinute * 1000) - now;

    logger.info('Scheduling first window processing', {
      currentTime: new Date(now).toISOString(),
      nextMinute: new Date(nextMinute * 1000).toISOString(),
      msUntilNextMinute
    });

    // Wait until next minute boundary
    setTimeout(() => {
      this.processCurrentWindow();
      
      // Then process every minute
      this.windowTimer = setInterval(() => {
        this.processCurrentWindow();
      }, 60000); // Every 60 seconds
    }, msUntilNextMinute);
  }

  /**
   * Add a price update (can be called multiple times per second)
   */
  public addPrice(priceEntry: PriceEntry): void {
    const currentSecond = Math.floor(priceEntry.timestamp / 1000);
    
    // Update the price for this second (overwrites if multiple updates in same second)
    this.secondTracker.set(currentSecond, priceEntry.price);
    this.lastPrice = priceEntry.price;

    // Log every price for debugging
    // if (Math.random()) { // 10% of prices
    //   logger.info('Price tracked', {
    //     originalTimestamp: priceEntry.timestamp,
    //     second: currentSecond,
    //     price: priceEntry.price,
    //     date: new Date(priceEntry.timestamp).toISOString(),
    //     trackedSeconds: this.secondTracker.size
    //   });
    // }
  }

  /**
   * Process the current window at minute boundary
   */
  private processCurrentWindow(): void {
    const now = Math.floor(Date.now() / 1000);
    const windowEnd = Math.floor(now / 60) * 60; // Current minute boundary
    const windowStart = windowEnd - 60; // Previous minute

    logger.info('Processing window at minute boundary', {
      windowStart,
      windowEnd,
      windowStartDate: new Date(windowStart * 1000).toISOString(),
      windowEndDate: new Date(windowEnd * 1000).toISOString(),
      trackedSeconds: this.secondTracker.size
    });

    // Build array of exactly 60 prices (one per second)
    const prices: number[] = new Array(60);
    
    // First pass: Fill in actual prices from secondTracker
    for (let i = 0; i < 60; i++) {
      const second = windowStart + i;
      const price = this.secondTracker.get(second);
      if (price !== undefined) {
        prices[i] = price;
      }
    }

    // Second pass: Backward fill - fill gaps by looking ahead for next known price
    let nextKnownPrice: number | undefined = undefined;
    for (let i = 59; i >= 0; i--) {
      if (prices[i] !== undefined) {
        nextKnownPrice = prices[i];
      } else if (nextKnownPrice !== undefined) {
        prices[i] = nextKnownPrice;
      }
    }

    // Third pass: Forward fill any remaining gaps at the start
    let lastKnownPrice = this.lastPrice || 1.0;
    for (let i = 0; i < 60; i++) {
      if (prices[i] !== undefined) {
        lastKnownPrice = prices[i];
      } else {
        prices[i] = lastKnownPrice;
      }
    }

    // Validate we have exactly 60 prices
    if (prices.length !== this.EXPECTED_PRICES) {
      logger.error('Price array length mismatch', {
        expected: this.EXPECTED_PRICES,
        actual: prices.length,
        windowStart
      });
      return;
    }

    // Check if we have any real data
    const uniquePrices = new Set(prices);
    if (uniquePrices.size === 0 || (uniquePrices.size === 1 && prices[0] === 1.0)) {
      logger.warn('No real price data for window, skipping', { windowStart });
      return;
    }

    logger.info('Window ready with complete data', {
      windowStart,
      priceCount: prices.length,
      uniquePrices: uniquePrices.size,
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices)
      }
    });

    // Calculate TWAP and volatility
    const twap = this.calculateTWAP(prices);
    const volatility = this.calculateVolatility(prices, twap);

    // Get last price, bid, ask
    const lastPrice = prices[prices.length - 1];
    const bid = lastPrice * 0.9999; // Approximate
    const ask = lastPrice * 1.0001; // Approximate

    const payload: PriceWindowPayload = {
      windowStart,
      windowEnd: windowEnd - 1,
      prices,
      lastPrice,
      bid,
      ask,
      twap,
      volatility
    };

    // Clean up old seconds (keep last 2 minutes for safety)
    const cutoff = windowStart - 60;
    for (const [second] of this.secondTracker) {
      if (second < cutoff) {
        this.secondTracker.delete(second);
      }
    }

    logger.info('Emitting window for processing', {
      windowStart,
      twap,
      volatility,
      priceCount: prices.length
    });

    // Emit asynchronously so we don't block the timer
    setImmediate(() => {
      this.emit('windowReady', payload);
    });
  }

  /**
   * Get the current buffer size
   */
  public getBufferSize(): number {
    return this.secondTracker.size;
  }

  /**
   * Get the current window start timestamp
   */
  public getCurrentWindowStart(): number {
    const now = Math.floor(Date.now() / 1000);
    return Math.floor(now / 60) * 60 - 60;
  }

  /**
   * Check if the current window is ready for processing
   */
  public isWindowReady(): boolean {
    // Not used anymore since we use timer-based processing
    return false;
  }

  /**
   * Force process the current window (for testing)
   */
  public forceProcessWindow(): void {
    this.processCurrentWindow();
  }

  /**
   * Calculate Time-Weighted Average Price
   */
  private calculateTWAP(prices: number[]): number {
    if (prices.length === 0) return 0;
    const sum = prices.reduce((acc, price) => acc + price, 0);
    return sum / prices.length;
  }

  /**
   * Calculate volatility (standard deviation)
   */
  private calculateVolatility(prices: number[], mean: number): number {
    if (prices.length === 0) return 0;
    
    const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    // Return as percentage of mean
    return (stdDev / mean) * 100;
  }

  /**
   * Calculate standard deviation for a set of prices
   */
  public static calculateStdDev(prices: number[]): number {
    if (prices.length === 0) return 0;
    
    const mean = prices.reduce((acc, val) => acc + val, 0) / prices.length;
    const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / prices.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate TWAP for a set of prices
   */
  public static calculateTWAPStatic(prices: number[]): number {
    if (prices.length === 0) return 0;
    return prices.reduce((acc, val) => acc + val, 0) / prices.length;
  }

  /**
   * Stop the window timer
   */
  public stop(): void {
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
      this.windowTimer = null;
    }
  }
}

export default PriceAggregator;
