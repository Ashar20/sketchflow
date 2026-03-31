import logger from '../utils/logger.js';

/**
 * PNL Calculation Result
 */
export interface PNLResult {
  pnl: number;                    // Final PNL in wei (can be negative)
  fee: number;                    // Fee amount in wei (0 if loss)
  finalAmount: number;            // Final amount user receives in wei
  accuracy: number;               // Accuracy score (0 to 1)
  correctDirections: number;      // Number of correct directional predictions
  totalDirections: number;        // Total directional comparisons (59)
  priceMovement: number;          // Absolute price movement
  maxProfit: number;              // Maximum possible profit
  positionSize: number;           // Position size in tokens
}

/**
 * PNL Calculator Service
 * Implements the complete PNL formula from PRD Section 5
 */
export class PNLCalculator {
  /**
   * Calculate PNL based on predictions vs actual prices
   * 
   * @param predictions Array of 60 predicted prices
   * @param actualPrices Array of 60 actual prices
   * @param amount Deposited amount in wei
   * @param leverage Leverage multiplier (1-2500)
   * @param feePercentage Fee percentage in basis points (200 = 2%)
   * @returns PNLResult with detailed breakdown
   */
  public calculatePNL(
    predictions: number[],
    actualPrices: number[],
    amount: number,
    leverage: number,
    feePercentage: number
  ): PNLResult {
    // Validate inputs
    if (predictions.length !== 60) {
      throw new Error(`Invalid predictions length: ${predictions.length}, expected 60`);
    }
    if (actualPrices.length !== 60) {
      throw new Error(`Invalid actual prices length: ${actualPrices.length}, expected 60`);
    }
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (leverage < 1 || leverage > 2500) {
      throw new Error('Leverage must be between 1 and 2500');
    }

    logger.debug('Calculating PNL', {
      predictionsCount: predictions.length,
      actualPricesCount: actualPrices.length,
      amount,
      leverage,
      feePercentage
    });

    // Step 1: Count correct directional matches (59 comparisons)
    const correctDirections = this.countCorrectDirections(predictions, actualPrices);
    const totalDirections = 59;

    // Step 2: Calculate accuracy
    const accuracy = correctDirections / totalDirections;

    // Step 3: Calculate price movement
    const priceMovement = Math.abs(Number(actualPrices[59]) - Number(actualPrices[0]));

    // Step 4: Calculate position size
    const positionSize = Number(amount) / Number(actualPrices[0]);

    // Step 5: Calculate maximum profit
    const maxProfit = Number(priceMovement) * Number(positionSize) * Number(leverage);

    // Step 6: Calculate base PNL (linear mapping)
    // Formula: PNL = (2 × Acc - 1) × Pₘₐₓ
    const pnl = (2 * Number(accuracy) - 1) * Number(maxProfit);

    // Step 7: Calculate fee (only on profits)
    const fee = pnl > 0 ? (Number(pnl) * Number(feePercentage)) / 10000 : 0;

    // Step 8: Calculate final amount
    const finalAmount = Number(amount) + Number(pnl) - Number(fee);

    const result: PNLResult = {
      pnl: Math.floor(pnl),
      fee: Math.floor(fee),
      finalAmount: Math.max(0, Math.floor(finalAmount)),
      accuracy,
      correctDirections,
      totalDirections,
      priceMovement,
      maxProfit,
      positionSize
    };

    logger.info('PNL calculated', {
      accuracy: `${(accuracy * 100).toFixed(2)}%`,
      correctDirections: `${correctDirections}/${totalDirections}`,
      pnl: result.pnl,
      fee: result.fee,
      finalAmount: result.finalAmount
    });

    return result;
  }

  /**
   * Count correct directional predictions
   * Compares direction changes between consecutive prices
   * 
   * @param predictions User's predicted prices
   * @param actualPrices Actual market prices
   * @returns Number of correct directional matches
   */
  private countCorrectDirections(predictions: number[], actualPrices: number[]): number {
    let correct = 0;

    // Compare 59 directional changes (from i=0 to i=58)
    for (let i = 0; i < 59; i++) {
      const predictedDir = this.getDirection(predictions[i], predictions[i + 1]);
      const actualDir = this.getDirection(actualPrices[i], actualPrices[i + 1]);

      if (predictedDir === actualDir) {
        correct++;
      }
    }

    return correct;
  }

  /**
   * Get direction of price change
   * 
   * @param price1 Starting price
   * @param price2 Ending price
   * @returns 1 for up, -1 for down, 0 for unchanged
   */
  private getDirection(price1: number, price2: number): number {
    if (price2 > price1) return 1;   // UP
    if (price2 < price1) return -1;  // DOWN
    return 0;                         // UNCHANGED
  }

  /**
   * Calculate PNL for multiple positions (batch)
   * 
   * @param positions Array of position data
   * @returns Array of PNL results
   */
  public calculateBatchPNL(
    positions: Array<{
      predictions: number[];
      actualPrices: number[];
      amount: number;
      leverage: number;
      feePercentage: number;
    }>
  ): PNLResult[] {
    return positions.map(pos => 
      this.calculatePNL(
        pos.predictions,
        pos.actualPrices,
        pos.amount,
        pos.leverage,
        pos.feePercentage
      )
    );
  }

  /**
   * Validate prediction array
   * 
   * @param predictions Array of predictions
   * @returns True if valid
   */
  public validatePredictions(predictions: number[]): boolean {
    if (predictions.length !== 60) {
      return false;
    }

    for (const price of predictions) {
      if (typeof price !== 'number' || price <= 0 || !isFinite(price)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate expected PNL for a given accuracy
   * Useful for simulations and testing
   * 
   * @param accuracy Target accuracy (0 to 1)
   * @param amount Deposited amount
   * @param leverage Leverage multiplier
   * @param priceMovement Price movement
   * @param initialPrice Initial price
   * @param feePercentage Fee percentage in basis points
   * @returns Expected PNL
   */
  public calculateExpectedPNL(
    accuracy: number,
    amount: number,
    leverage: number,
    priceMovement: number,
    initialPrice: number,
    feePercentage: number
  ): number {
    const positionSize = amount / initialPrice;
    const maxProfit = priceMovement * positionSize * leverage;
    const pnl = (2 * accuracy - 1) * maxProfit;
    const fee = pnl > 0 ? (pnl * feePercentage) / 10000 : 0;
    
    return pnl - fee;
  }
}

export default PNLCalculator;

