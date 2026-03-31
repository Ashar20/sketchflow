const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Ask the backend to sign and submit the openPosition / batchOpenPositions
 * transaction using its operator key — no wallet popup required.
 *
 * Returns the Flow transaction ID; call sealAndExtractPositionIds() on it
 * to wait for sealing and extract position IDs.
 */
export async function openPositionViaBackend(params: {
  userAddress: string;
  leverage: number;
  commitmentIds: string[];
  amount: number;
}): Promise<string> {
  const res = await fetch(`${DEFAULT_BACKEND_URL}/api/flow/open-position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const body = (await res.json().catch(() => ({}))) as { txId?: string; error?: string };

  if (!res.ok) {
    throw new Error(body.error || `open-position failed (${res.status})`);
  }

  if (!body.txId) {
    throw new Error('Backend did not return a txId');
  }

  return body.txId;
}
