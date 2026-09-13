import { api } from "@/lib/api/http";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { query, execute } from "@/lib/db/connection";
import type { RegisterDeviceInput } from "@/lib/types/pos";

export const DeviceService = {
  async register(input: RegisterDeviceInput) {
    try {
      if (input.serverUrl) {
        const res = await api.post<{
          deviceId: string;
          deviceCode: string;
          branchId: number;
          branchName: string;
          branchAddress: string;
          publicIdentifier: string;
        }>("/api/device/register", {
          activationToken: input.activationToken,
          publicKey: input.publicKey,
          machineIdentifier: input.machineIdentifier,
          computerName: input.computerName,
          appVersion: input.appVersion,
          osVersion: input.osVersion,
        });

        if (res.ok && res.data) {
          const device = await DeviceRepository.create({
            deviceCode: res.data.deviceCode,
            deviceName: input.computerName,
            publicIdentifier: res.data.publicIdentifier,
            branchId: res.data.branchId,
            branchName: res.data.branchName,
            branchAddress: res.data.branchAddress,
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
          });

          return { success: true, device };
        }
        return { success: false, error: "Server registration failed" };
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
