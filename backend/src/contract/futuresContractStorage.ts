import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { getEthereumProvider } from '../ethereumProvider.js';

/**
 * Position data structure matching the contract
 */
export interface Position {
  user: string;
  amount: bigint;
  leverage: number;
  openTimestamp: bigint;
  predictionCommitmentId: string;
  isOpen: boolean;
  pnl: bigint;
  actualPriceCommitmentId: string;
  closeTimestamp: bigint;
}

/**
 * LineFutures Contract ABI (minimal required functions)
 */
const LINEFUTURES_ABI = [
  // Read functions
  'function getPosition(uint256 _positionId) external view returns (tuple(address user, uint256 amount, uint16 leverage, uint256 openTimestamp, string predictionCommitmentId, bool isOpen, int256 pnl, string actualPriceCommitmentId, uint256 closeTimestamp))',
  'function getUserPositions(address _user) external view returns (uint256[])',
  'function canClosePosition(uint256 _positionId) external view returns (bool)',
  'function getContractBalance() external view returns (uint256)',
  'function getUserStats(address _user) external view returns (uint256 totalPositions, uint256 openPositions, uint256 closedPositions, int256 totalPnl)',
  'function positionCounter() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'function owner() external view returns (address)',
  'function pnlServer() external view returns (address)',
  'function feePercentage() external view returns (uint256)',
  'function collectedFees() external view returns (uint256)',

  // Write functions
  'function openPosition(uint16 _leverage, string _predictionCommitmentId) external payable returns (uint256)',
  'function batchOpenPositions(uint16 _leverage, string[] _predictionCommitmentIds) external payable returns (uint256[])',
  'function closePosition(uint256 _positionId, int256 _pnl, string _actualPriceCommitmentId) external',

  // Events
  'event PositionOpened(uint256 indexed positionId, address indexed user, uint256 amount, uint16 leverage, uint256 timestamp, string predictionCommitmentId)',
  'event PositionClosed(uint256 indexed positionId, address indexed user, int256 pnl, uint256 finalAmount, string actualPriceCommitmentId, uint256 timestamp)'
];

/**
 * Futures Contract Storage Service
 * Wrapper for LineFutures contract interactions
 */
export class FuturesContractStorage {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private contractAddress: string;

  constructor(
    _rpcUrl?: string,
    privateKey: string = config.ethereumPrivateKey,
    contractAddress?: string
  ) {
    const addr = contractAddress ?? config.futuresContractAddress;
    if (!addr) {
      throw new Error('FUTURES_CONTRACT_ADDRESS is required for EVM futures');
    }
    this.contractAddress = addr;
    this.provider = getEthereumProvider();
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(addr, LINEFUTURES_ABI, this.wallet);

    logger.info('FuturesContractStorage initialized', {
      contractAddress: addr,
      walletAddress: this.wallet.address
    });
  }

  /**
   * Get a position by ID
   */
  public async getPosition(positionId: number): Promise<Position> {
    try {
      logger.debug('Getting position', { positionId });

      const position = await this.contract.getPosition(positionId);

      return {
        user: position.user,
        amount: position.amount,
        leverage: position.leverage,
        openTimestamp: position.openTimestamp,
        predictionCommitmentId: position.predictionCommitmentId,
        isOpen: position.isOpen,
        pnl: position.pnl,
        actualPriceCommitmentId: position.actualPriceCommitmentId,
        closeTimestamp: position.closeTimestamp
      };
    } catch (error) {
      logger.error('Failed to get position', { positionId, error });
      throw error;
    }
  }

  /**
   * Get all position IDs for a user
   */
  public async getUserPositions(userAddress: string): Promise<number[]> {
    try {
      logger.debug('Getting user positions', { userAddress });

      const positionIds = await this.contract.getUserPositions(userAddress);
      return positionIds.map((id: bigint) => Number(id));
    } catch (error) {
      logger.error('Failed to get user positions', { userAddress, error });
      throw error;
    }
  }

  /**
   * Check if a position can be closed
   */
  public async canClosePosition(positionId: number): Promise<boolean> {
    try {
      return await this.contract.canClosePosition(positionId);
    } catch (error) {
      logger.error('Failed to check if position can be closed', { positionId, error });
      throw error;
    }
  }

  /**
   * Close a position (only callable by PnL server)
   * Includes proper nonce management and gas price handling to avoid replacement transaction errors
   */
  public async closePosition(
    positionId: number,
    pnl: bigint,
    actualPriceCommitmentId: string
  ): Promise<string> {
    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info('Closing position', {
          positionId,
          pnl: pnl.toString(),
          actualPriceCommitmentId,
          attempt: attempt + 1,
          maxRetries
        });

        // Get fresh nonce from network (including pending transactions)
        const nonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');

        // Estimate gas
        const gasEstimate = await this.contract.closePosition.estimateGas(
          positionId,
          pnl,
          actualPriceCommitmentId
        );

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * 120n) / 100n;

        // Get current fee data
        const feeData = await this.provider.getFeeData();

        // Bump gas price for retries (10% increase per attempt)
        const gasPriceMultiplier = 100n + (BigInt(attempt) * 10n); // 100%, 110%, 120%
        const gasPrice = feeData.gasPrice
          ? (feeData.gasPrice * gasPriceMultiplier) / 100n
          : undefined;

        logger.debug('Transaction parameters', {
          positionId,
          gasLimit: gasLimit.toString(),
          gasPrice: gasPrice?.toString(),
          nonce,
          attempt: attempt + 1
        });

        // Send transaction with explicit nonce and gas settings
        const tx = await this.contract.closePosition(
          positionId,
          pnl,
          actualPriceCommitmentId,
          {
            gasLimit,
            gasPrice,
            nonce
          }
        );

        logger.info('Close position transaction sent', {
          positionId,
          txHash: tx.hash,
          nonce,
          attempt: attempt + 1
        });

        // Wait for confirmation
        const receipt = await tx.wait();

        logger.info('Position closed successfully', {
          positionId,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          attempt: attempt + 1
        });

        return receipt.hash;

      } catch (error: any) {
        const errorCode = error?.code;
        const errorMessage = error?.message || String(error);
        const isReplacementError =
          errorCode === 'REPLACEMENT_UNDERPRICED' ||
          errorMessage.includes('replacement transaction underpriced') ||
          errorMessage.includes('replacement fee too low');

        // If it's a replacement error and we have retries left, wait and retry with higher gas
        if (isReplacementError && attempt < maxRetries - 1) {
          const delay = retryDelays[attempt];
          logger.warn('Replacement transaction error, retrying with higher gas price', {
            positionId,
            attempt: attempt + 1,
            maxRetries,
            delay,
            error: errorMessage
          });

          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry with higher gas price
        }

        // If it's the last attempt or a different error, throw
        logger.error('Failed to close position', {
          positionId,
          attempt: attempt + 1,
          maxRetries,
          error,
          errorCode,
          errorMessage
        });
        throw error;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('Failed to close position after all retries');
  }

  /**
   * Get user statistics
   */
  public async getUserStats(userAddress: string): Promise<{
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalPnl: bigint;
  }> {
    try {
      const stats = await this.contract.getUserStats(userAddress);

      return {
        totalPositions: Number(stats.totalPositions),
        openPositions: Number(stats.openPositions),
        closedPositions: Number(stats.closedPositions),
        totalPnl: stats.totalPnl
      };
    } catch (error) {
      logger.error('Failed to get user stats', { userAddress, error });
      throw error;
    }
  }

  /**
   * Get total position counter
   */
  public async getPositionCounter(): Promise<number> {
    try {
      const counter = await this.contract.positionCounter();
      return Number(counter);
    } catch (error) {
      logger.error('Failed to get position counter', error);
      throw error;
    }
  }

  /**
   * Get contract balance
   */
  public async getContractBalance(): Promise<bigint> {
    try {
      return await this.contract.getContractBalance();
    } catch (error) {
      logger.error('Failed to get contract balance', error);
      throw error;
    }
  }

  /**
   * Check if contract is paused
   */
  public async isPaused(): Promise<boolean> {
    try {
      return await this.contract.paused();
    } catch (error) {
      logger.error('Failed to check if paused', error);
      throw error;
    }
  }

  /**
   * Get all open positions (by scanning events)
   */
  public async getOpenPositions(): Promise<number[]> {
    try {
      logger.debug('Getting open positions');

      const positionCounter = await this.getPositionCounter();
      const openPositions: number[] = [];

      // Check each position (could be optimized with event filtering)
      for (let i = 0; i < positionCounter; i++) {
        const position = await this.getPosition(i);
        if (position.isOpen) {
          openPositions.push(i);
        }
      }

      logger.info('Found open positions', { count: openPositions.length });
      return openPositions;
    } catch (error) {
      logger.error('Failed to get open positions', error);
      throw error;
    }
  }

  /**
   * Get positions that can be closed (expired)
   */
  public async getClosablePositions(): Promise<number[]> {
    try {
      logger.debug('Getting closable positions');

      const openPositions = await this.getOpenPositions();
      const closablePositions: number[] = [];

      for (const positionId of openPositions) {
        const canClose = await this.canClosePosition(positionId);
        if (canClose) {
          closablePositions.push(positionId);
        }
      }

      logger.info('Found closable positions', { count: closablePositions.length });
      return closablePositions;
    } catch (error) {
      logger.error('Failed to get closable positions', error);
      throw error;
    }
  }

  /**
   * Test connection to contract
   */
  public async testConnection(): Promise<boolean> {
    try {
      logger.info('Testing futures contract connection');

      const counter = await this.getPositionCounter();
      const paused = await this.isPaused();

      logger.info('Futures contract connection test successful', {
        positionCounter: counter,
        paused
      });

      return true;
    } catch (error) {
      logger.error('Futures contract connection test failed', error);
      return false;
    }
  }

  /**
   * Get contract info
   */
  public async getContractInfo(): Promise<{
    owner: string;
    pnlServer: string;
    feePercentage: number;
    collectedFees: bigint;
    paused: boolean;
    positionCounter: number;
    balance: bigint;
  }> {
    try {
      const [owner, pnlServer, feePercentage, collectedFees, paused, positionCounter, balance] =
        await Promise.all([
          this.contract.owner(),
          this.contract.pnlServer(),
          this.contract.feePercentage(),
          this.contract.collectedFees(),
          this.contract.paused(),
          this.contract.positionCounter(),
          this.contract.getContractBalance()
        ]);

      return {
        owner,
        pnlServer,
        feePercentage: Number(feePercentage),
        collectedFees,
        paused,
        positionCounter: Number(positionCounter),
        balance
      };
    } catch (error) {
      logger.error('Failed to get contract info', error);
      throw error;
    }
  }

  /**
   * Listen for PositionOpened events
   */
  public onPositionOpened(
    callback: (positionId: number, user: string, amount: bigint, leverage: number) => void
  ): void {
    this.contract.on('PositionOpened', (positionId, user, amount, leverage) => {
      logger.info('PositionOpened event', {
        positionId: Number(positionId),
        user,
        amount: amount.toString(),
        leverage
      });
      callback(Number(positionId), user, amount, leverage);
    });
  }

  /**
   * Listen for PositionClosed events
   */
  public onPositionClosed(
    callback: (positionId: number, user: string, pnl: bigint, finalAmount: bigint) => void
  ): void {
    this.contract.on('PositionClosed', (positionId, user, pnl, finalAmount) => {
      logger.info('PositionClosed event', {
        positionId: Number(positionId),
        user,
        pnl: pnl.toString(),
        finalAmount: finalAmount.toString()
      });
      callback(Number(positionId), user, pnl, finalAmount);
    });
  }

  /**
   * Get wallet address
   */
  public getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get contract address
   */
  public getContractAddress(): string {
    return this.contractAddress;
  }
}

export default FuturesContractStorage;

