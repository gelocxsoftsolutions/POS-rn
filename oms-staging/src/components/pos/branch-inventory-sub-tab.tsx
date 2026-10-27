"use client";

import React, { useMemo, useState } from "react";
import {
  Boxes,
  Eye,
  Warehouse,
  Search,
  Filter,
  Package,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { usePosApi, usePosScope } from "./pos-scope";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ViewProductModal } from "../../app/(dashboard)/inventory/view-product-modal";

interface BranchInventorySubTabProps {
  branchId: number;
  branchName: string;
}

type InventoryStatusFilter = "all" | "in_stock" | "low" | "out_of_stock";

interface BranchInventoryRow {
  variationId: number;
  productId: number;
  productName: string;
  variationName: string;
  barcode: string | null;
  unit: string | null;
  weight: number;
  posPrice: number;
  price: number;
  imageUrl: string | null;
  category: { name: string; color: string | null } | null;
  area: { id: number; name: string; color: string | null } | null;
  totalStock: number;
  deviceCount: number;
}

function resolveUnitPrice(input: { posPrice: number; price: number }) {
  return input.posPrice > 0 ? input.posPrice : input.price;
}

function createVariationLabel(input: { variationName: string; weight: number; unit: string | null }) {
  const parts: string[] = [];
  if (input.variationName) parts.push(input.variationName);
  if (input.weight > 0) parts.push(`${input.weight}${input.unit ? ` ${input.unit}` : ""}`);
  return parts.join(" • ") || "Default variation";
}

function resolveProductImageUrl(imageUrl: string | null): string {
  if (!imageUrl || imageUrl === "placeholder.png" || imageUrl === "" || imageUrl === "null") {
    return "/placeholder.png";
  }

  if (imageUrl.startsWith("/api/product-images")) {
    return imageUrl;
  }

  if (imageUrl.startsWith("/product_images/")) {
    const filename = imageUrl.split("/product_images/")[1];
    return `/api/product-images/${filename}`;
  }

  if (imageUrl.includes("product_images/")) {
    const filename = imageUrl.split("product_images/")[1];
    return `/api/product-images/${filename}`;
  }

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || imageUrl.startsWith("/")) {
    return imageUrl;
  }

  return `/api/product-images/${imageUrl}`;
}

function getInventoryStatus(qty: number) {
  if (qty <= 0) {
    return { label: "Out of stock", className: "bg-red-100 text-red-800" };
  }
  if (qty < 10) {
    return { label: "Low stock", className: "bg-yellow-100 text-yellow-800" };
  }
  return { label: "In stock", className: "bg-green-100 text-green-800" };
}

export function BranchInventorySubTab({ branchId, branchName }: BranchInventorySubTabProps) {
  const nct = usePosScope() === "pos";
  const api = usePosApi();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");
  const [viewTarget, setViewTarget] = useState<{ productId: number; variationId: number } | null>(null);

  const devicesQuery = api.posDevice.getDevices.useQuery({
    branchId,
    search: "",
    limit: 500,
  });

  const deviceIds = useMemo(
    () => new Set(devicesQuery.data?.devices?.map((d: any) => d.id) ?? []),
    [devicesQuery.data],
  );

  const posInventory = api.pos.getInventory.useQuery({
    branchId: nct ? branchId : undefined,
    search,
    limit: 500,
    deviceId: "ALL",
  });

  const productDetails = api.product.getById.useQuery(
    { id: viewTarget?.productId ?? 0 },
    { enabled: Boolean(viewTarget) },
  );

  const branchInventory = useMemo((): BranchInventoryRow[] => {
    const raw = posInventory.data ?? [];
    const filtered = nct ? raw : raw.filter((row: any) => deviceIds.has(row.deviceId));

    const grouped = new Map<number, BranchInventoryRow>();

    for (const row of filtered) {
      const existing = grouped.get(row.variation.id);
      if (existing) {
        existing.totalStock += row.qty;
        existing.deviceCount += 1;
      } else {
        grouped.set(row.variation.id, {
          variationId: row.variation.id,
          productId: row.variation.productId,
          productName: row.variation.productName,
          variationName: row.variation.variationName,
          barcode: row.variation.barcode,
          unit: row.variation.unit,
          weight: row.variation.weight,
          posPrice: row.variation.posPrice,
          price: row.variation.price,
          imageUrl: row.variation.imageUrl,
          category: row.variation.category,
          area: row.variation.area,
          totalStock: row.qty,
          deviceCount: 1,
        });
      }
    }

    return Array.from(grouped.values());
  }, [posInventory.data, deviceIds]);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const row of branchInventory) {
      if (row.category && !map.has(row.category.name)) {
        map.set(row.category.name, row.category);
      }
    }
    return Array.from(map.values());
  }, [branchInventory]);

  const filteredInventory = useMemo(() => {
    return branchInventory.filter((row) => {
      if (categoryFilter !== "all" && row.category?.name !== categoryFilter) return false;

      if (statusFilter === "in_stock" && row.totalStock <= 10) return false;
      if (statusFilter === "low" && (row.totalStock <= 0 || row.totalStock >= 10)) return false;
      if (statusFilter === "out_of_stock" && row.totalStock > 0) return false;

      return true;
    });
  }, [branchInventory, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const totalProducts = branchInventory.length;
    const inStock = branchInventory.filter((r) => r.totalStock > 10).length;
    const lowStock = branchInventory.filter((r) => r.totalStock > 0 && r.totalStock <= 10).length;
    const outOfStock = branchInventory.filter((r) => r.totalStock <= 0).length;
    return { totalProducts, inStock, lowStock, outOfStock };
  }, [branchInventory]);

  const viewProduct =
    productDetails.data && viewTarget
      ? ({
          ...productDetails.data,
          product_variations: (productDetails.data.product_variations ?? []).filter(
            (v: any) => v.id === viewTarget.variationId,
          ),
        } as any)
      : null;

  const isLoading = devicesQuery.isLoading || posInventory.isLoading;
  const hasDeviceFilter = deviceIds.size > 0;

  return (
    <>
      <Card className="bg-white shadow-lg border-0">
        <CardContent className="p-4 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Products</p>
                <p className="text-lg font-bold text-gray-900">{stats.totalProducts}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <Boxes className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">In Stock</p>
                <p className="text-lg font-bold text-green-700">{stats.inStock}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-yellow-100 bg-gradient-to-br from-yellow-50 to-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Low Stock</p>
                <p className="text-lg font-bold text-yellow-700">{stats.lowStock}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Out of Stock</p>
                <p className="text-lg font-bold text-red-700">{stats.outOfStock}</p>
              </div>
            </div>
          </div>

          {/* Search + Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products or SKU..."
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-white pl-9 pr-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1 rounded-lg border border-input bg-gray-50 p-1">
              {([
                { value: "all", label: "All" },
                { value: "in_stock", label: "In Stock" },
                { value: "low", label: "Low" },
                { value: "out_of_stock", label: "Out" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatusFilter(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Table */}
          <div className="min-h-[400px] overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden">
              <thead className="bg-gradient-to-r from-blue-50 to-blue-100/50">
                <tr className="text-left text-gray-700">
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Preview</th>
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Product</th>
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Category</th>
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm text-center">Total Stock</th>
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Status</th>
                  <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      Loading branch inventory...
                    </td>
                  </tr>
                ) : !hasDeviceFilter ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      No devices registered for this branch.
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((row) => {
                    const status = getInventoryStatus(row.totalStock);
                    const label = `${row.productName}${row.variationName ? ` — ${row.variationName}` : ""}`;

                    return (
                      <tr
                        key={row.variationId}
                        className="border-b border-gray-100 bg-gradient-to-r from-white to-blue-50/10 transition-colors hover:bg-blue-50/50 hover:from-blue-50/20 hover:to-blue-100/20"
                      >
                        <td className="py-3 px-3 sm:py-4 sm:px-6">
                          <div className="h-12 w-12 overflow-hidden rounded-lg border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-200">
                            <img
                              src={resolveProductImageUrl(row.imageUrl)}
                              alt={row.productName}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/placeholder.png";
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:py-4 sm:px-6">
                          <div className="font-medium text-gray-900 text-sm sm:text-base">{row.productName}</div>
                          <div className="text-xs text-gray-500">
                            {row.variationName || createVariationLabel({
                              variationName: row.variationName,
                              weight: row.weight,
                              unit: row.unit,
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:py-4 sm:px-6">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white shadow-sm"
                            style={
                              row.category?.color
                                ? { backgroundColor: row.category.color }
                                : { background: "linear-gradient(to right, #3b82f6, #2563eb)" }
                            }
                          >
                            {row.category?.name ?? "N/A"}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Warehouse className="h-4 w-4 text-gray-400" />
                            <span className="font-semibold text-gray-900">{row.totalStock}</span>
                            <span className="text-[11px] text-gray-400">({row.deviceCount} device{row.deviceCount === 1 ? "" : "s"})</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:py-4 sm:px-6">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:py-4 sm:px-6">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setViewTarget({ productId: row.productId, variationId: row.variationId })}
                            className="h-8 w-8 border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                            title={`View ${label}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ViewProductModal
        isOpen={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        product={viewProduct}
      />
    </>
  );
}
