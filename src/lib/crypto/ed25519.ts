if (!globalThis.crypto) {
  (globalThis as any).crypto = {
    getRandomValues(buf: Uint8Array) {
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.floor(Math.random() * 256);
      }
      return buf;
    },
  };
}

import { ed25519 } from "@noble/curves/ed25519.js";

function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

export function generateEd25519Keypair(): {
  publicKey: string;
  privateKey: string;
} {
  const privateKey = getRandomBytes(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

export function signTimestamp(
  privateKeyHex: string,
  timestamp: string,
  nonce: string,
  deviceSecret: string
): string {
  const message = `${timestamp}${nonce}${deviceSecret}`;
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const signature = ed25519.sign(messageBytes, privateKeyBytes);
  return bytesToHex(signature);
}

export function sha256(data: string): string {
  if (!data) return "";
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
