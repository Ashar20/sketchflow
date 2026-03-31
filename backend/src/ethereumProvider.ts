/**
 * Shared Ethereum RPC provider with optional fallback URLs.
 * When the primary RPC returns 522/timeouts, FallbackProvider tries alternate endpoints.
 */
import { ethers } from 'ethers';
import config from './config/config.js';
import logger from './utils/logger.js';

let cachedProvider: ethers.AbstractProvider | null = null;

/**
 * Pinned chain for FallbackProvider: every RPC URL must serve this chain.
 * Override with ETHEREUM_CHAIN_ID when using a custom network (e.g. local anvil on another id).
 */
function getPinnedEthereumNetwork(): ethers.Network {
  const raw = process.env.ETHEREUM_CHAIN_ID?.trim();
  let chainId: number;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Invalid ETHEREUM_CHAIN_ID: ${process.env.ETHEREUM_CHAIN_ID}`);
    }
    chainId = n;
  } else {
    switch (config.network) {
      case 'mainnet':
        chainId = 8453; // Base
        break;
      case 'testnet':
        chainId = 11155111; // Sepolia
        break;
      case 'local':
      default:
        chainId = 31337; // Hardhat / Anvil default
        break;
    }
  }
  const name =
    chainId === 8453 ? 'base' : chainId === 11155111 ? 'sepolia' : chainId === 31337 ? 'localhost' : 'custom';
  return new ethers.Network(name, chainId);
}

function getProvider(): ethers.AbstractProvider {
  if (cachedProvider) return cachedProvider;

  const primary = config.ethereumRpcUrl;
  const fallbacks = config.ethereumRpcFallbackUrls ?? [];

  if (fallbacks.length === 0) {
    cachedProvider = new ethers.JsonRpcProvider(primary);
    logger.info('Ethereum provider: single RPC', { url: primary });
    return cachedProvider;
  }

  const network = getPinnedEthereumNetwork();
  const providerList = [
    new ethers.JsonRpcProvider(primary, network),
    ...fallbacks.map((url) => new ethers.JsonRpcProvider(url, network)),
  ];
  cachedProvider = new ethers.FallbackProvider(providerList, network, { quorum: 1 });
  logger.info('Ethereum provider: primary + fallbacks', {
    primary,
    fallbacks: fallbacks.length,
    chainId: network.chainId,
  });
  return cachedProvider;
}

/** Get the shared Ethereum provider (single JsonRpcProvider or FallbackProvider). */
export function getEthereumProvider(): ethers.AbstractProvider {
  return getProvider();
}

/** Primary RPC URL (for logging only). */
export function getEthereumRpcUrl(): string {
  return config.ethereumRpcUrl;
}
