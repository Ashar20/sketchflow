import type { Request, Response } from 'express';
import * as fcl from '@onflow/fcl';
import config from '../config/config.js';
import { submitFlowTransaction } from '../flow/flowTx.js';
import { configureFlowAccessNode } from '../flow/flowTx.js';
import logger from '../utils/logger.js';

function getFlowCoreAddresses(): { fungibleToken: string; flowToken: string } {
  return {
    fungibleToken: config.flowFungibleTokenAddress || '0x9a0766d93b6608b7',
    flowToken: config.flowTokenAddress || '0x7e60df042a9c0868',
  };
}

function with0x(addr: string): string {
  return /^0x/i.test(addr) ? addr : `0x${addr}`;
}

/**
 * POST /api/flow/open-position
 * Signs and submits a LineFutures openPosition (or batchOpenPositions) transaction
 * entirely server-side using the operator key, so no wallet popup is needed.
 *
 * Body: { userAddress, leverage, commitmentIds: string[], amount: number }
 * Returns: { txId }
 */
export async function handleFlowOpenPosition(req: Request, res: Response): Promise<void> {
  try {
    if (config.blockchainAdapter !== 'flow') {
      res.status(503).json({ error: 'Flow adapter not enabled' });
      return;
    }

    if (!config.flowLineFuturesAddress || !config.flowAccountAddress || !config.flowPrivateKey) {
      res.status(503).json({ error: 'Flow signing not configured on server' });
      return;
    }

    const { userAddress, leverage, commitmentIds, amount } = req.body as {
      userAddress?: string;
      leverage?: unknown;
      commitmentIds?: unknown;
      amount?: unknown;
    };

    if (!userAddress || !/^0x[a-fA-F0-9]{1,40}$/.test(userAddress)) {
      res.status(400).json({ error: 'Invalid userAddress' });
      return;
    }

    const lev = Number(leverage);
    if (!Number.isFinite(lev) || lev < 1 || lev > 2500) {
      res.status(400).json({ error: 'leverage must be 1–2500' });
      return;
    }

    if (!Array.isArray(commitmentIds) || commitmentIds.length === 0) {
      res.status(400).json({ error: 'commitmentIds must be a non-empty array' });
      return;
    }

    const ids: string[] = (commitmentIds as unknown[]).map(String).filter(Boolean);
    if (ids.length === 0) {
      res.status(400).json({ error: 'No valid commitmentIds' });
      return;
    }

    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    const amtStr = amtNum.toFixed(8);

    configureFlowAccessNode(config.flowAccessNode);

    const { fungibleToken, flowToken } = getFlowCoreAddresses();
    const futuresAddr = with0x(config.flowLineFuturesAddress);

    const signerOpts = {
      privateKeyHex: config.flowPrivateKey,
      address: with0x(config.flowAccountAddress),
      keyId: config.flowKeyId,
      signAlgo: config.flowKeySignAlgo,
      hashAlgo: config.flowKeyHashAlgo,
    };

    let cadence: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: (arg: any, t: any) => any[];

    if (ids.length === 1) {
      cadence = `
import FungibleToken from ${fungibleToken}
import FlowToken from ${flowToken}
import LineFutures from ${futuresAddr}

transaction(userAddress: Address, leverage: UInt16, predictionCommitmentId: String, amount: UFix64) {
    prepare(signer: auth(Storage) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.openPosition(
            user: userAddress,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentId: predictionCommitmentId
        )
    }
}`;
      args = (arg, t) => [
        arg(fcl.withPrefix(userAddress.replace(/^0x/i, '')), t.Address),
        arg(String(lev), t.UInt16),
        arg(ids[0], t.String),
        arg(amtStr, t.UFix64),
      ];
    } else {
      cadence = `
import FungibleToken from ${fungibleToken}
import FlowToken from ${flowToken}
import LineFutures from ${futuresAddr}

transaction(userAddress: Address, leverage: UInt16, predictionCommitmentIds: [String], amount: UFix64) {
    prepare(signer: auth(Storage) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.batchOpenPositions(
            user: userAddress,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentIds: predictionCommitmentIds
        )
    }
}`;
      args = (arg, t) => [
        arg(fcl.withPrefix(userAddress.replace(/^0x/i, '')), t.Address),
        arg(String(lev), t.UInt16),
        arg(ids, t.Array(t.String)),
        arg(amtStr, t.UFix64),
      ];
    }

    logger.info('Opening position via backend signing', {
      userAddress,
      leverage: lev,
      commitmentCount: ids.length,
      amount: amtStr,
    });

    const txId = await submitFlowTransaction({
      cadence,
      args,
      proposerAddress: signerOpts.address,
      signerOpts,
      limit: 9999,
    });

    logger.info('Position transaction submitted', { txId, userAddress });
    res.json({ txId });
  } catch (e) {
    logger.error('open-position failed', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Open position failed' });
  }
}
