import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { query, queryFirst, execute } from "@/lib/db/connection";
import type { RegisterDeviceInput } from "@/lib/types/pos";

export const DeviceService = {
  async register(input: RegisterDeviceInput) {
    try {
      if (input.serverUrl) {
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
          publicKey: input.publicKey,
          machineIdentifier: input.machineIdentifier,
          computerName: input.computerName,
          appVersion: input.appVersion,
          osVersion: input.osVersion,
        });

        console.log("[DeviceService] register response:", res.ok, res.status, JSON.stringify(res.data)?.slice(0, 500));

        if (res.ok && res.data) {
          const d = res.data;

          const device = await DeviceRepository.create({
            deviceCode: d.deviceCode,
            deviceName: d.deviceName || input.computerName,
            publicIdentifier: d.publicIdentifier,
            branchId: d.branchId,
            branchName: d.branchName,
            branchAddress: d.branchAddress,
            status: "REGISTERED",
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
            apiKey: d.deviceSecret,
            accessToken: d.accessToken,
          });

          try {
            const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
            await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
              state: { serverUrl: input.serverUrl, apiKey: d.deviceSecret, accessToken: d.accessToken },
              version: 0,
            }));
          } catch { /* non-blocking */ }

          if (d.initialCashiers && d.initialCashiers.length > 0) {
            console.log("[DeviceService] initialCashiers full:", JSON.stringify(d.initialCashiers));
            await execute("DELETE FROM CashierSession");
            await execute("DELETE FROM Cashier");

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
      await execute("DELETE FROM CashierSession");
      await execute("UPDATE Cashier SET lastLogin = NULL");
      useDeviceStore.getState().clearDevice();
    } catch {
      // silent fail
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
