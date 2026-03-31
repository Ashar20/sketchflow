export type FlowNetworkId = 'testnet' | 'mainnet';

export function resolveFlowNetwork(): FlowNetworkId {
  const n = (process.env.NEXT_PUBLIC_FLOW_NETWORK || 'testnet').toLowerCase();
  return n === 'mainnet' ? 'mainnet' : 'testnet';
}

/** Canonical core contract addresses for FungibleToken + FlowToken. */
export function flowCoreImports(network: FlowNetworkId): {
  fungibleToken: string;
  flowToken: string;
} {
  if (network === 'mainnet') {
    return {
      fungibleToken: '0xf233dcee88fe0abe',
      flowToken: '0x1654653399040a61',
    };
  }
  return {
    fungibleToken: '0x9a0766d93b6608b7',
    flowToken: '0x7e60df042a9c0868',
  };
}

export function cadenceImportAddress(addr: string): string {
  const h = addr.replace(/^0x/i, '');
  return `0x${h}`;
}
