import { api } from "@/lib/api/http";
import { useDeviceStore } from "@/lib/stores/device-store";
import {
  useBackupSettingsStore,
  type BranchBackupSchedule,
} from "@/lib/stores/backup-settings-store";
import { useNetworkStore } from "./network.service";
import { requirePermission } from "./authorization.service";
import { isBackupTime } from "@/lib/backup/nct-schedule";
import { isNctPos } from "./nct-scope";
import { withNctActionAudit } from "./action-audit";

let generation = 0;
let saving = false;

function validSchedule(value: BranchBackupSchedule, branchId: number) {
  return (
    value?.branchId === branchId &&
    value.timeZone === "Asia/Manila" &&
    isBackupTime(value.time) &&
    (value.revision === null || typeof value.revision === "string") &&
    (value.updatedAt === null || typeof value.updatedAt === "string")
  );
}

export const BackupScheduleService = {
  async refresh(): Promise<BranchBackupSchedule | null> {
    const device = useDeviceStore.getState().device;
    if (
      saving ||
      !isNctPos() ||
      !device.deviceId ||
      !device.branchId ||
      !useNetworkStore.getState().isOnline
    )
      return null;
    const requestGeneration = ++generation;
    const response = await api.get<BranchBackupSchedule>("/api/pos/backups/schedule");
    if (!response.ok || !response.data || !validSchedule(response.data, device.branchId))
      return null;
    // A response started under an old registration must not replace this cache.
    const current = useDeviceStore.getState().device;
    if (
      requestGeneration !== generation ||
      saving ||
      current.deviceId !== device.deviceId ||
      current.branchId !== device.branchId
    )
      return null;
    useBackupSettingsStore.getState().setSchedule(response.data);
    return response.data;
  },
  ...withNctActionAudit("BackupSchedule", {
    async save(input: { id: number; time: string; revision: string | null }): Promise<BranchBackupSchedule> {
      const { time, revision } = input;
      if (saving) throw new Error("A branch schedule change is already in progress.");
      saving = true;
      generation++;
      try {
        await requirePermission("POS_BACKUP", "change the branch backup time");
        if (!isBackupTime(time))
          throw new Error("Enter a time from 00:00 to 23:59 in Philippine time.");
        if (!useNetworkStore.getState().isOnline)
          throw new Error("Connect to OMS before changing the branch backup time.");
        const device = useDeviceStore.getState().device;
        if (!isNctPos() || !device.deviceId || !device.branchId)
          throw new Error("Register this POS to its NCT branch first.");
        if (input.id !== device.branchId) throw new Error("The branch changed. Refresh its backup schedule before saving.");
        const response = await api.put<BranchBackupSchedule>("/api/pos/backups/schedule", {
          time,
          revision,
        });
        if (response.status === 409)
          throw new Error(
            "The branch time was changed elsewhere. Refresh the schedule before saving again.",
          );
        if (!response.ok || !response.data || !validSchedule(response.data, device.branchId)) {
          throw new Error(
            response.error?.error ??
              "OMS did not confirm the new backup time. Refresh before retrying.",
          );
        }
        const current = useDeviceStore.getState().device;
        if (current.deviceId !== device.deviceId || current.branchId !== device.branchId)
          throw new Error("Device registration changed. Refresh the branch schedule.");
        useBackupSettingsStore.getState().setSchedule(response.data);
        return response.data;
      } finally {
        saving = false;
      }
    },
  }),
};
