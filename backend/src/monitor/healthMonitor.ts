import { EventEmitter } from 'events';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { HealthMetrics } from '../types/index.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

interface AlertCondition {
  name: string;
  check: () => boolean;
  message: string;
}

export class HealthMonitor extends EventEmitter {
  private orchestrator: Orchestrator;
  private monitorInterval: NodeJS.Timeout | null = null;
  private metrics: HealthMetrics;
  private storageSubmissions: { success: number; total: number } = { success: 0, total: 0 };
  private totalWindows = 0;

  constructor(
    orchestrator: Orchestrator
  ) {
    super();
    this.orchestrator = orchestrator;

    this.metrics = {
      websocketConnected: false,
      lastPriceUpdate: 0,
      bufferSize: 0,
      lastStorageSubmission: 0,
      storageSuccessRate: 100,
      totalWindows: 0
    };

    this.setupEventHandlers();
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    logger.info('Starting health monitor');

    // Monitor every 10 seconds
    this.monitorInterval = setInterval(() => {
      this.updateMetrics();
      this.checkAlerts();
    }, 10000);

    this.emit('started');
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    logger.info('Stopping health monitor');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.emit('stopped');
  }

  /**
   * Get current health metrics
   */
  public getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  /**
   * Setup event handlers for tracking metrics
   */
  private setupEventHandlers(): void {
    // Track storage submissions
    this.orchestrator.on('dataStored', () => {
      this.storageSubmissions.success++;
      this.storageSubmissions.total++;
      this.metrics.lastStorageSubmission = Date.now();
      this.updateSuccessRates();
    });

    // Track commitment storage (now in MongoDB)
    this.orchestrator.on('commitmentStored', () => {
      this.totalWindows++;
      this.updateSuccessRates();
    });

    // Track failures
    this.orchestrator.on('windowProcessingError', (data) => {
      this.storageSubmissions.total++;
      this.updateSuccessRates();
      
      logger.error('Window processing error detected', data);
      this.sendAlert('Window Processing Error', `Failed to process window ${data.windowStart}`);
    });

    // Track buffer size mismatches
    this.orchestrator.on('bufferSizeMismatch', (data) => {
      logger.warn('Buffer size mismatch detected', data);
      this.sendAlert(
        'Buffer Size Mismatch',
        `Window ${data.windowStart}: expected ${data.expected} prices, got ${data.actual}`
      );
    });

    // Track ingester disconnections
    this.orchestrator.on('ingesterDisconnected', () => {
      logger.warn('Ingester disconnected');
      this.sendAlert('WebSocket Disconnected', 'Price ingester WebSocket disconnected');
    });
  }

  /**
   * Update metrics from orchestrator
   */
  private updateMetrics(): void {
    const orchestratorMetrics = this.orchestrator.getMetrics();

    this.metrics.websocketConnected = orchestratorMetrics.websocketConnected;
    this.metrics.lastPriceUpdate = orchestratorMetrics.lastPriceUpdate;
    this.metrics.bufferSize = orchestratorMetrics.bufferSize;
    this.metrics.totalWindows = this.totalWindows;

    logger.debug('Metrics updated', this.metrics);
  }

  /**
   * Update success rates
   */
  private updateSuccessRates(): void {
    if (this.storageSubmissions.total > 0) {
      this.metrics.storageSuccessRate = 
        (this.storageSubmissions.success / this.storageSubmissions.total) * 100;
    }
  }

  /**
   * Check alert conditions
   */
  private checkAlerts(): void {
    const now = Date.now();

    const alerts: AlertCondition[] = [
      {
        name: 'WebSocket Disconnect',
        check: () => {
          const disconnectTime = now - this.metrics.lastPriceUpdate;
          return this.metrics.lastPriceUpdate > 0 && disconnectTime > 30000;
        },
        message: 'WebSocket disconnected for more than 30 seconds'
      },
      {
        name: 'Buffer Size Anomaly',
        check: () => {
          // With the new second-based tracking, buffer size is the number of unique seconds tracked
          // This should grow throughout the minute, so we only alert if it's 0 for too long
          const timeSinceLastUpdate = now - this.metrics.lastPriceUpdate;
          return this.metrics.lastPriceUpdate > 0 && 
                 timeSinceLastUpdate > 60000 && // No updates for 1 minute
                 this.metrics.bufferSize === 0;
        },
        message: `No price data tracked for over 1 minute`
      },
      {
        name: 'Storage Low Success Rate',
        check: () => {
          return this.storageSubmissions.total >= 3 && 
                 this.metrics.storageSuccessRate < 90;
        },
        message: `Storage success rate is ${this.metrics.storageSuccessRate.toFixed(1)}%`
      },
      {
        name: 'No Recent Storage Submission',
        check: () => {
          const timeSinceSubmission = now - this.metrics.lastStorageSubmission;
          return this.metrics.lastStorageSubmission > 0 && timeSinceSubmission > 300000; // 5 minutes
        },
        message: 'No storage submission in the last 5 minutes'
      }
    ];

    for (const alert of alerts) {
      if (alert.check()) {
        this.sendAlert(alert.name, alert.message);
      }
    }
  }

  /**
   * Send an alert
   */
  private sendAlert(title: string, message: string): void {
    logger.warn('ALERT', { title, message });
    
    this.emit('alert', { title, message, timestamp: Date.now() });

    // Send webhook if configured
    if (config.alertWebhookUrl) {
      this.sendWebhookAlert(title, message).catch(error => {
        logger.error('Failed to send webhook alert', error);
      });
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(title: string, message: string): Promise<void> {
    if (!config.alertWebhookUrl) return;

    try {
      const response = await fetch(config.alertWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          message,
          timestamp: new Date().toISOString(),
          metrics: this.metrics
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      logger.info('Webhook alert sent', { title });
    } catch (error) {
      logger.error('Failed to send webhook alert', error);
    }
  }

  /**
   * Get health status summary
   */
  public getHealthStatus(): {
    healthy: boolean;
    issues: string[];
    metrics: HealthMetrics;
  } {
    const issues: string[] = [];
    const now = Date.now();

    if (!this.metrics.websocketConnected) {
      issues.push('WebSocket not connected');
    }

    if (this.metrics.lastPriceUpdate > 0 && now - this.metrics.lastPriceUpdate > 30000) {
      issues.push('No price updates in 30+ seconds');
    }

    if (this.metrics.storageSuccessRate < 90 && this.storageSubmissions.total >= 3) {
      issues.push(`Low storage success rate: ${this.metrics.storageSuccessRate.toFixed(1)}%`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics: this.metrics
    };
  }
}

export default HealthMonitor;

