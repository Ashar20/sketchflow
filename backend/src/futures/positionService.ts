import { FuturesContractStorage, Position } from '../contract/futuresContractStorage.js';
import type { FlowFuturesContractStorage } from '../contract/flowFuturesContractStorage.js';
import { PredictionService } from './predictionService.js';
import { PNLCalculator, PNLResult } from '../pnl/pnlCalculator.js';
import { MongoDBStorage } from '../storage/mongoStorage.js';
import { RetrievalService } from '../retrieval/retrievalService.js';
import { PositionDatabase } from '../database/positionDatabase.js';
import logger from '../utils/logger.js';

/**
 * Position close result
 */
export interface PositionCloseResult {
  success: boolean;
  positionId: number;
  user: string;
  amount: string;
  leverage: number;
  pnl: string;
  fee: string;
  finalAmount: string;
  accuracy: number;
  correctDirections: number;
  totalDirections: number;
  priceMovement: string;
  maxProfit: string;
  actualPriceCommitmentId: string;
  transaction: {
    hash: string;
    blockNumber?: number;
    gasUsed?: string;
  };
  closedAt: number;
}

/**
 * Position details with analytics
 */
export interface PositionDetails extends Position {
  predictions?: number[];
  actualPrices?: number[];
  analytics?: {
    accuracy: number;
    correctDirections: number;
    totalDirections: number;
    priceMovement: number;
    maxProfit: number;
    fee: number;
  };
}

/**
 * Position Service
 * Manages positions, retrieval, and closing
 */
export class PositionService {
  private futuresContract: FuturesContractStorage | FlowFuturesContractStorage;
  private predictionService: PredictionService;
  private pnlCalculator: PNLCalculator;
  private mongoStorage: MongoDBStorage;
  private retrievalService: RetrievalService;
  private positionDatabase?: PositionDatabase;
  constructor(
    futuresContract: FuturesContractStorage | FlowFuturesContractStorage,
    predictionService: PredictionService,
    pnlCalculator: PNLCalculator,
    mongoStorage: MongoDBStorage,
    retrievalService: RetrievalService,
    positionDatabase?: PositionDatabase
  ) {
    this.futuresContract = futuresContract;
    this.predictionService = predictionService;
    this.pnlCalculator = pnlCalculator;
    this.mongoStorage = mongoStorage;
    this.retrievalService = retrievalService;
    this.positionDatabase = positionDatabase;

    logger.info('PositionService initialized', {
      hasDatabase: !!positionDatabase
    });
  }

  /**
   * Get position by ID
   */
  public async getPosition(positionId: number): Promise<Position> {
    try {
      logger.debug('Getting position', { positionId });
      return await this.futuresContract.getPosition(positionId);
    } catch (error) {
      logger.error('Failed to get position', { positionId, error });
      throw error;
    }
  }

  /**
   * Get position with full details including predictions and analytics
   */
  public async getPositionDetails(
    positionId: number,
    includePredictions: boolean = false,
    includeAnalytics: boolean = true
  ): Promise<PositionDetails> {
    try {
      logger.debug('Getting position details', {
        positionId,
        includePredictions,
        includeAnalytics
      });

      const position = await this.getPosition(positionId);
      const details: PositionDetails = { ...position };

      // Retrieve predictions if requested
      if (includePredictions && position.predictionCommitmentId) {
        try {
          const predictionBlob = await this.predictionService.retrievePredictions(
            position.predictionCommitmentId
          );
          details.predictions = predictionBlob.predictions;
        } catch (error) {
          logger.warn('Failed to retrieve predictions', { positionId, error });
        }
      }

      // Retrieve actual prices and calculate analytics if position is closed
      if (includeAnalytics && !position.isOpen && position.actualPriceCommitmentId) {
        try {
          // Get actual prices from oracle
          const actualPriceData = await this.mongoStorage.retrieveData(
            position.actualPriceCommitmentId
          );
          details.actualPrices = actualPriceData.prices;

          // Calculate analytics if we have both predictions and actual prices
          if (details.predictions && details.actualPrices) {
            const pnlResult = this.pnlCalculator.calculatePNL(
              details.predictions,
              details.actualPrices,
              Number(position.amount.toString()),
              position.leverage,
              200 // Default fee percentage
            );

            details.analytics = {
              accuracy: pnlResult.accuracy,
              correctDirections: pnlResult.correctDirections,
              totalDirections: pnlResult.totalDirections,
              priceMovement: pnlResult.priceMovement,
              maxProfit: pnlResult.maxProfit,
              fee: pnlResult.fee
            };
          }
        } catch (error) {
          logger.warn('Failed to calculate analytics', { positionId, error });
        }
      }

      return details;
    } catch (error) {
      logger.error('Failed to get position details', { positionId, error });
      throw error;
    }
  }

  /**
   * Get all positions for a user
   */
  public async getUserPositions(userAddress: string): Promise<number[]> {
    try {
      logger.debug('Getting user positions', { userAddress });
      return await this.futuresContract.getUserPositions(userAddress);
    } catch (error) {
      logger.error('Failed to get user positions', { userAddress, error });
      throw error;
    }
  }

  /**
   * Get all open positions
   */
  public async getOpenPositions(): Promise<number[]> {
    try {
      logger.debug('Getting open positions');
      return await this.futuresContract.getOpenPositions();
    } catch (error) {
      logger.error('Failed to get open positions', error);
      throw error;
    }
  }

  /**
   * Check if position can be closed
   */
  public async canClosePosition(positionId: number): Promise<boolean> {
    try {
      return await this.futuresContract.canClosePosition(positionId);
    } catch (error) {
      logger.error('Failed to check if position can be closed', { positionId, error });
      throw error;
    }
  }

  /**
   * Close a position (full workflow)
   */
  public async closePosition(positionId: number): Promise<PositionCloseResult> {
    try {
      logger.info('Starting position close workflow', { positionId });

      // Step 1: Fetch position from contract
      const position = await this.getPosition(positionId);

      // Step 2: Validate position is closable
      if (!position.isOpen) {
        throw new Error('Position is already closed');
      }

      const canClose = await this.canClosePosition(positionId);
      if (!canClose) {
        const elapsed = Math.floor(Date.now() / 1000) - Number(position.openTimestamp);
        const remaining = 60 - elapsed;
        throw new Error(`Position cannot be closed yet. ${remaining} seconds remaining`);
      }

      // Step 3: Retrieve user predictions from MongoDB
      logger.info('Retrieving user predictions', {
        positionId,
        commitmentId: position.predictionCommitmentId
      });

      const predictionBlob = await this.predictionService.retrievePredictions(
        position.predictionCommitmentId
      );
      const predictions = predictionBlob.predictions;

      // Step 4: Get actual price data for the position's time window
      // Use getWindowForPosition to extract exact 60-second window from current and next minute
      const openTimestamp = Number(position.openTimestamp);

      logger.info('Retrieving actual prices for position', {
        positionId,
        openTimestamp
      });

      const actualPriceWindow = await this.retrievalService.getWindowForPosition(openTimestamp);

      if (!actualPriceWindow) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - openTimestamp;
        const currentMinuteStart = Math.floor(openTimestamp / 60) * 60;
        const nextMinuteStart = currentMinuteStart + 60;
        const currentMinute = Math.floor(now / 60) * 60;

        logger.error('Actual price data not found for position window', {
          positionId,
          openTimestamp,
          now,
          elapsed,
          currentMinuteStart,
          nextMinuteStart,
          currentMinute,
          nextMinuteExists: nextMinuteStart <= currentMinute,
          note: 'This may happen if position closes before next minute window is stored. Will retry.'
        });

        throw new Error(`Actual price data not found for position window. Position opened at ${openTimestamp}, current time ${now}, elapsed ${elapsed}s. Next minute window (${nextMinuteStart}) ${nextMinuteStart > currentMinute ? 'not yet stored' : 'should exist but not found'}.`);
      }

      const actualPrices = actualPriceWindow.prices;

      // Get commitment ID from the current minute (the minute containing the position start)
      const currentMinuteStart = Math.floor(openTimestamp / 60) * 60;
      const actualPriceCommitmentId = await this.mongoStorage.getCommitment(currentMinuteStart);
      
      if (!actualPriceCommitmentId) {
        throw new Error(`No commitment found for window ${currentMinuteStart}`);
      }

      if (actualPrices.length !== 60) {
        throw new Error(`Invalid actual prices length: ${actualPrices.length}, expected 60`);
      }

      // Step 5: Calculate PNL
      logger.info('Calculating PNL', { positionId });

      const pnlResult = this.pnlCalculator.calculatePNL(
        predictions,
        actualPrices,
        Number(position.amount.toString()),
        position.leverage,
        200 // 2% fee
      );

      logger.info('PNL calculated', {
        positionId,
        pnl: pnlResult.pnl,
        accuracy: `${(pnlResult.accuracy * 100).toFixed(2)}%`,
        correctDirections: `${pnlResult.correctDirections}/${pnlResult.totalDirections}`
      });

      // Step 6: Call contract closePosition()
      logger.info('Closing position on contract', {
        positionId,
        pnl: pnlResult.pnl,
        actualPriceCommitmentId
      });

      const txHash = await this.futuresContract.closePosition(
        positionId,
        BigInt(pnlResult.pnl),
        actualPriceCommitmentId
      );

      // Step 7: Return result
      const result: PositionCloseResult = {
        success: true,
        positionId,
        user: position.user,
        amount: position.amount.toString(),
        leverage: position.leverage,
        pnl: pnlResult.pnl.toString(),
        fee: pnlResult.fee.toString(),
        finalAmount: pnlResult.finalAmount.toString(),
        accuracy: pnlResult.accuracy,
        correctDirections: pnlResult.correctDirections,
        totalDirections: pnlResult.totalDirections,
        priceMovement: pnlResult.priceMovement.toString(),
        maxProfit: pnlResult.maxProfit.toString(),
        actualPriceCommitmentId: actualPriceCommitmentId,
        transaction: {
          hash: txHash
        },
        closedAt: Math.floor(Date.now() / 1000)
      };

      logger.info('Position closed successfully', {
        positionId,
        txHash,
        pnl: result.pnl,
        finalAmount: result.finalAmount
      });

      // Step 8: Save to database for leaderboard
      if (this.positionDatabase) {
        try {
          // Get the closed position from contract to get closeTimestamp
          const closedPosition = await this.futuresContract.getPosition(positionId);
          const closeTimestamp = closedPosition.closeTimestamp
            ? Number(closedPosition.closeTimestamp.toString())
            : result.closedAt;

          this.positionDatabase.savePosition({
            positionId,
            userAddress: position.user,
            amount: position.amount.toString(),
            leverage: position.leverage,
            openTimestamp: Number(position.openTimestamp.toString()),
            closeTimestamp,
            pnl: result.pnl,
            predictionCommitmentId: position.predictionCommitmentId,
            actualPriceCommitmentId: result.actualPriceCommitmentId,
            txHash: result.transaction.hash,
            accuracy: result.accuracy,
            correctDirections: result.correctDirections,
            totalDirections: result.totalDirections
          });

          logger.info('Position saved to database', { positionId });
        } catch (dbError) {
          // Log but don't fail the position close if database save fails
          logger.error('Failed to save position to database', {
            positionId,
            error: dbError
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to close position', {
        positionId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  public async getUserStats(userAddress: string): Promise<{
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalPnl: string;
  }> {
    try {
      const stats = await this.futuresContract.getUserStats(userAddress);

      return {
        totalPositions: stats.totalPositions,
        openPositions: stats.openPositions,
        closedPositions: stats.closedPositions,
        totalPnl: stats.totalPnl.toString()
      };
    } catch (error) {
      logger.error('Failed to get user stats', { userAddress, error });
      throw error;
    }
  }
}

export default PositionService;

