import { withNctActionAudit } from "./action-audit";
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
import { PermissionService } from "@/lib/services/permission.service";
import AsyncStorage from "@/lib/storage/app-storage";
import { isNctPos } from "./nct-scope";
import { EmployeeSyncService } from "./employee-sync.service";
import { AuditService } from "./audit.service";

function credentialHash(value: string) { return isNctPos() ? secureCredentialHash(value) : sha256(value); }
function requireLocalUserSource() {
  if (isNctPos()) throw new Error("Manage NCT users and credentials in OMS Employees / branch POS access.");
}

export const SUPER_ADMIN_ID = "__nct_pos_super_admin__";
const SUPER_ADMIN_USERNAME_HASH = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
const SUPER_ADMIN_PASSWORD_HASH = "ec6df1896ef437111a84bd831d24130d1ad8c8e68582f39ee08ee1ce89e806d7";
const SUPER_ADMIN_PROFILE_KEY = "nct-pos-super-admin-profile";

function secureCredentialHash(value: string): string {
  return Array.from(secureSha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requireUserManagementPermission() {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error("Sign in before managing users.");
  if (session.isSuperAdmin) return;
  if (!session.roleId || !(await PermissionService.hasPermission(session.roleId, "POS_USERS", session.cashierId))) throw new Error("Your account cannot manage users or permissions.");
}

async function startCashierSession(cashier: Awaited<ReturnType<typeof CashierRepository.findById>>, loginType: "pin" | "password") {
  if (!cashier) throw new Error("User not found");
  if (isNctPos() && !/^oms:\d+$/.test(cashier.employeeId ?? "")) throw new Error("This account is not linked to OMS Employees.");
  const role = cashier.roleId
    ? await queryFirst<{ name: string }>("SELECT name FROM Role WHERE id = ?", [cashier.roleId])
    : null;
  const roleName = role?.name ?? "";
  const isAdministrator = !isNctPos() && roleName.trim().toLowerCase() === "admin";
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

  if (isNctPos()) await AuditService.log("LOGIN_SUCCESS", "User signed in", cashier.id, cashier.displayName, JSON.stringify({ entityType: "Session", entityId: session.id }));
  return session;
}

export const CashierService = withNctActionAudit("Cashier", {
  async loginPin(pin: string) {
    try {
      const pinHash = credentialHash(pin);
      const cashier = await CashierRepository.findByPinHash(pinHash);
      if (isNctPos() && cashier && !cashier.pinLoginEnabled) return { success: false, error: "PIN login is disabled for this employee." };
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
      if (!cashier.pinHash || cashier.pinHash !== credentialHash(pin)) {
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

  async verifyCurrentUserPin(pin: string): Promise<{ success: boolean; error?: string }> {
    const session = useCashierStore.getState().session;
    if (!session) return { success: false, error: "Sign in before confirming this action." };
    if (session.cashierId === SUPER_ADMIN_ID) {
      return secureCredentialHash(pin) === SUPER_ADMIN_PASSWORD_HASH
        ? { success: true }
        : { success: false, error: "Incorrect password." };
    }
    const cashier = await CashierRepository.findById(session.cashierId);
    if (!cashier || !cashier.pinHash) return { success: false, error: "This account has no PIN set." };
    return cashier.pinHash === credentialHash(pin)
      ? { success: true }
      : { success: false, error: "Incorrect PIN." };
  },

  async loginSuperAdmin(username: string, password: string) {
    if (isNctPos()) return { success: false, error: "Sign in using an OMS Employee account." };
    if (
      secureCredentialHash(username.trim().toLowerCase()) !== SUPER_ADMIN_USERNAME_HASH ||
      secureCredentialHash(password) !== SUPER_ADMIN_PASSWORD_HASH
    ) {
      return { success: false, error: "Invalid super admin credentials." };
    }
    const now = new Date().toISOString();
    const sessionId = `super-admin-${Date.now()}`;
    let profile: { displayName?: string; photoUri?: string | null } = {};
    try { profile = JSON.parse(await AsyncStorage.getItem(SUPER_ADMIN_PROFILE_KEY) ?? "{}"); } catch { profile = {}; }
    const displayName = profile.displayName?.trim() || "Super Admin";
    useCashierStore.getState().setSession({
      sessionId,
      cashierId: SUPER_ADMIN_ID,
      cashierName: displayName,
      photoUri: profile.photoUri ?? null,
      cashierRole: "Super Admin",
      roleId: SUPER_ADMIN_ID,
      loginTime: now,
      locked: false,
      lockedAt: null,
      isSuperAdmin: true,
    });
    useAuthStore.getState().signIn({
      id: SUPER_ADMIN_ID,
      name: displayName,
      pin: "",
      role: "Super Admin",
      avatarUrl: profile.photoUri ?? undefined,
      isSuperAdmin: true,
    });
    return { success: true, session: useCashierStore.getState().session };
  },

  async listLoginUsers() {
    if (isNctPos()) await EmployeeSyncService.refresh().catch(() => false);
    const users = await CashierRepository.findLoginUsers();
    return isNctPos() ? users.filter((user) => /^oms:\d+$/.test(user.employeeId ?? "")) : users;
  },

  async unlockManagedUser(cashierId: string) {
    await requireUserManagementPermission();
    const cashier = await CashierRepository.resetPinFailures(cashierId);
    if (!cashier) throw new Error("User not found.");
    return cashier;
  },

  async loginPassword(username: string, password: string) {
    try {
      const cashier = await CashierRepository.findByUsername(username);
      if (!cashier) return { success: false, error: "Invalid credentials" };
      if (isNctPos() && !cashier.passwordLoginEnabled) return { success: false, error: "Password login is disabled for this employee." };

      if (cashier.accountLocked) return { success: false, error: "This account is locked. Ask a super admin to unlock it." };

      const passwordHash = credentialHash(password);
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
    if (isNctPos()) await AuditService.log("LOGOUT", "User signed out", undefined, undefined, JSON.stringify({ entityType: "Session", entityId: sessionId }));
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
    requireLocalUserSource();
    if (cashierId === SUPER_ADMIN_ID) {
      const currentSession = useCashierStore.getState().session;
      if (!currentSession?.isSuperAdmin) throw new Error("Only the Super Admin can update this profile.");
      if (pin) throw new Error("Super Admin credentials cannot be changed from the local profile page.");
      const normalizedName = displayName.trim() || "Super Admin";
      await AsyncStorage.setItem(SUPER_ADMIN_PROFILE_KEY, JSON.stringify({ displayName: normalizedName, photoUri: photoUri ?? null }));
      useCashierStore.getState().setSession({ ...currentSession, cashierName: normalizedName, photoUri: photoUri ?? null });
      const currentAuth = useAuthStore.getState().cashier;
      if (currentAuth) useAuthStore.getState().signIn({ ...currentAuth, name: normalizedName, avatarUrl: photoUri ?? undefined });
      return { id: SUPER_ADMIN_ID, displayName: normalizedName, photoUri: photoUri ?? null };
    }
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
    requireLocalUserSource();
    await requireUserManagementPermission();
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

  async updateManagedUser(cashierId: string, input: { displayName: string; username?: string; pin?: string; roleId?: string }) {
    requireLocalUserSource();
    await requireUserManagementPermission();
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
      roleId: input.roleId,
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
    requireLocalUserSource();
    await requireUserManagementPermission();
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
});
