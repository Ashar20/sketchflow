import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path (same as in positionDatabase.ts)
const dbPath = path.join(__dirname, '../positions.db');

// Connect to database
const db = new Database(dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');

console.log('Connected to database:', dbPath);

// Generate random Ethereum address
function randomAddress() {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

// Generate random timestamp within last 7 days
function randomTimestamp() {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - (7 * 24 * 60 * 60);
  return Math.floor(Math.random() * (now - sevenDaysAgo)) + sevenDaysAgo;
}

// Generate random commitment ID
function randomCommitmentId() {
  const chars = '0123456789abcdef';
  let commitment = '0x';
  for (let i = 0; i < 64; i++) {
    commitment += chars[Math.floor(Math.random() * chars.length)];
  }
  return commitment;
}

// Generate random PnL (in wei) - can be positive or negative
function randomPnL() {
  // Random between -10 ETH and +20 ETH in wei
  const min = -10 * 1e18;
  const max = 20 * 1e18;
  return Math.floor(Math.random() * (max - min) + min).toString();
}

// Generate random amount (in wei) - between 0.01 and 1 ETH
function randomAmount() {
  const min = 0.01 * 1e18;
  const max = 1 * 1e18;
  return Math.floor(Math.random() * (max - min) + min).toString();
}

// Generate random leverage (1-2500)
function randomLeverage() {
  const leverages = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];
  return leverages[Math.floor(Math.random() * leverages.length)];
}

// Generate random accuracy (0 to 1)
function randomAccuracy() {
  return Math.random();
}

// Create mock positions
function createMockPositions(count = 50) {
  const users = [
    '0xf1d51b52cf2843205fabd9f6981a67f6011c583c',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1e5E8',
    '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c',
    '0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C',
    '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB',
    '0x583031D1113aD414F02576BD6afaBfb302140225',
    '0xdD870fA1b7C4700F2BD7f44238821C26f7392148',
    '0x0A098Eda01Ce92ff4A4CCb7A4fFFb5A43EBC70DC',
    '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
    '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
    '0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a',
    '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
    '0x8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
    '0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d',
    '0x0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e',
    '0x1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f',
    '0x2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
    '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    '0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    '0x5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
    '0x6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
    '0x7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
    '0x8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
    '0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    '0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c',
    '0xb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
    '0xc2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
    '0xd3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f',
    '0xe4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a',
    '0xf5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    '0xa6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c',
    '0xb7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    '0xc8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e',
    '0xd9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
    '0xe0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
    '0xf1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    '0xa2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    '0xb3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    '0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
    '0xd5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
    '0xe6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a',
    '0xf7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
    '0xa8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
    '0xb9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d',
  ];

  const positions = [];
  let positionId = 1;

  // Check existing max position ID
  try {
    const maxId = db.prepare('SELECT MAX(position_id) as max_id FROM closed_positions').get();
    if (maxId && maxId.max_id) {
      positionId = maxId.max_id + 1;
    }
  } catch (error) {
    // Table might not exist or be empty
    console.log('Starting from position ID 1');
  }

  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const openTimestamp = randomTimestamp();
    const closeTimestamp = openTimestamp + 60; // 60 seconds later
    const amount = randomAmount();
    const leverage = randomLeverage();
    const pnl = randomPnL();
    const accuracy = randomAccuracy();
    const pnlNum = parseFloat(pnl) / 1e18;
    const correctDirections = Math.floor(accuracy * 59);
    const totalDirections = 59;

    positions.push({
      positionId: positionId++,
      userAddress: user.toLowerCase(),
      amount: amount,
      leverage: leverage,
      openTimestamp: openTimestamp,
      closeTimestamp: closeTimestamp,
      pnl: pnl,
      predictionCommitmentId: randomCommitmentId(),
      actualPriceCommitmentId: randomCommitmentId(),
      txHash: randomCommitmentId(),
      accuracy: accuracy,
      correctDirections: correctDirections,
      totalDirections: totalDirections,
    });
  }

  return positions;
}

// Insert positions into database
function insertPositions(positions) {
  const insert = db.prepare(`
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

  const insertMany = db.transaction((positions) => {
    const now = Math.floor(Date.now() / 1000);
    for (const pos of positions) {
      insert.run(
        pos.positionId,
        pos.userAddress,
        pos.amount,
        pos.leverage,
        pos.openTimestamp,
        pos.closeTimestamp,
        pos.pnl,
        pos.predictionCommitmentId,
        pos.actualPriceCommitmentId,
        pos.txHash,
        pos.accuracy,
        pos.correctDirections,
        pos.totalDirections,
        now
      );
    }
  });

  insertMany(positions);
  console.log(`Inserted ${positions.length} positions`);
}

// Main function
function main() {
  // Parse arguments - handle both --force and count
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const countArg = args.find(arg => !arg.startsWith('--') && !isNaN(parseInt(arg)));
  const count = countArg ? parseInt(countArg) : 50;
  
  try {
    // Create table if it doesn't exist
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
    db.exec(createTable);

    // Clear database if --force flag is used
    if (force) {
      console.log('--force flag detected: clearing existing positions...');
      db.prepare('DELETE FROM closed_positions').run();
      console.log('Database cleared.');
    }

    // Create indexes
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_user_address ON closed_positions(user_address);
      CREATE INDEX IF NOT EXISTS idx_pnl ON closed_positions(pnl DESC);
      CREATE INDEX IF NOT EXISTS idx_close_timestamp ON closed_positions(close_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_position_id ON closed_positions(position_id);
    `;
    db.exec(createIndexes);

    // Generate and insert mock data
    const positions = createMockPositions(count);
    insertPositions(positions);

    // Show summary
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_address) as unique_users,
        SUM(CAST(pnl AS REAL)) as total_pnl
      FROM closed_positions
    `).get();

    console.log('\nDatabase Summary:');
    console.log(`Total positions: ${stats.total}`);
    console.log(`Unique users: ${stats.unique_users}`);
    console.log(`Total PnL (wei): ${stats.total_pnl}`);
    console.log(`Total PnL (ETH): ${(parseFloat(stats.total_pnl) / 1e18).toFixed(4)}`);

    // Show top 5 users by PnL
    console.log('\nTop 5 Users by PnL:');
    const topUsers = db.prepare(`
      SELECT 
        user_address,
        COUNT(*) as positions,
        SUM(CAST(pnl AS REAL)) as total_pnl
      FROM closed_positions
      GROUP BY user_address
      ORDER BY total_pnl DESC
      LIMIT 5
    `).all();

    topUsers.forEach((user, index) => {
      const pnlEth = (parseFloat(user.total_pnl) / 1e18).toFixed(4);
      console.log(`${index + 1}. ${user.user_address}: ${user.positions} positions, ${pnlEth} ETH`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

// Run the script
main();
