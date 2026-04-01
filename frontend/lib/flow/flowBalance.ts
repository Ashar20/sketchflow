import * as fcl from '@onflow/fcl';
import * as t from '@onflow/types';
import { cadenceImportAddress, flowCoreImports, resolveFlowNetwork } from './addresses';

function buildFlowBalanceScript(): string {
  const net = resolveFlowNetwork();
  const { fungibleToken, flowToken } = flowCoreImports(net);
  const fungible = cadenceImportAddress(
    process.env.NEXT_PUBLIC_FLOW_FUNGIBLE_TOKEN_ADDRESS || fungibleToken,
  );
  const ft = cadenceImportAddress(process.env.NEXT_PUBLIC_FLOW_TOKEN_ADDRESS || flowToken);

  return `
import FungibleToken from ${fungible}
import FlowToken from ${ft}

access(all) fun main(address: Address): UFix64 {
    let acct = getAccount(address)
    let vaultRef = acct.capabilities.borrow<&FlowToken.Vault{FungibleToken.Balance}>(
            /public/flowTokenBalance
        ) ?? panic("Could not borrow FlowToken balance")
    return vaultRef.balance
}
`;
}

export async function fetchFlowBalanceDisplay(addr: string): Promise<string> {
  if (!addr) return '0.0000';
  const cadence = buildFlowBalanceScript();
  const normalized = fcl.withPrefix(addr.replace(/^0x/i, ''));
  const bal = await fcl.query({
    cadence,
    args: (arg: (value: string, type: unknown) => unknown, types: typeof t) => [
      arg(normalized, types.Address),
    ],
  });
  const n = parseFloat(String(bal));
  if (!Number.isFinite(n)) return '0.000000';
  // Use enough decimals so small earnings are visible
  if (n === 0) return '0.000000';
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
}
