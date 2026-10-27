import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { api } from "@/lib/api/http";
import type { SyncQueueRow, SyncStats } from "@/lib/repositories/sync-queue.repository";

export const SyncQueueService = {
  async enqueue(
    entityType: string,
    entityId: string,
    operation: string,
    payload?: Record<string, any>,
    dedupeKey?: string
  ): Promise<SyncQueueRow | null> {
    try {
      return await SyncQueueRepository.enqueue({
        entityType,
        entityId,
        operation,
        payload: payload ? JSON.stringify(payload) : undefined,
        dedupeKey,
      });
    } catch {
      return null;
    }
  },

  async processPending(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const pending = await SyncQueueRepository.getPending(50);

      for (const item of pending) {
        if (item.entityType === "EndOfDay" || item.entityType === "DatabaseBackup") {
          // Preserve legacy jobs for inspection; never upload them to NCT OMS.
          await SyncQueueRepository.markEntityFailed(item.entityType, item.entityId,
            "Cloud EOD and database uploads are not supported by NCT POS. Local backups are preserved.");
          failed++;
          continue;
        }
        if (item.entityType === "Sale") {
          try {
            const { queryFirst } = await import("@/lib/db/connection");
            const sale = await queryFirst<{ id: string; originMode: string }>(
              "SELECT id, originMode FROM Sale WHERE id = ? AND status = 'COMPLETED'",
              [item.entityId]
            );
            if (!sale || sale.originMode === "INDEPENDENT") {
              await SyncQueueRepository.markEntityFailed(
                "Sale",
                item.entityId,
                sale ? "Legacy independent sales are not uploaded to NCT OMS." : "Discarded orphaned sale queue entry."
              );
              failed++;
              continue;
            }
          } catch {
            await SyncQueueRepository.markFailed(item.id, "Unable to verify the local sale before NCT synchronization.");
            failed++;
            continue;
          }
        }

        await SyncQueueRepository.markProcessing(item.id);

        try {
          let endpoint = "";
          let method = "POST";

          switch (item.entityType) {
            case "Sale":
              endpoint = "/api/pos/sales";
              method = "POST";
              break;
            case "Inventory":
              endpoint = "/api/pos/inventory";
              method = "PUT";
              break;
            case "Transfer":
              endpoint = "/api/pos/transfers";
              method = "PUT";
              break;
            case "Return":
              endpoint = "/api/pos/returns";
              method = "POST";
              break;
            default:
              endpoint = `/api/pos/${item.entityType.toLowerCase()}`;
          }

          let body = item.payload ? JSON.parse(item.payload) : undefined;
          // Backward-compat: legacy queued sales used productId/quantity/payments shape; normalize now
          let discardAsMock = false;
          if (item.entityType === "Sale" && body?.items) {
            const hasLegacy = body.items[0]?.productId !== undefined || body.items[0]?.sku !== undefined;
            const hasCanonical = body.items[0]?.variationId !== undefined && body.items[0]?.qty !== undefined;
            if (hasLegacy && !hasCanonical) {
              try {
                const { queryFirst: qf } = await import("@/lib/db/connection");
                const mapped: Array<{ variationId: number; qty: number }> = [];
                let sawLegacyMock = false;
                for (const it of body.items as Array<{ productId?: string; sku?: string; quantity?: number; qty?: number }>) {
                  const pid = (it as any).productId ?? (it as any).sku;
                  if (!pid) continue;
                  // pid may be UUID -> lookup sku
                  const r = await qf<{ sku: string | null }>("SELECT sku FROM Product WHERE id = ?", [pid]);
                  const sku = r?.sku ?? String(pid);
                  const vid = Number(sku);
                  if (!Number.isFinite(vid) || vid <= 0) {
                    if (sku && /^(SHR|TUN|SAL|SQU|CRA|CHI|POR|MLK|APL|WTR)-/.test(sku)) sawLegacyMock = true;
                    continue;
                  }
                  mapped.push({ variationId: Math.trunc(vid), qty: (it as any).quantity ?? (it as any).qty ?? 1 });
                }
                if (mapped.length > 0) {
                  body = {
                    items: mapped,
                    paymentMethod: body.payments?.[0]?.method ?? body.paymentMethod,
                    cashierUserId: body.cashierId ?? body.cashierUserId,
                    receiptNumber: body.receiptNumber,
                    cashierName: body.cashierName,
                    total: body.total,
                    payments: body.payments,
                    deviceId: body.deviceId,
                    branchId: body.branchId,
                  };
                } else {
                  // All items unmappable (mock, deleted product, or invalid sku) -> keep as Failed with a reason
                  console.warn("[SyncQueue] Sale has no items linked to OMS variations", item.id, body.items);
                  await SyncQueueRepository.markEntityFailed(
                    "Sale",
                    item.entityId,
                    "Not recorded in OMS: no items linked to OMS products."
                  );
                  failed++;
                  continue;
                }
              } catch {}
            } else if (hasLegacy && body.items[0]?.variationId === undefined) {
              const mapped2 = (body.items as any[]).map((it: any) => ({ variationId: Number(it.productId ?? it.sku), qty: it.quantity ?? it.qty })).filter((x: any) => Number.isFinite(x.variationId) && x.variationId > 0);
              if (mapped2.length > 0) body.items = mapped2;
              else discardAsMock = true;
            }
            if (discardAsMock || (Array.isArray(body.items) && body.items.length === 0)) {
              console.warn("[SyncQueue] Sale has no items linked to OMS variations", item.id);
              await SyncQueueRepository.markEntityFailed(
                "Sale",
                item.entityId,
                "Not recorded in OMS: sale has no items linked to OMS products."
              );
              failed++;
              continue;
            }
          }
          const res = method === "POST"
            ? await api.post(endpoint, body)
            : await api.put(endpoint, body);

          if (res.ok) {
            await SyncQueueRepository.markSynced(item.id);
            if (item.entityType === "Sale") {
              try {
                const { execute } = await import("@/lib/db/connection");
                await execute("UPDATE Sale SET synced = 1 WHERE id = ?", [item.entityId]);
              } catch {}
            }
            processed++;
          } else {
            const error = String(
              (res.error as any)?.error ?? (res.error as any)?.message ?? `HTTP ${res.status}`
            );
            // Remote conflicts never delete a completed local sale or reverse
            // its ledger. Keep the retry/error state for reconciliation.
            await SyncQueueRepository.markFailed(item.id, error);
            failed++;
          }
        } catch (e: any) {
          await SyncQueueRepository.markFailed(item.id, e.message ?? "Sync failed");
          failed++;
        }
      }
    } catch {
      // global failure
    }

    return { processed, failed };
  },

  async getStats(): Promise<SyncStats> {
    try {
      return await SyncQueueRepository.getStats();
    } catch {
      return { total: 0, pending: 0, processing: 0, synced: 0, failed: 0 };
    }
  },
};
