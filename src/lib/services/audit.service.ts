import { AuditRepository } from "@/lib/repositories/audit.repository";
import type { AuditLogRow } from "@/lib/repositories/audit.repository";

export const AuditService = {
  async log(
    eventType: string,
    description?: string,
    cashierId?: string,
    cashierName?: string,
    metadata?: string
  ): Promise<AuditLogRow | null> {
    try {
      return await AuditRepository.create({
        eventType,
        description,
        cashierId,
        cashierName,
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
