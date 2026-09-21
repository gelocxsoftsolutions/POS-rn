import { SettingsRepository } from "@/lib/repositories/settings.repository";
import type { StoreSettingsRow, UpsertSettingsInput } from "@/lib/repositories/settings.repository";

export const SettingsService = {
  async get(): Promise<StoreSettingsRow> {
    try {
      const settings = await SettingsRepository.get();
      if (settings.taxRate > 1 && settings.taxRate <= 100) {
        return await SettingsRepository.upsert({ taxRate: settings.taxRate / 100 });
      }
      return settings;
    } catch {
      return {
        id: "default",
        storeName: "",
        storeCode: "",
        currencyCode: "PHP",
        taxLabel: "VAT",
        taxRate: 0,
        supportPhone: "",
        address: "",
        receiptFooter: "",
        updatedAt: new Date().toISOString(),
      };
    }
  },

  async update(partial: UpsertSettingsInput): Promise<StoreSettingsRow> {
    try {
      return await SettingsRepository.upsert(partial);
    } catch (e: any) {
      throw new Error(e.message ?? "Failed to update settings");
    }
  },
};
