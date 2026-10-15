import { v4 as uuid } from "uuid";
import { execute, queryFirst } from "@/lib/db/connection";
import { sha256 } from "@/lib/crypto/ed25519";
import { SettingsRepository } from "@/lib/repositories/settings.repository";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { BusinessConfigurationService } from "./configuration.service";
import { DEFAULT_RECEIPT_TEMPLATE } from "./defaults";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";

export interface IndependentSetupInput {
  businessName: string;
  posSystemName: string;
  address: string;
  supportPhone: string;
  contactEmail: string;
  branchName: string;
  deviceName: string;
  ownerName: string;
  ownerUsername: string;
  ownerPin: string;
  paperWidthMm: 58 | 80;
  receiptFooter: string;
  currencyCode: string;
  taxRate: 0 | 0.12;
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

export const IndependentOnboardingService = {
  async needsExistingInstallationAuthorization(): Promise<boolean> {
    const counts = await queryFirst<{ cashiers: number; records: number }>(
      `SELECT (SELECT COUNT(*) FROM Cashier WHERE active = 1) cashiers,
              (SELECT COUNT(*) FROM Sale) + (SELECT COUNT(*) FROM Product) +
              (SELECT COUNT(*) FROM InventoryTransfer) records`
    );
    return (counts?.cashiers ?? 0) > 0 || (counts?.records ?? 0) > 0;
  },

  async complete(input: IndependentSetupInput) {
    const businessName = required(input.businessName, "Business name");
    const posSystemName = required(input.posSystemName, "POS system name");
    const branchName = required(input.branchName, "Location name");
    const deviceName = required(input.deviceName, "Terminal name");
    const ownerName = required(input.ownerName, "Owner name");
    const ownerUsername = required(input.ownerUsername, "Owner username").toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(ownerUsername)) {
      throw new Error("Username must be 3–40 characters using letters, numbers, dots, dashes, or underscores.");
    }
    if (!/^\d{6}$/.test(input.ownerPin)) throw new Error("Owner PIN must contain exactly 6 numbers.");

    const existingInstallation = await this.needsExistingInstallationAuthorization();
    if (existingInstallation && !useCashierStore.getState().session?.isSuperAdmin) {
      throw new Error("Super Admin authorization is required to reconfigure an existing installation.");
    }

    const current = await SettingsRepository.get();
    const recordCount = await queryFirst<{ records: number }>(
      `SELECT (SELECT COUNT(*) FROM Sale) + (SELECT COUNT(*) FROM Product) +
              (SELECT COUNT(*) FROM InventoryTransfer) records`
    );
    const businessId = current.businessId === "nct-default" && (recordCount?.records ?? 0) === 0
      ? `business-${uuid()}`
      : current.businessId;
    const pending = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) c FROM SyncQueue WHERE status IN ('PENDING', 'PROCESSING')"
    );
    if (current.operatingMode !== "INDEPENDENT" && (pending?.c ?? 0) > 0) {
      throw new Error("Resolve pending synchronization before changing this installation to Independent mode.");
    }

    const existingOwner = await CashierRepository.findByUsername(ownerUsername);
    const duplicatePin = await CashierRepository.findByPinHash(sha256(input.ownerPin));
    if (duplicatePin && duplicatePin.id !== existingOwner?.id) throw new Error("That PIN is already assigned to another user.");

    const now = new Date().toISOString();
    let device = await DeviceRepository.find();
    const ownerId = existingOwner?.id ?? uuid();
    let roleId = (await queryFirst<{ id: string }>("SELECT id FROM Role WHERE name = 'Admin'"))?.id;
    roleId ??= uuid();
    const deviceId = device?.id ?? uuid();
    const localBranchId = device?.branchId ?? Math.max(1, parseInt(deviceId.replace(/-/g, "").slice(0, 7), 16));
    const template = {
      ...DEFAULT_RECEIPT_TEMPLATE,
      paperWidthMm: input.paperWidthMm,
      footerMessage: input.receiptFooter.trim() || DEFAULT_RECEIPT_TEMPLATE.footerMessage,
    };

    await execute("BEGIN IMMEDIATE");
    try {
      await execute(
        `INSERT OR IGNORE INTO Role (id, name, description, isSystem, createdAt)
         VALUES (?, 'Admin', 'Dealership administrator', 1, ?)`,
        [roleId, now]
      );
      await SettingsRepository.upsert({
        businessId,
        operatingMode: "INDEPENDENT",
        modeChangedAt: current.operatingMode === "INDEPENDENT" ? current.modeChangedAt : now,
        storeName: businessName,
        headerName: businessName,
        posSystemName,
        address: input.address.trim(),
        supportPhone: input.supportPhone.trim(),
        contactEmail: input.contactEmail.trim().toLowerCase(),
        currencyCode: input.currencyCode.trim().toUpperCase() || "PHP",
        taxLabel: input.taxRate === 0.12 ? "VAT" : "Tax",
        taxRate: input.taxRate,
        receiptFooter: template.footerMessage,
        receiptTemplateJson: JSON.stringify(template),
        receiptTemplateVersion: Number(current.receiptTemplateVersion) || 1,
      });
      if (current.operatingMode !== "INDEPENDENT") {
        await execute(
          `INSERT INTO OperatingModeAudit
           (id, businessId, previousMode, nextMode, changedById, changedByName, stockResolution, createdAt)
           VALUES (?, ?, ?, 'INDEPENDENT', ?, ?, ?, ?)`,
          [uuid(), businessId, current.operatingMode, ownerId, ownerName,
            "Existing products, stock, NCT identifiers, transfers, and sales preserved; new NCT transfer operations disabled.", now]
        );
      }
      if (existingOwner) {
        await execute(
          `UPDATE Cashier SET displayName = ?, username = ?, pinHash = ?, roleId = ?, active = 1,
             pinLoginEnabled = 1, failedPinAttempts = 0, accountLocked = 0,
             accountLockedAt = NULL, updatedAt = ? WHERE id = ?`,
          [ownerName, ownerUsername, sha256(input.ownerPin), roleId, now, existingOwner.id]
        );
      } else {
        await execute(
          `INSERT INTO Cashier
           (id, employeeId, username, displayName, pinHash, roleId, active, pinLoginEnabled,
            passwordLoginEnabled, failedPinAttempts, accountLocked, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, 0, 0, ?, ?)`,
          [ownerId, `OWNER-${ownerId.slice(0, 8).toUpperCase()}`, ownerUsername, ownerName,
            sha256(input.ownerPin), roleId, now, now]
        );
      }
      if (device) {
        await execute(
          `UPDATE Device SET deviceCode = ?, deviceName = ?, publicIdentifier = ?, branchId = ?,
             branchName = ?, branchAddress = ?, status = 'REGISTERED', registeredAt = COALESCE(registeredAt, ?),
             updatedAt = ? WHERE id = ?`,
          [`IND-${deviceId.slice(0, 8).toUpperCase()}`, deviceName, `local:${deviceId}`,
            localBranchId, branchName, input.address.trim(), now, now, deviceId]
        );
      } else {
        await execute(
          `INSERT INTO Device
           (id, deviceCode, deviceName, publicIdentifier, branchId, branchName, branchAddress,
            status, provisionVersion, configVersion, registeredAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'REGISTERED', 0, 1, ?, ?, ?)`,
          [deviceId, `IND-${deviceId.slice(0, 8).toUpperCase()}`, deviceName, `local:${deviceId}`,
            localBranchId, branchName, input.address.trim(), now, now, now]
        );
      }
      await execute("COMMIT");
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }

    device = await DeviceRepository.find();
    await BusinessConfigurationService.load();
    useDeviceStore.getState().setDevice({
      deviceId,
      deviceCode: device?.deviceCode ?? `IND-${deviceId.slice(0, 8).toUpperCase()}`,
      publicIdentifier: device?.publicIdentifier ?? `local:${deviceId}`,
      branchId: localBranchId,
      branchName,
      branchAddress: input.address.trim(),
      deviceName,
      registeredAt: device?.registeredAt ?? now,
      registrationState: "registered",
      deviceSecret: null,
      posApiKey: null,
      privateKey: null,
    });
    return { businessId, deviceId, ownerId };
  },
};
