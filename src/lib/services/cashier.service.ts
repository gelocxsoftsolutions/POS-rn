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
        photoUri: cashier.photoUri,
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
        avatarUrl: cashier.photoUri ?? undefined,
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
        photoUri: cashier.photoUri,
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
        avatarUrl: cashier.photoUri ?? undefined,
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
    } catch {
      // silent fail
    } finally {
      useCashierStore.getState().clearSession();
      useAuthStore.getState().signOut();
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

  async updateProfile(cashierId: string, displayName: string, pin?: string, photoUri?: string | null) {
    const updates: { displayName: string; pinHash?: string; photoUri?: string | null } = { displayName };
    if (pin) {
      const pinHash = sha256(pin);
      const duplicatePin = await CashierRepository.findByPinHash(pinHash);
      if (duplicatePin && duplicatePin.id !== cashierId) throw new Error("That PIN is already assigned to another user.");
      updates.pinHash = pinHash;
    }
    if (photoUri !== undefined) updates.photoUri = photoUri;
    const cashier = await CashierRepository.update(cashierId, updates);
    if (!cashier) throw new Error("Cashier profile not found");

    const currentSession = useCashierStore.getState().session;
    if (currentSession) {
      useCashierStore.getState().setSession({ ...currentSession, cashierName: cashier.displayName, photoUri: cashier.photoUri });
    }
    const currentAuth = useAuthStore.getState().cashier;
    if (currentAuth) {
      useAuthStore.getState().signIn({ ...currentAuth, name: cashier.displayName, pin: pin || currentAuth.pin, avatarUrl: cashier.photoUri ?? undefined });
    }
    return cashier;
  },

  async createLocalUser(input: { displayName: string; username?: string; pin: string; roleId?: string }) {
    const displayName = input.displayName.trim();
    const username = input.username?.trim().toLowerCase();
    if (!displayName) throw new Error("Enter a display name.");
    if (!/^\d{6}$/.test(input.pin)) throw new Error("The PIN must contain exactly 6 numbers.");
    if (await CashierRepository.findByPinHash(sha256(input.pin))) throw new Error("That PIN is already assigned to another user.");
    if (username && await CashierRepository.findByUsername(username)) throw new Error("That username is already in use.");

    return CashierRepository.create({
      displayName,
      username: username || undefined,
      pinHash: sha256(input.pin),
      roleId: input.roleId || undefined,
    });
  },

  async updateManagedUser(cashierId: string, input: { displayName: string; username?: string; pin?: string }) {
    const displayName = input.displayName.trim();
    const username = input.username?.trim().toLowerCase() || null;
    if (!displayName) throw new Error("Enter a display name.");
    if (input.pin && !/^\d{6}$/.test(input.pin)) throw new Error("The PIN must contain exactly 6 numbers.");

    if (input.pin) {
      const duplicatePin = await CashierRepository.findByPinHash(sha256(input.pin));
      if (duplicatePin && duplicatePin.id !== cashierId) throw new Error("That PIN is already assigned to another user.");
    }
    if (username) {
      const duplicateUsername = await CashierRepository.findByUsername(username);
      if (duplicateUsername && duplicateUsername.id !== cashierId) throw new Error("That username is already in use.");
    }

    const cashier = await CashierRepository.update(cashierId, {
      displayName,
      username,
      pinHash: input.pin ? sha256(input.pin) : undefined,
    });
    if (!cashier) throw new Error("User not found.");
    const currentSession = useCashierStore.getState().session;
    if (currentSession?.cashierId === cashierId) {
      useCashierStore.getState().setSession({ ...currentSession, cashierName: cashier.displayName });
      const currentAuth = useAuthStore.getState().cashier;
      if (currentAuth) useAuthStore.getState().signIn({ ...currentAuth, name: cashier.displayName, pin: input.pin || currentAuth.pin });
    }
    return cashier;
  },

  async deleteLocalUser(cashierId: string) {
    const current = useCashierStore.getState().session;
    if (current?.cashierId === cashierId) throw new Error("You cannot delete the account currently signed in.");
    const cashier = await CashierRepository.findById(cashierId);
    if (!cashier) throw new Error("User not found.");
    await SessionRepository.deactivateByCashierId(cashierId);
    await CashierRepository.update(cashierId, { active: false });
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
