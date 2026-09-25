import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { api } from "@/lib/api/http";
import type { SyncQueueRow, SyncStats } from "@/lib/repositories/sync-queue.repository";

export const SyncQueueService = {
  async enqueue(
    entityType: string,
    entityId: string,
    operation: string,
    payload?: Record<string, any>
  ): Promise<SyncQueueRow | null> {
    try {
      return await SyncQueueRepository.enqueue({
        entityType,
        entityId,
        operation,
        payload: payload ? JSON.stringify(payload) : undefined,
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
                  body = { items: mapped, paymentMethod: body.payments?.[0]?.method ?? body.paymentMethod, cashierUserId: body.cashierId ?? body.cashierUserId };
                } else {
                  // All items unmappable (mock, deleted product, or invalid sku) -> discard to stop 400 loop
                  console.warn("[SyncQueue] Discarding unmappable sale", item.id, body.items);
                  await SyncQueueRepository.markSynced(item.id);
                  // Also mark original Sale as synced to avoid re-enqueue
                  try {
                    const { execute } = await import("@/lib/db/connection");
                    await execute("UPDATE Sale SET synced = 1 WHERE id = ?", [item.entityId]);
                  } catch {}
                  processed++;
                  continue;
                }
              } catch {}
            } else if (hasLegacy && body.items[0]?.variationId === undefined) {
              const mapped2 = (body.items as any[]).map((it: any) => ({ variationId: Number(it.productId ?? it.sku), qty: it.quantity ?? it.qty })).filter((x: any) => Number.isFinite(x.variationId) && x.variationId > 0);
              if (mapped2.length > 0) body.items = mapped2;
              else discardAsMock = true;
            }
            if (discardAsMock || (Array.isArray(body.items) && body.items.length === 0)) {
              console.warn("[SyncQueue] Discarding empty sale payload", item.id);
              await SyncQueueRepository.markSynced(item.id);
              processed++;
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
            const isPermanentSaleConflict =
              item.entityType === "Sale" &&
              res.status === 400 &&
              /insufficient pos stock/i.test(error);
            if (isPermanentSaleConflict) {
              await SyncQueueRepository.markEntityFailed(item.entityType, item.entityId, error);
              // Revert local inventory for this failed sale to keep POS consistent with OMS group stock
              try {
                const { execute, query } = await import("@/lib/db/connection");
                const { InventoryRepository } = await import("@/lib/repositories/inventory.repository");
                const items = await query<{ productId: string | null; quantity: number }>(
                  `SELECT productId, quantity FROM SaleItem WHERE saleId = ?`,
                  [item.entityId]
                );
                for (const it of items) {
                  if (!it.productId) continue;
                  try {
                    await InventoryRepository.updateQuantities(it.productId, {
                      availableQty: it.quantity,
                      soldQty: -it.quantity,
                    });
                  } catch {}
                  try {
                    await execute(
                      `DELETE FROM InventoryLedger WHERE referenceNumber = ? AND productId = ? AND movementType = 'SALE'`,
                      [item.entityId, it.productId]
                    );
                  } catch {}
                }
                try {
                  await execute(`DELETE FROM Payment WHERE saleId = ?`, [item.entityId]);
                } catch {}
                try {
                  await execute(`DELETE FROM SaleItem WHERE saleId = ?`, [item.entityId]);
                } catch {}
                try {
                  await execute(`DELETE FROM Sale WHERE id = ?`, [item.entityId]);
                } catch {}
                // Refresh inventory from OMS so next sale sees correct group stock
                try {
                  const { OmsSyncService } = await import("@/lib/services/oms-sync.service");
                  const { useDeviceStore } = await import("@/lib/stores/device-store");
                  const deviceId = useDeviceStore.getState().device?.deviceId;
                  if (deviceId) OmsSyncService.syncInventory(deviceId).catch(() => {});
                } catch {}
              } catch {}
            } else {
              await SyncQueueRepository.markFailed(item.id, error);
            }
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
