import { DiscountRepository } from "@/lib/repositories/discount.repository";
import { execute } from "@/lib/db/connection";

export interface ValidateDiscountResult {
  valid: boolean;
  discount?: any;
  calculatedDiscount?: number;
  error?: string;
}

export const DiscountService = {
  async validate(
    code: string,
    purchaseAmount: number
  ): Promise<ValidateDiscountResult> {
    try {
      const discount = await DiscountRepository.findByCode(code);
      if (!discount) {
        return { valid: false, error: "Discount code not found" };
      }

      if (!discount.active) {
        return { valid: false, discount, error: "Discount is inactive" };
      }

      const now = new Date().toISOString();
      if (discount.startsAt && now < discount.startsAt) {
        return { valid: false, discount, error: "Discount not yet active" };
      }
      if (discount.expiresAt && now > discount.expiresAt) {
        return { valid: false, discount, error: "Discount has expired" };
      }

      if (discount.minPurchase && purchaseAmount < discount.minPurchase) {
        return {
          valid: false,
          discount,
          error: `Minimum purchase of ${discount.minPurchase} required`,
        };
      }

      if (discount.maxUses != null && discount.usedCount >= discount.maxUses) {
        return { valid: false, discount, error: "Discount usage limit reached" };
      }

      let calculatedDiscount = 0;
      if (discount.type === "PERCENTAGE") {
        calculatedDiscount = (purchaseAmount * discount.value) / 100;
      } else {
        calculatedDiscount = Math.min(discount.value, purchaseAmount);
      }

      return { valid: true, discount, calculatedDiscount };
    } catch {
      return { valid: false, error: "Failed to validate discount" };
    }
  },

  async list() {
    try {
      return await DiscountRepository.findAll();
    } catch {
      return [];
    }
  },

  async create(data: {
    code: string;
    name: string;
    description?: string;
    type?: string;
    value: number;
    minPurchase?: number;
    maxUses?: number;
    startsAt?: string;
    expiresAt?: string;
  }) {
    try {
      return await DiscountRepository.create(data);
    } catch (e: any) {
      throw new Error(e.message ?? "Failed to create discount");
    }
  },
};
