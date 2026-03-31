import { createHash } from 'crypto';
import type { Config } from '../config/config.js';

function cadenceImportAddress(addr: string): string {
  const h = addr.replace(/^0x/i, '');
  return `0x${h}`;
}

function coreImportsForNetwork(
  network: Config['network'],
  fungibleOverride?: string | null,
  flowTokenOverride?: string | null,
): { fungible: string; flowToken: string } {
  const isMain = network === 'mainnet';
  const defaultFungible = isMain ? '0xf233dcee88fe0abe' : '0x9a0766d93b6608b7';
  const defaultFlow = isMain ? '0x1654653399040a61' : '0x7e60df042a9c0868';
  return {
    fungible: cadenceImportAddress(fungibleOverride || defaultFungible),
    flowToken: cadenceImportAddress(flowTokenOverride || defaultFlow),
  };
}

function buildOpenPositionCadence(lineFutures: string, fungible: string, flowToken: string): string {
  return `
import FungibleToken from ${fungible}
import FlowToken from ${flowToken}
import LineFutures from ${lineFutures}

transaction(
    leverage: UInt16,
    predictionCommitmentId: String,
    amount: UFix64
) {
    prepare(signer: AuthAccount) {
        let vaultRef = signer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        if vaultRef.balance < amount {
            panic("Insufficient FLOW balance")
        }
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.openPosition(
            user: signer.address,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentId: predictionCommitmentId
        )
    }
}
`;
}

function buildBatchOpenCadence(lineFutures: string, fungible: string, flowToken: string): string {
  return `
import FungibleToken from ${fungible}
import FlowToken from ${flowToken}
import LineFutures from ${lineFutures}

transaction(
    leverage: UInt16,
    predictionCommitmentIds: [String],
    amount: UFix64
) {
    prepare(signer: AuthAccount) {
        let vaultRef = signer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        if vaultRef.balance < amount {
            panic("Insufficient FLOW balance")
        }
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.batchOpenPositions(
            user: signer.address,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentIds: predictionCommitmentIds
        )
    }
}
`;
}

function normalizeCadence(c: string): string {
  return c.replace(/\s+/g, ' ').trim();
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function buildAllowedCadenceHashes(config: Config): Set<string> {
  const addr = config.flowLineFuturesAddress;
  if (!addr) {
    return new Set();
  }
  const lf = cadenceImportAddress(addr);
  const { fungible, flowToken } = coreImportsForNetwork(
    config.network,
    config.flowFungibleTokenAddress,
    config.flowTokenAddress,
  );
  const open = normalizeCadence(buildOpenPositionCadence(lf, fungible, flowToken));
  const batch = normalizeCadence(buildBatchOpenCadence(lf, fungible, flowToken));
  return new Set([sha256Hex(open), sha256Hex(batch)]);
}

export function extractCadenceFromSignable(signable: unknown): string | null {
  const deep = (obj: unknown, depth = 0): string | null => {
    if (depth > 10 || !obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      for (const x of obj) {
        const f = deep(x, depth + 1);
        if (f) return f;
      }
      return null;
    }
    const o = obj as Record<string, unknown>;
    if (typeof o.cadence === 'string' && o.cadence.length > 20) return o.cadence;
    for (const k of Object.keys(o)) {
      const f = deep(o[k], depth + 1);
      if (f) return f;
    }
    return null;
  };
  return deep(signable);
}

export function isCadenceAllowedForSponsorship(
  cadence: string | null,
  allowedHashes: Set<string>,
): boolean {
  if (!cadence || allowedHashes.size === 0) return false;
  const h = sha256Hex(normalizeCadence(cadence));
  return allowedHashes.has(h);
}
