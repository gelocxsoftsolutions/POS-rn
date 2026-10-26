import { getDatabase, queryFirst } from "@/lib/db/connection";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { applyModeSwitchInDatabase } from "@/lib/business/mode-switch-storage";
import { setDeviceTransitionActive, setDeviceTransitionPending } from "@/lib/business/device-transition";
import { getCloudConnection, saveCloudConnection, modeSwitchRequest, readModeSwitchIntent, saveModeSwitchIntent } from "./dealership-cloud.service";
import type { CloudConnection } from "./dealership-cloud.service";
import { RecoveryService } from "@/lib/backup/recovery.service";
import { SyncQueueService } from "./sync-queue.service";
import { pauseSyncForModeSwitch } from "./sync-worker";

let running = false;
export interface ModeSwitchIntent { code: string; actor: { id: string; name: string }; }
async function finalize(intent: ModeSwitchIntent, result: Awaited<ReturnType<typeof modeSwitchRequest>>) {
  const current = getCloudConnection();
  const value = result.connection as CloudConnection | null;
  if (!current || !value || value.deviceId !== current.deviceId || value.businessId !== current.businessId || value.operatingMode !== result.nextMode || !["INDEPENDENT","NCT_DEPENDENT"].includes(value.operatingMode)) throw new Error("OMS returned a different device or business");
  if (value.operatingMode === "NCT_DEPENDENT" && !value.oms?.apiKey) throw new Error("OMS has not provisioned the dependent device");
  const next = { ...value, serverUrl: current.serverUrl, deviceKey: current.deviceKey };
  await applyModeSwitchInDatabase(await getDatabase(), { ...result, connection: next, actor: intent.actor });
  await saveCloudConnection(next);
  useDeviceStore.getState().setDevice({ deviceId: next.oms?.deviceId ?? useDeviceStore.getState().device.deviceId ?? next.deviceId, deviceName: next.deviceName,
    branchId: next.oms?.branchId ?? null, branchName: null, posApiKey: next.oms?.apiKey ?? null, registrationState: "registered" });
  await BusinessConfigurationService.load();
  await modeSwitchRequest(intent.code, "confirm");
  await saveModeSwitchIntent(null);
  setDeviceTransitionPending(false);
  return next;
}
export async function resumePendingModeSwitch() {
  const intent = await readModeSwitchIntent();
  setDeviceTransitionPending(Boolean(intent));
  if (!intent) return;
  try {
    const result = await modeSwitchRequest(intent.code, "preview");
    if (result.applied) await finalize(intent, result);
  } catch (error: any) {
    if (/expired or was cancelled/.test(error?.message ?? "")) { await saveModeSwitchIntent(null); setDeviceTransitionPending(false); }
    // Otherwise keep the durable intent and block inventory sync until the server can be reached.
  }
}
export async function switchDealershipMode(rawCode: string) {
  if (running) throw new Error("A mode switch is already running");
  const session = useCashierStore.getState().session;
  if (!session || (!session.isSuperAdmin && !["admin", "administrator", "super admin"].includes(session.cashierRole.toLowerCase()))) throw new Error("Sign in as a device administrator to change its mode");
  if (!getCloudConnection()) throw new Error("Connect dealership cloud backups first");
  if (useCartStore.getState().items.length) throw new Error("Finish or clear the active checkout before switching modes");
  running = true;
  setDeviceTransitionActive(true);
  let resumeSync: (() => void) | undefined;
  try {
    resumeSync = await pauseSyncForModeSwitch();
    await resumePendingModeSwitch();
    let code = rawCode.trim();
    if (code.startsWith("{")) {
      const value = JSON.parse(code);
      if (value.type !== "dealership-mode-switch" || value.deviceId !== getCloudConnection()!.deviceId) throw new Error("Scan the mode switch QR code for this device");
      code = value.code;
    }
    if (typeof code !== "string" || !code.trim()) throw new Error("Enter the mode switch key from OMS");
    const result = await modeSwitchRequest(code, "preview");
    const intent = { code, actor: { id: session.cashierId, name: session.cashierName } };
    if (result.applied) { await saveModeSwitchIntent(intent); return await finalize(intent, result); }
    const pending = await queryFirst<{ count: number }>("SELECT COUNT(*) count FROM InventoryTransfer WHERE status IN ('PENDING','IN_TRANSIT')");
    if (pending?.count) throw new Error("Finish pending transfer receipts before switching modes");
    const existing = await readModeSwitchIntent();
    if (existing && existing.code !== code) {
      const previous = await modeSwitchRequest(existing.code, "preview").catch(error => { if (/expired or was cancelled/.test(error.message)) return null; throw error; });
      if (previous?.applied) throw new Error("Retry the previous switch key first to finish applying it");
    }
    await saveModeSwitchIntent(intent);
    setDeviceTransitionPending(true);
    await RecoveryService.queueBackupUpload(`mode-switch:${result.requestId}`);
    await SyncQueueService.processPending();
    const applied = await modeSwitchRequest(code, "apply");
    return await finalize(intent, applied);
  } finally { running = false; setDeviceTransitionActive(false); resumeSync?.(); }
}
