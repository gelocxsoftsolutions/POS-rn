import { create } from "zustand";
import type { PosCartItem } from "@/lib/types/pos";

interface CartState {
  items: PosCartItem[];
  addItem: (product: PosCartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  refreshMaxQuantities: (getMax: (productId: string) => number | undefined) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.productId
              ? { ...i, quantity: Math.min(i.quantity + 1, i.maxQuantity) }
              : i
          ),
        };
      }
      return { items: [...state.items, { ...product, quantity: 1 }] };
    }),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.productId !== productId)
          : state.items.map((i) =>
              i.productId === productId ? { ...i, quantity: Math.min(quantity, i.maxQuantity) } : i
            ),
    })),
  // Catalog stock is reloaded over time (sync, transfer receive). Items
  // already in the cart snapshot maxQuantity at add time, so refresh the caps
  // from fresh stock instead of clamping to a stale value forever.
  refreshMaxQuantities: (getMax) =>
    set((state) => ({
      items: state.items.map((i) => {
        const fresh = getMax(i.productId);
        return fresh === undefined ? i : { ...i, maxQuantity: fresh };
      }),
    })),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
}));
