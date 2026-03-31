import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ClosedPositionData {
  positionId: number;
  userAddress: string;
  amount: string;
  leverage: number;
  openTimestamp: number;
  closeTimestamp: number;
  pnl: string;
  predictionCommitmentId: string;
  actualPriceCommitmentId: string;
  txHash: string;
  accuracy: number;
  correctDirections: number;
  totalDirections: number;
}

export interface LeaderboardEntry {
  positionId: number;
  userAddress: string;
  amount: string;
  leverage: number;
  pnl: string;
  openTimestamp: number;
  closeTimestamp: number;
  accuracy: number;
  txHash: string;
}

export interface UserStats {
  userAddress: string;
  totalPositions: number;
  totalPnL: string;
  averagePnL: string;
  winRate: number;
  positions: LeaderboardEntry[];
}

export class PositionDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to positions.db in the backend directory
    this.dbPath = dbPath || path.join(__dirname, '../../positions.db');
    this.db = new Database(this.dbPath);
    
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    logger.info('SQLite database initialized', { dbPath: this.dbPath });
  }

  /**
   * Initialize the database schema
   */
  public initialize(): void {
    try {
      const createTable = `
        CREATE TABLE IF NOT EXISTS closed_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          position_id INTEGER NOT NULL UNIQUE,
          user_address TEXT NOT NULL,
          amount TEXT NOT NULL,
          leverage INTEGER NOT NULL,
          open_timestamp INTEGER NOT NULL,
          close_timestamp INTEGER NOT NULL,
          pnl TEXT NOT NULL,
          prediction_commitment_id TEXT,
          actual_price_commitment_id TEXT,
          tx_hash TEXT,
          accuracy REAL,
          correct_directions INTEGER,
          total_directions INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `;

      this.db.exec(createTable);

      // Create indexes for better query performance
      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_user_address ON closed_positions(user_address);
        CREATE INDEX IF NOT EXISTS idx_pnl ON closed_positions(pnl DESC);
        CREATE INDEX IF NOT EXISTS idx_close_timestamp ON closed_positions(close_timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_position_id ON closed_positions(position_id);
      `;

      this.db.exec(createIndexes);

      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database schema', error);
      throw error;
    }
  }

  /**
   * Save a closed position to the database
   */
  public savePosition(data: ClosedPositionData): void {
    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO closed_positions (
          position_id,
          user_address,
          amount,
          leverage,
          open_timestamp,
          close_timestamp,
          pnl,
          prediction_commitment_id,
          actual_price_commitment_id,
          tx_hash,
          accuracy,
          correct_directions,
          total_directions,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Math.floor(Date.now() / 1000);
      
      insert.run(
        data.positionId,
        data.userAddress.toLowerCase(), // Normalize to lowercase
        data.amount,
        data.leverage,
        data.openTimestamp,
        data.closeTimestamp,
        data.pnl,
        data.predictionCommitmentId || null,
        data.actualPriceCommitmentId || null,
        data.txHash || null,
        data.accuracy || null,
        data.correctDirections || null,
        data.totalDirections || null,
        now
      );

      logger.debug('Position saved to database', {
        positionId: data.positionId,
        userAddress: data.userAddress,
        pnl: data.pnl
      });
    } catch (error) {
      logger.error('Failed to save position to database', {
        positionId: data.positionId,
        error
      });
      // Don't throw - we don't want database errors to fail position closing
    }
  }

  /**
   * Get all closed positions (paginated)
   */
  public getAllPositions(limit: number = 100, offset: number = 0): {
    positions: LeaderboardEntry[];
    total: number;
  } {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as total FROM closed_positions');
      const total = (countStmt.get() as { total: number }).total;

      const select = this.db.prepare(`
        SELECT 
          position_id as positionId,
          user_address as userAddress,
          amount,
          leverage,
          pnl,
          open_timestamp as openTimestamp,
          close_timestamp as closeTimestamp,
          accuracy,
          tx_hash as txHash
        FROM closed_positions
        ORDER BY close_timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const positions = select.all(limit, offset) as LeaderboardEntry[];

      return {
        positions,
        total
      };
    } catch (error) {
      logger.error('Failed to get all positions', error);
      throw error;
    }
  }

  /**
   * Get positions by user address
   */
  public getPositionsByUser(userAddress: string, limit: number = 100, offset: number = 0): {
    positions: LeaderboardEntry[];
    total: number;
  } {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as total FROM closed_positions WHERE user_address = ?'
      );
      const total = (countStmt.get(normalizedAddress) as { total: number }).total;

      const select = this.db.prepare(`
        SELECT 
          position_id as positionId,
          user_address as userAddress,
          amount,
          leverage,
          pnl,
          open_timestamp as openTimestamp,
          close_timestamp as closeTimestamp,
          accuracy,
          tx_hash as txHash
        FROM closed_positions
        WHERE user_address = ?
        ORDER BY close_timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const positions = select.all(normalizedAddress, limit, offset) as LeaderboardEntry[];

      return {
        positions,
        total
      };
    } catch (error) {
      logger.error('Failed to get positions by user', { userAddress, error });
      throw error;
    }
  }

  /**
   * Get leaderboard (top positions by PnL)
   */
  public getLeaderboard(limit: number = 100, offset: number = 0, sortBy: 'pnl' | 'timestamp' = 'pnl'): {
    positions: LeaderboardEntry[];
    total: number;
  } {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as total FROM closed_positions');
      const total = (countStmt.get() as { total: number }).total;

      const orderBy = sortBy === 'pnl' 
        ? 'CAST(pnl AS REAL) DESC' 
        : 'close_timestamp DESC';

      const select = this.db.prepare(`
        SELECT 
          position_id as positionId,
          user_address as userAddress,
          amount,
          leverage,
          pnl,
          open_timestamp as openTimestamp,
          close_timestamp as closeTimestamp,
          accuracy,
          tx_hash as txHash
        FROM closed_positions
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `);

      const positions = select.all(limit, offset) as LeaderboardEntry[];

      return {
        positions,
        total
      };
    } catch (error) {
      logger.error('Failed to get leaderboard', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  public getUserStats(userAddress: string): UserStats {
    try {
      const normalizedAddress = userAddress.toLowerCase();

      const positionsStmt = this.db.prepare(`
        SELECT 
          position_id as positionId,
          user_address as userAddress,
          amount,
          leverage,
          pnl,
          open_timestamp as openTimestamp,
          close_timestamp as closeTimestamp,
          accuracy,
          tx_hash as txHash
        FROM closed_positions
        WHERE user_address = ?
        ORDER BY close_timestamp DESC
      `);

      const positions = positionsStmt.all(normalizedAddress) as LeaderboardEntry[];

      const totalPositions = positions.length;
      
      // Calculate total PnL (sum of all PnLs)
      const totalPnL = positions.reduce((sum, pos) => {
        return sum + parseFloat(pos.pnl);
      }, 0);

      // Calculate average PnL
      const averagePnL = totalPositions > 0 ? totalPnL / totalPositions : 0;

      // Calculate win rate (percentage of positions with positive PnL)
      const winningPositions = positions.filter(pos => parseFloat(pos.pnl) > 0).length;
      const winRate = totalPositions > 0 ? (winningPositions / totalPositions) * 100 : 0;

      return {
        userAddress: normalizedAddress,
        totalPositions,
        totalPnL: totalPnL.toString(),
        averagePnL: averagePnL.toString(),
        winRate,
        positions
      };
    } catch (error) {
      logger.error('Failed to get user stats', { userAddress, error });
      throw error;
    }
  }

  /**
   * Get total unique user count
   */
  public getTotalUserCount(): number {
    try {
      const result = this.db.prepare('SELECT COUNT(DISTINCT user_address) as count FROM closed_positions').get();
      return (result as { count: number }).count;
    } catch (error) {
      logger.error('Failed to get total user count', error);
      return 0;
    }
  }

  /**
   * Get total volume (sum of all amounts)
   */
  public getTotalVolume(): string {
    try {
      const result = this.db.prepare('SELECT SUM(CAST(amount AS REAL)) as total FROM closed_positions').get();
      const total = (result as { total: number | null }).total;
      return total ? total.toString() : '0';
    } catch (error) {
      logger.error('Failed to get total volume', error);
      return '0';
    }
  }

  /**
   * Get positions count for today
   */
  public getPositionsToday(): number {
    try {
      const now = Math.floor(Date.now() / 1000);
      const todayStart = Math.floor(now / 86400) * 86400;
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM closed_positions WHERE close_timestamp >= ?'
      ).get(todayStart);
      return (result as { count: number }).count;
    } catch (error) {
      logger.error('Failed to get positions today', error);
      return 0;
    }
  }

  /**
   * Get average win rate across all users
   */
  public getAverageWinRate(): number {
    try {
      // Calculate win rate per user, then average
      const userStats = this.db.prepare(`
        SELECT 
          user_address,
          COUNT(*) as total_positions,
          SUM(CASE WHEN CAST(pnl AS REAL) > 0 THEN 1 ELSE 0 END) as winning_positions
        FROM closed_positions
        GROUP BY user_address
      `).all() as Array<{ user_address: string; total_positions: number; winning_positions: number }>;

      if (userStats.length === 0) return 0;

      const totalWinRate = userStats.reduce((sum, user) => {
        const winRate = user.total_positions > 0 ? (user.winning_positions / user.total_positions) * 100 : 0;
        return sum + winRate;
      }, 0);

      return totalWinRate / userStats.length;
    } catch (error) {
      logger.error('Failed to get average win rate', error);
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  public close(): void {
    try {
      this.db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database', error);
    }
  }
}

export default PositionDatabase;
