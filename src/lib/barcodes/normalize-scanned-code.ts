export function normalizeScannedCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();
}

export function canonicalScannedCode(value: unknown): string {
  return normalizeScannedCode(value).replace(/\s+/g, "").toUpperCase();
}
