import { seedIfNeeded } from "@/lib/db/seed";
import { seedSampleData, ensureLocalDeviceRegistration } from "@/lib/db/seed-sample-data";
import { useDeviceStore } from "@/lib/stores/device-store";
import { PermissionService } from "@/lib/services/permission.service";

export const SeedService = {
  async run(): Promise<void> {
    try {
      await seedIfNeeded();
      await PermissionService.ensureDefaults();
    } catch {
      // silent fail
    }
    try {
      await seedSampleData();
    } catch {
      // silent fail
    }
    try {
      const device = await ensureLocalDeviceRegistration();
      if (device) {
        useDeviceStore.getState().setDevice({
          ...device,
          registrationState: "registered",
        });
      }
    } catch {
      // silent fail
    }
  },
};
