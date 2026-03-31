import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { getEthereumProvider } from '../ethereumProvider.js';

// PriceOracle contract ABI (only the functions we need)
const ORACLE_ABI = [
  'function storeCommitment(uint256 windowStart, string commitment) external',
  'function getCommitment(uint256 windowStart) external view returns (string)',
  'function getLatestWindow() external view returns (uint256)',
  'function getWindowsInRange(uint256 start, uint256 end) external view returns (uint256[] memory)',
  'function getWindowCount() external view returns (uint256)',
  'event CommitmentStored(uint256 indexed windowStart, string commitment, uint256 timestamp)'
];

/**
 * Transaction queue item
 */
interface QueuedTransaction {
  execute: () => Promise<string>;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

export class ContractStorage {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private txQueue: QueuedTransaction[] = [];
  private isProcessingQueue = false;

  constructor(
    _rpcUrl?: string,
    privateKey: string = config.ethereumPrivateKey,
    contractAddress: string = process.env.PRICE_ORACLE_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || ''
  ) {
    this.provider = getEthereumProvider();
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, ORACLE_ABI, this.wallet);

    logger.info('ContractStorage initialized', {
      contractAddress,
      walletAddress: this.wallet.address
    });
  }

  /**
   * Store a commitment on-chain (with transaction queue and retry logic)
   */
  public async storeCommitment(windowStart: number, commitment: string): Promise<string> {
    return this.enqueueTransaction(async () => {
      return this.executeStoreCommitment(windowStart, commitment);
    });
  }

  /**
   * Enqueue a transaction to be processed sequentially
   */
  private async enqueueTransaction(execute: () => Promise<string>): Promise<string> {
    return new Promise((resolve, reject) => {
      this.txQueue.push({ execute, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the transaction queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.txQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.txQueue.length > 0) {
      const item = this.txQueue.shift()!;

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute store commitment with retry logic
   */
  private async executeStoreCommitment(windowStart: number, commitment: string): Promise<string> {
    logger.info('Storing commitment on-chain', {
      windowStart,
      commitment
    });

    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get fresh nonce from network for each attempt
        const nonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');

        logger.debug('Transaction attempt', {
          windowStart,
          commitment: commitment.substring(0, 20) + '...',
          attempt: attempt + 1,
          nonce
        });

        // Estimate gas
        const gasEstimate = await this.contract.storeCommitment.estimateGas(
          windowStart,
          commitment
        );

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * 120n) / 100n;

        // Get current gas price
        const feeData = await this.provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        logger.debug('Transaction parameters', {
          windowStart,
          gasLimit: gasLimit.toString(),
          gasPrice: gasPrice?.toString(),
          nonce,
          attempt: attempt + 1
        });

        // Send transaction
        const tx = await this.contract.storeCommitment(
          windowStart,
          commitment,
          {
            gasLimit,
            gasPrice,
            nonce
          }
        );

        logger.info('Transaction sent', {
          windowStart,
          txHash: tx.hash,
          nonce,
          attempt: attempt + 1
        });

        // Wait for confirmation
        const receipt = await tx.wait();

        logger.info('Transaction confirmed', {
          windowStart,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          attempt: attempt + 1
        });

        return receipt.hash;

      } catch (error: any) {
        const isNonceError = this.isNonceError(error);
        const isLastAttempt = attempt === maxRetries - 1;

        logger.warn('Transaction attempt failed', {
          windowStart,
          attempt: attempt + 1,
          maxRetries,
          isNonceError,
          error: error.message || error.toString()
        });

        if (isLastAttempt) {
          logger.error('Failed to store commitment after all retries', {
            windowStart,
            attempts: maxRetries,
            error
          });
          throw error;
        }

        // Wait before retry with exponential backoff
        const delay = retryDelays[attempt];
        logger.info('Retrying transaction', {
          windowStart,
          nextAttempt: attempt + 2,
          delayMs: delay
        });
        await this.sleep(delay);
      }
    }

    throw new Error('Failed to store commitment: max retries exceeded');
  }

  /**
   * Check if error is nonce-related
   */
  private isNonceError(error: any): boolean {
    const errorStr = error.message || error.toString();
    return (
      errorStr.includes('nonce') ||
      errorStr.includes('NONCE_EXPIRED') ||
      errorStr.includes('REPLACEMENT_UNDERPRICED') ||
      errorStr.includes('replacement transaction underpriced') ||
      error.code === 'NONCE_EXPIRED' ||
      error.code === 'REPLACEMENT_UNDERPRICED'
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get a commitment from the contract
   */
  public async getCommitment(windowStart: number): Promise<string> {
    try {
      const commitment = await this.contract.getCommitment(windowStart);
      return commitment;
    } catch (error) {
      logger.error('Failed to get commitment', error);
      throw error;
    }
  }

  /**
   * Get the latest window timestamp
   */
  public async getLatestWindow(): Promise<number> {
    try {
      const latestWindow = await this.contract.getLatestWindow();
      return Number(latestWindow);
    } catch (error) {
      logger.error('Failed to get latest window', error);
      throw error;
    }
  }

  /**
   * Get windows in a time range
   */
  public async getWindowsInRange(start: number, end: number): Promise<number[]> {
    try {
      const windows = await this.contract.getWindowsInRange(start, end);
      return windows.map((w: bigint) => Number(w));
    } catch (error) {
      logger.error('Failed to get windows in range', error);
      throw error;
    }
  }

  /**
   * Get total window count
   */
  public async getWindowCount(): Promise<number> {
    try {
      const count = await this.contract.getWindowCount();
      return Number(count);
    } catch (error) {
      logger.error('Failed to get window count', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   */
  public async getBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Failed to get balance', error);
      throw error;
    }
  }

  /**
   * Test the contract connection with timeout
   */
  public async testConnection(): Promise<boolean> {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), 10000); // 10 second timeout
      });

      const testPromise = (async () => {
        try {
          const count = await this.getWindowCount();
          logger.info('Contract connection test successful', { windowCount: count });
          return true;
        } catch (error) {
          logger.error('Contract connection test failed', error);
          return false;
        }
      })();

      return await Promise.race([testPromise, timeoutPromise]);
    } catch (error) {
      logger.warn('Contract connection test timed out or failed, continuing anyway', error);
      // Return true to allow server to start even if contract test fails
      // The contract will be tested when actually used
      return true;
    }
  }

}

export default ContractStorage;

