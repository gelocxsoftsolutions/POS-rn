declare module "jsqr" {
  type QrResult = {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: unknown;
  };

  const jsQR: (
    data: Uint8ClampedArray,
    width: number,
    height: number
  ) => QrResult | null;

  export default jsQR;
}

declare module "upng-js" {
  type DecodedImage = {
    width: number;
    height: number;
    data: ArrayBuffer;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: Record<string, unknown>;
  };

  const UPNG: {
    decode(buffer: ArrayBuffer): DecodedImage;
    toRGBA8(image: DecodedImage): ArrayBuffer[];
  };

  export default UPNG;
}
