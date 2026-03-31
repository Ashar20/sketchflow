import cron from 'node-cron';
import { PositionService, PositionCloseResult } from './positionService.js';
import { FuturesContractStorage } from '../contract/futuresContractStorage.js';
import type { FlowFuturesContractStorage } from '../contract/flowFuturesContractStorage.js';
import logger from '../utils/logger.js';

/**
 * Close expired positions result
 */
export interface CloseExpiredResult {
  success: boolean;
  summary: {
    totalScanned: number;
    expiredFound: number;
    processed: number;
    successful: number;
    failed: number;
  };
  closedPositions: Array<{
    positionId: number;
    user: string;
    pnl: string;
    txHash: string;
  }>;
  failedPositions: Array<{
    positionId: number;
    error: string;
    code?: string;
  }>;
  executionTime: string;
}

/**
 * Failed position tracking
 */
interface FailedPosition {
  positionId: number;
  failCount: number;
  lastError: string;
  lastAttempt: number;
}

/**
 * Position Closer Service
 * Automatically closes expired positions via cron job
 */
export class PositionCloser {
  private positionService: PositionService;
  private futuresContract: FuturesContractStorage | FlowFuturesContractStorage;
  private skipPositionIds: Set<number>;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private delayBetweenClosures: number = 2000; // 2 seconds delay between closures
  private retryQueue: Map<number, FailedPosition> = new Map();
  private maxRetries: number = 5; // Max retries before giving up on a position

  constructor(
    positionService: PositionService,
    futuresContract: FuturesContractStorage | FlowFuturesContractStorage,
    skipPositionIds: number[] = []
  ) {
    this.positionService = positionService;
    this.futuresContract = futuresContract;
    this.skipPositionIds = new Set(skipPositionIds);

    if (this.skipPositionIds.size > 0) {
      logger.info('PositionCloser skipping position IDs', {
        skipPositionIds: [...this.skipPositionIds]
      });
    }
    logger.info('PositionCloser initialized');
  }

  /**
   * Start the cron job to auto-close expired positions
   * Runs every 10 seconds
   */
  public start(): void {
    if (this.cronJob) {
      logger.warn('PositionCloser cron job already running');
      return;
    }

    // Run every 10 seconds
    this.cronJob = cron.schedule('*/10 * * * * *', async () => {
      await this.checkAndCloseExpired();
    });

    logger.info('PositionCloser cron job started (runs every 10 seconds)');
  }

  /**
   * Stop the cron job
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('PositionCloser cron job stopped');
    }
  }

  /**
   * Check and close expired positions (called by cron)
   */
  private async checkAndCloseExpired(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Position closer already running, skipping this cycle');
      return;
    }

    this.isRunning = true;

    try {
      logger.debug('Checking for expired positions');

      // Remove skip-listed positions from retry queue so we don't keep them around
      if (this.skipPositionIds.size > 0) {
        for (const id of this.skipPositionIds) {
          if (this.retryQueue.has(id)) {
            this.retryQueue.delete(id);
          }
        }
      }

      const closablePositions = await this.futuresContract.getClosablePositions();
      const filteredClosable = closablePositions.filter((id) => !this.skipPositionIds.has(id));

      if (filteredClosable.length === 0 && this.retryQueue.size === 0) {
        logger.debug('No expired positions found');
        return;
      }

      if (this.skipPositionIds.size > 0 && closablePositions.length !== filteredClosable.length) {
        logger.debug('Skipping closable positions (in skip list)', {
          skipped: closablePositions.filter((id) => this.skipPositionIds.has(id)),
          willAttempt: filteredClosable
        });
      }

      logger.info('Found closable positions', { 
        count: filteredClosable.length,
        retryQueueSize: this.retryQueue.size 
      });

      // Combine new closable positions with retry queue, excluding skip list
      const retryIds = [...this.retryQueue.keys()].filter((id) => !this.skipPositionIds.has(id));
      const allPositions = new Set([...filteredClosable, ...retryIds]);

      // Close positions with delay between each
      for (const positionId of allPositions) {
        try {
          logger.info('Auto-closing position', { positionId });
          await this.positionService.closePosition(positionId);
          
          // Remove from retry queue on success
          if (this.retryQueue.has(positionId)) {
            logger.info('Position closed successfully after retry', { 
              positionId,
              previousFailures: this.retryQueue.get(positionId)?.failCount 
            });
            this.retryQueue.delete(positionId);
          }
          
          // Delay before next closure to avoid gas spikes
          if (allPositions.size > 1) {
            await this.sleep(this.delayBetweenClosures);
          }
        } catch (error: any) {
          this.handlePositionCloseError(positionId, error);
          // Continue with next position
        }
      }

      // Clean up old entries from retry queue (positions that are no longer open)
      await this.cleanupRetryQueue();

    } catch (error) {
      logger.error('Error in position closer cron job', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle position close error with retry logic
   */
  private handlePositionCloseError(positionId: number, error: any): void {
    const errorMessage = error.message || error.toString();
    const now = Date.now();

    // Check if this is a retrieval error (missing data)
    const isRetrievalError = 
      errorMessage.includes('Failed to retrieve') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('MongoDB') ||
      errorMessage.includes('Actual price data not found') ||
      errorMessage.includes('price data not found for position window') ||
      errorMessage.includes('window not found') ||
      errorMessage.includes('not yet stored');

    if (this.retryQueue.has(positionId)) {
      const failedPos = this.retryQueue.get(positionId)!;
      failedPos.failCount++;
      failedPos.lastError = errorMessage;
      failedPos.lastAttempt = now;

      if (failedPos.failCount >= this.maxRetries) {
        logger.error('Position failed too many times, removing from retry queue', {
          positionId,
          failCount: failedPos.failCount,
          lastError: errorMessage
        });
        this.retryQueue.delete(positionId);
      } else {
        logger.warn('Position close failed, will retry', {
          positionId,
          failCount: failedPos.failCount,
          maxRetries: this.maxRetries,
          isRetrievalError,
          error: errorMessage
        });
      }
    } else {
      // First failure - add to retry queue
      this.retryQueue.set(positionId, {
        positionId,
        failCount: 1,
        lastError: errorMessage,
        lastAttempt: now
      });

      logger.warn('Position close failed, added to retry queue', {
        positionId,
        isRetrievalError,
        error: errorMessage
      });
    }
  }

  /**
   * Clean up retry queue by removing positions that are no longer open
   */
  private async cleanupRetryQueue(): Promise<void> {
    if (this.retryQueue.size === 0) {
      return;
    }

    const positionsToRemove: number[] = [];

    for (const [positionId, failedPos] of this.retryQueue.entries()) {
      try {
        const position = await this.futuresContract.getPosition(positionId);
        
        // If position is closed, remove from retry queue
        if (!position.isOpen) {
          positionsToRemove.push(positionId);
        }

        // Remove positions that haven't been retried in over 10 minutes
        const timeSinceLastAttempt = Date.now() - failedPos.lastAttempt;
        if (timeSinceLastAttempt > 10 * 60 * 1000) {
          positionsToRemove.push(positionId);
        }
      } catch (error) {
        // If we can't get position info, remove from queue
        positionsToRemove.push(positionId);
      }
    }

    for (const positionId of positionsToRemove) {
      logger.info('Removing position from retry queue', { positionId });
      this.retryQueue.delete(positionId);
    }
  }

  /**
   * Manually close expired positions (API endpoint)
   */
  public async closeExpiredPositions(maxPositions?: number): Promise<CloseExpiredResult> {
    const startTime = Date.now();

    try {
      logger.info('Manually closing expired positions', { maxPositions });

      // Get all open positions
      const openPositions = await this.futuresContract.getOpenPositions();
      const totalScanned = openPositions.length;

      // Find expired positions
      const expiredPositions: number[] = [];
      for (const positionId of openPositions) {
        const canClose = await this.futuresContract.canClosePosition(positionId);
        if (canClose) {
          expiredPositions.push(positionId);
        }
      }

      const expiredFound = expiredPositions.length;
      logger.info('Found expired positions', { totalScanned, expiredFound });

      // Limit number to process
      const toProcess = maxPositions
        ? expiredPositions.slice(0, maxPositions)
        : expiredPositions;

      const closedPositions: Array<{
        positionId: number;
        user: string;
        pnl: string;
        txHash: string;
      }> = [];

      const failedPositions: Array<{
        positionId: number;
        error: string;
        code?: string;
      }> = [];

      // Process each position
      for (const positionId of toProcess) {
        try {
          logger.info('Closing position', { positionId });
          
          const result = await this.positionService.closePosition(positionId);
          
          closedPositions.push({
            positionId: result.positionId,
            user: result.user,
            pnl: result.pnl,
            txHash: result.transaction.hash
          });

          // Delay between closures
          if (toProcess.length > 1) {
            await this.sleep(this.delayBetweenClosures);
          }
        } catch (error: any) {
          logger.error('Failed to close position', { positionId, error });
          
          failedPositions.push({
            positionId,
            error: error.message || 'Unknown error',
            code: error.code
          });
        }
      }

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

      const result: CloseExpiredResult = {
        success: true,
        summary: {
          totalScanned,
          expiredFound,
          processed: toProcess.length,
          successful: closedPositions.length,
          failed: failedPositions.length
        },
        closedPositions,
        failedPositions,
        executionTime
      };

      logger.info('Expired positions closed', {
        totalScanned,
        expiredFound,
        successful: closedPositions.length,
        failed: failedPositions.length,
        executionTime
      });

      return result;
    } catch (error) {
      logger.error('Failed to close expired positions', error);
      throw error;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get status
   */
  public getStatus(): {
    isRunning: boolean;
    cronActive: boolean;
    retryQueueSize: number;
    retryQueue: Array<{
      positionId: number;
      failCount: number;
      lastError: string;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      cronActive: this.cronJob !== null,
      retryQueueSize: this.retryQueue.size,
      retryQueue: Array.from(this.retryQueue.values()).map(fp => ({
        positionId: fp.positionId,
        failCount: fp.failCount,
        lastError: fp.lastError
      }))
    };
  }

  /**
   * Set delay between closures
   */
  public setDelayBetweenClosures(delayMs: number): void {
    this.delayBetweenClosures = delayMs;
    logger.info('Delay between closures updated', { delayMs });
  }
}

export default PositionCloser;

