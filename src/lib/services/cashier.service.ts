import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { SessionRepository } from "@/lib/repositories/session.repository";
import { PermissionRepository } from "@/lib/repositories/permission.repository";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { sha256 } from "@/lib/crypto/ed25519";

export const CashierService = {
  async loginPin(pin: string) {
    try {
      const pinHash = sha256(pin);
      console.log("[CashierService] loginPin attempt, pinHash:", pinHash);
      const cashier = await CashierRepository.findByPinHash(pinHash);
      console.log("[CashierService] findByPinHash result:", cashier ? `${cashier.displayName} (${cashier.id})` : "NOT FOUND");
      if (!cashier) {
        const all = await CashierRepository.findAll();
        console.log("[CashierService] all active cashiers:", all.length, all.map(c => ({ id: c.id, name: c.displayName, pinHash: c.pinHash })));
        return { success: false, error: "Invalid PIN" };
      }

      const device = useDeviceStore.getState().device;
      const session = await SessionRepository.create({
        cashierId: cashier.id,
        cashierName: cashier.displayName,
        roleId: cashier.roleId ?? undefined,
        loginType: "pin",
        deviceId: device.deviceId ?? undefined,
        deviceName: device.deviceName ?? undefined,
      });

      await CashierRepository.update(cashier.id, {
        lastLogin: new Date().toISOString(),
      });

      useCashierStore.getState().setSession({
        sessionId: session.id,
        cashierId: cashier.id,
        cashierName: cashier.displayName,
        cashierRole: "",
        roleId: cashier.roleId ?? "",
        loginTime: session.loginTime,
        locked: false,
        lockedAt: null,
      });

      useAuthStore.getState().signIn({
        id: cashier.id,
        name: cashier.displayName,
        pin,
        role: "",
      });

      return {
        success: true,
        session: {
          sessionId: session.id,
          cashierId: cashier.id,
          cashierName: cashier.displayName,
          roleId: cashier.roleId,
          loginTime: session.loginTime,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Login failed" };
    }
  },

  async loginPassword(username: string, password: string) {
    try {
      const cashier = await CashierRepository.findByUsername(username);
      if (!cashier) return { success: false, error: "Invalid credentials" };

      const passwordHash = sha256(password);
      if (cashier.passwordHash !== passwordHash) {
        return { success: false, error: "Invalid credentials" };
      }

      const device = useDeviceStore.getState().device;
      const session = await SessionRepository.create({
        cashierId: cashier.id,
        cashierName: cashier.displayName,
        roleId: cashier.roleId ?? undefined,
        loginType: "password",
        deviceId: device.deviceId ?? undefined,
        deviceName: device.deviceName ?? undefined,
      });

      await CashierRepository.update(cashier.id, {
        lastLogin: new Date().toISOString(),
      });

      useCashierStore.getState().setSession({
        sessionId: session.id,
        cashierId: cashier.id,
        cashierName: cashier.displayName,
        cashierRole: "",
        roleId: cashier.roleId ?? "",
        loginTime: session.loginTime,
        locked: false,
        lockedAt: null,
      });

      useAuthStore.getState().signIn({
        id: cashier.id,
        name: cashier.displayName,
        pin: "",
        role: "",
      });

      return {
        success: true,
        session: {
          sessionId: session.id,
          cashierId: cashier.id,
          cashierName: cashier.displayName,
          roleId: cashier.roleId,
          loginTime: session.loginTime,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Login failed" };
    }
  },

  async logout(sessionId: string): Promise<void> {
    try {
      await SessionRepository.deactivate(sessionId);
      useCashierStore.getState().clearSession();
      useAuthStore.getState().signOut();
    } catch {
      // silent fail
    }
  },

  async lock(sessionId: string): Promise<void> {
    try {
      await SessionRepository.lock(sessionId);
      useCashierStore.getState().lock();
    } catch {
      // silent fail
    }
  },

  async unlock(sessionId: string): Promise<void> {
    try {
      await SessionRepository.unlock(sessionId);
      useCashierStore.getState().unlock();
    } catch {
      // silent fail
    }
  },

  getCurrentSession() {
    return useCashierStore.getState().session;
  },

  async getRolePermissions(roleId: string) {
    try {
      return await PermissionRepository.findByRole(roleId);
    } catch {
      return [];
    }
  },

  async replaceCashiers(cashiers: Array<{
    employeeId?: string;
    username?: string;
    displayName: string;
    pinHash?: string;
    passwordHash?: string;
    roleId?: string;
  }>): Promise<void> {
    try {
      for (const c of cashiers) {
        const existing = c.username
          ? await CashierRepository.findByUsername(c.username)
          : null;

        if (existing) {
          await CashierRepository.update(existing.id, {
            displayName: c.displayName,
            pinHash: c.pinHash,
            passwordHash: c.passwordHash,
            roleId: c.roleId,
            employeeId: c.employeeId,
          });
        } else {
          await CashierRepository.create(c);
        }
      }
    } catch {
      // silent fail
    }
  },
};
