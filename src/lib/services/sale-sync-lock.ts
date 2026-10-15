const salesInFlight = new Set<string>();

export function acquireSaleSync(saleId: string): boolean {
  if (salesInFlight.has(saleId)) return false;
  salesInFlight.add(saleId);
  return true;
}

export function releaseSaleSync(saleId: string): void {
  salesInFlight.delete(saleId);
}
