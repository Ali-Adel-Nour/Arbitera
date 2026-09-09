import type { AuditableVerdict } from "./ai-judge/verdict.js";
import { canonicalize } from "./ai-judge/verdict.js";

export async function uploadToIPFS(verdict: AuditableVerdict): Promise<string | null> {
  const apiKey = process.env.IPFS_API_KEY;
  const secretKey = process.env.IPFS_SECRET_KEY;
  const jwt = process.env.IPFS_JWT;

  // We need either a JWT, or both an API key and Secret key
  if (!jwt && (!apiKey || !secretKey)) {
    console.log("⚠️ IPFS Upload skipped: Missing Pinata credentials in .env");
    return null;
  }

  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
  } else {
    headers["pinata_api_key"] = apiKey!;
    headers["pinata_secret_api_key"] = secretKey!;
  }

  // Pinata expects a JSON body with pinataOptions, pinataMetadata, and pinataContent
  const body = {
    pinataOptions: {
      cidVersion: 1,
    },
    pinataMetadata: {
      name: `Arbitra_Judgment_${verdict.dealId}`,
      keyvalues: {
        dealId: verdict.dealId,
        verdictHash: verdict.verdictHash
      }
    },
    // We upload the canonicalized JSON object to ensure reproducible hashes
    pinataContent: JSON.parse(canonicalize(verdict))
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ IPFS Upload failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = (await response.json()) as { IpfsHash: string };
    console.log(`✅ IPFS Upload successful! View it here: https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`);
    return data.IpfsHash;
  } catch (error) {
    console.error("❌ IPFS Upload encountered an error:", error);
    return null;
  }
}
