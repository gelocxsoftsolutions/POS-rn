import { api } from "@/lib/api/http";
import { DeviceRepository } from "@/lib/repositories/device.repository";

let intervalId: ReturnType<typeof setInterval> | null = null;
let deviceId: string | null = null;
let deviceSecret: string | null = null;

export const HeartbeatService = {
  async start(intervalMs: number = 30000) {
    this.stop();

    const device = await DeviceRepository.find();
    if (!device) return;

    deviceId = device.id;
    deviceSecret = device.deviceCode;

    const tick = async () => {
      try {
        await api.post("/api/device/heartbeat", {
          deviceId,
          deviceSecret,
          deviceName: device.deviceName,
          branchId: device.branchId,
          branchName: device.branchName,
          status: device.status,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // heartbeat failures are non-critical
      }
    };

    await tick();
    intervalId = setInterval(tick, intervalMs);
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    deviceId = null;
    deviceSecret = null;
  },
};
