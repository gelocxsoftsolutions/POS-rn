import { create } from "zustand";
import type { PosCartItem } from "@/lib/types/pos";

interface CartState {
  items: PosCartItem[];
  addItem: (product: PosCartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
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
              i.productId === productId ? { ...i, quantity } : i
            ),
    })),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
}));
