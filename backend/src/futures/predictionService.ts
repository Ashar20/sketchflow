import { MongoDBStorage } from '../storage/mongoStorage.js';
import logger from '../utils/logger.js';

/**
 * Prediction upload request
 */
export interface PredictionUploadRequest {
  predictions: number[];
  userAddress: string;
  timestamp?: number;
}

/**
 * Prediction upload response
 */
export interface PredictionUploadResponse {
  success: boolean;
  commitmentId: string;
  fullCommitment?: string;
  timestamp: number;
  predictionsCount: number;
}

/**
 * Prediction blob structure for MongoDB storage
 */
interface PredictionBlob {
  type: string;
  version: string;
  userAddress: string;
  predictions: number[];
  uploadTimestamp: number;
}

/**
 * Rate limiter for prediction uploads
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed
   */
  public isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Get time until next request is allowed
   */
  public getRetryAfter(key: string): number {
    const requests = this.requests.get(key) || [];
    if (requests.length === 0) return 0;

    const oldestRequest = Math.min(...requests);
    const retryAfter = Math.ceil((oldestRequest + this.windowMs - Date.now()) / 1000);

    return Math.max(0, retryAfter);
  }

  /**
   * Clear rate limit for a key
   */
  public clear(key: string): void {
    this.requests.delete(key);
  }
}

/**
 * Prediction Service
 * Handles uploading user predictions to MongoDB with rate limiting
 */
export class PredictionService {
  private mongoStorage: MongoDBStorage;
  private rateLimiter: RateLimiter;

  constructor(
    mongoStorage: MongoDBStorage,
    rateLimitWindowMs: number = 60000,  // 1 minute
    rateLimitMaxRequests: number = 10    // 10 requests per minute
  ) {
    this.mongoStorage = mongoStorage;
    this.rateLimiter = new RateLimiter(rateLimitWindowMs, rateLimitMaxRequests);

    logger.info('PredictionService initialized', {
      rateLimitWindowMs,
      rateLimitMaxRequests
    });
  }

  /**
   * Upload predictions to MongoDB
   */
  public async uploadPredictions(
    request: PredictionUploadRequest,
    ipAddress?: string
  ): Promise<PredictionUploadResponse> {
    try {
      logger.info('Uploading predictions', {
        userAddress: request.userAddress,
        predictionsCount: request.predictions.length,
        ipAddress
      });

      // Validate predictions
      this.validatePredictions(request.predictions);

      // Validate user address
      if (!this.isValidAddress(request.userAddress)) {
        throw new Error('Invalid Ethereum address');
      }

      // Apply rate limiting (by IP address or user address)
      const rateLimitKey = ipAddress || request.userAddress;
      if (!this.rateLimiter.isAllowed(rateLimitKey)) {
        const retryAfter = this.rateLimiter.getRetryAfter(rateLimitKey);
        throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
      }

      // Create prediction blob
      const blob: PredictionBlob = {
        type: 'user_predictions',
        version: '1.0',
        userAddress: request.userAddress,
        predictions: request.predictions,
        uploadTimestamp: request.timestamp || Date.now()
      };

      // Upload to MongoDB
      const commitment = await this.mongoStorage.submitData(blob);

      logger.info('Predictions uploaded successfully', {
        userAddress: request.userAddress,
        commitmentId: commitment.commitment,
        predictionsCount: request.predictions.length
      });

      return {
        success: true,
        commitmentId: commitment.commitment, // Return the full commitment for the contract
        timestamp: blob.uploadTimestamp,
        predictionsCount: request.predictions.length
      };
    } catch (error) {
      logger.error('Failed to upload predictions', {
        userAddress: request.userAddress,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieve predictions from MongoDB
   * @param commitmentId The full commitment string (MongoDB ObjectId)
   */
  public async retrievePredictions(commitmentId: string): Promise<PredictionBlob> {
    try {
      logger.info('Retrieving predictions', { commitmentId });

      const data = await this.mongoStorage.retrieveData(commitmentId) as any;

      // MongoDB returned null (data not found)
      if (data == null) {
        throw new Error('Predictions not found in MongoDB (data may be unavailable)');
      }

      // Validate retrieved data
      if (data.type !== 'user_predictions') {
        throw new Error('Invalid prediction data type');
      }

      logger.info('Predictions retrieved successfully', {
        commitmentId,
        userAddress: data.userAddress,
        predictionsCount: data.predictions?.length || 0
      });

      return data as PredictionBlob;
    } catch (error) {
      logger.error('Failed to retrieve predictions', {
        commitmentId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Validate predictions array
   */
  private validatePredictions(predictions: number[]): void {
    // Must be exactly 60 predictions
    if (!Array.isArray(predictions)) {
      throw new Error('Predictions must be an array');
    }

    if (predictions.length !== 60) {
      throw new Error(`Predictions must be an array of exactly 60 numbers, got ${predictions.length}`);
    }

    // All elements must be positive numbers
    for (let i = 0; i < predictions.length; i++) {
      const price = predictions[i];
      
      if (typeof price !== 'number') {
        throw new Error(`Prediction at index ${i} is not a number: ${typeof price}`);
      }

      if (!isFinite(price)) {
        throw new Error(`Prediction at index ${i} is not finite: ${price}`);
      }

      if (price <= 0) {
        throw new Error(`Prediction at index ${i} must be positive: ${price}`);
      }
    }
  }

  /**
   * Validate Ethereum address
   */
  private isValidAddress(address: string): boolean {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Clear rate limit for a key (admin function)
   */
  public clearRateLimit(key: string): void {
    this.rateLimiter.clear(key);
    logger.info('Rate limit cleared', { key });
  }

  /**
   * Get rate limit status
   */
  public getRateLimitStatus(key: string): {
    allowed: boolean;
    retryAfter: number;
  } {
    const allowed = this.rateLimiter.isAllowed(key);
    const retryAfter = allowed ? 0 : this.rateLimiter.getRetryAfter(key);

    return { allowed, retryAfter };
  }
}

export default PredictionService;

