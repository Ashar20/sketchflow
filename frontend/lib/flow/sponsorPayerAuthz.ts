import * as fcl from '@onflow/fcl';

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Async authorization factory for the **payer** role: signs via backend `/api/flow/sponsor-sign`
 * after the server verifies cadence against an allowlist.
 */
export function createSponsorPayerAuthz(params: {
  payerAddress: string;
  keyId: number;
}): (account?: Record<string, unknown>) => Promise<Record<string, unknown>> {
  const fullAddr = fcl.withPrefix(params.payerAddress.replace(/^0x/i, ''));
  const sans = fcl.sansPrefix(fullAddr);

  return async (account: Record<string, unknown> = {}) => ({
    ...account,
    tempId: fullAddr,
    addr: sans,
    keyId: params.keyId,
    signingFunction: async (signable: { message?: string }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = process.env.NEXT_PUBLIC_FLOW_SPONSOR_API_KEY;
      if (apiKey) {
        headers['x-flow-sponsor-key'] = apiKey;
      }
      const res = await fetch(`${DEFAULT_BACKEND_URL}/api/flow/sponsor-sign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signable }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        addr?: string;
        keyId?: number;
        signature?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Sponsor sign failed (${res.status})`);
      }
      if (!body.signature) {
        throw new Error('Sponsor sign response missing signature');
      }
      return {
        addr: fcl.withPrefix(String(body.addr || fullAddr).replace(/^0x/i, '')),
        keyId: body.keyId ?? params.keyId,
        signature: body.signature,
      };
    },
  });
}
