import QRCodeLib from "qrcode";

export type QrMatrix = {
  size: number;
  modules: boolean[];
};

export function createReceiptQrMatrix(value: string): QrMatrix {
  const qr = QRCodeLib.create(value, { errorCorrectionLevel: "L" });
  return {
    size: qr.modules.size,
    modules: Array.from(qr.modules.data as ArrayLike<number>, (module) => Boolean(module)),
  };
}

export function serializeReceiptQrMatrix(value: string) {
  const matrix = createReceiptQrMatrix(value);
  return `${matrix.size}|${matrix.modules.map((module) => (module ? "1" : "0")).join("")}`;
}
