import {
  Contract,
  JsonRpcProvider,
  Wallet,
  isHexString,
  keccak256,
  toUtf8Bytes,
} from "ethers";

const ESCROW_ABI = [
  "function resolveEscrow(bytes32 dealId, bool approved, string verdictReasoningHash)",
];

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export interface SettlementResult {
  transactionHash: string;
  reasoningHash: string;
}

export async function settleEscrow(
  dealId: string,
  approved: boolean,
  reasoning: string
): Promise<SettlementResult> {
  if (!isHexString(dealId, 32)) {
    throw new Error(
      "Invalid dealId. Expected a 32-byte hex string."
    );
  }

  const rpcUrl = getEnv("ARBITER_RPC_URL");
  const oraclePrivateKey = getEnv(
    "ARBITER_ORACLE_PRIVATE_KEY"
  );
  const escrowAddress = getEnv("ARBITER_ESCROW_ADDRESS");

  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(oraclePrivateKey, provider);

  const escrow = new Contract(
    escrowAddress,
    ESCROW_ABI,
    signer
  );

  const reasoningHash = keccak256(toUtf8Bytes(reasoning));

  const transaction = await escrow.resolveEscrow(
    dealId,
    approved,
    reasoningHash
  );

  await transaction.wait();

  return {
    transactionHash: transaction.hash,
    reasoningHash,
  };
}