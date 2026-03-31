import * as fcl from '@onflow/fcl';
import { authorization } from '@onflow/sdk';
import { withPrefix } from '@onflow/util-address';
import type { FlowSignerOptions } from './flowSigner.js';
import { createFlowSigningFunction } from './flowSigner.js';

export function configureFlowAccessNode(url: string): void {
  fcl.config({ 'accessNode.api': url });
}

/** Matches FCL `(arg, t) => [...]` cadence argument builders. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlowCadenceArgs = (arg: any, t: any) => any[];

export async function sendFlowTransaction(params: {
  cadence: string;
  args: FlowCadenceArgs;
  proposerAddress: string;
  signerOpts: FlowSignerOptions;
  limit?: number;
}): Promise<string> {
  const signFn = createFlowSigningFunction(params.signerOpts);
  const authz = authorization(
    withPrefix(params.proposerAddress.replace(/^0x/i, '0x')),
    signFn as Parameters<typeof authorization>[1],
    params.signerOpts.keyId
  );

  const txId = await fcl.mutate({
    cadence: params.cadence,
    args: params.args,
    proposer: authz,
    payer: authz,
    authorizations: [authz],
    limit: params.limit ?? 9999,
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
