import * as fcl from '@onflow/fcl';
import { resolveFlowNetwork } from './addresses';

let configured = false;

/**
 * One-time FCL setup (access node, discovery, network). Call from a client `useEffect` in `Providers`.
 */
export function initFcl(): void {
  if (typeof window === 'undefined') return;
  if (configured) return;

  const network = resolveFlowNetwork();

  const accessNode =
    process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE ||
    (network === 'mainnet'
      ? 'https://rest-mainnet.onflow.org'
      : 'https://rest-testnet.onflow.org');

  const discoveryWallet =
    process.env.NEXT_PUBLIC_FLOW_DISCOVERY_WALLET ||
    (network === 'mainnet'
      ? 'https://fcl-discovery.onflow.org/mainnet/authn'
      : 'https://fcl-discovery.onflow.org/testnet/authn');

  fcl
    .config()
    .put('accessNode.api', accessNode)
    .put('discovery.wallet', discoveryWallet)
    .put('flow.network', network);

  configured = true;
}
