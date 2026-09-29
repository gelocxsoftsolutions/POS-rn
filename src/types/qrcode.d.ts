declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type QrCode = {
    modules: {
      size: number;
      data: ArrayLike<number>;
    };
  };

  const QRCode: {
    create(value: string, options?: { errorCorrectionLevel?: ErrorCorrectionLevel }): QrCode;
    toString(value: string, options?: Record<string, unknown>): Promise<string>;
  };

  export default QRCode;
}
