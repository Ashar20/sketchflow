export type FlowNetworkId = 'testnet' | 'mainnet' | 'emulator';

export function resolveFlowNetwork(): FlowNetworkId {
  const n = (process.env.NEXT_PUBLIC_FLOW_NETWORK || 'testnet').toLowerCase();
  if (n === 'mainnet') return 'mainnet';
  if (n === 'emulator' || n === 'local') return 'emulator';
  return 'testnet';
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
  if (network === 'emulator') {
    return {
      fungibleToken: '0xee82856bf20e2aa6',
      flowToken: '0x0ae53cb6e3f42a79',
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
