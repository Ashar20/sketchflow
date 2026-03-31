import dotenv from 'dotenv';
import type { FlowKeyHashAlgo, FlowKeySignAlgo } from '../flow/flowSigner.js';

// `.env.local` overrides `.env` (matches common local dev layout).
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

export type BlockchainAdapter = 'evm' | 'flow';

export interface Config {
  /** On-chain contracts: EVM (ethers) or Flow (Cadence + FCL). */
  blockchainAdapter: BlockchainAdapter;
  network: 'mainnet' | 'testnet' | 'local';
  ethereumRpcUrl: string;
  /** Optional fallback RPC URLs when primary returns 522/timeouts */
  ethereumRpcFallbackUrls: string[];
  ethereumPrivateKey: string;
  mongodbUri: string;
  mongodbDatabase: string;
  port: number;
  apiHost: string;
  bybitWssUrl: string;
  logLevel: string;
  alertWebhookUrl?: string;
  adminApiKey: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  defaultPriceSymbol: string;
  /** Futures contract address — EVM (0x…) or Flow deployment address */
  futuresContractAddress: string | null;
  /** Flow access node (REST), e.g. https://rest-testnet.onflow.org */
  flowAccessNode: string;
  /** Account that signs Flow txs (e.g. PnL server closing positions via PnlOperator) */
  flowAccountAddress: string;
  flowPrivateKey: string;
  flowKeyId: number;
  flowKeySignAlgo: FlowKeySignAlgo;
  flowKeyHashAlgo: FlowKeyHashAlgo;
  /** LineFutures contract address on Flow (defaults to FUTURES_CONTRACT_ADDRESS when adapter is flow) */
  flowLineFuturesAddress: string | null;
  /** Optional overrides for sponsor cadence hash (must match frontend NEXT_PUBLIC_FLOW_* token addresses) */
  flowFungibleTokenAddress: string | null;
  flowTokenAddress: string | null;
  /** When true, POST /api/flow/sponsor-sign signs payer role for allowlisted LineFutures open/batch txs */
  flowSponsorEnabled: boolean;
  flowSponsorAddress: string;
  flowSponsorPrivateKey: string;
  flowSponsorKeyId: number;
  /** If set, client must send x-flow-sponsor-key header matching this value */
  flowSponsorApiKey: string | null;
  /** Max sponsor-sign calls per window per IP */
  flowSponsorRateLimitMax: number;
  ethUsdRate: number;
  /** Position IDs to never attempt to close (e.g. after data loss). Comma-separated, e.g. "4,5" */
  skipPositionIds: number[];
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getOptionalEnvVar(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

const resolvedBlockchainAdapter: BlockchainAdapter =
  (process.env.BLOCKCHAIN_ADAPTER || 'flow').toLowerCase() === 'evm' ? 'evm' : 'flow';

export const config: Config = {
  blockchainAdapter: resolvedBlockchainAdapter,
  network: (process.env.NETWORK || 'local') as 'mainnet' | 'testnet' | 'local',
  ethereumRpcUrl: getOptionalEnvVar('ETHEREUM_RPC_URL', 'https://mainnet.base.org'),
  ethereumRpcFallbackUrls: (process.env.ETHEREUM_RPC_FALLBACK_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  ethereumPrivateKey: getEnvVar('ETHEREUM_PRIVATE_KEY'),
  mongodbUri: getEnvVar('MONGODB_URI'),
  mongodbDatabase: getOptionalEnvVar('MONGODB_DATABASE', 'sketchflow'),
  port: parseInt(process.env.PORT || '3001', 10),
  apiHost: process.env.API_HOST || '0.0.0.0',
  bybitWssUrl: getOptionalEnvVar('BYBIT_WSS_URL', 'wss://stream.bybit.com/v5/public/spot'),
  logLevel: process.env.LOG_LEVEL || 'info',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
  adminApiKey: getEnvVar('ADMIN_API_KEY'),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
  defaultPriceSymbol: getOptionalEnvVar('PRICE_SYMBOL', 'FLOWUSDT'),
  futuresContractAddress: process.env.FUTURES_CONTRACT_ADDRESS || null,
  flowAccessNode: getOptionalEnvVar('FLOW_ACCESS_NODE', 'https://rest-testnet.onflow.org'),
  flowAccountAddress: getOptionalEnvVar('FLOW_ACCOUNT_ADDRESS', ''),
  flowPrivateKey:
    process.env.FLOW_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY || '',
  flowKeyId: parseInt(process.env.FLOW_KEY_ID || '0', 10),
  flowKeySignAlgo: (process.env.FLOW_KEY_SIGN_ALGO || 'ECDSA_P256') as FlowKeySignAlgo,
  flowKeyHashAlgo: (process.env.FLOW_KEY_HASH_ALGO || 'SHA2_256') as FlowKeyHashAlgo,
  flowLineFuturesAddress:
    process.env.FLOW_LINE_FUTURES_ADDRESS ||
    (resolvedBlockchainAdapter === 'flow' ? process.env.FUTURES_CONTRACT_ADDRESS || null : null) ||
    null,
  flowFungibleTokenAddress: process.env.FLOW_FUNGIBLE_TOKEN_ADDRESS || null,
  flowTokenAddress: process.env.FLOW_TOKEN_ADDRESS || null,
  flowSponsorEnabled: process.env.FLOW_SPONSOR_ENABLED === 'true',
  flowSponsorAddress: process.env.FLOW_SPONSOR_ADDRESS || '',
  flowSponsorPrivateKey: process.env.FLOW_SPONSOR_PRIVATE_KEY || '',
  flowSponsorKeyId: parseInt(process.env.FLOW_SPONSOR_KEY_ID || '0', 10),
  flowSponsorApiKey: process.env.FLOW_SPONSOR_API_KEY || null,
  flowSponsorRateLimitMax: parseInt(process.env.FLOW_SPONSOR_RATE_LIMIT_MAX || '60', 10),
  ethUsdRate: (() => {
    const v = parseFloat(process.env.ETH_USD_RATE || '3000');
    return Number.isFinite(v) && v > 0 ? v : 3000;
  })(),
  skipPositionIds: (process.env.SKIP_POSITION_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0),
};

export default config;
