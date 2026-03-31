import express, { Request, Response, NextFunction } from 'express';
import { RetrievalService } from '../retrieval/retrievalService.js';
import { HealthMonitor } from '../monitor/healthMonitor.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { LiquidationRequest } from '../types/index.js';
import { PredictionService } from '../futures/predictionService.js';
import { PositionService } from '../futures/positionService.js';
import { PositionCloser } from '../futures/positionCloser.js';
import { PositionDatabase } from '../database/positionDatabase.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import {
  handleFlowFeeSponsorshipStatus,
  handleFlowSponsorSign,
} from './flowSponsorHandlers.js';
import { handleFlowOpenPosition } from './flowOpenPositionHandler.js';

export class APIServer {
  private app: express.Application;
  private retrievalService: RetrievalService;
  private healthMonitor: HealthMonitor;
  private orchestrator: Orchestrator;
  private predictionService?: PredictionService;
  private positionService?: PositionService;
  private positionCloser?: PositionCloser;
  private positionDatabase?: PositionDatabase;
  private server: any = null;

  constructor(
    retrievalService: RetrievalService,
    healthMonitor: HealthMonitor,
    orchestrator: Orchestrator,
    predictionService?: PredictionService,
    positionService?: PositionService,
    positionCloser?: PositionCloser,
    positionDatabase?: PositionDatabase
  ) {
    this.app = express();
    this.retrievalService = retrievalService;
    this.healthMonitor = healthMonitor;
    this.orchestrator = orchestrator;
    this.predictionService = predictionService;
    this.positionService = positionService;
    this.positionCloser = positionCloser;
    this.positionDatabase = positionDatabase;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, x-flow-sponsor-key');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('API request', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', this.handleHealth.bind(this));

    // Flow fee sponsorship (payer signs allowlisted LineFutures open txs)
    this.app.get('/api/flow/fee-sponsorship', handleFlowFeeSponsorshipStatus);
    this.app.post('/api/flow/sponsor-sign', (req, res) => {
      void handleFlowSponsorSign(req, res);
    });

    // Fully server-signed open position (no wallet popup required)
    this.app.post('/api/flow/open-position', (req, res) => {
      void handleFlowOpenPosition(req, res);
    });

    // Get latest price window
    this.app.get('/api/latest', this.handleLatest.bind(this));

    // Get specific window by timestamp
    this.app.get('/api/window/:timestamp', this.handleWindow.bind(this));

    // Get price history
    this.app.get('/api/history', this.handleHistory.bind(this));

    // Calculate liquidation price
    this.app.post('/api/liquidation', this.handleLiquidation.bind(this));

    // Get summary statistics
    this.app.get('/api/stats', this.handleStats.bind(this));

    // Get metrics
    this.app.get('/api/metrics', this.handleMetrics.bind(this));

    // Token pair endpoints
    this.app.get('/api/token-pairs', this.handleGetTokenPairs.bind(this));
    this.app.get('/api/token-pairs/current', this.handleGetCurrentPair.bind(this));
    this.app.post('/api/token-pairs/select', this.handleSelectPair.bind(this));

    // Futures endpoints
    if (this.predictionService) {
      this.app.post('/api/predictions/upload', this.handlePredictionUpload.bind(this));
      this.app.get('/api/predictions/:commitmentId', this.handlePredictionRetrieve.bind(this));
    }

    if (this.positionService) {
      this.app.get('/api/position/:positionId', this.handleGetPosition.bind(this));
      this.app.get('/api/positions/user/:address', this.handleGetUserPositions.bind(this));
      this.app.get('/api/positions/open', this.handleGetOpenPositions.bind(this));
    }

    if (this.positionCloser) {
      this.app.post('/api/admin/close-position', this.handleClosePosition.bind(this));
      this.app.post('/api/admin/close-expired', this.handleCloseExpired.bind(this));
    }

    if (this.positionDatabase) {
      this.app.get('/api/leaderboard', this.handleLeaderboard.bind(this));
      this.app.get('/api/leaderboard/user/:address', this.handleUserStats.bind(this));
      this.app.get('/api/positions/closed', this.handleClosedPositions.bind(this));
      this.app.get('/api/leaderboard/stats', this.handleLeaderboardStats.bind(this));
      this.app.post('/api/positions/record-open', this.handleRecordOpenTx.bind(this));
    }

    // Root endpoint
    this.app.get('/', (req, res) => {
      const endpoints = [
        'GET /api/health',
        'GET /api/flow/fee-sponsorship',
        'POST /api/flow/sponsor-sign',
        'GET /api/latest',
        'GET /api/window/:timestamp',
        'GET /api/history?start=<timestamp>&end=<timestamp>',
        'POST /api/liquidation',
        'GET /api/stats',
        'GET /api/metrics'
      ];

      if (this.predictionService) {
        endpoints.push('POST /api/predictions/upload');
        endpoints.push('GET /api/predictions/:commitmentId');
      }

      if (this.positionService) {
        endpoints.push('GET /api/position/:positionId');
        endpoints.push('GET /api/positions/user/:address');
        endpoints.push('GET /api/positions/open');
      }

      if (this.positionCloser) {
        endpoints.push('POST /api/admin/close-position');
        endpoints.push('POST /api/admin/close-expired');
      }

      if (this.positionDatabase) {
        endpoints.push('GET /api/leaderboard?limit=<number>&offset=<number>&sort=<pnl|timestamp>');
        endpoints.push('GET /api/leaderboard/user/:address');
        endpoints.push('GET /api/positions/closed?limit=<number>&offset=<number>&user=<address>');
      }

      res.json({
        name: 'Sketch Flow — Price Oracle & Line Futures API',
        version: '1.0.0',
        endpoints
      });
    });
  }

  /**
   * Handle health check
   */
  private async handleHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = this.healthMonitor.getHealthStatus();
      const status = healthStatus.healthy ? 200 : 503;

      res.status(status).json({
        status: healthStatus.healthy ? 'healthy' : 'unhealthy',
        ...healthStatus
      });
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  }

  /**
   * Handle latest window request
   */
  private async handleLatest(req: Request, res: Response): Promise<void> {
    try {
      const window = await this.retrievalService.getLatestWindow();

      if (!window) {
        res.status(404).json({ error: 'No windows available yet' });
        return;
      }

      res.json({
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        twap: window.twap,
        lastPrice: window.lastPrice,
        volatility: window.volatility,
        priceCount: window.prices.length,
        confidence: this.calculateConfidence(window.prices.length)
      });
    } catch (error) {
      logger.error('Failed to get latest window', error);
      res.status(500).json({ error: 'Failed to retrieve latest window' });
    }
  }

  /**
   * Handle window request by timestamp
   */
  private async handleWindow(req: Request, res: Response): Promise<void> {
    try {
      const timestampStr = Array.isArray(req.params.timestamp) ? req.params.timestamp[0] : req.params.timestamp;
      const timestamp = parseInt(timestampStr, 10);

      if (isNaN(timestamp)) {
        res.status(400).json({ error: 'Invalid timestamp' });
        return;
      }

      const window = await this.retrievalService.getWindow(timestamp);

      if (!window) {
        res.status(404).json({ error: 'Window not found' });
        return;
      }

      res.json({
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        prices: window.prices,
        twap: window.twap,
        lastPrice: window.lastPrice,
        bid: window.bid,
        ask: window.ask,
        volatility: window.volatility
      });
    } catch (error) {
      logger.error('Failed to get window', error);
      res.status(500).json({ error: 'Failed to retrieve window' });
    }
  }

  /**
   * Handle history request
   */
  private async handleHistory(req: Request, res: Response): Promise<void> {
    try {
      const startParam = req.query.start as string;
      const endParam = req.query.end as string;

      let start: number;
      let end: number;

      // Parse start parameter
      if (startParam) {
        if (startParam.endsWith('h')) {
          const hours = parseInt(startParam.slice(0, -1), 10);
          start = Math.floor(Date.now() / 1000) - (hours * 3600);
        } else if (startParam.endsWith('m')) {
          const minutes = parseInt(startParam.slice(0, -1), 10);
          start = Math.floor(Date.now() / 1000) - (minutes * 60);
        } else {
          start = parseInt(startParam, 10);
        }
      } else {
        start = Math.floor(Date.now() / 1000) - 3600; // Default: 1 hour ago
      }

      // Parse end parameter
      if (endParam && endParam !== 'now') {
        end = parseInt(endParam, 10);
      } else {
        end = Math.floor(Date.now() / 1000);
      }

      if (isNaN(start) || isNaN(end)) {
        res.status(400).json({ error: 'Invalid start or end parameter' });
        return;
      }

      // Align to minute boundaries
      start = Math.floor(start / 60) * 60;
      end = Math.floor(end / 60) * 60;

      const windows = await this.retrievalService.getWindowsInRange(start, end);

      const avgPrice = windows.length > 0
        ? windows.reduce((sum, w) => sum + w.twap, 0) / windows.length
        : 0;

      res.json({
        start,
        end,
        windowCount: windows.length,
        windows: windows.map(w => ({
          windowStart: w.windowStart,
          twap: w.twap,
          volatility: w.volatility,
          priceCount: w.prices.length
        })),
        avgPrice
      });
    } catch (error) {
      logger.error('Failed to get history', error);
      res.status(500).json({ error: 'Failed to retrieve history' });
    }
  }

  /**
   * Handle liquidation calculation request
   */
  private async handleLiquidation(req: Request, res: Response): Promise<void> {
    try {
      const { entryPrice, leverage, lookbackMinutes } = req.body as LiquidationRequest;

      // Validate input
      if (!entryPrice || !leverage || !lookbackMinutes) {
        res.status(400).json({
          error: 'Missing required fields: entryPrice, leverage, lookbackMinutes'
        });
        return;
      }

      if (entryPrice <= 0 || leverage <= 0 || lookbackMinutes <= 0) {
        res.status(400).json({
          error: 'All values must be positive'
        });
        return;
      }

      const result = await this.retrievalService.calculateLiquidation({
        entryPrice,
        leverage,
        lookbackMinutes
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to calculate liquidation', error);
      res.status(500).json({ error: 'Failed to calculate liquidation' });
    }
  }

  /**
   * Handle stats request
   */
  private async handleStats(req: Request, res: Response): Promise<void> {
    try {
      const windowCount = parseInt(req.query.windows as string, 10) || 10;
      const stats = await this.retrievalService.getSummaryStats(windowCount);

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get stats', error);
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  }

  /**
   * Handle metrics request
   */
  private handleMetrics(req: Request, res: Response): void {
    try {
      const metrics = this.healthMonitor.getMetrics();
      res.json(metrics);
    } catch (error) {
      logger.error('Failed to get metrics', error);
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  }

  /**
   * Handle prediction upload
   */
  private async handlePredictionUpload(req: Request, res: Response): Promise<void> {
    try {
      if (!this.predictionService) {
        res.status(503).json({ error: 'Prediction service not available' });
        return;
      }

      const { predictions, userAddress, timestamp } = req.body;

      if (!predictions || !userAddress) {
        res.status(400).json({ error: 'Missing required fields: predictions, userAddress' });
        return;
      }

      const ipAddress = Array.isArray(req.ip) ? req.ip[0] : req.ip;
      const result = await this.predictionService.uploadPredictions(
        { predictions, userAddress, timestamp },
        ipAddress
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to upload predictions', error);

      if (error.message?.includes('Rate limit')) {
        res.status(429).json({ error: error.message });
      } else if (error.message?.includes('Invalid') || error.message?.includes('must be')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to upload predictions' });
      }
    }
  }

  /**
   * Handle prediction retrieval
   */
  private async handlePredictionRetrieve(req: Request, res: Response): Promise<void> {
    try {
      if (!this.predictionService) {
        res.status(503).json({ error: 'Prediction service not available' });
        return;
      }

      const commitmentId = Array.isArray(req.params.commitmentId) ? req.params.commitmentId[0] : req.params.commitmentId;

      const data = await this.predictionService.retrievePredictions(commitmentId);

      res.json({
        success: true,
        commitmentId,
        data,
        predictionsCount: data.predictions?.length || 0
      });
    } catch (error) {
      logger.error('Failed to retrieve predictions', error);
      res.status(404).json({ error: 'Predictions not found' });
    }
  }

  /**
   * Handle get position
   */
  private async handleGetPosition(req: Request, res: Response): Promise<void> {
    try {
      if (!this.positionService) {
        res.status(503).json({ error: 'Position service not available' });
        return;
      }

      const positionIdStr = Array.isArray(req.params.positionId) ? req.params.positionId[0] : req.params.positionId;
      const positionId = parseInt(positionIdStr, 10);
      const includeAnalyticsQuery = Array.isArray(req.query.includeAnalytics) ? req.query.includeAnalytics[0] : req.query.includeAnalytics;
      const includePredictionsQuery = Array.isArray(req.query.includePredictions) ? req.query.includePredictions[0] : req.query.includePredictions;
      const includeAnalytics = includeAnalyticsQuery !== 'false';
      const includePredictions = includePredictionsQuery === 'true';

      const position = await this.positionService.getPositionDetails(
        positionId,
        includePredictions,
        includeAnalytics
      );

      res.json({ success: true, position });
    } catch (error) {
      logger.error('Failed to get position', error);
      res.status(404).json({ error: 'Position not found' });
    }
  }

  /**
   * Handle get user positions
   */
  private async handleGetUserPositions(req: Request, res: Response): Promise<void> {
    try {
      if (!this.positionService) {
        res.status(503).json({ error: 'Position service not available' });
        return;
      }

      const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
      const positionIds = (await this.positionService.getUserPositions(address)).sort((a, b) => a - b);
      const stats = await this.positionService.getUserStats(address);

      res.json({
        success: true,
        userAddress: address,
        positionIds,
        stats
      });
    } catch (error) {
      logger.error('Failed to get user positions', error);
      res.status(500).json({ error: 'Failed to retrieve user positions' });
    }
  }

  /**
   * Handle get open positions
   */
  private async handleGetOpenPositions(req: Request, res: Response): Promise<void> {
    try {
      if (!this.positionService) {
        res.status(503).json({ error: 'Position service not available' });
        return;
      }

      const openPositions = await this.positionService.getOpenPositions();

      res.json({
        success: true,
        openPositions,
        count: openPositions.length
      });
    } catch (error) {
      logger.error('Failed to get open positions', error);
      res.status(500).json({ error: 'Failed to retrieve open positions' });
    }
  }

  /**
   * Handle close position (admin)
   */
  private async handleClosePosition(req: Request, res: Response): Promise<void> {
    try {
      // Verify admin API key
      const apiKey = Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key'];
      if (apiKey !== config.adminApiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!this.positionService) {
        res.status(503).json({ error: 'Position service not available' });
        return;
      }

      const { positionId } = req.body;

      if (positionId === undefined) {
        res.status(400).json({ error: 'Missing required field: positionId' });
        return;
      }

      const result = await this.positionService.closePosition(positionId);

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to close position', error);

      if (error.message?.includes('cannot be closed yet')) {
        res.status(400).json({ error: error.message });
      } else if (error.message?.includes('already closed')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to close position' });
      }
    }
  }

  /**
   * Handle close expired positions (admin)
   */
  private async handleCloseExpired(req: Request, res: Response): Promise<void> {
    try {
      // Verify admin API key
      const apiKey = Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key'];
      if (apiKey !== config.adminApiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!this.positionCloser) {
        res.status(503).json({ error: 'Position closer service not available' });
        return;
      }

      const { maxPositions } = req.body;

      const result = await this.positionCloser.closeExpiredPositions(maxPositions);

      res.json(result);
    } catch (error) {
      logger.error('Failed to close expired positions', error);
      res.status(500).json({ error: 'Failed to close expired positions' });
    }
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Global error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Handle leaderboard request
   */
  private handleLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.positionDatabase) {
        res.status(503).json({ error: 'Leaderboard service not available' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sort as 'pnl' | 'timestamp') || 'pnl';

      const result = this.positionDatabase.getLeaderboard(limit, offset, sortBy);

      res.json(result);
    } catch (error) {
      logger.error('Failed to get leaderboard', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  };

  /**
   * Handle user stats request
   */
  private handleUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.positionDatabase) {
        res.status(503).json({ error: 'Leaderboard service not available' });
        return;
      }

      const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
      if (!address || !/^0x[a-fA-F0-9]{1,40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid address' });
        return;
      }

      const stats = this.positionDatabase.getUserStats(address);

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get user stats', error);
      res.status(500).json({ error: 'Failed to get user stats' });
    }
  };

  /**
   * Handle closed positions request
   * When DB returns empty for a user, falls back to fetching closed positions from chain
   * (handles case where PositionCloser failed to save to DB but position was closed on-chain)
   */
  private handleClosedPositions = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const user = req.query.user as string;

      let result: { positions: Array<{ positionId: number; userAddress: string; amount: string; leverage: number; pnl: string; openTimestamp: number; closeTimestamp: number; accuracy: number; txHash: string }>; total: number };

      if (user && /^0x[a-fA-F0-9]{1,40}$/.test(user)) {
        // Get from DB
        const dbResult = this.positionDatabase
          ? this.positionDatabase.getPositionsByUser(user, 1000, 0) // Fetch more for merging
          : { positions: [], total: 0 };

        // Also fetch from chain (handles positions closed on-chain but not saved to DB)
        let chainPositions: typeof dbResult.positions = [];
        if (this.positionService) {
          try {
            chainPositions = await this.fetchClosedPositionsFromChain(user);
          } catch (chainErr) {
            logger.debug('Chain fallback for closed positions failed', { user, error: chainErr });
          }
        }

        // Merge: DB entries take precedence (have accuracy, txHash); add chain-only positions
        const dbIds = new Set(dbResult.positions.map((p) => p.positionId));
        const fromChainOnly = chainPositions.filter((p) => !dbIds.has(p.positionId));
        const merged = [...dbResult.positions, ...fromChainOnly].sort(
          (a, b) => b.closeTimestamp - a.closeTimestamp
        );
        const paginated = merged.slice(offset, offset + limit);
        result = { positions: paginated, total: merged.length };
      } else if (this.positionDatabase) {
        result = this.positionDatabase.getAllPositions(limit, offset);
      } else {
        res.status(503).json({ error: 'Leaderboard service not available' });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error('Failed to get closed positions', error);
      res.status(500).json({ error: 'Failed to get closed positions' });
    }
  };

  /**
   * Fetch closed positions for a user directly from the contract (fallback when DB is empty)
   */
  private async fetchClosedPositionsFromChain(
    userAddress: string
  ): Promise<Array<{ positionId: number; userAddress: string; amount: string; leverage: number; pnl: string; openTimestamp: number; closeTimestamp: number; accuracy: number; txHash: string }>> {
    if (!this.positionService) return [];

    const normalizedUser = userAddress.toLowerCase();
    const positionIds = await this.positionService.getUserPositions(userAddress);
    const closed: Array<{ positionId: number; userAddress: string; amount: string; leverage: number; pnl: string; openTimestamp: number; closeTimestamp: number; accuracy: number; txHash: string }> = [];

    for (const positionId of positionIds) {
      try {
        const position = await this.positionService.getPosition(positionId);
        if (!position.isOpen && position.closeTimestamp) {
          const closeTs = Number(position.closeTimestamp.toString());
          const openTxHash = this.positionDatabase?.getOpenTxHash(positionId) ?? '';
          closed.push({
            positionId,
            userAddress: normalizedUser,
            amount: position.amount.toString(),
            leverage: position.leverage,
            pnl: position.pnl.toString(),
            openTimestamp: Number(position.openTimestamp.toString()),
            closeTimestamp: closeTs,
            accuracy: 0,
            txHash: openTxHash
          });
        }
      } catch (err) {
        logger.debug('Failed to fetch position from chain', { positionId, error: err });
      }
    }

    return closed;
  }

  /**
   * Record the open-transaction hash for one or more position IDs.
   * Called by the frontend after a successful seal so we can surface the
   * open txHash in history even before the position closer runs.
   * Body: { positionIds: number[], txHash: string, userAddress: string }
   */
  private handleRecordOpenTx = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.positionDatabase) {
        res.status(503).json({ error: 'Database not available' });
        return;
      }

      const { positionIds, txHash, userAddress } = req.body as {
        positionIds?: unknown;
        txHash?: unknown;
        userAddress?: unknown;
      };

      if (!Array.isArray(positionIds) || positionIds.length === 0) {
        res.status(400).json({ error: 'positionIds must be a non-empty array' });
        return;
      }
      if (typeof txHash !== 'string' || !txHash) {
        res.status(400).json({ error: 'txHash is required' });
        return;
      }
      if (typeof userAddress !== 'string' || !/^0x[a-fA-F0-9]{1,40}$/.test(userAddress)) {
        res.status(400).json({ error: 'Invalid userAddress' });
        return;
      }

      const ids = (positionIds as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
      for (const id of ids) {
        this.positionDatabase.saveOpenTx(id, userAddress, txHash);
      }

      logger.info('Open tx hashes recorded', { positionIds: ids, txHash, userAddress });
      res.json({ success: true, recorded: ids.length });
    } catch (error) {
      logger.error('Failed to record open tx', error);
      res.status(500).json({ error: 'Failed to record open tx' });
    }
  };

  /**
   * Handle leaderboard stats request
   */
  private handleLeaderboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!this.positionDatabase) {
        res.status(503).json({ error: 'Leaderboard service not available' });
        return;
      }

      const totalTraders = this.positionDatabase.getTotalUserCount();
      const totalVolume = this.positionDatabase.getTotalVolume();
      const positionsToday = this.positionDatabase.getPositionsToday();
      const avgWinRate = this.positionDatabase.getAverageWinRate();

      res.json({
        totalTraders,
        totalVolume,
        positionsToday,
        avgWinRate
      });
    } catch (error) {
      logger.error('Failed to get leaderboard stats', error);
      res.status(500).json({ error: 'Failed to get leaderboard stats' });
    }
  };

  /**
   * Handle get token pairs request
   */
  private handleGetTokenPairs(req: Request, res: Response): void {
    try {
      const pairs = [
        { symbol: 'FLOWUSDT', display: 'FLOW/USDT', available: true },
        { symbol: 'BTCUSDT', display: 'BTC/USDT', available: true },
        { symbol: 'ETHUSDT', display: 'ETH/USDT', available: true },
        { symbol: 'AAVEUSDT', display: 'AAVE/USDT', available: true },
        { symbol: 'DOGEUSDT', display: 'DOGE/USDT', available: true },
        // Coming soon pairs
        { symbol: 'SOLUSDT', display: 'SOL/USDT', available: false },
        { symbol: 'BNBUSDT', display: 'BNB/USDT', available: false },
        { symbol: 'XRPUSDT', display: 'XRP/USDT', available: false },
        { symbol: 'ADAUSDT', display: 'ADA/USDT', available: false },
        { symbol: 'MATICUSDT', display: 'MATIC/USDT', available: false },
        { symbol: 'DOTUSDT', display: 'DOT/USDT', available: false },
      ];

      res.json({ pairs });
    } catch (error) {
      logger.error('Failed to get token pairs', error);
      res.status(500).json({ error: 'Failed to get token pairs' });
    }
  }

  /**
   * Handle get current pair request
   */
  private handleGetCurrentPair(req: Request, res: Response): void {
    try {
      const currentTicker = this.orchestrator.getCurrentTicker();
      res.json({ symbol: currentTicker });
    } catch (error) {
      logger.error('Failed to get current pair', error);
      res.status(500).json({ error: 'Failed to get current pair' });
    }
  }

  /**
   * Handle select pair request
   */
  private handleSelectPair(req: Request, res: Response): void {
    try {
      const { symbol } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        res.status(400).json({ error: 'Invalid symbol parameter' });
        return;
      }

      // Validate symbol format (should be like BTCUSDT, ETHUSDT, etc.)
      if (!/^[A-Z]{2,10}USDT$/.test(symbol)) {
        res.status(400).json({ error: 'Invalid symbol format. Must be like BTCUSDT, ETHUSDT, etc.' });
        return;
      }

      // Update the ticker
      this.orchestrator.updateTicker(symbol);

      res.json({
        success: true,
        symbol,
        message: `Switched to ${symbol}`
      });
    } catch (error) {
      logger.error('Failed to select pair', error);
      res.status(500).json({ error: 'Failed to select pair' });
    }
  }

  /**
   * Calculate confidence score based on price count
   */
  private calculateConfidence(priceCount: number): number {
    const expected = 60;
    const ratio = priceCount / expected;
    return Math.min(ratio, 1.0);
  }

  /**
   * Start the API server
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(config.port, config.apiHost, () => {
        logger.info('API server started', {
          host: config.apiHost,
          port: config.port
        });
        resolve();
      });
    });
  }

  /**
   * Stop the API server
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err: Error) => {
        if (err) {
          logger.error('Failed to stop API server', err);
          reject(err);
        } else {
          logger.info('API server stopped');
          resolve();
        }
      });
    });
  }
}

export default APIServer;

