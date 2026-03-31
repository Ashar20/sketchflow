/**
 * Format backend "wei-like" 18-decimal fixed integers (used for Flow UFix64/Fix64 mapped in the API).
 * Mirrors ethers `formatEther` for positive and negative values.
 */
export function formatWeiLike18(wei: bigint | string): string {
  const w = typeof wei === 'string' ? BigInt(wei) : wei;
  const neg = w < 0n;
  const abs = neg ? -w : w;
  const whole = abs / 10n ** 18n;
  const frac = abs % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  if (fracStr === '') {
    return `${neg ? '-' : ''}${whole}`;
  }
  return `${neg ? '-' : ''}${whole}.${fracStr}`;
}
