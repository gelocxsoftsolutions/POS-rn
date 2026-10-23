import jsQR from "jsqr";
import { decode as decodeJpeg } from "jpeg-js";
import UPNG from "upng-js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function looksPng(bytes: Uint8Array, mimeType?: string | null): boolean {
  if (mimeType === "image/png") return true;
  return bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function tryDecodePng(bytes: Uint8Array): { pixels: Uint8ClampedArray; width: number; height: number } {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const image = UPNG.decode(buffer);
  const rgba = UPNG.toRGBA8(image)[0];
  if (!rgba) throw new Error("Empty PNG frame");
  return { pixels: new Uint8ClampedArray(rgba), width: image.width, height: image.height };
}

function tryDecodeJpeg(bytes: Uint8Array): { pixels: Uint8ClampedArray; width: number; height: number } {
  const decoded = decodeJpeg(bytes, { useTArray: true, maxMemoryUsageInMB: 512 });
  return {
    pixels: Uint8ClampedArray.from(decoded.data as Uint8Array),
    width: decoded.width,
    height: decoded.height,
  };
}

/**
 * Reads a QR code from a base64-encoded PNG/JPEG image (e.g. an activation
 * QR screenshot from the gallery). Returns the QR text, or null when the
 * image cannot be decoded or contains no QR code.
 */
export function decodeQrFromBase64(base64: string, mimeType?: string | null): string | null {
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 16) return null;

    const candidates: Array<() => { pixels: Uint8ClampedArray; width: number; height: number }> =
      looksPng(bytes, mimeType)
        ? [() => tryDecodePng(bytes), () => tryDecodeJpeg(bytes)]
        : [() => tryDecodeJpeg(bytes), () => tryDecodePng(bytes)];

    for (const attempt of candidates) {
      try {
        const { pixels, width, height } = attempt();
        if (!pixels || width <= 0 || height <= 0) continue;
        const result = jsQR(pixels, width, height);
        if (result?.data) return result.data;
      } catch {
        // try the next decoder
      }
    }
    return null;
  } catch {
    return null;
  }
}
