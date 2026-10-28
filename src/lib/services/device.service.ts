import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { query, queryFirst, execute } from "@/lib/db/connection";
import type { RegisterDeviceInput } from "@/lib/types/pos";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import type { OperatingMode } from "@/lib/business/types";
import { EmployeeSyncService } from "./employee-sync.service";
import { isNctPos } from "./nct-scope";

export const DeviceService = {
  async register(input: RegisterDeviceInput) {
    try {
      if (input.serverUrl) {
        const priorDevice = await DeviceRepository.find();
        const priorDeviceId = priorDevice?.id || useDeviceStore.getState().device.deviceId || undefined;
        console.log("[DeviceService] registering with server:", input.serverUrl);
        setApiConfig({ baseUrl: input.serverUrl });

        const res = await api.post<{
          deviceId: string;
          deviceCode: string;
          publicIdentifier: string;
          deviceSecret: string;
          posApiKey: string;
          accessToken: string;
          refreshToken: string;
          refreshTokenExpiresAt: string;
          branchId: number;
          branchName: string;
          branchAddress: string;
          registeredAt: string;
          deviceName: string;
          businessId?: string;
          businessName?: string;
          posSystemName?: string;
          operatingMode?: OperatingMode;
          initialCashiers: Array<{
            id: string;
            username: string;
            displayName: string;
            pin: string;
            role: string;
            roleId: string;
          }>;
        }>("/api/device/register", {
          activationToken: input.activationToken,
          existingDeviceId: priorDeviceId,
          publicKey: input.publicKey,
          machineIdentifier: input.machineIdentifier,
          computerName: input.computerName,
          appVersion: input.appVersion,
          osVersion: input.osVersion,
          requestedOperatingMode: "NCT_DEPENDENT",
        });

        console.log("[DeviceService] register response:", res.ok, res.status);

        if (res.ok && res.data) {
          const d = res.data;
          await BusinessConfigurationService.applyProvisionedConfiguration({
            businessId: d.businessId,
            businessName: d.businessName,
            posSystemName: d.posSystemName,
            operatingMode: "NCT_DEPENDENT",
          });

          // Clean slate: wipe all business data from previous device (products, inventory, sales, transfers, queues)
          // Each new device must start empty and isolated — no cross-device leakage or mock leftovers
          try {
            // Business records and local users are preserved during device
            // provisioning. Cross-business registration is blocked above.
          } catch {}

          const existingDevice = await DeviceRepository.find();
          if (existingDevice && existingDevice.id !== d.deviceId) {
            throw new Error("This installation is already registered to another device. Existing POS data was preserved.");
          }
          const device = existingDevice
            ? await DeviceRepository.update(existingDevice.id, {
                deviceCode: d.deviceCode, deviceName: d.deviceName || input.computerName,
                publicIdentifier: d.publicIdentifier, branchId: d.branchId,
                branchName: d.branchName, branchAddress: d.branchAddress, status: "REGISTERED",
              })
            : await DeviceRepository.create({
                id: d.deviceId, deviceCode: d.deviceCode,
                deviceName: d.deviceName || input.computerName,
                publicIdentifier: d.publicIdentifier, branchId: d.branchId,
                branchName: d.branchName, branchAddress: d.branchAddress, status: "REGISTERED",
              });

          useDeviceStore.getState().setDevice({
            deviceId: d.deviceId,
            deviceCode: d.deviceCode,
            publicIdentifier: d.publicIdentifier,
            branchId: d.branchId,
            branchName: d.branchName,
            branchAddress: d.branchAddress,
            deviceName: d.deviceName || input.computerName,
            registeredAt: d.registeredAt,
            registrationState: "registered",
            deviceSecret: d.deviceSecret,
            posApiKey: d.posApiKey,
            privateKey: input.privateKey,
          });

          setApiConfig({
            baseUrl: input.serverUrl,
            apiKey: d.posApiKey,
            accessToken: d.accessToken,
          });

          try {
            const AsyncStorage = (await import("@/lib/storage/app-storage")).default;
            await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
              state: { serverUrl: input.serverUrl, apiKey: d.posApiKey, accessToken: d.accessToken },
              version: 0,
            }));
          } catch { /* non-blocking */ }

          if (isNctPos()) await EmployeeSyncService.refresh();
          if (!isNctPos() && d.initialCashiers && d.initialCashiers.length > 0) {
            // Preserve historical local records; only Employees-backed accounts can sign in.

            const roleIds = [...new Set(d.initialCashiers.map((c) => c.roleId))];
            for (const roleId of roleIds) {
              const existing = await queryFirst<{ id: string }>(
                "SELECT id FROM Role WHERE id = ?",
                [roleId]
              );
              if (!existing) {
                const cashierWithRole = d.initialCashiers.find((c) => c.roleId === roleId);
                await execute(
                  "INSERT OR IGNORE INTO Role (id, name, description, isSystem, createdAt, updatedAt) VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))",
                  [roleId, cashierWithRole?.role ?? "Unknown", ""]
                );
              }
            }

            for (const c of d.initialCashiers) {
              await CashierRepository.upsert({
                id: c.id,
                username: c.username,
                displayName: c.displayName,
                pin: c.pin,
                roleId: c.roleId,
                roleName: c.role,
                active: true,
              });
            }
          }

          return {
            success: true,
            device,
            deviceSecret: d.deviceSecret,
            accessToken: d.accessToken,
          };
        }
        return { success: false, error: `Server registration failed (${res.status}): ${typeof res.error === 'string' ? res.error : JSON.stringify(res.error) ?? 'Unknown error'}` };
      }

      const device = await DeviceRepository.create({
        deviceName: input.computerName,
        status: "REGISTERED",
      });

      useDeviceStore.getState().setDevice({
        deviceId: device.id,
        deviceCode: device.deviceCode,
        publicIdentifier: device.publicIdentifier,
        branchId: device.branchId,
        branchName: device.branchName,
        branchAddress: device.branchAddress,
        deviceName: device.deviceName,
        registeredAt: device.registeredAt,
        registrationState: "registered",
        privateKey: input.privateKey,
      });

      return { success: true, device };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Registration failed" };
    }
  },

  async getInfo() {
    try {
      return await DeviceRepository.find();
    } catch {
      return null;
    }
  },

  async getIdentity(): Promise<string | null> {
    try {
      const device = await DeviceRepository.find();
      return device?.publicIdentifier ?? null;
    } catch {
      return null;
    }
  },

  async clearRegistration(): Promise<void> {
    try {
      await DeviceRepository.clear();
      // Full wipe for clean slate on next registration — same tables as register
      // Re-registration removes device credentials only. Products, users,
      // transactions, inventory, receipts, and pending uploads are preserved.
      try { await execute("DELETE FROM Category WHERE id NOT IN (SELECT DISTINCT categoryId FROM Product WHERE categoryId IS NOT NULL)"); } catch {}
      try { await execute("DELETE FROM Brand WHERE id NOT IN (SELECT DISTINCT brandId FROM Product WHERE brandId IS NOT NULL)"); } catch {}
      try { await execute("DELETE FROM Unit WHERE id NOT IN (SELECT DISTINCT unitId FROM Product WHERE unitId IS NOT NULL)"); } catch {}
      useDeviceStore.getState().clearDevice();
      try {
        const AsyncStorage = (await import("@/lib/storage/app-storage")).default;
        await AsyncStorage.removeItem("nct-pos-oms");
      } catch {}
    } catch {
      // silent fail
    }
  },

  async recoverPosApiKey(): Promise<{ success: boolean; posApiKey?: string; error?: string }> {
    try {
      const device = useDeviceStore.getState().device;
      if (!device.publicIdentifier || !device.deviceCode) {
        return { success: false, error: "No device identity to recover" };
      }

      const config = getApiConfig();
      if (!config.baseUrl) {
        return { success: false, error: "No server URL configured" };
      }

      const res = await api.post<{ posApiKey: string; deviceId: string }>(
        "/api/device/recover-key",
        {
          publicIdentifier: device.publicIdentifier,
          deviceCode: device.deviceCode,
        },
      );

      if (res.ok && res.data?.posApiKey) {
        setApiConfig({ apiKey: res.data.posApiKey });

        useDeviceStore.getState().setDevice({
          posApiKey: res.data.posApiKey,
        });

        try {
          const AsyncStorage = (await import("@/lib/storage/app-storage")).default;
          const raw = await AsyncStorage.getItem("nct-pos-oms");
          const parsed = raw ? JSON.parse(raw) : {};
          const state = parsed?.state ?? parsed;
          await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
            state: { ...state, apiKey: res.data.posApiKey },
            version: 0,
          }));
        } catch { /* non-blocking */ }

        console.log("[DeviceService] recovered posApiKey for", device.publicIdentifier);
        return { success: true, posApiKey: res.data.posApiKey };
      }

      return { success: false, error: res.error ?? "Recovery failed" };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Recovery failed" };
    }
  },

  async notifyServerRevoke(): Promise<void> {
    try {
      await api.post("/api/device/self-delete");
    } catch {
      // Best-effort: even if server call fails, proceed with local cleanup
    }
  },

  async saveRegistration(data: {
    deviceId: string;
    deviceCode?: string;
    deviceName?: string;
    publicIdentifier?: string;
    branchId?: number;
    branchName?: string;
    branchAddress?: string;
  }): Promise<void> {
    try {
      const existing = await DeviceRepository.find();
      if (existing) {
        await DeviceRepository.update(existing.id, {
          deviceCode: data.deviceCode,
          deviceName: data.deviceName,
          publicIdentifier: data.publicIdentifier,
          branchId: data.branchId,
          branchName: data.branchName,
          branchAddress: data.branchAddress,
          status: "REGISTERED",
        });
      } else {
        await DeviceRepository.create({
          deviceCode: data.deviceCode,
          deviceName: data.deviceName,
          publicIdentifier: data.publicIdentifier,
          branchId: data.branchId,
          branchName: data.branchName,
          branchAddress: data.branchAddress,
          status: "REGISTERED",
        });
      }

      useDeviceStore.getState().setDevice({
        deviceId: data.deviceId,
        deviceCode: data.deviceCode,
        publicIdentifier: data.publicIdentifier,
        branchId: data.branchId,
        branchName: data.branchName,
        branchAddress: data.branchAddress,
        deviceName: data.deviceName,
        registeredAt: new Date().toISOString(),
        registrationState: "registered",
      });
    } catch {
      // silent fail
    }
  },
};
