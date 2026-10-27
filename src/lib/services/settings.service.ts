import { withNctActionAudit } from "./action-audit";
import { SettingsRepository } from "@/lib/repositories/settings.repository";
import type { StoreSettingsRow, UpsertSettingsInput } from "@/lib/repositories/settings.repository";
import { DEFAULT_RECEIPT_TEMPLATE } from "@/lib/business/defaults";
import type { ReceiptTemplate } from "@/lib/business/types";
import { requirePermission } from "@/lib/services/authorization.service";

export type ResolvedSettings = StoreSettingsRow & ReceiptTemplate & {
  logoUri: string | null;
  headerMessage: string;
};

function resolve(row: StoreSettingsRow): ResolvedSettings {
  let template: ReceiptTemplate = DEFAULT_RECEIPT_TEMPLATE;
  try {
    template = { ...DEFAULT_RECEIPT_TEMPLATE, ...(row.receiptTemplateJson ? JSON.parse(row.receiptTemplateJson) : {}) };
  } catch {}
  return {
    ...row,
    ...template,
    logoUri: row.receiptLogoUri || row.businessLogoUri || null,
    headerMessage: template.headerMessage,
    receiptFooter: template.footerMessage || row.receiptFooter,
  };
}

export const SettingsService = withNctActionAudit("Settings", {
  async get(): Promise<ResolvedSettings> {
    try {
      const settings = await SettingsRepository.get();
      if (settings.taxRate > 1 && settings.taxRate <= 100) {
        return resolve(await SettingsRepository.upsert({ taxRate: settings.taxRate / 100 }));
      }
      return resolve(settings);
    } catch {
      return resolve({
        id: "default",
        storeName: "",
        storeCode: "",
        currencyCode: "PHP",
        taxLabel: "VAT",
        taxRate: 0,
        supportPhone: "",
        address: "",
        receiptFooter: "",
        businessId: "nct-default",
        operatingMode: "INDEPENDENT",
        posSystemName: "NCT Seafoods POS",
        headerName: "NCT Seafoods",
        businessLogoUri: null,
        receiptLogoUri: null,
        contactEmail: "",
        receiptTemplateJson: null,
        receiptTemplateVersion: 1,
        modeChangedAt: null,
        updatedAt: new Date().toISOString(),
      });
    }
  },

  async update(partial: UpsertSettingsInput): Promise<ResolvedSettings> {
    try {
      await requirePermission("POS_SETTINGS", "change business settings");
      return resolve(await SettingsRepository.upsert(partial));
    } catch (e: any) {
      throw new Error(e.message ?? "Failed to update settings");
    }
  },
});
