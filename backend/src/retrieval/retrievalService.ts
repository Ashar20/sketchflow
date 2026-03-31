import { PriceWindowPayload, LiquidationRequest, LiquidationResult } from '../types/index.js';
import { MongoDBStorage } from '../storage/mongoStorage.js';
import { PriceAggregator } from '../aggregator/priceAggregator.js';
import logger from '../utils/logger.js';

export class RetrievalService {
  private mongoStorage: MongoDBStorage;

  constructor(
    mongoStorage: MongoDBStorage
  ) {
    this.mongoStorage = mongoStorage;
  }

  /**
   * Get the latest price window
   */
  public async getLatestWindow(): Promise<PriceWindowPayload | null> {
    try {
      const latestWindowTimestamp = await this.mongoStorage.getLatestWindow();
      
      if (latestWindowTimestamp === null) {
        logger.info('No windows stored yet');
        return null;
      }

      return await this.getWindow(latestWindowTimestamp);
    } catch (error) {
      logger.error('Failed to get latest window', error);
      throw error;
    }
  }

  /**
   * Get a specific price window by timestamp
   */
  public async getWindow(windowStart: number): Promise<PriceWindowPayload | null> {
    try {
      logger.info('Retrieving window', { windowStart });

      // Get commitment from MongoDB
      const commitment = await this.mongoStorage.getCommitment(windowStart);

      if (commitment === null) {
        logger.warn('No commitment found for window', { windowStart });
        return null;
      }

      // Retrieve data from MongoDB
      const payload = await this.mongoStorage.retrieveData(commitment);

      logger.info('Window retrieved successfully', {
        windowStart,
        priceCount: payload.prices.length,
        twap: payload.twap
      });

      return payload;
    } catch (error) {
      logger.error('Failed to retrieve window', { windowStart, error });
      throw error;
    }
  }

  /**
   * Get multiple windows in a time range
   */
  public async getWindowsInRange(start: number, end: number): Promise<PriceWindowPayload[]> {
    try {
      logger.info('Retrieving windows in range', { start, end });

      // Get window timestamps from MongoDB
      const windowTimestamps = await this.mongoStorage.getWindowsInRange(start, end);

      if (windowTimestamps.length === 0) {
        logger.info('No windows found in range', { start, end });
        return [];
      }

      // Retrieve all windows in parallel
      const windows = await Promise.all(
        windowTimestamps.map(timestamp => this.getWindow(timestamp))
      );

      // Filter out null values
      const validWindows = windows.filter((w): w is PriceWindowPayload => w !== null);

      logger.info('Windows retrieved successfully', {
        start,
        end,
        count: validWindows.length
      });

      return validWindows;
    } catch (error) {
      logger.error('Failed to retrieve windows in range', { start, end, error });
      throw error;
    }
  }

  /**
   * Get price history for a lookback period (in minutes)
   */
  public async getPriceHistory(lookbackMinutes: number): Promise<number[]> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = now - (lookbackMinutes * 60);
      
      // Align to minute boundaries
      const startWindow = Math.floor(start / 60) * 60;
      const endWindow = Math.floor(now / 60) * 60;

      const windows = await this.getWindowsInRange(startWindow, endWindow);

      // Flatten all prices from all windows
      const allPrices = windows.flatMap(w => w.prices);

      logger.info('Price history retrieved', {
        lookbackMinutes,
        windowCount: windows.length,
        priceCount: allPrices.length
      });

      return allPrices;
    } catch (error) {
      logger.error('Failed to get price history', { lookbackMinutes, error });
      throw error;
    }
  }

  /**
   * Calculate liquidation price based on historical volatility
   */
  public async calculateLiquidation(request: LiquidationRequest): Promise<LiquidationResult> {
    try {
      logger.info('Calculating liquidation price', request);

      // Get historical prices
      const prices = await this.getPriceHistory(request.lookbackMinutes);

      if (prices.length === 0) {
        throw new Error('No price data available for liquidation calculation');
      }

      // Calculate volatility (standard deviation)
      const stdDev = PriceAggregator.calculateStdDev(prices);
      const mean = PriceAggregator.calculateTWAPStatic(prices);
      const volatilityPercent = (stdDev / mean) * 100;

      // Calculate price range
      const min = Math.min(...prices);
      const max = Math.max(...prices);

      // Calculate liquidation price
      // Formula: entryPrice - (entryPrice / leverage) - (volatility buffer)
      const leverageBuffer = request.entryPrice / request.leverage;
      const volatilityBuffer = stdDev * 2; // 2 standard deviations
      const liqPrice = request.entryPrice - leverageBuffer - volatilityBuffer;

      const result: LiquidationResult = {
        liqPrice: Math.max(0, liqPrice), // Ensure non-negative
        volatility: volatilityPercent,
        priceRange: { min, max }
      };

      logger.info('Liquidation calculated', {
        request,
        result
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate liquidation', { request, error });
      throw error;
    }
  }

  /**
   * Get price window for a specific position based on its openTimestamp
   * Extracts prices from current minute (from start second) and next minute (to complete 60 seconds)
   * 
   * @param openTimestamp Position's open timestamp in seconds
   * @returns PriceWindowPayload with exactly 60 prices covering the position's 60-second window
   */
  public async getWindowForPosition(openTimestamp: number): Promise<PriceWindowPayload | null> {
    try {
      logger.info('Getting window for position', { openTimestamp });

      // Calculate which seconds we need
      const startSecond = openTimestamp % 60; // e.g., 20 if position starts at :20
      const pricesFromCurrentMinute = 60 - startSecond; // e.g., 40 prices
      const pricesFromNextMinute = startSecond; // e.g., 20 prices

      // Get minute-aligned windows
      const currentMinuteStart = Math.floor(openTimestamp / 60) * 60;
      const nextMinuteStart = currentMinuteStart + 60;

      logger.debug('Position window calculation', {
        openTimestamp,
        startSecond,
        pricesFromCurrentMinute,
        pricesFromNextMinute,
        currentMinuteStart,
        nextMinuteStart
      });

      // Retrieve both windows
      const currentWindow = await this.getWindow(currentMinuteStart);
      if (!currentWindow) {
        logger.warn('Current minute window not found', { currentMinuteStart });
        return null;
      }

      // If position starts at second 0, we only need the current minute window
      if (startSecond === 0) {
        logger.info('Position starts at minute boundary, using current window only');
        return {
          ...currentWindow,
          windowStart: openTimestamp,
          windowEnd: openTimestamp + 59
        };
      }

      // Retrieve next minute window
      // Windows are stored at the END of the minute they represent
      // e.g., window for 16:40:00-16:41:00 is stored at 16:41:00
      // So if we're still in minute 16:40, that window hasn't been stored yet
      const now = Math.floor(Date.now() / 1000);
      const currentMinute = Math.floor(now / 60) * 60;
      const nextMinuteEnd = nextMinuteStart + 60; // When the next window will be stored
      const isNextMinuteWindowStored = currentMinute >= nextMinuteEnd;
      
      if (!isNextMinuteWindowStored) {
        logger.warn('Next minute window not yet stored (window stored at end of minute)', { 
          nextMinuteStart,
          nextMinuteEnd,
          currentMinute,
          openTimestamp,
          now,
          secondsUntilStored: nextMinuteEnd - now,
          note: 'Window for next minute is stored at the end of that minute. Need to wait for window to be stored.'
        });
        // Next minute window hasn't been stored yet - return null so caller can retry
        return null;
      }

      const nextWindow = await this.getWindow(nextMinuteStart);
      if (!nextWindow) {
        logger.warn('Next minute window not found in storage', { 
          nextMinuteStart,
          openTimestamp,
          currentMinute,
          note: 'Window should exist but was not found in contract storage'
        });
        // Window should exist but doesn't - might be a data issue
        return null;
      }

      // Extract and combine prices
      const prices: number[] = [];
      
      // From current minute: seconds [startSecond, 59]
      for (let i = startSecond; i < 60; i++) {
        prices.push(currentWindow.prices[i]);
      }
      
      // From next minute: seconds [0, startSecond-1]
      for (let i = 0; i < startSecond; i++) {
        prices.push(nextWindow.prices[i]);
      }

      // Validate we have exactly 60 prices
      if (prices.length !== 60) {
        logger.error('Price extraction failed', {
          openTimestamp,
          expected: 60,
          actual: prices.length,
          pricesFromCurrentMinute,
          pricesFromNextMinute
        });
        return null;
      }

      // Recalculate TWAP and volatility for the combined 60 prices
      const twap = PriceAggregator.calculateTWAPStatic(prices);
      const stdDev = PriceAggregator.calculateStdDev(prices);
      const volatility = (stdDev / twap) * 100; // Percentage of mean

      // Get last price, bid, ask from the last price in the window
      const lastPrice = prices[prices.length - 1];
      const bid = lastPrice * 0.9999; // Approximate
      const ask = lastPrice * 1.0001; // Approximate

      const payload: PriceWindowPayload = {
        windowStart: openTimestamp,
        windowEnd: openTimestamp + 59,
        prices,
        lastPrice,
        bid,
        ask,
        twap,
        volatility
      };

      logger.info('Window for position retrieved successfully', {
        openTimestamp,
        priceCount: prices.length,
        twap,
        volatility,
        extractedFrom: {
          currentMinute: `${startSecond}-59`,
          nextMinute: `0-${startSecond - 1}`
        }
      });

      return payload;
    } catch (error) {
      logger.error('Failed to get window for position', { openTimestamp, error });
      throw error;
    }
  }

  /**
   * Get summary statistics for recent windows
   */
  public async getSummaryStats(windowCount: number = 10): Promise<{
    avgTwap: number;
    avgVolatility: number;
    minPrice: number;
    maxPrice: number;
    windowCount: number;
  }> {
    try {
      const latestWindowTimestamp = await this.mongoStorage.getLatestWindow();
      
      if (latestWindowTimestamp === null) {
        throw new Error('No windows available');
      }

      const startWindow = latestWindowTimestamp - (windowCount * 60);
      const windows = await this.getWindowsInRange(startWindow, latestWindowTimestamp);

      if (windows.length === 0) {
        throw new Error('No windows found');
      }

      const avgTwap = windows.reduce((sum, w) => sum + w.twap, 0) / windows.length;
      const avgVolatility = windows.reduce((sum, w) => sum + w.volatility, 0) / windows.length;
      
      const allPrices = windows.flatMap(w => w.prices);
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);

      return {
        avgTwap,
        avgVolatility,
        minPrice,
        maxPrice,
        windowCount: windows.length
      };
    } catch (error) {
      logger.error('Failed to get summary stats', error);
      throw error;
    }
  }
}

export default RetrievalService;

