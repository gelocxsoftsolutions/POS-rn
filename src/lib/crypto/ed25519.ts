import { ed25519 } from "@noble/curves/ed25519";

export function generateEd25519Keypair(): {
  publicKey: string;
  privateKey: string;
} {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey: Buffer.from(publicKey).toString("hex"),
    privateKey: Buffer.from(privateKey).toString("hex"),
  };
}

export function signTimestamp(
  privateKeyHex: string,
  timestamp: string,
  nonce: string,
  deviceSecret: string
): string {
  const message = `${timestamp}${nonce}${deviceSecret}`;
  const messageHash = new TextEncoder().encode(message);
  const privateKeyBytes = Uint8Array.from(Buffer.from(privateKeyHex, "hex"));
  const signature = ed25519.sign(messageHash, privateKeyBytes);
  return Buffer.from(signature).toString("hex");
}

export function sha256(data: string): string {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  let hash = 0;
  for (let i = 0; i < dataBuffer.length; i++) {
    const char = dataBuffer[i];
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
