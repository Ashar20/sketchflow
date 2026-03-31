import * as fcl from '@onflow/fcl';
import { cadenceImportAddress, flowCoreImports, resolveFlowNetwork } from './addresses';

/** Minimal event shape from `fcl.tx(...).onceSealed()`. */
interface SealedEvent {
  type: string;
  data?: Record<string, unknown>;
}

interface TransactionStatusLike {
  statusCode: number;
  errorMessage: string;
  events?: SealedEvent[];
}

function lineFuturesImport(): string {
  const raw = process.env.NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS || '';
  if (!raw.trim()) {
    throw new Error(
      'Set NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS to your deployed LineFutures account address on Flow.',
    );
  }
  return cadenceImportAddress(raw);
}

function coreImports(): { fungible: string; flowToken: string } {
  const net = resolveFlowNetwork();
  const o = flowCoreImports(net);
  const fungible = cadenceImportAddress(
    process.env.NEXT_PUBLIC_FLOW_FUNGIBLE_TOKEN_ADDRESS || o.fungibleToken,
  );
  const flowToken = cadenceImportAddress(
    process.env.NEXT_PUBLIC_FLOW_TOKEN_ADDRESS || o.flowToken,
  );
  return { fungible, flowToken };
}

export function flowAmountToUFix64String(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('FLOW amount must be a positive number');
  }
  return amount.toFixed(8);
}

export function buildOpenPositionCadence(): string {
  const lf = lineFuturesImport();
  const { fungible, flowToken } = coreImports();
  return `
import FungibleToken from ${fungible}
import FlowToken from ${flowToken}
import LineFutures from ${lf}

transaction(
    leverage: UInt16,
    predictionCommitmentId: String,
    amount: UFix64
) {
    prepare(signer: auth(Storage) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
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

export function buildBatchOpenPositionsCadence(): string {
  const lf = lineFuturesImport();
  const { fungible, flowToken } = coreImports();
  return `
import FungibleToken from ${fungible}
import FlowToken from ${flowToken}
import LineFutures from ${lf}

transaction(
    leverage: UInt16,
    predictionCommitmentIds: [String],
    amount: UFix64
) {
    prepare(signer: auth(Storage) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
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

export function parsePositionOpenedIdsFromStatus(status: TransactionStatusLike): number[] {
  const ids: number[] = [];
  for (const ev of status.events ?? []) {
    const id = positionIdFromEvent(ev);
    if (id !== null) ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}

function positionIdFromEvent(ev: SealedEvent): number | null {
  if (!ev.type?.includes('LineFutures.PositionOpened')) return null;
  const d = ev.data as Record<string, unknown> | undefined;
  if (!d) return null;
  const raw = d.positionId;
  if (raw === undefined || raw === null) return null;
  const n = Number(String(raw));
  return Number.isFinite(n) ? n : null;
}

export async function sealAndExtractPositionIds(txId: string): Promise<number[]> {
  const status = (await fcl.tx(txId).onceSealed()) as TransactionStatusLike;
  if (status.statusCode !== 0) {
    throw new Error(status.errorMessage || 'Transaction failed');
  }
  return parsePositionOpenedIdsFromStatus(status);
}
