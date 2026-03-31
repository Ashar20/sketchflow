import logger from '../utils/logger.js';
import config from '../config/config.js';
import type { Position } from './futuresContractStorage.js';
import { configureFlowAccessNode, executeFlowScript, sendFlowTransaction } from '../flow/flowTx.js';
import type { FlowSignerOptions } from '../flow/flowSigner.js';

function cadenceImportAddress(addr: string): string {
  const h = addr.replace(/^0x/i, '');
  return `0x${h}`;
}

/** Match EVM-style 18-decimal scale used by PnLCalculator when collateral was ETH wei. */
export function flowUfix64ToWeiLikeBigInt(s: string): bigint {
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '000000000000000000').slice(0, 18);
  const w = BigInt(whole || '0');
  const f = BigInt(fracPadded || '0');
  return w * 10n ** 18n + f;
}

function fix64ToWeiLikeBigInt(s: string): bigint {
  const neg = s.trim().startsWith('-');
  const abs = neg ? s.trim().slice(1) : s.trim();
  const v = flowUfix64ToWeiLikeBigInt(abs);
  return neg ? -v : v;
}

function ufixSecondsToBigInt(s: string): bigint {
  return BigInt(Math.floor(parseFloat(s)));
}

function normalizeFlowAddress(a: unknown): string {
  if (typeof a !== 'string') {
    return String(a);
  }
  const h = a.replace(/^0x/i, '');
  return `0x${h}`;
}

function mapPosition(raw: Record<string, unknown>): Position {
  return {
    user: normalizeFlowAddress(raw.user),
    amount: flowUfix64ToWeiLikeBigInt(String(raw.amount)),
    leverage: Number(raw.leverage),
    openTimestamp: ufixSecondsToBigInt(String(raw.openTimestamp)),
    predictionCommitmentId: String(raw.predictionCommitmentId),
    isOpen: Boolean(raw.isOpen),
    pnl: fix64ToWeiLikeBigInt(String(raw.pnl)),
    actualPriceCommitmentId: String(raw.actualPriceCommitmentId ?? ''),
    closeTimestamp: ufixSecondsToBigInt(String(raw.closeTimestamp || '0')),
  };
}

function isEthereumAddress(addr: string): boolean {
  return /^0x[a-fA-F]{40}$/.test(addr);
}

function weiLikeBigIntToFix64String(wei: bigint): string {
  const neg = wei < 0n;
  const w = neg ? -wei : wei;
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 8);
  return `${neg ? '-' : ''}${whole}.${fracStr}`;
}

/**
 * Flow Cadence backend for LineFutures (testnet / mainnet). Mirrors FuturesContractStorage public API.
 */
export class FlowFuturesContractStorage {
  private futuresAddr: string;
  private contractAddress: string;
  private signerOpts: FlowSignerOptions;

  constructor() {
    const addr = config.flowLineFuturesAddress;
    if (!addr) {
      throw new Error('FLOW_LINE_FUTURES_ADDRESS (or FUTURES_CONTRACT_ADDRESS with Flow adapter) is required');
    }
    if (!config.flowAccountAddress) {
      throw new Error('FLOW_ACCOUNT_ADDRESS is required when using Flow');
    }
    if (!config.flowPrivateKey) {
      throw new Error(
        'FLOW_PRIVATE_KEY (or ETHEREUM_PRIVATE_KEY as fallback) is required when using Flow'
      );
    }
    configureFlowAccessNode(config.flowAccessNode);
    this.futuresAddr = cadenceImportAddress(addr);
    this.contractAddress = with0x(addr);
    this.signerOpts = {
      privateKeyHex: config.flowPrivateKey,
      address: with0x(config.flowAccountAddress),
      keyId: config.flowKeyId,
      signAlgo: config.flowKeySignAlgo,
      hashAlgo: config.flowKeyHashAlgo,
    };
    logger.info('FlowFuturesContractStorage initialized', {
      contractAddress: this.contractAddress,
      flowAccount: this.signerOpts.address,
    });
  }

  public async getPosition(positionId: number): Promise<Position> {
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(positionId: UInt64): LineFutures.Position {
    return LineFutures.getPosition(positionId: positionId)
}
`;
    const raw = await executeFlowScript<Record<string, unknown>>({
      cadence,
      args: (arg, types) => [arg(positionId, types.UInt64)],
    });
    return mapPosition(raw);
  }

  public async getUserPositions(userAddress: string): Promise<number[]> {
    if (isEthereumAddress(userAddress)) {
      return [];
    }
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(user: Address): [UInt64] {
    return LineFutures.getUserPositions(user: user)
}
`;
    const ids = await executeFlowScript<string[]>({
      cadence,
      args: (arg, types) => [arg(normalizeFlowAddress(userAddress), types.Address)],
    });
    return ids.map((x) => Number(x));
  }

  public async canClosePosition(positionId: number): Promise<boolean> {
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(positionId: UInt64): Bool {
    return LineFutures.canClosePosition(positionId: positionId)
}
`;
    return executeFlowScript<boolean>({
      cadence,
      args: (arg, types) => [arg(positionId, types.UInt64)],
    });
  }

  public async closePosition(
    positionId: number,
    pnl: bigint,
    actualPriceCommitmentId: string
  ): Promise<string> {
    const pnlStr = weiLikeBigIntToFix64String(pnl);
    const cadence = `
import LineFutures from ${this.futuresAddr}

transaction(positionId: UInt64, pnl: Fix64, actualPriceCommitmentId: String) {
    prepare(signer: auth(Storage) &Account) {
        let op = signer.storage.borrow<&LineFutures.PnlOperator>(from: /storage/sketchflowPnlOperator)
            ?? panic("missing PnlOperator at /storage/sketchflowPnlOperator")
        op.closePosition(positionId: positionId, pnl: pnl, actualPriceCommitmentId: actualPriceCommitmentId)
    }
}
`;
    return sendFlowTransaction({
      cadence,
      args: (arg, types) => [
        arg(positionId, types.UInt64),
        arg(pnlStr, types.Fix64),
        arg(actualPriceCommitmentId, types.String),
      ],
      proposerAddress: this.signerOpts.address,
      signerOpts: this.signerOpts,
      limit: 9999,
    });
  }

  public async getUserStats(userAddress: string): Promise<{
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalPnl: bigint;
  }> {
    if (isEthereumAddress(userAddress)) {
      return {
        totalPositions: 0,
        openPositions: 0,
        closedPositions: 0,
        totalPnl: 0n,
      };
    }
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(user: Address): LineFutures.UserStats {
    return LineFutures.getUserStats(user: user)
}
`;
    const raw = await executeFlowScript<Record<string, unknown>>({
      cadence,
      args: (arg, types) => [arg(normalizeFlowAddress(userAddress), types.Address)],
    });
    return {
      totalPositions: Number(raw.totalPositions),
      openPositions: Number(raw.openPositions),
      closedPositions: Number(raw.closedPositions),
      totalPnl: fix64ToWeiLikeBigInt(String(raw.totalPnl)),
    };
  }

  public async getPositionCounter(): Promise<number> {
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(): UInt64 {
    return LineFutures.getPositionCounter()
}
`;
    const c = await executeFlowScript<string>({
      cadence,
      args: () => [],
    });
    return Number(c);
  }

  public async getContractBalance(): Promise<bigint> {
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(): UFix64 {
    return LineFutures.getContractBalance()
}
`;
    const s = await executeFlowScript<string>({
      cadence,
      args: () => [],
    });
    return flowUfix64ToWeiLikeBigInt(s);
  }

  public async isPaused(): Promise<boolean> {
    const cadence = `
import LineFutures from ${this.futuresAddr}

access(all) fun main(): Bool {
    return LineFutures.getPaused()
}
`;
    return executeFlowScript<boolean>({
      cadence,
      args: () => [],
    });
  }

  public async getOpenPositions(): Promise<number[]> {
    const counter = await this.getPositionCounter();
    const open: number[] = [];
    for (let i = 0; i < counter; i++) {
      const p = await this.getPosition(i);
      if (p.isOpen) {
        open.push(i);
      }
    }
    return open;
  }

  public async getClosablePositions(): Promise<number[]> {
    const open = await this.getOpenPositions();
    const out: number[] = [];
    for (const id of open) {
      if (await this.canClosePosition(id)) {
        out.push(id);
      }
    }
    return out;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.getPositionCounter();
      await this.isPaused();
      return true;
    } catch (e) {
      logger.error('Flow futures connection test failed', e);
      return false;
    }
  }

  public async getContractInfo(): Promise<{
    owner: string;
    pnlServer: string;
    feePercentage: number;
    collectedFees: bigint;
    paused: boolean;
    positionCounter: number;
    balance: bigint;
  }> {
    const imp = this.futuresAddr;
    const [owner, feePct, fees, paused, counter, balance] = await Promise.all([
      executeFlowScript<string>({
        cadence: `import LineFutures from ${imp}\naccess(all) fun main(): Address { return LineFutures.getOwner() }`,
        args: () => [],
      }),
      executeFlowScript<string>({
        cadence: `import LineFutures from ${imp}\naccess(all) fun main(): UInt64 { return LineFutures.getFeePercentage() }`,
        args: () => [],
      }),
      executeFlowScript<string>({
        cadence: `import LineFutures from ${imp}\naccess(all) fun main(): UFix64 { return LineFutures.getCollectedFees() }`,
        args: () => [],
      }),
      this.isPaused(),
      this.getPositionCounter(),
      this.getContractBalance(),
    ]);
    const op = normalizeFlowAddress(owner);
    return {
      owner: op,
      pnlServer: op,
      feePercentage: Number(feePct),
      collectedFees: flowUfix64ToWeiLikeBigInt(fees),
      paused,
      positionCounter: counter,
      balance,
    };
  }

  public onPositionOpened(): void {
    /* Flow: poll events separately if needed */
  }

  public onPositionClosed(): void {
    /* Flow: poll events separately if needed */
  }

  public getWalletAddress(): string {
    return this.signerOpts.address;
  }

  public getContractAddress(): string {
    return this.contractAddress;
  }
}

function with0x(addr: string): string {
  const h = addr.replace(/^0x/i, '');
  return `0x${h}`;
}
