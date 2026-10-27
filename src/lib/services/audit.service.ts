import { AuditRepository } from "@/lib/repositories/audit.repository";
import type { AuditLogRow } from "@/lib/repositories/audit.repository";
import { isNctPos } from "./nct-scope";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";

export const AuditService = {
  async log(
    eventType: string,
    description?: string,
    cashierId?: string,
    cashierName?: string,
    metadata?: string
  ): Promise<AuditLogRow | null> {
    try {
      const session = useCashierStore.getState().session;
      if (isNctPos()) {
        let details: Record<string, unknown> = {};
        try {
          const parsed = metadata ? JSON.parse(metadata) : {};
          // Audit only known event context; omit arbitrary input and credentials.
          for (const key of ["entityType", "entityId", "outcome", "targetCashierId", "productId", "transferId", "saleId"]) {
            if (parsed && ["string", "number", "boolean"].includes(typeof parsed[key])) details[key] = parsed[key];
          }
        } catch { /* Exclude unstructured data that may contain credentials. */ }
        const device = useDeviceStore.getState().device;
        metadata = JSON.stringify({ ...details, source: "NCT_POS", branchId: device.branchId, deviceId: device.deviceId });
      }
      return await AuditRepository.create({
        eventType,
        description,
        cashierId: cashierId ?? session?.cashierId,
        cashierName: cashierName ?? session?.cashierName,
        roleId: session?.roleId,
        metadata,
      });
    } catch {
      return null;
    }
  },

  async recent(n: number = 50): Promise<AuditLogRow[]> {
    try {
      return await AuditRepository.findRecent(n);
    } catch {
      return [];
    }
  },

  async byEvent(eventType: string): Promise<AuditLogRow[]> {
    try {
      return await AuditRepository.findByEvent(eventType);
    } catch {
      return [];
    }
  },
};
