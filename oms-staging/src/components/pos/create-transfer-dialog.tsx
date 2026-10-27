"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import {
  X,
  ArrowRightLeft,
  Search,
  Package,
  Minus,
  Trash2,
  GripVertical,
  Link2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { usePosApi, usePosScope } from "./pos-scope";
import { NctCreateTransferDialog } from "./nct-create-transfer-dialog";
import { api as omsApi } from "~/trpc/react";
import { useDepartmentTheme } from "~/contexts/DepartmentThemeContext";

export interface CreateTransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: number;
  branchName?: string;
  fixedDeviceId?: string;
  dealershipId?: string;
  dealershipName?: string;
  onSuccess?: () => void;
}

type Direction = "OMS_TO_POS" | "POS_TO_OMS";

interface InventoryItem {
  id: number;
  productId: number;
  productName: string;
  variationName: string;
  barcode: string | null;
  stockGroupId: string | null;
  groupKey: string;
  stock: number;
  posPrice: number;
  price: number;
  unit: string | null;
  weight: number;
  imageUrl: string | null;
}

interface VariationItem {
  id: number;
  variationName: string;
  stock: number;
  unit: string | null;
  barcode: string | null;
  imageUrl: string | null;
  stockGroupId: string | null;
}

interface SharedGroup {
  stockGroupId: string;
  /** Unified stock = first variation's stock (shared pool) */
  unifiedStock: number;
  variations: VariationItem[];
}

interface ProductRow {
  key: string;
  productName: string;
  imageUrl: string | null;
  unit: string | null;
  totalStock: number;
  sharedGroups: SharedGroup[];
  individualVariations: VariationItem[];
}

interface SelectedItem {
  key: string;
  productName: string;
  variationName: string;
  qty: number;
  maxQty: number;
  unit: string | null;
  barcode: string | null;
  imageUrl: string | null;
  stockGroupId: string | null;
  variationId: number;
  isShared: boolean;
}

const PAGE_SIZE = 20;

export function CreateTransferDialog(props: CreateTransferDialogProps) {
  const nct = usePosScope() === "pos" && !props.dealershipId;
  return nct ? <NctCreateTransferDialog {...props} /> : <LegacyCreateTransferDialog {...props} />;
}

function LegacyCreateTransferDialog({ isOpen, onClose, branchId, branchName, fixedDeviceId, dealershipId, dealershipName, onSuccess }: CreateTransferDialogProps) {
  const api = usePosApi();
  const { primaryColor, gradient } = useDepartmentTheme();
  const [direction, setDirection] = useState<Direction>("OMS_TO_POS");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [draggingFromLeft, setDraggingFromLeft] = useState<string | null>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef<HTMLDivElement>(null);

  const devicesQuery = api.posDevice.getDevices.useQuery(
    { search: "", branchId, limit: 100 },
    { enabled: isOpen && !dealershipId },
  );
  const dealershipDevicesQuery = omsApi.dealership.transferDevices.useQuery(
    { dealershipId: dealershipId ?? "" }, { enabled: isOpen && Boolean(dealershipId) },
  );
  const devices = dealershipId ? dealershipDevicesQuery.data ?? [] : devicesQuery.data?.devices ?? [];
  const deviceQuery = dealershipId ? dealershipDevicesQuery : devicesQuery;
  const destinationName = dealershipId ? ((devices.find(device => device.id === selectedDeviceId) as { branch?: { name: string } } | undefined)?.branch?.name || branchName || dealershipName || "Dealership branch") : "POS";
  useEffect(() => { if (isOpen) { setSelectedDeviceId(fixedDeviceId ?? ""); setSelectedItems([]); } }, [isOpen, dealershipId, fixedDeviceId]);

  const inventoryQuery = api.pos.searchVariations.useQuery(
    { search: productSearch.length >= 2 ? productSearch : undefined, limit: 500 },
    { enabled: isOpen },
  );

  const createTransfer = api.posTransfer.create.useMutation({
    onSuccess: () => {
      toast.success("Transfer created successfully");
      handleClose();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
      setIsSubmitting(false);
    },
  });

  const handleClose = () => {
    setDirection("OMS_TO_POS");
    setSelectedDeviceId(fixedDeviceId ?? "");
    setProductSearch("");
    setSelectedItems([]);
    setNotes("");
    setIsSubmitting(false);
    setExpandedKey(null);
    setPage(1);
    setDraggingFromLeft(null);
    onClose();
  };

  // Group by productName → shared groups + individual variations
  const productRows = useMemo(() => {
    const raw = (inventoryQuery.data ?? []) as InventoryItem[];
    const byName = new Map<string, InventoryItem[]>();

    for (const item of raw) {
      const list = byName.get(item.productName) ?? [];
      list.push(item);
      byName.set(item.productName, list);
    }

    return Array.from(byName.entries()).map(([productName, items]): ProductRow => {
      const sharedMap = new Map<string, VariationItem[]>();
      const individual: VariationItem[] = [];

      for (const item of items) {
        if (item.stockGroupId) {
          const list = sharedMap.get(item.stockGroupId) ?? [];
          list.push({
            id: item.id,
            variationName: item.variationName,
            stock: item.stock ?? 0,
            unit: item.unit,
            barcode: item.barcode,
            imageUrl: item.imageUrl,
            stockGroupId: item.stockGroupId,
          });
          sharedMap.set(item.stockGroupId, list);
        } else {
          individual.push({
            id: item.id,
            variationName: item.variationName,
            stock: item.stock ?? 0,
            unit: item.unit,
            barcode: item.barcode,
            imageUrl: item.imageUrl,
            stockGroupId: null,
          });
        }
      }

      const sharedGroups: SharedGroup[] = Array.from(sharedMap.entries()).map(([gid, vars]) => ({
        stockGroupId: gid,
        unifiedStock: vars[0]?.stock ?? 0,
        variations: vars,
      }));

      const totalStock =
        sharedGroups.reduce((sum, g) => sum + g.unifiedStock, 0) +
        individual.reduce((sum, v) => sum + v.stock, 0);

      return {
        key: productName,
        productName,
        imageUrl: items[0]?.imageUrl ?? null,
        unit: items[0]?.unit ?? null,
        totalStock,
        sharedGroups,
        individualVariations: individual,
      };
    });
  }, [inventoryQuery.data]);

  const filteredProducts = useMemo(() => {
    return productRows;
  }, [productRows]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Find cart item by key
  const findCartItem = useCallback((key: string): SelectedItem | undefined => {
    return selectedItems.find((s) => s.key === key);
  }, [selectedItems]);

  // Increment shared group in cart
  const incSharedGroup = useCallback((row: ProductRow, sg: SharedGroup) => {
    const key = `${row.key}_shared_${sg.stockGroupId}`;
    const existing = selectedItems.find((s) => s.key === key);
    if (existing) {
      if (existing.qty >= existing.maxQty) return;
      setSelectedItems((prev) =>
        prev.map((s) => s.key === key ? { ...s, qty: s.qty + 1 } : s),
      );
    } else {
      if (sg.unifiedStock <= 0) return;
      setSelectedItems((prev) => [
        ...prev,
        {
          key,
          productName: row.productName,
          variationName: `${sg.variations.length} variation${sg.variations.length > 1 ? "s" : ""} (shared)`,
          qty: 1,
          maxQty: sg.unifiedStock,
          unit: row.unit,
          barcode: sg.variations[0]?.barcode ?? null,
          imageUrl: row.imageUrl,
          stockGroupId: sg.stockGroupId,
          variationId: sg.variations[0]!.id,
          isShared: true,
        },
      ]);
    }
  }, [selectedItems]);

  // Decrement shared group in cart
  const decSharedGroup = useCallback((row: ProductRow, sg: SharedGroup) => {
    const key = `${row.key}_shared_${sg.stockGroupId}`;
    setSelectedItems((prev) => {
      const item = prev.find((s) => s.key === key);
      if (!item) return prev;
      if (item.qty <= 1) return prev.filter((s) => s.key !== key);
      return prev.map((s) => s.key === key ? { ...s, qty: s.qty - 1 } : s);
    });
  }, []);

  // Increment individual variation in cart
  const incIndividual = useCallback((row: ProductRow, v: VariationItem) => {
    const key = `${row.key}_var_${v.id}`;
    const existing = selectedItems.find((s) => s.key === key);
    if (existing) {
      if (existing.qty >= existing.maxQty) return;
      setSelectedItems((prev) =>
        prev.map((s) => s.key === key ? { ...s, qty: s.qty + 1 } : s),
      );
    } else {
      if (v.stock <= 0) return;
      setSelectedItems((prev) => [
        ...prev,
        {
          key,
          productName: row.productName,
          variationName: v.variationName,
          qty: 1,
          maxQty: v.stock,
          unit: v.unit,
          barcode: v.barcode,
          imageUrl: row.imageUrl,
          stockGroupId: null,
          variationId: v.id,
          isShared: false,
        },
      ]);
    }
  }, [selectedItems]);

  // Decrement individual variation in cart
  const decIndividual = useCallback((row: ProductRow, v: VariationItem) => {
    const key = `${row.key}_var_${v.id}`;
    setSelectedItems((prev) => {
      const item = prev.find((s) => s.key === key);
      if (!item) return prev;
      if (item.qty <= 1) return prev.filter((s) => s.key !== key);
      return prev.map((s) => s.key === key ? { ...s, qty: s.qty - 1 } : s);
    });
  }, []);

  // Add entire product (shared groups + individual variations)
  const addToCart = useCallback((row: ProductRow) => {
    const existing = selectedItems.filter((s) => s.productName === row.productName);
    if (existing.length > 0) {
      // Increment each existing item by 1
      setSelectedItems((prev) =>
        prev.map((s) =>
          s.productName === row.productName && s.qty < s.maxQty
            ? { ...s, qty: s.qty + 1 }
            : s
        )
      );
      return;
    }
    const newItems: SelectedItem[] = [];

    for (const sg of row.sharedGroups) {
      if (sg.unifiedStock <= 0) continue;
      newItems.push({
        key: `${row.key}_shared_${sg.stockGroupId}`,
        productName: row.productName,
        variationName: `${sg.variations.length} variation${sg.variations.length > 1 ? "s" : ""} (shared)`,
        qty: 1,
        maxQty: sg.unifiedStock,
        unit: row.unit,
        barcode: sg.variations[0]?.barcode ?? null,
        imageUrl: row.imageUrl,
        stockGroupId: sg.stockGroupId,
        variationId: sg.variations[0]!.id,
        isShared: true,
      });
    }

    for (const v of row.individualVariations) {
      if (v.stock <= 0) continue;
      newItems.push({
        key: `${row.key}_var_${v.id}`,
        productName: row.productName,
        variationName: v.variationName,
        qty: 1,
        maxQty: v.stock,
        unit: v.unit,
        barcode: v.barcode,
        imageUrl: row.imageUrl,
        stockGroupId: null,
        variationId: v.id,
        isShared: false,
      });
    }

    if (newItems.length === 0) {
      toast.error("All variations are out of stock");
      return;
    }

    setSelectedItems((prev) => [...prev, ...newItems]);
    toast.success(`${row.productName} added`, { duration: 1500 });
  }, [selectedItems]);

  const removeItem = (key: string) => {
    setSelectedItems((prev) => prev.filter((s) => s.key !== key));
  };

  const updateQty = (key: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, qty: Math.max(1, Math.min(s.maxQty, s.qty + delta)) } : s,
      ),
    );
  };

  // Drag from left to cart
  const handleLeftDragStart = (e: React.DragEvent, productName: string) => {
    setDraggingFromLeft(productName);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", productName);
  };

  const handleCartDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCartDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const productName = e.dataTransfer.getData("text/plain") || draggingFromLeft;
    if (!productName) return;
    const row = productRows.find((p) => p.productName === productName);
    if (row) addToCart(row);
    setDraggingFromLeft(null);
  };

  // Reorder within cart
  const handleCartDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = "move";
    if (dragNodeRef.current) e.dataTransfer.setDragImage(dragNodeRef.current, 0, 0);
  };

  const handleCartDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverItem(index);
  };

  const handleCartDropReorder = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === dropIndex) return;
    setSelectedItems((prev) => {
      const updated = [...prev];
      const dragged = updated.splice(draggedItem, 1)[0];
      if (!dragged) return prev;
      updated.splice(dropIndex, 0, dragged);
      return updated;
    });
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
    setDraggingFromLeft(null);
  };

  const handleSubmit = () => {
    if (selectedItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    if (!selectedDeviceId || (dealershipId && !devices.some(d => d.id === selectedDeviceId))) {
      toast.error("Select a target device");
      return;
    }
    setIsSubmitting(true);
    createTransfer.mutate({
      direction: direction === "OMS_TO_POS" ? "INVENTORY_TO_POS" : "POS_TO_INVENTORY",
      targetDeviceId: selectedDeviceId,
      targetBranchId: dealershipId ? Number(devices.find(d => d.id === selectedDeviceId)?.branchId) : branchId,
      dealershipId,
      items: selectedItems.map((s) => ({
        variationId: s.variationId,
        productName: s.productName,
        allocatedQty: s.qty,
        variationName: s.variationName,
        sku: s.barcode ?? undefined,
      })),
      notes: notes.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  const isOmsToPos = direction === "OMS_TO_POS";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 text-white shrink-0" style={{ background: gradient }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <ArrowRightLeft className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-semibold">Create Transfer</div>
              <div className="text-sm text-white/80">Move products between OMS and {destinationName}</div>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Product List */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200">
            <div className="p-3 border-b border-slate-200 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("OMS_TO_POS")}
                  className="rounded-lg border-2 px-3 py-2 text-center font-semibold transition-all text-sm"
                  style={isOmsToPos
                    ? { borderColor: primaryColor, backgroundColor: `${primaryColor}15`, color: primaryColor }
                    : { borderColor: "#e2e8f0", backgroundColor: "#fff", color: "#6b7280" }
                  }
                >
                  OMS &rarr; {destinationName}
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("POS_TO_OMS")}
                  className={`rounded-lg border-2 px-3 py-2 text-center font-semibold transition-all text-sm ${
                    !isOmsToPos ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : "border-slate-200 bg-white text-gray-500 hover:border-emerald-300"
                  }`}
                >
                  {destinationName} &rarr; OMS
                </button>
              </div>

              <select
                value={selectedDeviceId}
                aria-label="Transfer device"
                disabled={(!dealershipId && Boolean(fixedDeviceId)) || deviceQuery.isLoading || deviceQuery.isError}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" disabled>{deviceQuery.isLoading ? "Loading devices..." : "Select device..."}</option>
                {devices.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.deviceName} ({d.status})</option>
                ))}
              </select>
              {deviceQuery.isError && <p role="alert" className="text-sm text-red-600">Unable to load devices. <button type="button" onClick={() => void deviceQuery.refetch()}>Retry</button></p>}
              {dealershipId && deviceQuery.isSuccess && !devices.length && <p className="text-sm text-slate-500">Enroll an enabled device for this dealership to create a transfer.</p>}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setPage(1); }}
                  placeholder="Search products..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="text-xs text-gray-500">
                {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} — click to expand, drag or click Add
              </div>
            </div>

            {/* Product Rows */}
            <div className="flex-1 overflow-y-auto">
              {inventoryQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading inventory...</div>
              ) : pagedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Package className="h-10 w-10 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pagedProducts.map((row) => {
                    const isExpanded = expandedKey === row.productName;
                    const hasVariations = row.sharedGroups.length > 0 || row.individualVariations.length > 0;
                    const totalVariations =
                      row.sharedGroups.reduce((sum, g) => sum + g.variations.length, 0) +
                      row.individualVariations.length;

                    // Check if any variation has stock > 0
                    const hasStock = row.sharedGroups.some((g) => g.unifiedStock > 0) ||
                      row.individualVariations.some((v) => v.stock > 0);

                    return (
                      <div key={row.key}>
                        {/* Product Row */}
                        <div
                          draggable
                          onDragStart={(e) => handleLeftDragStart(e, row.productName)}
                          onDragEnd={handleDragEnd}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-colors"
                        >
                          {hasVariations ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedKey(isExpanded ? null : row.productName); }}
                              className="h-5 w-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          ) : <div className="w-5 shrink-0" />}

                          <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-5 w-5 text-gray-300" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{row.productName}</div>
                            <div className="text-xs text-gray-500">{totalVariations} variation{totalVariations !== 1 ? "s" : ""}</div>
                          </div>

                          <span className={`text-sm font-semibold shrink-0 ${row.totalStock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {row.totalStock}
                          </span>

                          {(() => {
                            const inCartQty = selectedItems
                              .filter((s) => s.productName === row.productName)
                              .reduce((sum, s) => sum + s.qty, 0);
                            const inCart = inCartQty > 0;
                            return (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); addToCart(row); }}
                                disabled={!hasStock}
                                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ backgroundColor: inCart ? "#059669" : primaryColor }}
                              >
                                {inCart ? `In Cart (${inCartQty})` : "Add"}
                              </button>
                            );
                          })()}
                        </div>

                        {/* Expanded */}
                        {isExpanded && hasVariations && (
                          <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 ml-8 space-y-2">
                            {/* Shared Groups */}
                            {row.sharedGroups.map((sg) => {
                              const cartItem = findCartItem(`${row.key}_shared_${sg.stockGroupId}`);
                              const inCart = !!cartItem;
                              const isZero = sg.unifiedStock <= 0;

                              return (
                                <div key={sg.stockGroupId}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide flex items-center gap-1">
                                      <Link2 className="h-2.5 w-2.5" />
                                      Shared Stock ({sg.variations.length} var.)
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span className={`text-[10px] font-bold ${sg.unifiedStock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                        {isZero ? "Out of stock" : sg.unifiedStock}
                                      </span>
                                    </div>
                                  </div>
                                  {/* Variation names + inline +/- */}
                                  <div className="space-y-0.5">
                                    {sg.variations.map((v, vi) => (
                                      <div key={v.id} className="flex items-center gap-2 rounded bg-white border border-slate-200 px-2.5 py-1">
                                        <span className="text-xs text-gray-700 flex-1 truncate">{v.variationName}</span>
                                        {vi === 0 && (
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => decSharedGroup(row, sg)}
                                              disabled={!inCart || (cartItem?.qty ?? 0) <= 1}
                                              className="h-5 w-5 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <Minus className="h-2.5 w-2.5" />
                                            </button>
                                            <span className="w-6 text-center text-[10px] font-bold text-gray-900">
                                              {cartItem?.qty ?? 0}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => incSharedGroup(row, sg)}
                                              disabled={isZero || (cartItem?.qty ?? 0) >= sg.unifiedStock}
                                              className="h-5 w-5 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <span className="text-[10px] font-bold">+</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Individual Variations */}
                            {row.individualVariations.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Variations
                                </div>
                                <div className="space-y-0.5">
                                  {row.individualVariations.map((v) => {
                                    const cartItem = findCartItem(`${row.key}_var_${v.id}`);
                                    const inCart = !!cartItem;
                                    const isZero = v.stock <= 0;

                                    return (
                                      <div key={v.id} className="flex items-center gap-2 rounded bg-white border border-slate-200 px-2.5 py-1">
                                        <span className="text-xs text-gray-700 flex-1 truncate">{v.variationName}</span>
                                        {isZero ? (
                                          <span className="text-[10px] font-medium text-red-400 shrink-0">Out of stock</span>
                                        ) : (
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => decIndividual(row, v)}
                                              disabled={!inCart || (cartItem?.qty ?? 0) <= 1}
                                              className="h-5 w-5 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <Minus className="h-2.5 w-2.5" />
                                            </button>
                                            <span className="w-6 text-center text-[10px] font-bold text-gray-900">
                                              {cartItem?.qty ?? 0}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => incIndividual(row, v)}
                                              disabled={(cartItem?.qty ?? 0) >= v.stock}
                                              className="h-5 w-5 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <span className="text-[10px] font-bold">+</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Prev
                </button>
                <span className="text-xs text-gray-500">Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Cart */}
          <div
            ref={cartRef}
            className="w-[320px] flex flex-col overflow-hidden shrink-0"
            onDragOver={handleCartDragOver}
            onDrop={handleCartDrop}
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-200 text-white shrink-0" style={{ background: gradient }}>
              <span className="text-sm font-medium">Cart ({selectedItems.length})</span>
              {draggingFromLeft && <span className="text-[10px] text-white/70 animate-pulse">Drop here...</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {selectedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Package className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-xs text-gray-500">Drag products here or click Add</p>
                </div>
              ) : (
                selectedItems.map((item, index) => (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={(e) => handleCartDragStart(e, index)}
                    onDragOver={(e) => handleCartDragOverItem(e, index)}
                    onDrop={(e) => handleCartDropReorder(e, index)}
                    onDragEnd={handleDragEnd}
                    ref={dragNodeRef}
                    className={`flex items-center gap-2 rounded-lg border bg-white p-2 transition-all ${
                      draggedItem === index ? "opacity-50 border-slate-400" : dragOverItem === index ? "border-slate-600 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                    <div className="h-8 w-8 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-3.5 w-3.5 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{item.productName}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 truncate">{item.variationName}</span>
                        {item.isShared && <Link2 className="h-1.5 w-1.5 text-purple-600 shrink-0" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(item.key, -1)}
                        disabled={item.qty <= 1}
                        className="h-6 w-6 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40"
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 1 && val <= item.maxQty) {
                            setSelectedItems((prev) => prev.map((s) => s.key === item.key ? { ...s, qty: val } : s));
                          }
                        }}
                        className="w-8 text-center text-xs font-medium border border-slate-200 rounded py-0.5"
                        min={1}
                        max={item.maxQty}
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(item.key, 1)}
                        disabled={item.qty >= item.maxQty}
                        className="h-6 w-6 rounded border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40"
                      >
                        <span className="text-xs font-bold">+</span>
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 w-10 text-right">/ {item.maxQty}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="h-6 w-6 rounded border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 shrink-0"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-200">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes (optional)..."
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 shrink-0" style={{ backgroundColor: `${primaryColor}08` }}>
          <div className="text-sm text-gray-500">
            {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} · {selectedItems.reduce((sum, i) => sum + i.qty, 0)} units
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedItems.length === 0 || !selectedDeviceId}
              className="text-white"
              style={{ backgroundColor: isOmsToPos ? primaryColor : "#059669" }}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              {isSubmitting ? "Creating..." : "Create Transfer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
