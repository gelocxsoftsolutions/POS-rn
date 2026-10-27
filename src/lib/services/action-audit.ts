import { AuditService } from "./audit.service";
import { isNctPos } from "./nct-scope";
import { useCashierStore } from "@/lib/stores/cashier-store";

// Record operation names/identities, never raw arguments or credentials.
export function withNctActionAudit<T extends object>(entityType: string, service: T): T {
  return new Proxy(service, { get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function" || typeof property !== "string" || /^(get|list|find|count|summary|recent|by)/.test(property) || property === "lock" || property === "unlock") return value;
    return async (...args: unknown[]) => {
      if (!isNctPos()) return value.apply(target, args);
      const actor = useCashierStore.getState().session;
      const first = args[0];
      const targetId = entityType === "Cashier" ? null : typeof first === "string" ? first : first && typeof first === "object" && "id" in first ? String(first.id) : null;
      const metadata = { entityType, entityId: targetId };
      try {
        const result = await value.apply(target, args);
        const failed = result === null || (result && typeof result === "object" && "success" in result && result.success === false);
        const resultId = result?.sale?.id ?? result?.id ?? targetId;
        await AuditService.log(`${entityType.toUpperCase()}_${property.toUpperCase()}`.slice(0, 100), failed ? "Action failed" : "Action completed", actor?.cashierId, actor?.cashierName,
          JSON.stringify({ ...metadata, entityId: resultId == null ? null : String(resultId).slice(0, 100), outcome: failed ? "FAILED" : "SUCCESS" }));
        return result;
      } catch (error) {
        await AuditService.log(`${entityType.toUpperCase()}_${property.toUpperCase()}`.slice(0, 100), "Action failed", actor?.cashierId, actor?.cashierName, JSON.stringify({ ...metadata, outcome: "FAILED" }));
        throw error;
      }
    };
  } });
}
