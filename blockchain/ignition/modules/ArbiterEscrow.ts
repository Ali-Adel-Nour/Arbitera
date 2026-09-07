import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const ArbiterEscrowModule = buildModule("ArbiterEscrowModule", (m) => {
  // We need to provide the AI Judge Oracle address during deployment.
  // For local development, we can default to the second account (account #1) in Hardhat's default list.
  // When deploying to production/testnet, we will pass the real backend wallet address as a parameter.
  const oracleAddress = m.getParameter("oracleAddress", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const escrow = m.contract("ArbiterEscrow", [oracleAddress]);
  // For testing purposes on local networks/testnets, we also deploy the MockUSDC and MockFeeToken
  const mockUSDC = m.contract("MockUSDC");
  const mockFeeToken = m.contract("MockFeeToken");
  return { escrow, mockUSDC, mockFeeToken };
});
export default ArbiterEscrowModule;
