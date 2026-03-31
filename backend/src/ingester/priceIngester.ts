import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { BybitTickerData, PriceEntry } from '../types/index.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

export class PriceIngester extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private isConnecting = false;
  private shouldReconnect = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;
  private currentTicker: string;

  constructor(
    private tickerSymbol: string = config.defaultPriceSymbol,
    private wssUrl: string = config.bybitWssUrl
  ) {
    super();
    this.currentTicker = `tickers.${tickerSymbol}`;
  }

  /**
   * Update the ticker symbol and resubscribe
   */
  public updateTicker(newTickerSymbol: string): void {
    if (this.currentTicker === `tickers.${newTickerSymbol}`) {
      return; // Already subscribed to this ticker
    }
    
    this.currentTicker = `tickers.${newTickerSymbol}`;
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Unsubscribe from old ticker and subscribe to new one
      this.subscribe();
    }
  }

  /**
   * Get current ticker symbol
   */
  public getTickerSymbol(): string {
    return this.currentTicker.replace('tickers.', '');
  }

  /**
   * Start the WebSocket connection and subscribe to price updates
   */
  public async start(): Promise<void> {
    logger.info('Starting price ingester', { url: this.wssUrl });
    this.shouldReconnect = true;
    await this.connect();
  }

  /**
   * Stop the WebSocket connection
   */
  public stop(): void {
    logger.info('Stopping price ingester');
    this.shouldReconnect = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if the WebSocket is connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get the last message timestamp
   */
  public getLastMessageTime(): number {
    return this.lastMessageTime;
  }

  /**
   * Connect to the Bybit WebSocket
   */
  private async connect(): Promise<void> {
    if (this.isConnecting) {
      logger.debug('Connection already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.wssUrl);

      this.ws.on('open', () => {
        logger.info('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
        this.subscribe();
        this.startHeartbeat();
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error', error);
        this.emit('error', error);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn('WebSocket closed', { code, reason: reason.toString() });
        this.isConnecting = false;
        this.ws = null;

        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }

        this.emit('disconnected');

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('ping', () => {
        if (this.ws) {
          this.ws.pong();
        }
      });

    } catch (error) {
      logger.error('Failed to create WebSocket connection', error);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Subscribe to ticker updates
   */
  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot subscribe: WebSocket not open');
      return;
    }

    const subscribeMessage = {
      op: 'subscribe',
      args: [this.currentTicker]
    };

    logger.info(`Subscribing to ${this.currentTicker}`);
    this.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Log all messages for debugging
      logger.debug('WebSocket message received', {
        op: message.op,
        topic: message.topic,
        type: message.type
      });

      // Handle subscription confirmation
      if (message.op === 'subscribe' && message.success) {
        logger.info(`Successfully subscribed to ${this.currentTicker}`);
        return;
      }

      // Handle ping/pong
      if (message.op === 'ping') {
        if (this.ws) {
          this.ws.send(JSON.stringify({ op: 'pong' }));
        }
        logger.debug('Responded to ping');
        return;
      }

      // Handle ticker data
      if (message.topic === this.currentTicker && message.data) {
        this.lastMessageTime = Date.now();
        this.processPriceUpdate(message as BybitTickerData);
      } else if (message.topic && message.topic.startsWith('tickers')) {
        logger.debug('Received ticker message', { topic: message.topic });
      }

    } catch (error) {
      logger.error('Failed to parse WebSocket message', error);
    }
  }

  /**
   * Process a price update from Bybit
   */
  private processPriceUpdate(data: BybitTickerData): void {
    try {
      const price = parseFloat(data.data.lastPrice);
      const timestamp = (data as any).ts || Date.now();

      if (isNaN(price) || price <= 0) {
        logger.warn('Invalid price received', { price: data.data.lastPrice });
        return;
      }

      const priceEntry: PriceEntry = {
        price,
        timestamp,
        source: 'bybit'
      };

      // Log occasionally
      if (Math.random() < 0.05) { // Log ~5% of prices
        logger.info('Price update received', { price, timestamp, source: 'bybit' });
      }
      this.emit('price', priceEntry);

    } catch (error) {
      logger.error('Failed to process price update', error);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    logger.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delay: `${delay}ms`
    });

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;

      // If no message received in 30 seconds, consider connection stale
      if (timeSinceLastMessage > 30000 && this.lastMessageTime > 0) {
        logger.warn('No messages received for 30 seconds, reconnecting');
        if (this.ws) {
          this.ws.close();
        }
      }
    }, 10000); // Check every 10 seconds
  }
}

export default PriceIngester;

