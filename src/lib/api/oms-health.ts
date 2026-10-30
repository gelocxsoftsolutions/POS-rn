import { api } from "./http";
import { useDeviceStore } from "@/lib/stores/device-store";

export async function checkOmsHealth() {
  const health = await api.get("/api/pos/health");
  if (health.status !== 404) return health;

  // Older OMS deployments do not expose POS health. Verify credentials
  // against the registered device's read-only inventory endpoint instead.
  const deviceId = useDeviceStore.getState().device.deviceId;
  if (!deviceId) return health;
  const inventory = await api.get<{ data: unknown[] }>(
    `/api/pos/inventory?deviceId=${encodeURIComponent(deviceId)}`
  );
  if (inventory.ok && !Array.isArray(inventory.data?.data)) {
    return { ...inventory, ok: false, status: 502, error: { message: "OMS returned an invalid inventory response" } };
  }
  return inventory;
}
