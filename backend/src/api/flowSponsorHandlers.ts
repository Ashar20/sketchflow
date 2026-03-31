import type { Request, Response } from 'express';
import { withPrefix } from '@onflow/util-address';
import config from '../config/config.js';
import { createFlowSigningFunction } from '../flow/flowSigner.js';
import {
  buildAllowedCadenceHashes,
  extractCadenceFromSignable,
  isCadenceAllowedForSponsorship,
} from '../flow/sponsorCadenceAllowlist.js';
import logger from '../utils/logger.js';

class SponsorIpLimiter {
  private requests = new Map<string, number[]>();
  constructor(
    private windowMs: number,
    private maxRequests: number,
  ) {}

  isAllowed(ip: string): boolean {
    const now = Date.now();
    const valid = (this.requests.get(ip) || []).filter((t) => now - t < this.windowMs);
    if (valid.length >= this.maxRequests) {
      this.requests.set(ip, valid);
      return false;
    }
    valid.push(now);
    this.requests.set(ip, valid);
    return true;
  }
}

const sponsorLimiter = new SponsorIpLimiter(
  config.rateLimitWindowMs,
  Math.max(1, config.flowSponsorRateLimitMax),
);

function sponsorSigningConfigured(): boolean {
  return (
    config.flowSponsorEnabled &&
    !!config.flowSponsorAddress &&
    !!config.flowSponsorPrivateKey &&
    config.blockchainAdapter === 'flow'
  );
}

/**
 * Public: whether fee sponsorship is available and payer address (for FCL).
 */
export function handleFlowFeeSponsorshipStatus(_req: Request, res: Response): void {
  if (!sponsorSigningConfigured()) {
    res.json({ enabled: false });
    return;
  }
  res.json({
    enabled: true,
    payerAddress: withPrefix(config.flowSponsorAddress.replace(/^0x/i, '0x')),
    keyId: config.flowSponsorKeyId,
    apiKeyRequired: Boolean(config.flowSponsorApiKey),
  });
}

/**
 * Signs the payer envelope for an allowlisted LineFutures user open transaction.
 */
export async function handleFlowSponsorSign(req: Request, res: Response): Promise<void> {
  try {
    if (!sponsorSigningConfigured()) {
      res.status(503).json({ error: 'Flow fee sponsorship is not enabled' });
      return;
    }

    if (config.flowSponsorApiKey) {
      const sent = req.headers['x-flow-sponsor-key'];
      if (sent !== config.flowSponsorApiKey) {
        res.status(401).json({ error: 'Invalid sponsor API key' });
        return;
      }
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!sponsorLimiter.isAllowed(ip)) {
      res.status(429).json({ error: 'Too many sponsor requests' });
      return;
    }

    const signable = req.body?.signable;
    if (!signable || typeof signable !== 'object') {
      res.status(400).json({ error: 'Missing signable object' });
      return;
    }

    const cadence = extractCadenceFromSignable(signable);
    const allowed = buildAllowedCadenceHashes(config);
    if (!isCadenceAllowedForSponsorship(cadence, allowed)) {
      logger.warn('Rejected sponsor sign: cadence not allowlisted', {
        ip,
        hasCadence: Boolean(cadence),
      });
      res.status(403).json({ error: 'Cadence is not eligible for sponsorship' });
      return;
    }

    const signFn = createFlowSigningFunction({
      address: config.flowSponsorAddress,
      privateKeyHex: config.flowSponsorPrivateKey,
      keyId: config.flowSponsorKeyId,
      signAlgo: config.flowKeySignAlgo,
      hashAlgo: config.flowKeyHashAlgo,
    });

    const out = await signFn(signable as { message?: string });
    res.json(out);
  } catch (e) {
    logger.error('sponsor-sign failed', e);
    res.status(500).json({ error: 'Sponsor signing failed' });
  }
}
