/**
 * USDC ↔ ETH conversion for the predict flow.
 * Backend uses the same rate (ETH_USD_RATE): 1 ETH = rate USDC (default 3000).
 * UI amounts are in USDC (6 decimals); the contract uses ETH wei.
 */

const ETH_DECIMALS = 18;
const USDC_DECIMALS = 6;

export function getEthUsdRate(): number {
  const v = parseFloat(process.env.NEXT_PUBLIC_ETH_USD_RATE || '3000');
  return Number.isFinite(v) && v > 0 ? v : 3000;
}

export function usdcToEthWei(usdcAmount: number): bigint {
  const rate = BigInt(Math.floor(getEthUsdRate()));
  const wei =
    (BigInt(Math.floor(usdcAmount * 10 ** USDC_DECIMALS)) * BigInt(10 ** ETH_DECIMALS)) /
    (rate * BigInt(10 ** USDC_DECIMALS));
  return wei;
}

export function ethWeiToUsdcHuman(wei: bigint): number {
  const rate = BigInt(Math.floor(getEthUsdRate()));
  const usdcUnits = (wei * rate * BigInt(10 ** USDC_DECIMALS)) / BigInt(10 ** ETH_DECIMALS);
  return Number(usdcUnits) / 10 ** USDC_DECIMALS;
}

const MIN_ETH = 0.001;

export function getMinUsdcAmount(): number {
  const rate = getEthUsdRate();
  return MIN_ETH * rate;
}
