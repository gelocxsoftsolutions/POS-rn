import { v4 as uuid } from "uuid";
import { execute, query, queryFirst } from "@/lib/db/connection";
import { SettingsRepository } from "@/lib/repositories/settings.repository";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { DEFAULT_BUSINESS_CONFIGURATION, DEFAULT_RECEIPT_TEMPLATE } from "./defaults";
import { capabilitiesFor } from "./capabilities";
import type {
  BusinessConfiguration,
  OperatingMode,
  ReceiptTemplate,
} from "./types";
import { useCashierStore } from "@/lib/stores/cashier-store";

function requireAdministrator() {
  const session = useCashierStore.getState().session;
  if (!session?.isSuperAdmin) {
    throw new Error("Only a dealership administrator can change business configuration.");
  }
}

function safeTemplate(raw: string | null, footer: string): ReceiptTemplate {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_RECEIPT_TEMPLATE,
      ...parsed,
      footerMessage: parsed.footerMessage ?? footer ?? DEFAULT_RECEIPT_TEMPLATE.footerMessage,
      paperWidthMm: parsed.paperWidthMm === 80 ? 80 : 58,
      version: Number(parsed.version) || 1,
    };
  } catch {
    return { ...DEFAULT_RECEIPT_TEMPLATE, footerMessage: footer || DEFAULT_RECEIPT_TEMPLATE.footerMessage };
  }
}

function fromRow(row: Awaited<ReturnType<typeof SettingsRepository.get>>): BusinessConfiguration {
  const template = safeTemplate(row.receiptTemplateJson, row.receiptFooter);
  return {
    businessId: row.businessId || DEFAULT_BUSINESS_CONFIGURATION.businessId,
    operatingMode: row.operatingMode === "INDEPENDENT" ? "INDEPENDENT" : "NCT_DEPENDENT",
    businessName: row.storeName || DEFAULT_BUSINESS_CONFIGURATION.businessName,
    posSystemName: row.posSystemName || DEFAULT_BUSINESS_CONFIGURATION.posSystemName,
    headerName: row.headerName || row.storeName || DEFAULT_BUSINESS_CONFIGURATION.headerName,
    businessLogoUri: row.businessLogoUri || null,
    receiptLogoUri: row.receiptLogoUri || null,
    address: row.address || "",
    supportPhone: row.supportPhone || "",
    contactEmail: row.contactEmail || "",
    receiptTemplate: template,
    receiptTemplateVersion: Number(row.receiptTemplateVersion) || template.version || 1,
    modeChangedAt: row.modeChangedAt || null,
  };
}

async function persistOperatingModeChange(input: {
  current: BusinessConfiguration;
  nextMode: OperatingMode;
  changedById?: string;
  changedByName?: string;
  stockResolution?: string;
}) {
  if (input.current.operatingMode === input.nextMode) return;
  const pending = await queryFirst<{ c: number }>(
    "SELECT COUNT(*) c FROM SyncQueue WHERE status IN ('PENDING', 'PROCESSING')"
  );
  if ((pending?.c ?? 0) > 0) {
    throw new Error("Finish or resolve pending synchronization before changing operating mode.");
  }
  if (input.nextMode === "NCT_DEPENDENT" && !input.stockResolution?.trim()) {
    throw new Error("Document how existing independent stock will be mapped before enabling OMS-dependent mode.");
  }
  if (input.nextMode === "NCT_DEPENDENT") {
    const unmapped = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) c FROM Product p
       INNER JOIN PosInventory i ON i.productId = p.id AND i.availableQty <> 0
       LEFT JOIN ProductOmsMapping m ON m.localProductId = p.id
       WHERE p.businessId = ? AND p.identitySource = 'INDEPENDENT'
         AND p.status = 'ACTIVE' AND m.localProductId IS NULL`,
      [input.current.businessId]
    );
    if ((unmapped?.c ?? 0) > 0) {
      throw new Error(`${unmapped?.c} independent variation(s) with stock must be mapped to NCT variations first.`);
    }
  }

  const now = new Date().toISOString();
  await execute("BEGIN IMMEDIATE");
  try {
    await execute(
      `INSERT INTO OperatingModeAudit
       (id, businessId, previousMode, nextMode, changedById, changedByName, stockResolution, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), input.current.businessId, input.current.operatingMode, input.nextMode,
        input.changedById ?? null, input.changedByName ?? null,
        input.stockResolution?.trim() || null, now]
    );
    await SettingsRepository.upsert({ operatingMode: input.nextMode, modeChangedAt: now });
    await execute("COMMIT");
  } catch (error) {
    await execute("ROLLBACK");
    throw error;
  }
}

export const BusinessConfigurationService = {
  async load(): Promise<BusinessConfiguration> {
    const configuration = fromRow(await SettingsRepository.get());
    useBusinessConfigStore.getState().setConfiguration(configuration);
    return configuration;
  },

  current(): BusinessConfiguration {
    return useBusinessConfigStore.getState().configuration;
  },

  capabilities() {
    return capabilitiesFor(this.current().operatingMode);
  },

  async applyProvisionedConfiguration(input: {
    businessId?: string;
    businessName?: string;
    posSystemName?: string;
    operatingMode?: OperatingMode;
    stockResolution?: string;
  }): Promise<BusinessConfiguration> {
    const current = this.current();
    const requestedId = input.businessId?.trim();
    if (requestedId && requestedId !== current.businessId) {
      const data = await queryFirst<{ records: number }>(
        `SELECT (SELECT COUNT(*) FROM Sale) + (SELECT COUNT(*) FROM Product) +
                (SELECT COUNT(*) FROM InventoryTransfer) records`
      );
      if ((data?.records ?? 0) > 0) {
        throw new Error("This installation already contains business data. Provisioning a different business ID was blocked.");
      }
    }
    await SettingsRepository.upsert({
      businessId: requestedId || current.businessId,
      storeName: input.businessName?.trim() || current.businessName,
      headerName: input.businessName?.trim() || current.headerName,
      posSystemName: input.posSystemName?.trim() || current.posSystemName,
    });
    const provisioned = await this.load();
    if (input.operatingMode && input.operatingMode !== provisioned.operatingMode) {
      await persistOperatingModeChange({
        current: provisioned,
        nextMode: input.operatingMode,
        changedById: "DEVICE_ACTIVATION",
        changedByName: "Authorized device registration",
        stockResolution: input.stockResolution,
      });
    }
    return this.load();
  },

  async updateBranding(input: Partial<Pick<
    BusinessConfiguration,
    "businessName" | "posSystemName" | "headerName" | "businessLogoUri" |
    "receiptLogoUri" | "address" | "supportPhone" | "contactEmail"
  >>): Promise<BusinessConfiguration> {
    requireAdministrator();
    await SettingsRepository.upsert({
      storeName: input.businessName,
      posSystemName: input.posSystemName,
      headerName: input.headerName,
      businessLogoUri: input.businessLogoUri,
      receiptLogoUri: input.receiptLogoUri,
      address: input.address,
      supportPhone: input.supportPhone,
      contactEmail: input.contactEmail,
    });
    return this.load();
  },

  async saveReceiptTemplate(template: ReceiptTemplate): Promise<BusinessConfiguration> {
    requireAdministrator();
    const current = this.current();
    const version = current.receiptTemplateVersion + 1;
    const normalized = { ...DEFAULT_RECEIPT_TEMPLATE, ...template, version };
    await SettingsRepository.upsert({
      receiptTemplateJson: JSON.stringify(normalized),
      receiptTemplateVersion: version,
      receiptFooter: normalized.footerMessage,
    });
    return this.load();
  },

  async listIndependentStockMappings() {
    const business = this.current();
    return query<{
      productId: string; name: string; sku: string; availableQty: number;
      omsVariationId: string | null;
    }>(
      `SELECT p.id productId, p.name, p.sku, COALESCE(i.availableQty, 0) availableQty,
              m.omsVariationId
       FROM Product p
       LEFT JOIN PosInventory i ON i.productId = p.id
       LEFT JOIN ProductOmsMapping m ON m.localProductId = p.id
       WHERE p.businessId = ? AND p.identitySource = 'INDEPENDENT' AND p.status = 'ACTIVE'
       ORDER BY p.name`, [business.businessId]
    );
  },

  async mapIndependentVariation(input: {
    productId: string; omsVariationId: string;
    mappedById?: string; mappedByName?: string;
  }) {
    requireAdministrator();
    const business = this.current();
    if (!/^\d+$/.test(input.omsVariationId.trim())) throw new Error("Enter a numeric NCT OMS variation ID.");
    const product = await queryFirst<{ id: string }>(
      `SELECT id FROM Product WHERE id = ? AND businessId = ? AND identitySource = 'INDEPENDENT'`,
      [input.productId, business.businessId]
    );
    if (!product) throw new Error("Independent variation not found for this business.");
    await execute(
      `INSERT INTO ProductOmsMapping
       (localProductId, businessId, omsVariationId, mappedById, mappedByName, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(localProductId) DO UPDATE SET omsVariationId = excluded.omsVariationId,
         mappedById = excluded.mappedById, mappedByName = excluded.mappedByName,
         createdAt = excluded.createdAt`,
      [input.productId, business.businessId, input.omsVariationId.trim(),
        input.mappedById ?? null, input.mappedByName ?? null, new Date().toISOString()]
    );
  },

  async changeOperatingMode(input: {
    nextMode: OperatingMode;
    changedById?: string;
    changedByName?: string;
    stockResolution?: string;
  }): Promise<BusinessConfiguration> {
    requireAdministrator();
    const current = this.current();
    if (current.operatingMode === input.nextMode) return current;
    await persistOperatingModeChange({ current, ...input });
    return this.load();
  },
};
