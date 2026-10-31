import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { api } from "@/lib/api/http";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { isLocalSuperAdmin } from "@/lib/permissions/local-super-admin";
import { CashierService } from "./cashier.service";
import { EmployeeSyncService } from "./employee-sync.service";
import { useNetworkStore } from "./network.service";
import { isNctPos } from "./nct-scope";
import { execute } from "@/lib/db/connection";
import { serializeLocalOperation } from "@/lib/db/local-operation";

let registrationDevice: string | null = null;

async function persistPin(userId: string, newPin: string, proof: { deviceSecret?: string; actorId?: string; currentPin?: string }): Promise<string> {
  if (!isNctPos()) throw new Error("Shared employee PINs are available for NCT POS only.");
  if (!/^\d{6}$/.test(newPin)) throw new Error("Enter a six-digit PIN.");
  if (!useNetworkStore.getState().isOnline) throw new Error("Connect to OMS to save the shared PIN.");
  const response = await api.post<{ success: boolean }>("/api/pos/users/pin", { userId, newPin, ...proof });
  if (!response.ok || !response.data?.success) {
    throw new Error(typeof response.error?.error === "string" ? response.error.error : "PIN save was not confirmed. Refresh from OMS before retrying.");
  }
  // A confirmed server save must not be reported as failed if a local refresh fails.
  try {
    await serializeLocalOperation(() => execute(
      "UPDATE Cashier SET pinHash = ?, pinLoginEnabled = 1, updatedAt = ? WHERE id = ? AND employeeId LIKE 'oms:%'",
      [bytesToHex(sha256(new TextEncoder().encode(newPin))), new Date().toISOString(), userId],
    ));
    if (await EmployeeSyncService.refresh()) return "PIN saved. The same PIN will sync to the employee’s other assigned devices when they connect.";
  } catch { /* OMS is authoritative; the next successful directory sync repairs the cache. */ }
  return "PIN saved in OMS. Refresh this device’s employee directory before signing in. Other assigned devices receive it when they connect.";
}

export const EmployeePinService = {
  beginRegistration(deviceId: string) {
    const device = useDeviceStore.getState().device;
    if (!isNctPos() || device.deviceId !== deviceId || !device.deviceSecret) throw new Error("Complete device activation before setting employee PINs.");
    registrationDevice = deviceId;
  },
  endRegistration() { registrationDevice = null; },
  async saveDuringRegistration(userId: string, newPin: string): Promise<string> {
    const device = useDeviceStore.getState().device;
    if (!registrationDevice || device.deviceId !== registrationDevice || !device.deviceSecret) throw new Error("PIN setup requires a freshly activated device. Use Settings > Users after signing in as an administrator.");
    return persistPin(userId, newPin, { deviceSecret: device.deviceSecret });
  },
  async save(userId: string, newPin: string, confirmation: string): Promise<string> {
    if (!isNctPos()) throw new Error("Shared employee PINs are available for NCT POS only.");
    if (!/^\d{6}$/.test(newPin)) throw new Error("Enter a six-digit PIN.");
    if (!useNetworkStore.getState().isOnline) throw new Error("Connect to OMS to save the shared PIN.");
    const session = useCashierStore.getState().session;
    if (!session) throw new Error("Sign in before changing an employee PIN.");
    const admin = isLocalSuperAdmin(session);
    const proof: { deviceSecret?: string; actorId?: string; currentPin?: string } = {};
    if (admin) {
      const verified = await CashierService.verifyCurrentUserPin(confirmation);
      if (!verified.success) throw new Error(verified.error || "Super Admin password is incorrect.");
      const secret = useDeviceStore.getState().device.deviceSecret;
      if (!secret) throw new Error("Reconnect this device through OMS before setting employee PINs.");
      proof.deviceSecret = secret;
    } else {
      proof.actorId = session.cashierId;
      proof.currentPin = confirmation;
    }
    return persistPin(userId, newPin, proof);
  },
};
