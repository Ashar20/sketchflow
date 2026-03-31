import * as fcl from '@onflow/fcl';
import { encodeTransactionEnvelope } from '@onflow/sdk';
import type { FlowSignerOptions } from './flowSigner.js';
import { createFlowSigningFunction } from './flowSigner.js';

export function configureFlowAccessNode(url: string): void {
  fcl.config({ 'accessNode.api': url });
}

/** Matches FCL `(arg, t) => [...]` cadence argument builders. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlowCadenceArgs = (arg: any, t: any) => any[];

interface JsonCdcArg {
  type: string;
  value: unknown;
}

/**
 * Single-signer transaction (proposer == payer == authorizer).
 *
 * FCL 1.21.x has a bug where it generates both a payload signature AND an
 * envelope signature for the same key when the same account fills all three
 * roles, which Flow rejects as a duplicated signature.
 *
 * This function bypasses FCL's signing entirely:
 *  - Encodes the transaction payload + empty payloadSigs using @onflow/sdk
 *  - Signs ONLY the envelope
 *  - POSTs directly to the Flow REST API
 *
 * Returns the transaction ID (does NOT wait for sealing).
 */
export async function submitFlowTransaction(params: {
  cadence: string;
  args: FlowCadenceArgs;
  signerOpts: FlowSignerOptions;
  accessNode: string;
  limit?: number;
}): Promise<string> {
  const { cadence, args: argsBuilder, signerOpts, accessNode, limit = 9999 } = params;
  const addr = signerOpts.address.replace(/^0x/i, '');

  // 1. Fetch latest sealed block ID
  const blockRes = await fetch(`${accessNode}/v1/blocks?height=sealed`);
  if (!blockRes.ok) throw new Error(`Failed to fetch sealed block: ${blockRes.status}`);
  const blocks = (await blockRes.json()) as Array<{ header: { id: string } }>;
  const refBlockId = blocks[0].header.id;

  // 2. Fetch account key sequence number
  const accountRes = await fetch(`${accessNode}/v1/accounts/${addr}?expand=keys`);
  if (!accountRes.ok) throw new Error(`Failed to fetch account ${addr}: ${accountRes.status}`);
  const account = (await accountRes.json()) as {
    keys: Array<{ index: string; sequence_number: string }>;
  };
  const keyEntry = account.keys.find((k) => String(k.index) === String(signerOpts.keyId));
  if (!keyEntry) throw new Error(`Key ${signerOpts.keyId} not found on account ${addr}`);
  const seqNum = parseInt(keyEntry.sequence_number, 10);

  // 3. Encode Cadence args to JSON-CDC
  const rawArgs = argsBuilder(fcl.arg, fcl.t);
  const jsonCdcArgs: JsonCdcArg[] = rawArgs.map(
    (a: { value: unknown; xform: { asArgument: (v: unknown) => JsonCdcArg } }) =>
      a.xform.asArgument(a.value),
  );

  // 4. Encode the transaction envelope with empty payloadSigs (single-signer rule)
  const envelopeHex = encodeTransactionEnvelope({
    cadence,
    arguments: jsonCdcArgs,
    refBlock: refBlockId,
    computeLimit: limit,
    proposalKey: { address: addr, keyId: signerOpts.keyId, sequenceNum: seqNum },
    payer: addr,
    authorizers: [addr],
    payloadSigs: [],
  });

  // 5. Sign ONLY the envelope
  const signFn = createFlowSigningFunction(signerOpts);
  const sigResult = await signFn({ message: envelopeHex });

  // 6. Submit directly to the REST API
  const body = {
    script: Buffer.from(cadence).toString('base64'),
    arguments: jsonCdcArgs.map((a) => Buffer.from(JSON.stringify(a)).toString('base64')),
    reference_block_id: refBlockId,
    gas_limit: String(limit),
    payer: addr,
    proposal_key: {
      address: addr,
      key_index: String(signerOpts.keyId),
      sequence_number: String(seqNum),
    },
    authorizers: [addr],
    payload_signatures: [],
    envelope_signatures: [
      {
        address: addr,
        key_index: String(signerOpts.keyId),
        signature: Buffer.from(sigResult.signature, 'hex').toString('base64'),
      },
    ],
  };

  const txRes = await fetch(`${accessNode}/v1/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const txBody = (await txRes.json()) as { id?: string; message?: string };
  if (!txRes.ok) {
    throw new Error(`Flow transaction rejected: ${txBody.message || txRes.statusText}`);
  }

  return txBody.id!;
}

/**
 * Submit a single-signer transaction and wait for it to be sealed.
 * Returns the transaction ID.
 */
export async function sendFlowTransaction(params: {
  cadence: string;
  args: FlowCadenceArgs;
  proposerAddress: string;
  signerOpts: FlowSignerOptions;
  accessNode: string;
  limit?: number;
}): Promise<string> {
  const txId = await submitFlowTransaction({
    cadence: params.cadence,
    args: params.args,
    signerOpts: params.signerOpts,
    accessNode: params.accessNode,
    limit: params.limit,
  });
  await fcl.onceSealed(txId);
  return txId;
}

export async function executeFlowScript<R>(params: {
  cadence: string;
  args: FlowCadenceArgs;
}): Promise<R> {
  return fcl.query({
    cadence: params.cadence,
    args: params.args,
  }) as Promise<R>;
}
