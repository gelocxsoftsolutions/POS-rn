import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { SessionRepository } from "@/lib/repositories/session.repository";
import { PermissionRepository } from "@/lib/repositories/permission.repository";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { sha256 } from "@/lib/crypto/ed25519";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";
import { sha256 as secureSha256 } from "@noble/hashes/sha2.js";
import { queryFirst } from "@/lib/db/connection";

export const SUPER_ADMIN_ID = "__nct_pos_super_admin__";
const SUPER_ADMIN_USERNAME_HASH = "67541e0a403c6868131cefa202501269b0079d088e8f2099afe3519004b6410d";
const SUPER_ADMIN_PASSWORD_HASH = "7e02e30cc5cacafefd09dc764e8c5fe5165f0f75cecb4fd74aaec45fc72c7de2";

function secureCredentialHash(value: string): string {
  return Array.from(secureSha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function startCashierSession(cashier: Awaited<ReturnType<typeof CashierRepository.findById>>, loginType: "pin" | "password") {
  if (!cashier) throw new Error("User not found");
  const role = cashier.roleId
    ? await queryFirst<{ name: string }>("SELECT name FROM Role WHERE id = ?", [cashier.roleId])
    : null;
  const roleName = role?.name ?? "";
  const isAdministrator = roleName.trim().toLowerCase() === "admin";
  const device = useDeviceStore.getState().device;
  const session = await SessionRepository.create({
    cashierId: cashier.id,
    cashierName: cashier.displayName,
    roleId: cashier.roleId ?? undefined,
    loginType,
    deviceId: device.deviceId ?? undefined,
    deviceName: device.deviceName ?? undefined,
  });

  await CashierRepository.update(cashier.id, {
    lastLogin: new Date().toISOString(),
    failedPinAttempts: 0,
    accountLocked: false,
    accountLockedAt: null,
  });

  useCashierStore.getState().setSession({
    sessionId: session.id,
    cashierId: cashier.id,
    cashierName: cashier.displayName,
    photoUri: cashier.photoUri,
    cashierRole: roleName,
    roleId: cashier.roleId ?? "",
    loginTime: session.loginTime,
    locked: false,
    lockedAt: null,
    isSuperAdmin: isAdministrator,
  });

  useAuthStore.getState().signIn({
    id: cashier.id,
    name: cashier.displayName,
    pin: "",
    role: roleName,
    avatarUrl: cashier.photoUri ?? undefined,
    isSuperAdmin: isAdministrator,
  });

  return session;
}

export const CashierService = {
  async loginPin(pin: string) {
    try {
      const pinHash = sha256(pin);
      const cashier = await CashierRepository.findByPinHash(pinHash);
      if (!cashier) {
        return { success: false, error: "Invalid PIN" };
      }
      if (cashier.accountLocked) return { success: false, error: "This account is locked. Ask a super admin to unlock it." };
      const session = await startCashierSession(cashier, "pin");

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

  async loginPinForCashier(cashierId: string, pin: string) {
    try {
      const cashier = await CashierRepository.findById(cashierId);
      if (!cashier || !cashier.active || !cashier.pinLoginEnabled) {
        return { success: false, error: "This user is not available." };
      }
      if (cashier.accountLocked) {
        return { success: false, locked: true, error: "This account is locked. Ask a super admin to unlock it." };
      }
      if (!cashier.pinHash || cashier.pinHash !== sha256(pin)) {
        const maximumAttempts = useAccessSettingsStore.getState().maxPinAttempts || 5;
        const updated = await CashierRepository.recordFailedPinAttempt(cashier.id, maximumAttempts);
        const failed = Number(updated?.failedPinAttempts ?? 0);
        const locked = Boolean(updated?.accountLocked);
        const remaining = Math.max(0, maximumAttempts - failed);
        return {
          success: false,
          locked,
          remainingAttempts: remaining,
          error: locked
            ? "Too many incorrect PIN attempts. This account is now locked."
            : `Incorrect PIN. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`,
        };
      }

      const session = await startCashierSession(cashier, "pin");
      return { success: true, session };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Login failed" };
    }
  },

  async loginSuperAdmin(username: string, password: string) {
    if (
      secureCredentialHash(username.trim().toLowerCase()) !== SUPER_ADMIN_USERNAME_HASH ||
      secureCredentialHash(password) !== SUPER_ADMIN_PASSWORD_HASH
    ) {
      return { success: false, error: "Invalid super admin credentials." };
    }
    const now = new Date().toISOString();
    const sessionId = `super-admin-${Date.now()}`;
    useCashierStore.getState().setSession({
      sessionId,
      cashierId: SUPER_ADMIN_ID,
      cashierName: "Super Admin",
      photoUri: null,
      cashierRole: "Super Admin",
      roleId: SUPER_ADMIN_ID,
      loginTime: now,
      locked: false,
      lockedAt: null,
      isSuperAdmin: true,
    });
    useAuthStore.getState().signIn({
      id: SUPER_ADMIN_ID,
      name: "Super Admin",
      pin: "",
      role: "Super Admin",
      isSuperAdmin: true,
    });
    return { success: true, session: useCashierStore.getState().session };
  },

  async listLoginUsers() {
    return CashierRepository.findLoginUsers();
  },

  async unlockManagedUser(cashierId: string) {
    const cashier = await CashierRepository.resetPinFailures(cashierId);
    if (!cashier) throw new Error("User not found.");
    return cashier;
  },

  async loginPassword(username: string, password: string) {
    try {
      const cashier = await CashierRepository.findByUsername(username);
      if (!cashier) return { success: false, error: "Invalid credentials" };

      if (cashier.accountLocked) return { success: false, error: "This account is locked. Ask a super admin to unlock it." };

      const passwordHash = sha256(password);
      if (cashier.passwordHash !== passwordHash) {
        return { success: false, error: "Invalid credentials" };
      }

      const session = await startCashierSession(cashier, "password");

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
