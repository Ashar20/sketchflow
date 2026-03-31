const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export interface FeeSponsorshipStatus {
  enabled: boolean;
  payerAddress?: string;
  keyId?: number;
  apiKeyRequired?: boolean;
}

export async function fetchFeeSponsorshipStatus(): Promise<FeeSponsorshipStatus> {
  try {
    const res = await fetch(`${DEFAULT_BACKEND_URL}/api/flow/fee-sponsorship`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { enabled: false };
    }
    return (await res.json()) as FeeSponsorshipStatus;
  } catch {
    return { enabled: false };
  }
}
