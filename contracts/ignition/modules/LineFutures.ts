import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LineFuturesModule", (m) => {
  // Get the PnL server address from parameters, or use the deployer as default
  const pnlServerAddress = m.getParameter("pnlServerAddress", m.getAccount(0));

  // Deploy the LineFutures contract
  const lineFutures = m.contract("LineFutures", [pnlServerAddress]);

  return { lineFutures };
});

