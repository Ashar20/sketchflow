import { PriceIngester } from './ingester/priceIngester.js';
import { PriceAggregator } from './aggregator/priceAggregator.js';
import { MongoDBStorage } from './storage/mongoStorage.js';
import { RetrievalService } from './retrieval/retrievalService.js';
import { Orchestrator } from './orchestrator/orchestrator.js';
import { HealthMonitor } from './monitor/healthMonitor.js';
import { APIServer } from './api/server.js';
import { PredictionService } from './futures/predictionService.js';
import { FuturesContractStorage } from './contract/futuresContractStorage.js';
import { FlowFuturesContractStorage } from './contract/flowFuturesContractStorage.js';
import { PNLCalculator } from './pnl/pnlCalculator.js';
import { PositionService } from './futures/positionService.js';
import { PositionCloser } from './futures/positionCloser.js';
import { PositionDatabase } from './database/positionDatabase.js';
import logger from './utils/logger.js';
import config from './config/config.js';

/**
 * Main application class
 */
class MNTPriceOracleApp {
  private ingester: PriceIngester;
  private aggregator: PriceAggregator;
  private mongoStorage: MongoDBStorage;
  private retrievalService: RetrievalService;
  private orchestrator: Orchestrator;
  private healthMonitor: HealthMonitor;
  private apiServer: APIServer;

  // Futures components
  private futuresContractStorage?: FuturesContractStorage | FlowFuturesContractStorage;
  private predictionService?: PredictionService;
  private pnlCalculator?: PNLCalculator;
  private positionService?: PositionService;
  private positionCloser?: PositionCloser;
  private positionDatabase?: PositionDatabase;

  constructor() {
    logger.info('Initializing Sketch Flow — Price Oracle & Line Futures', {
      network: config.network,
      blockchainAdapter: config.blockchainAdapter,
      futuresContractAddress: config.futuresContractAddress
    });

    // Initialize oracle components
    this.ingester = new PriceIngester(config.defaultPriceSymbol);
    this.aggregator = new PriceAggregator();
    this.mongoStorage = new MongoDBStorage();

    this.retrievalService = new RetrievalService(
      this.mongoStorage
    );

    this.orchestrator = new Orchestrator(
      this.ingester,
      this.aggregator,
      this.mongoStorage
    );

    this.healthMonitor = new HealthMonitor(
      this.orchestrator
    );

    // Initialize position database (for leaderboard)
    this.positionDatabase = new PositionDatabase();
    this.positionDatabase.initialize();
    logger.info('Position database initialized');

    // Initialize futures components if contract address is configured
    const futuresEnabled =
      config.blockchainAdapter === 'flow'
        ? Boolean(config.flowLineFuturesAddress)
        : Boolean(config.futuresContractAddress);

    if (futuresEnabled) {
      logger.info('Initializing futures components');

      this.futuresContractStorage =
        config.blockchainAdapter === 'flow'
          ? new FlowFuturesContractStorage()
          : new FuturesContractStorage();

      this.predictionService = new PredictionService(
        this.mongoStorage,
        config.rateLimitWindowMs,
        config.rateLimitMaxRequests
      );

      this.pnlCalculator = new PNLCalculator();

      this.positionService = new PositionService(
        this.futuresContractStorage,
        this.predictionService,
        this.pnlCalculator,
        this.mongoStorage,
        this.retrievalService,
        this.positionDatabase
      );

      this.positionCloser = new PositionCloser(
        this.positionService,
        this.futuresContractStorage,
        config.skipPositionIds
      );
    } else {
      logger.warn('Futures contract address not configured, futures features disabled');
    }

    this.apiServer = new APIServer(
      this.retrievalService,
      this.healthMonitor,
      this.orchestrator,
      this.predictionService,
      this.positionService,
      this.positionCloser,
      this.positionDatabase
    );

    this.setupSignalHandlers();
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting Sketch Flow — Price Oracle & Line Futures application');

      // Start orchestrator (includes ingester)
      await this.orchestrator.start();

      // Start health monitor
      this.healthMonitor.start();

      // Start position closer cron job if available
      if (this.positionCloser) {
        this.positionCloser.start();
        logger.info('Position closer cron job started');
      }

      // Start API server
      await this.apiServer.start();

      logger.info('Sketch Flow — Price Oracle & Line Futures application started successfully');
      logger.info('API available at', {
        url: `http://${config.apiHost}:${config.port}`
      });

    } catch (error) {
      logger.error('Failed to start application', error);
      throw error;
    }
  }

  /**
   * Stop the application
   */
  public async stop(): Promise<void> {
    logger.info('Stopping Sketch Flow — Price Oracle & Line Futures application');

    try {
      // Stop API server
      await this.apiServer.stop();

      // Stop position closer cron job
      if (this.positionCloser) {
        this.positionCloser.stop();
        logger.info('Position closer cron job stopped');
      }

      // Stop health monitor
      this.healthMonitor.stop();

      // Stop orchestrator
      this.orchestrator.stop();

      // Close database connection
      if (this.positionDatabase) {
        this.positionDatabase.close();
        logger.info('Position database connection closed');
      }

      logger.info('Sketch Flow — Price Oracle & Line Futures application stopped successfully');
    } catch (error) {
      logger.error('Error stopping application', error);
      throw error;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', { reason, promise });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });
  }
}

// Start the application if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new MNTPriceOracleApp();

  app.start().catch((error) => {
    logger.error('Fatal error during startup', error);
    process.exit(1);
  });
}

export default MNTPriceOracleApp;

