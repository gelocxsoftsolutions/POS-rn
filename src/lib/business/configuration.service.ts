import { queryFirst } from "@/lib/db/connection";
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
    throw new Error("Only a POS administrator can change business configuration.");
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
    // POS-rn is OMS-dependent only. A legacy stored mode is never allowed to
    // enable a different operating model on this application.
    operatingMode: "NCT_DEPENDENT",
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

export const BusinessConfigurationService = {
  async load(): Promise<BusinessConfiguration> {
    const row = await SettingsRepository.get();
    if (row.operatingMode !== "NCT_DEPENDENT") {
      await SettingsRepository.upsert({ operatingMode: "NCT_DEPENDENT" });
    }
    const configuration = fromRow(row);
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
    // OMS provisions this POS as dependent. Ignore a mode supplied by older
    // servers rather than allowing a device registration to change it.
    await SettingsRepository.upsert({ operatingMode: "NCT_DEPENDENT" });
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

  async changeOperatingMode(input: {
    nextMode: OperatingMode;
    changedById?: string;
    changedByName?: string;
    stockResolution?: string;
  }): Promise<BusinessConfiguration> {
    void input;
    throw new Error("This POS is permanently configured for NCT OMS-dependent operation.");
  },
};
