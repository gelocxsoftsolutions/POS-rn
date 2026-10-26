import type { CloudConnection } from "@/lib/services/dealership-cloud.service";
export interface SwitchDatabase {
  withTransactionAsync(work: () => Promise<void>): Promise<void>;
  getFirstAsync<T>(sql: string, values: any[]): Promise<T | null>;
  runAsync(sql: string, values: any[]): Promise<unknown>;
}
export async function applyModeSwitchInDatabase(db: SwitchDatabase, input: {
  requestId: string; previousMode: string; nextMode: string; connection: CloudConnection;
  actor: { id: string; name: string };
}) {
  await db.withTransactionAsync(async () => {
    const settings = await db.getFirstAsync<{ businessId: string; operatingMode: string }>("SELECT businessId, operatingMode FROM StoreSettings WHERE id='default'", []);
    if (!settings || settings.businessId !== input.connection.businessId) throw new Error("This switch belongs to another business");
    const done = await db.getFirstAsync<{ id: string }>("SELECT id FROM OperatingModeAudit WHERE id=?", [input.requestId]);
    if (done) {
      if (settings.operatingMode !== input.nextMode) throw new Error("This switch belongs to an older mode. Reconnect to OMS.");
      return;
    }
    if (settings.operatingMode !== input.previousMode) throw new Error("The local operating mode changed. Refresh the OMS switch request.");
    const now = new Date().toISOString();
    if (input.connection.oms) await db.runAsync("INSERT OR IGNORE INTO Device (id, deviceName, branchId, status, registeredAt) VALUES (?,?,?,'REGISTERED',?)", [input.connection.oms.deviceId, input.connection.deviceName, input.connection.oms.branchId, now]);
    await db.runAsync("UPDATE StoreSettings SET operatingMode=?, modeChangedAt=?, updatedAt=? WHERE id='default'", [input.nextMode, now, now]);
    await db.runAsync("INSERT INTO OperatingModeAudit (id,businessId,previousMode,nextMode,changedById,changedByName,stockResolution,createdAt) VALUES (?,?,?,?,?,?,'PRESERVE_ALL_PRODUCTS_AND_STOCK',?)", [input.requestId, settings.businessId, input.previousMode, input.nextMode, input.actor.id, input.actor.name, now]);
  });
}
