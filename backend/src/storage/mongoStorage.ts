import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { PriceWindowPayload, EigenDACommitment } from '../types/index.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

/**
 * MongoDB Storage Client
 * Replaces EigenDA for storing price windows and user predictions
 */
export class MongoDBStorage {
  private client: MongoClient;
  private db: Db | null = null;
  private priceWindowsCollection: Collection | null = null;
  private predictionsCollection: Collection | null = null;
  private priceCommitmentsCollection: Collection | null = null;
  private readonly maxRetries = 3;
  private readonly retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s
  private isConnected = false;

  constructor(
    mongoUri: string = config.mongodbUri,
    databaseName: string = config.mongodbDatabase
  ) {
    this.client = new MongoClient(mongoUri);
    this.initializeConnection(databaseName);
  }

  /**
   * Initialize MongoDB connection and collections
   */
  private async initializeConnection(databaseName: string): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(databaseName);
      
      // Get collection references
      this.priceWindowsCollection = this.db.collection('price_windows');
      this.predictionsCollection = this.db.collection('user_predictions');
      this.priceCommitmentsCollection = this.db.collection('price_commitments');

      // Create indexes
      await this.createIndexes();
      
      this.isConnected = true;
      logger.info('MongoDB connected successfully', {
        database: databaseName
      });
    } catch (error) {
      logger.error('Failed to initialize MongoDB connection', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Create database indexes for optimal query performance
   */
  private async createIndexes(): Promise<void> {
    try {
      // Price windows indexes
      await this.priceWindowsCollection!.createIndex(
        { windowStart: 1 },
        { unique: true }
      );
      await this.priceWindowsCollection!.createIndex({ createdAt: 1 });

      // User predictions indexes
      await this.predictionsCollection!.createIndex({ userAddress: 1 });
      await this.predictionsCollection!.createIndex({ createdAt: 1 });

      // Price commitments indexes
      await this.priceCommitmentsCollection!.createIndex(
        { windowStart: 1 },
        { unique: true }
      );
      await this.priceCommitmentsCollection!.createIndex({ createdAt: 1 });

      logger.info('MongoDB indexes created successfully');
    } catch (error) {
      logger.warn('Failed to create some indexes (may already exist)', error);
    }
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): void {
    if (!this.isConnected || !this.db || !this.priceWindowsCollection || !this.predictionsCollection || !this.priceCommitmentsCollection) {
      throw new Error('MongoDB not connected');
    }
  }

  /**
   * Submit a price window payload to MongoDB
   */
  public async submitPayload(payload: PriceWindowPayload): Promise<EigenDACommitment> {
    logger.info('Submitting payload to MongoDB', {
      windowStart: payload.windowStart,
      priceCount: payload.prices.length
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const commitment = await this.attemptSubmission(payload);
        
        logger.info('MongoDB submission successful', {
          windowStart: payload.windowStart,
          commitment: commitment.commitment,
          attempt: attempt + 1
        });

        return commitment;

      } catch (error) {
        lastError = error as Error;
        logger.warn('MongoDB submission failed', {
          windowStart: payload.windowStart,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message
        });

        // If not the last attempt, wait before retrying
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt];
          logger.info('Retrying MongoDB submission', {
            delay: `${delay}ms`,
            nextAttempt: attempt + 2
          });
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('MongoDB submission failed after all retries', {
      windowStart: payload.windowStart,
      attempts: this.maxRetries,
      error: lastError?.message
    });

    throw new Error(
      `Failed to submit to MongoDB after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Submit any generic data to MongoDB (for predictions, etc.)
   */
  public async submitData(data: any): Promise<EigenDACommitment> {
    logger.info('Submitting generic data to MongoDB', {
      dataType: data.type || 'unknown'
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const commitment = await this.attemptGenericSubmission(data);
        
        logger.info('MongoDB submission successful', {
          dataType: data.type || 'unknown',
          commitment: commitment.commitment,
          attempt: attempt + 1
        });

        return commitment;

      } catch (error) {
        lastError = error as Error;
        logger.warn('MongoDB submission failed', {
          dataType: data.type || 'unknown',
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message
        });

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt];
          logger.info('Retrying MongoDB submission', {
            delay: `${delay}ms`,
            nextAttempt: attempt + 2
          });
          await this.sleep(delay);
        }
      }
    }

    logger.error('MongoDB submission failed after all retries', {
      dataType: data.type || 'unknown',
      attempts: this.maxRetries,
      error: lastError?.message
    });

    throw new Error(
      `Failed to submit to MongoDB after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Attempt a single submission to MongoDB (price window)
   */
  private async attemptSubmission(payload: PriceWindowPayload): Promise<EigenDACommitment> {
    this.ensureConnected();

    const document = {
      windowStart: payload.windowStart,
      windowEnd: payload.windowEnd,
      prices: payload.prices,
      lastPrice: payload.lastPrice,
      bid: payload.bid,
      ask: payload.ask,
      twap: payload.twap,
      volatility: payload.volatility,
      createdAt: new Date()
    };

    logger.debug('Inserting price window into MongoDB', {
      windowStart: payload.windowStart,
      priceCount: payload.prices.length
    });

    const result = await this.priceWindowsCollection!.insertOne(document);

    if (!result.insertedId) {
      throw new Error('MongoDB did not return an inserted ID');
    }

    const commitment = result.insertedId.toHexString();

    logger.debug('MongoDB commitment received', {
      commitment,
      objectId: result.insertedId.toString()
    });

    return {
      commitment: `0x${commitment}`,
    };
  }

  /**
   * Attempt a single generic submission to MongoDB (predictions)
   */
  private async attemptGenericSubmission(data: any): Promise<EigenDACommitment> {
    this.ensureConnected();

    const document = {
      ...data,
      createdAt: new Date()
    };

    logger.debug('Inserting data into MongoDB', {
      dataType: data.type || 'unknown'
    });

    const result = await this.predictionsCollection!.insertOne(document);

    if (!result.insertedId) {
      throw new Error('MongoDB did not return an inserted ID');
    }

    const commitment = result.insertedId.toHexString();

    logger.debug('MongoDB commitment received', {
      commitment,
      objectId: result.insertedId.toString()
    });

    return {
      commitment: `0x${commitment}`,
    };
  }

  /**
   * Retrieve data from MongoDB using a commitment (with retry logic)
   */
  public async retrieveData(commitment: string): Promise<any> {
    logger.info('Retrieving data from MongoDB', { commitment });

    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s

    // Remove '0x' prefix if present
    const cleanCommitment = commitment.startsWith('0x') 
      ? commitment.slice(2) 
      : commitment;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.debug('MongoDB retrieval attempt', {
          commitment,
          attempt: attempt + 1,
          maxRetries
        });

        this.ensureConnected();

        // Convert hex string to ObjectId
        let objectId: ObjectId;
        try {
          objectId = new ObjectId(cleanCommitment);
        } catch (error) {
          logger.error('Invalid ObjectId format', { commitment });
          return null;
        }

        // Try to find in price_windows collection first
        let document = await this.priceWindowsCollection!.findOne({ _id: objectId });

        // If not found, try user_predictions collection
        if (!document) {
          document = await this.predictionsCollection!.findOne({ _id: objectId });
        }

        // Data not found in either collection
        if (!document) {
          logger.warn('Data not found in MongoDB', { commitment });
          return null;
        }

        // Remove MongoDB _id and createdAt before returning
        const { _id, createdAt, ...payload } = document as any;

        logger.info('Data retrieved from MongoDB', {
          commitment,
          dataType: payload.type || 'price_window',
          attempt: attempt + 1
        });

        return payload;

      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries - 1;

        logger.warn('MongoDB retrieval attempt failed', {
          commitment,
          attempt: attempt + 1,
          maxRetries,
          error: error.message || error.toString()
        });

        if (isLastAttempt) {
          logger.error('Failed to retrieve from MongoDB after all retries', {
            commitment,
            attempts: maxRetries,
            error
          });
          throw error;
        }

        // Wait before retry with exponential backoff
        const delay = retryDelays[attempt];
        logger.info('Retrying MongoDB retrieval', {
          commitment,
          nextAttempt: attempt + 2,
          delayMs: delay
        });
        await this.sleep(delay);
      }
    }

    throw new Error('Failed to retrieve from MongoDB: max retries exceeded');
  }

  /**
   * Test the MongoDB connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.client.db('admin').command({ ping: 1 });
      logger.info('MongoDB connection test successful');
      return true;

    } catch (error) {
      logger.error('MongoDB connection test failed', error);
      return false;
    }
  }

  /**
   * Close the MongoDB connection
   */
  public async close(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      logger.info('MongoDB connection closed');
    } catch (error) {
      logger.error('Error closing MongoDB connection', error);
      throw error;
    }
  }

  /**
   * Store a commitment mapping (windowStart → commitment)
   */
  public async storeCommitment(windowStart: number, commitment: string): Promise<void> {
    this.ensureConnected();

    logger.debug('Storing commitment in MongoDB', {
      windowStart,
      commitment: commitment.substring(0, 20) + '...'
    });

    const document = {
      windowStart,
      commitment,
      createdAt: new Date()
    };

    try {
      await this.priceCommitmentsCollection!.insertOne(document);
      logger.info('Commitment stored successfully', { windowStart });
    } catch (error: any) {
      // Handle duplicate key error (windowStart already exists)
      if (error.code === 11000) {
        logger.warn('Commitment already exists for window, updating', { windowStart });
        await this.priceCommitmentsCollection!.updateOne(
          { windowStart },
          { $set: { commitment, createdAt: new Date() } }
        );
      } else {
        logger.error('Failed to store commitment', { windowStart, error });
        throw error;
      }
    }
  }

  /**
   * Get commitment for a specific window
   */
  public async getCommitment(windowStart: number): Promise<string | null> {
    this.ensureConnected();

    try {
      const document = await this.priceCommitmentsCollection!.findOne({ windowStart });
      
      if (!document) {
        logger.debug('No commitment found for window', { windowStart });
        return null;
      }

      return document.commitment as string;
    } catch (error) {
      logger.error('Failed to get commitment', { windowStart, error });
      throw error;
    }
  }

  /**
   * Get the latest window timestamp
   */
  public async getLatestWindow(): Promise<number | null> {
    this.ensureConnected();

    try {
      const document = await this.priceCommitmentsCollection!
        .findOne({}, { sort: { windowStart: -1 } });

      if (!document) {
        return null;
      }

      return document.windowStart as number;
    } catch (error) {
      logger.error('Failed to get latest window', { error });
      throw error;
    }
  }

  /**
   * Get window timestamps in a time range
   */
  public async getWindowsInRange(start: number, end: number): Promise<number[]> {
    this.ensureConnected();

    try {
      const documents = await this.priceCommitmentsCollection!
        .find({
          windowStart: { $gte: start, $lte: end }
        })
        .sort({ windowStart: 1 })
        .toArray();

      return documents.map(doc => doc.windowStart as number);
    } catch (error) {
      logger.error('Failed to get windows in range', { start, end, error });
      throw error;
    }
  }

  /**
   * Get total count of stored windows
   */
  public async getWindowCount(): Promise<number> {
    this.ensureConnected();

    try {
      const count = await this.priceCommitmentsCollection!.countDocuments();
      return count;
    } catch (error) {
      logger.error('Failed to get window count', { error });
      throw error;
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MongoDBStorage;
