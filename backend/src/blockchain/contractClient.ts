import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import arbiterEscrowArtifact from './abi/ArbiterEscrow.json' with { type: "json" };

dotenv.config();

export const RPC_URL = process.env.ARBITER_RPC_URL || "http://127.0.0.1:8545";
const rawContractAddress = process.env.ARBITER_ESCROW_ADDRESS;
export const USDC_ADDRESS = process.env.ARC_TESTNET_USDC_ADDRESS;
export const ORACLE_PRIVATE_KEY = process.env.ARBITER_ORACLE_PRIVATE_KEY;

if (!rawContractAddress || !ORACLE_PRIVATE_KEY) {
    console.error("❌ CRITICAL ERROR: Missing ARBITER_ESCROW_ADDRESS or ORACLE_PRIVATE_KEY in .env");
    process.exit(1);
}

// Normalize to EIP-55 checksummed address (ethers v6 is strict about this)
export const CONTRACT_ADDRESS = ethers.getAddress(rawContractAddress);

export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const wallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
export const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, arbiterEscrowArtifact.abi, wallet);

// ---------------------------------------------------------------------------
// 1. SERIAL TRANSACTION QUEUE (Prevents Nonce Collisions)
// ---------------------------------------------------------------------------
export class TransactionQueue {
    private queue: Promise<void> = Promise.resolve();

    public enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue = this.queue.then(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

export const txQueue = new TransactionQueue();
