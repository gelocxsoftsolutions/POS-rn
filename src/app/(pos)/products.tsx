import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code128Barcode } from "@/components/ui/code128-barcode";
import { BarcodeScannerModal } from "@/components/ui/barcode-scanner-modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ProductService } from "@/lib/services/product.service";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import type {
  ProductDTO,
  ProductDetailDTO,
  CategoryDTO,
  BarcodeDTO,
  ProductFilter,
  ProductInventorySummary,
} from "@/lib/types/inventory";

const STOCK_FILTERS = ["All", "In Stock", "Low", "Out of Stock"];
type ViewMode = "grid" | "list";

export default function ProductsScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [inventorySummary, setInventorySummary] = useState<ProductInventorySummary>({
    totalProducts: 0,
    totalAvailable: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [loading, setLoading] = useState(true);
  const [detailProduct, setDetailProduct] = useState<ProductDetailDTO | null>(null);
  const [detailBarcodes, setDetailBarcodes] = useState<BarcodeDTO[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [variationGroup, setVariationGroup] = useState<ProductDTO[] | null>(null);
  const pageSize = useUiStore((state) => state.pageSizes?.products ?? 20);
  const setPageSize = useUiStore((state) => state.setPageSize);
  const lastSyncTime = useSyncStore((state) => state.lastSyncTime);
  const dark = useIsDarkTheme();
  const { width, height } = useWindowDimensions();
  const gridColumns = width < 700 ? 2 : 5;
  const gridCardWidth = (width - 32 - (gridColumns - 1) * 12) / gridColumns;
  const gridImageSize = Math.min(160, gridCardWidth - 24);
  const detailImageSize = Math.min(320, width * 0.32, height * 0.34);

  const loadProducts = useCallback(async () => {
    try {
      const filters: ProductFilter = { page, pageSize };
      if (search) filters.search = search;
      if (selectedCategoryId) filters.categoryId = selectedCategoryId;
      if (stockFilter === "In Stock") filters.stockStatus = "IN_STOCK";
      if (stockFilter === "Low") filters.stockStatus = "LOW";
      if (stockFilter === "Out of Stock") filters.stockStatus = "OUT_OF_STOCK";

      const result = await ProductService.search(filters);
      setProducts(Array.from(new Map<string, ProductDTO>(result.items.map((item) => [item.id, item])).values()));
      setTotalPages(result.totalPages || 1);
      setTotal(result.total);
    } catch {
      // keep empty
    }
  }, [search, selectedCategoryId, stockFilter, page, pageSize]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await ProductService.listCategories();
      setCategories(cats);
    } catch {
      // keep empty
    }
  }, []);

  const loadInventorySummary = useCallback(async () => {
    try {
      setInventorySummary(await ProductService.getInventorySummary());
    } catch {
      // Keep the zero summary when local inventory is unavailable.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await Promise.all([loadProducts(), loadCategories(), loadInventorySummary()]);
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [loadProducts, loadCategories, loadInventorySummary])
  );

  useEffect(() => {
    if (!lastSyncTime) return;
    void Promise.all([loadProducts(), loadInventorySummary()]);
  }, [lastSyncTime, loadProducts, loadInventorySummary]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategoryId, stockFilter]);

  const openDetail = useCallback(async (product: ProductDTO) => {
    setDetailLoading(true);
    setDetailProduct(product as ProductDetailDTO);
    setDetailBarcodes([]);
    try {
      const full = await ProductService.getById(product.id);
      if (full) {
        setDetailProduct(full as ProductDetailDTO);
        try {
          const barcodes = await BarcodeRepository.findByProduct(product.id);
          setDetailBarcodes(Array.from(new Map<string, BarcodeDTO>(barcodes.map((barcode) => [barcode.barcode, barcode])).values()));
        } catch { /* no barcodes */ }
      }
    } catch { /* use partial */ }
    setDetailLoading(false);
  }, []);

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    try {
      const product = await ProductService.getByBarcode(barcode);
      if (!product) {
        Alert.alert("Not Found", "No product matched that barcode.");
        return;
      }
      await openDetail(product);
    } catch {
      Alert.alert("Error", "Failed to look up product by barcode.");
    }
  }, [openDetail]);

  const stockBadge = (product: ProductDTO) => {
    const qty = (product as any).availableQty ?? 0;
    const min = (product as any).minimumStock ?? 0;
    if (qty <= 0) return { label: "Out of Stock", color: "#dc3545" };
    if (qty <= min) return { label: "Low Stock", color: "#ffc107" };
    return { label: "In Stock", color: "#28a745" };
  };

  const renderGridItem = ({ item }: { item: ProductDTO }) => {
    const badge = stockBadge(item);
    return (
      <TouchableOpacity onPress={() => openDetail(item)} activeOpacity={0.7}>
        <Card style={[styles.gridCard, { width: gridCardWidth, backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
          <View style={[styles.gridImagePlaceholder, { width: gridImageSize, height: gridImageSize }]}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" />
            ) : (
              <Ionicons name="fish" size={32} color="#17386b" />
            )}
          </View>
          <Text style={[styles.gridProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.gridProductPrice, { color: dark ? "#ffffff" : "#17386b" }]}>₱{(item.retailPrice ?? 0).toFixed(2)}</Text>
          <Text style={[styles.gridStockText, { color: dark ? "#94a3b8" : "#64748b" }]}>Available: {item.availableQty ?? 0}</Text>
          <Badge label={badge.label} color={badge.color} size="sm" style={{ marginTop: 6 }} />
        </Card>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: ProductDTO }) => {
    const badge = stockBadge(item);
    return (
      <TouchableOpacity onPress={() => openDetail(item)} activeOpacity={0.7}>
        <Card style={[styles.listCard, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
          <View style={styles.listRow}>
            <View style={styles.listImagePlaceholder}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" />
              ) : (
                <Ionicons name="fish" size={28} color="#17386b" />
              )}
            </View>
            <View style={styles.listInfo}>
              <Text style={[styles.listProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.listProductSku, { color: dark ? "#4a6785" : "#8e99a4" }]}>{item.sku}</Text>
              <View style={styles.listMeta}>
                <Text style={[styles.listProductPrice, { color: dark ? "#ffffff" : "#17386b" }]}>₱{(item.retailPrice ?? 0).toFixed(2)}</Text>
                <Badge label={badge.label} color={badge.color} size="sm" />
              </View>
              {item.categoryName && (
                <Text style={styles.listCategory}>{item.categoryName}</Text>
              )}
              <View style={styles.inventoryInlineRow}>
                <Text style={[styles.inventoryInlineText, { color: dark ? "#94a3b8" : "#64748b" }]}>Available {item.availableQty ?? 0}</Text>
                <Text style={[styles.inventoryInlineText, { color: dark ? "#94a3b8" : "#64748b" }]}>Min {item.minimumStock ?? 0}</Text>
                <Text style={[styles.inventoryInlineText, { color: dark ? "#94a3b8" : "#64748b" }]}>Allocated {item.allocatedQty ?? 0}</Text>
                <Text style={[styles.inventoryInlineText, { color: dark ? "#94a3b8" : "#64748b" }]}>Sold {item.soldQty ?? 0}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d9e6" />
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          <Ionicons name="chevron-back" size={18} color={page === 1 ? "#d1d9e6" : "#17386b"} />
        </TouchableOpacity>

        {start > 1 && (
          <>
            <TouchableOpacity style={styles.pageNum} onPress={() => setPage(1)}>
              <Text style={styles.pageNumText}>1</Text>
            </TouchableOpacity>
            {start > 2 && <Text style={styles.pageEllipsis}>...</Text>}
          </>
        )}

        {pages.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.pageNum, p === page && styles.pageNumActive]}
            onPress={() => setPage(p)}
          >
            <Text style={[styles.pageNumText, p === page && styles.pageNumTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <Text style={styles.pageEllipsis}>...</Text>}
            <TouchableOpacity style={styles.pageNum} onPress={() => setPage(totalPages)}>
              <Text style={styles.pageNumText}>{totalPages}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
          onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          <Ionicons name="chevron-forward" size={18} color={page === totalPages ? "#d1d9e6" : "#17386b"} />
        </TouchableOpacity>
      </View>
    );
  };

  const allCategories = [{ id: null, name: "All" } as any, ...categories];

  const groupedProducts = React.useMemo(() => {
    const groups = new Map<string, ProductDTO[]>();
    for (const p of products) {
      const key = (p.productCode ? p.productCode : p.name).toLowerCase().trim();
      const arr = groups.get(key);
      if (arr) arr.push(p);
      else groups.set(key, [p]);
    }
    const grouped = Array.from(groups.values()).map((g) => {
      g.sort((a, b) => a.name.localeCompare(b.name) || (a.retailPrice ?? 0) - (b.retailPrice ?? 0));
      return g;
    });
    grouped.sort((a, b) => a[0].name.localeCompare(b[0].name));
    return grouped;
  }, [products]);

  const groupTotalPages = Math.max(1, Math.ceil(groupedProducts.length / pageSize));
  const pagedGroups = React.useMemo(
    () => groupedProducts.slice((page - 1) * pageSize, page * pageSize),
    [groupedProducts, page, pageSize]
  );

  const handleGroupPress = useCallback(
    (group: ProductDTO[]) => {
      if (group.length === 1) {
        openDetail(group[0]);
      } else {
        setVariationGroup(group);
      }
    },
    [openDetail]
  );

  const renderGridGroup = ({ item: group }: { item: ProductDTO[] }) => {
    const isMulti = group.length > 1;
    const base = group[0];
    const totalStock = group.reduce((s, p) => s + (p.availableQty ?? 0), 0);
    const minPrice = Math.min(...group.map((p) => p.retailPrice ?? 0));
    const maxPrice = Math.max(...group.map((p) => p.retailPrice ?? 0));
    const priceText = isMulti ? `₱${minPrice.toFixed(2)} - ₱${maxPrice.toFixed(2)}` : `₱${(base.retailPrice ?? 0).toFixed(2)}`;
    const badge = stockBadge(base);
    const totalBadge = isMulti ? { label: `${group.length} variations`, color: "#6f42c1" } : badge;
    return (
      <TouchableOpacity onPress={() => handleGroupPress(group)} activeOpacity={0.7}>
        <Card style={[styles.gridCard, { width: gridCardWidth, backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
          <View style={[styles.gridImagePlaceholder, { width: gridImageSize, height: gridImageSize }]}>
            {base.imageUrl ? (
              <Image source={{ uri: base.imageUrl }} style={styles.productImage} resizeMode="contain" />
            ) : (
              <Ionicons name="fish" size={32} color="#17386b" />
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <Text style={[styles.gridProductName, { color: dark ? "#e2e8f0" : "#1a202c", flex: 1 }]} numberOfLines={2}>{base.name}</Text>
            {isMulti && <Ionicons name="layers-outline" size={14} color="#6f42c1" />}
          </View>
          {isMulti && <Badge label={`${group.length} variations`} color="#6f42c1" size="sm" style={{ marginTop: 4, alignSelf: "flex-start" }} />}
          <Text style={[styles.gridProductPrice, { color: dark ? "#ffffff" : "#17386b" }]}>{priceText}</Text>
          <Text style={[styles.gridStockText, { color: dark ? "#94a3b8" : "#64748b" }]}>Available: {isMulti ? totalStock : base.availableQty ?? 0}</Text>
          <Badge label={totalBadge.label} color={totalBadge.color} size="sm" style={{ marginTop: 6 }} />
          {isMulti && (
            <Text style={[styles.gridStockText, { color: dark ? "#94a3b8" : "#64748b", fontSize: 10 }]} numberOfLines={1}>
              {group.map((g) => `${g.sku}${g.weight ? ` ${g.weight}${g.unitName ?? ""}` : ""}`).join(" • ")}
            </Text>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  const renderListGroup = ({ item: group }: { item: ProductDTO[] }) => {
    const isMulti = group.length > 1;
    const base = group[0];
    const totalStock = group.reduce((s, p) => s + (p.availableQty ?? 0), 0);
    const minPrice = Math.min(...group.map((p) => p.retailPrice ?? 0));
    const maxPrice = Math.max(...group.map((p) => p.retailPrice ?? 0));
    const priceText = isMulti ? `₱${minPrice.toFixed(2)} - ₱${maxPrice.toFixed(2)}` : `₱${(base.retailPrice ?? 0).toFixed(2)}`;
    return (
      <TouchableOpacity onPress={() => handleGroupPress(group)} activeOpacity={0.7}>
        <Card style={[styles.listCard, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
          <View style={styles.listRow}>
            <View style={styles.listImagePlaceholder}>
              {base.imageUrl ? (
                <Image source={{ uri: base.imageUrl }} style={styles.productImage} resizeMode="contain" />
              ) : (
                <Ionicons name="fish" size={28} color="#17386b" />
              )}
            </View>
            <View style={styles.listInfo}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.listProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{base.name}</Text>
                {isMulti && <Badge label={`${group.length} var`} color="#6f42c1" size="sm" />}
              </View>
              <Text style={[styles.listProductSku, { color: dark ? "#4a6785" : "#8e99a4" }]}>{base.sku}{isMulti ? ` +${group.length - 1} more` : ""}</Text>
              <View style={styles.listMeta}>
                <Text style={[styles.listProductPrice, { color: dark ? "#ffffff" : "#17386b" }]}>{priceText}</Text>
                <Badge label={isMulti ? `Stock:${totalStock}` : stockBadge(base).label} color={isMulti ? "#6f42c1" : stockBadge(base).color} size="sm" />
              </View>
              {base.categoryName && <Text style={styles.listCategory}>{base.categoryName}</Text>}
            </View>
            <Ionicons name={isMulti ? "chevron-forward" : "chevron-forward"} size={18} color="#d1d9e6" />
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]}>
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: dark ? "#f5f7fa" : "#151a22" }]}>Products</Text>
          <Text style={[styles.pageSubtitle, { color: dark ? "#8f99a8" : "#667080" }]}>Browse pricing, availability, and product details</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: dark ? "#18202c" : "#e8edf3" }]}>
          <Text style={[styles.countBadgeText, { color: dark ? "#d8dee8" : "#334155" }]}>{total} products</Text>
        </View>
      </View>
      <View style={styles.searchTools}>
        <View style={[styles.searchBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
          <Ionicons name="search" size={18} color={dark ? "#4a6785" : "#8e99a4"} />
          <TextInput
            style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
            placeholder="Search products..."
            placeholderTextColor={dark ? "#4a6785" : "#b0b8c1"}
            value={search}
            onChangeText={(t) => { setSearch(t); setPage(1); }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={18} color={dark ? "#4a6785" : "#8e99a4"} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)} accessibilityLabel="Scan product barcode">
          <Ionicons name="scan" size={21} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <Text style={[styles.filterLabel, { color: dark ? "#94a3b8" : "#64748b" }]}>Category</Text>
        <View style={styles.filterPills}>
          <FlatList
            data={allCategories}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterContent}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.filterChip, { backgroundColor: dark ? "#0d1b2e" : "#f0f4ff", borderColor: dark ? "#1a2a42" : "#e2e8f0" }, selectedCategoryId === cat.id && styles.filterChipActive]}
                onPress={() => { setSelectedCategoryId(cat.id); setPage(1); }}
              >
                <Text style={[styles.filterText, { color: dark ? "#b8c2cf" : "#526174" }, selectedCategoryId === cat.id && styles.filterTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id ?? "all"}
          />
        </View>
        <View
          style={[
            styles.viewToggle,
            {
              backgroundColor: dark ? "#141922" : "#eef2f7",
              borderColor: dark ? "#334155" : "#d8e0ea",
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "grid" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons name="grid" size={18} color={viewMode === "grid" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("list")}
          >
            <Ionicons name="list" size={18} color={viewMode === "list" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.stockFilterLine}>
        <Text style={[styles.filterLabel, { color: dark ? "#94a3b8" : "#64748b" }]}>Stock</Text>
        <FlatList
          data={STOCK_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.stockFilterRow}
          contentContainerStyle={styles.stockFilterContent}
          renderItem={({ item: sf }) => (
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: dark ? "#0d1b2e" : "#f0f4ff", borderColor: dark ? "#1a2a42" : "#e2e8f0" }, stockFilter === sf && styles.filterChipActive]}
              onPress={() => { setStockFilter(sf); setPage(1); }}
            >
              <Text style={[styles.filterText, { color: dark ? "#b8c2cf" : "#526174" }, stockFilter === sf && styles.filterTextActive]}>
                {sf}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item}
        />
      </View>

      <View style={styles.summaryRow}>
        {[
          { label: "Products", value: inventorySummary.totalProducts, icon: "cube-outline", color: "#2563eb" },
          { label: "Available Units", value: inventorySummary.totalAvailable, icon: "layers-outline", color: "#16a34a" },
          { label: "Low Stock", value: inventorySummary.lowStock, icon: "alert-circle-outline", color: "#d97706" },
          { label: "Out of Stock", value: inventorySummary.outOfStock, icon: "close-circle-outline", color: "#dc2626" },
        ].map((metric) => (
          <View key={metric.label} style={[styles.summaryItem, { backgroundColor: dark ? "#111827" : "#ffffff", borderColor: dark ? "#263244" : "#dfe5ec" }]}>
            <Ionicons name={metric.icon as any} size={18} color={metric.color} />
            <View>
              <Text style={[styles.summaryValue, { color: dark ? "#f8fafc" : "#172033" }]}>{metric.value}</Text>
              <Text style={[styles.summaryLabel, { color: dark ? "#94a3b8" : "#64748b" }]}>{metric.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      ) : viewMode === "grid" ? (
        <FlatList
          key={`grid-${gridColumns}`}
          data={pagedGroups}
          renderItem={renderGridGroup}
          keyExtractor={(item: ProductDTO[]) => item[0].id}
          numColumns={gridColumns}
          contentContainerStyle={styles.gridList}
          columnWrapperStyle={styles.gridRow}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="#d1d9e6" />
              <Text style={styles.emptyText}>No products found</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          key="list"
          data={pagedGroups}
          renderItem={renderListGroup}
          keyExtractor={(item: ProductDTO[]) => item[0].id}
          numColumns={1}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="#d1d9e6" />
              <Text style={styles.emptyText}>No products found</Text>
            </View>
          }
        />
      )}

      <PaginationControls
        page={page}
        totalPages={groupTotalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize("products", size);
          setPage(1);
        }}
        dark={dark}
      />

      <Modal visible={!!variationGroup} transparent animationType="fade" onRequestClose={() => setVariationGroup(null)}>
        <View style={styles.variationModalOverlay}>
          <View style={[styles.variationModal, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
            <View style={styles.variationModalHeader}>
              <View style={styles.variationModalHeading}>
                <Text style={[styles.variationModalTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{variationGroup?.[0].name}</Text>
                <Text style={[styles.variationModalSubtitle, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>{variationGroup?.length} variations</Text>
              </View>
              <TouchableOpacity style={styles.variationCloseBtn} onPress={() => setVariationGroup(null)}>
                <Ionicons name="close" size={20} color={dark ? "#94a3b8" : "#6b7b8d"} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.variationList} showsVerticalScrollIndicator={false}>
              {variationGroup?.map((variant) => {
                const badge = stockBadge(variant);
                return (
                  <TouchableOpacity
                    key={variant.id}
                    style={[styles.variationRow, { backgroundColor: dark ? "#0f1729" : "#f8fafc", borderColor: dark ? "#1e293b" : "#e2e8f0" }]}
                    onPress={() => {
                      setVariationGroup(null);
                      openDetail(variant);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.variationImageWrap}>
                      {variant.imageUrl ? (
                        <Image source={{ uri: variant.imageUrl }} style={styles.variationImage} resizeMode="contain" />
                      ) : (
                        <Ionicons name="fish" size={24} color="#17386b" />
                      )}
                    </View>
                    <View style={styles.variationInfo}>
                      <Text style={[styles.variationName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>
                        {variant.sku}
                        {variant.weight ? ` • ${variant.weight}${variant.unitName ?? ""}` : ""}
                        {variant.description ? ` • ${variant.description}` : ""}
                      </Text>
                      <Text style={[styles.variationPrice, { color: dark ? "#ffffff" : "#17386b" }]}>₱{(variant.retailPrice ?? 0).toFixed(2)}</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                        <Badge label={badge.label} color={badge.color} size="sm" />
                        <Text style={[styles.variationStock, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>Stock: {variant.availableQty ?? 0}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BarcodeScannerModal
        visible={scannerVisible}
        dark={dark}
        onClose={() => setScannerVisible(false)}
        onScan={handleBarcodeScan}
      />

      <Modal
        visible={!!detailProduct}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailProduct(null)}
      >
        {detailLoading ? (
          <View style={styles.detailLoadingContainer}>
            <ActivityIndicator size="large" color="#17386b" />
          </View>
        ) : detailProduct ? (
          <View style={[styles.detailContainer, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
            <View style={[styles.detailHeader, { backgroundColor: dark ? "#0d1b2e" : "#ffffff", borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
              <TouchableOpacity onPress={() => setDetailProduct(null)} style={styles.detailBackBtn}>
                <Ionicons name="close" size={22} color="#17386b" />
              </TouchableOpacity>
              <Text style={[styles.detailHeaderTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Product Details</Text>
            </View>

            <View style={[styles.detailBody, width < 700 && styles.detailBodyPortrait]}>
              <ScrollView
                style={[
                styles.detailIdentity,
                width < 700 && styles.detailIdentityPortrait,
                { borderColor: dark ? "#1a2a42" : "#e8edf3" },
                ]}
                contentContainerStyle={styles.detailIdentityContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={[styles.detailImagePlaceholder, { width: detailImageSize, height: detailImageSize }]}>
                  {detailProduct.imageUrl ? (
                    <Image source={{ uri: detailProduct.imageUrl }} style={styles.productImage} resizeMode="contain" />
                  ) : (
                    <Ionicons name="fish" size={64} color="#17386b" />
                  )}
                </View>

                <Text style={[styles.detailProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.name}</Text>
                <View style={[styles.detailBarcodeCard, { backgroundColor: dark ? "#0d1b2e" : "#ffffff", borderColor: dark ? "#1a2a42" : "#e8edf3" }]}>
                  <View style={styles.barcodeFooterHeading}>
                    <Ionicons name="barcode-outline" size={20} color={dark ? "#8fb4e8" : "#17386b"} />
                    <Text style={[styles.barcodeFooterTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Variation Barcode</Text>
                  </View>
                  {detailBarcodes.length > 0 ? detailBarcodes.map((bc, index) => (
                    <View key={`${bc.barcode}-${index}`} style={[styles.barcodeRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                      <Code128Barcode value={bc.barcode} height={68} dark={dark} />
                      <View style={styles.barcodeCaption}>
                        <Text style={[styles.barcodeText, { color: dark ? "#f8fafc" : "#1a202c" }]} selectable>{bc.barcode}</Text>
                        <Text style={[styles.barcodeType, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{bc.type}</Text>
                      </View>
                    </View>
                  )) : (
                    <Text style={[styles.barcodeEmptyText, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>No barcode received from OMS</Text>
                  )}
                </View>
              </ScrollView>

              <ScrollView style={styles.detailInformation} contentContainerStyle={styles.detailScroll}>
                <Text style={[styles.detailColumnTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Product Information</Text>
                <View style={[styles.detailSection, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
                <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                  <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>SKU</Text>
                  <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.sku}</Text>
                </View>
                {detailProduct.categoryName && (
                  <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                    <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Category</Text>
                    <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.categoryName}</Text>
                  </View>
                )}
                {detailProduct.weight != null && (
                  <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                    <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Weight</Text>
                    <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>
                      {detailProduct.weight}
                      {detailProduct.unitName ? ` ${detailProduct.unitName}` : ""}
                    </Text>
                  </View>
                )}
                {detailProduct.brandName && (
                  <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                    <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Brand</Text>
                    <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.brandName}</Text>
                  </View>
                )}
                {detailProduct.unitName && (
                  <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                    <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Unit</Text>
                    <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.unitName}</Text>
                  </View>
                )}
                <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                  <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Price</Text>
                  <Text style={[styles.detailInfoValueBold, { color: dark ? "#ffffff" : "#17386b" }]}>₱{(detailProduct.retailPrice ?? 0).toFixed(2)}</Text>
                </View>
                {detailProduct.description && (
                  <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                    <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Description</Text>
                    <Text style={[styles.detailInfoValue, { flex: 1, textAlign: "right", color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={3}>
                      {detailProduct.description}
                    </Text>
                  </View>
                )}
                </View>

                <Text style={[styles.detailColumnTitle, styles.inventoryTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Inventory</Text>
                <View style={[styles.detailSection, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
                  {[
                    ["Available", detailProduct.availableQty ?? 0],
                    ["Minimum", detailProduct.minimumStock ?? 0],
                    ["Allocated", detailProduct.allocatedQty ?? 0],
                    ["Reserved", detailProduct.reservedQty ?? 0],
                    ["Sold", detailProduct.soldQty ?? 0],
                    ["Damaged", detailProduct.damagedQty ?? 0],
                    ["Adjustments", detailProduct.adjustmentQty ?? 0],
                    ["Maximum", detailProduct.maximumStock ?? 0],
                  ].map(([label, value]) => (
                    <View key={String(label)} style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                      <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{label}</Text>
                      <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{value}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7b8d",
    marginTop: 8,
  },
  searchTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: "#1a202c",
  },
  scanBtn: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    minHeight: 38,
    marginBottom: 6,
    gap: 8,
  },
  filterLabel: {
    width: 58,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  filterPills: {
    flex: 1,
    minWidth: 0,
  },
  categoryFilterContent: {
    alignItems: "center",
    gap: 8,
  },
  viewToggle: {
    flexDirection: "row",
    width: 76,
    height: 36,
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  viewToggleBtn: {
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleBtnActive: {
    backgroundColor: "#17386b",
  },
  filterRow: {
    maxHeight: 44,
  },
  stockFilterRow: {
    flex: 1,
    flexGrow: 0,
  },
  stockFilterLine: {
    minHeight: 38,
    marginBottom: 6,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stockFilterContent: {
    gap: 8,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: 14,
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: "#6b7b8d",
    includeFontPadding: false,
  },
  filterTextActive: {
    color: "#ffffff",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    minWidth: 140,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  summaryLabel: {
    fontSize: 10,
    marginTop: 1,
  },
  gridList: {
    padding: 12,
    paddingBottom: 8,
  },
  gridRow: {
    justifyContent: "flex-start",
    gap: 12,
  },
  gridCard: {
    padding: 12,
    marginBottom: 12,
  },
  gridImagePlaceholder: {
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "hidden",
    alignSelf: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  gridProductName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
    minHeight: 34,
  },
  gridProductPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
    marginTop: 4,
  },
  gridStockText: {
    fontSize: 11,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  listCard: {
    padding: 14,
    marginBottom: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    overflow: "hidden",
  },
  listInfo: {
    flex: 1,
  },
  listProductName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a202c",
  },
  listProductSku: {
    fontSize: 11,
    color: "#8e99a4",
    marginTop: 2,
  },
  listMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  listProductPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
  },
  listCategory: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 4,
  },
  inventoryInlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 5,
  },
  inventoryInlineText: {
    fontSize: 10,
    fontWeight: "600",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  pageBtnDisabled: {
    opacity: 0.5,
  },
  pageNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  pageNumActive: {
    backgroundColor: "#17386b",
  },
  pageNumText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7b8d",
  },
  pageNumTextActive: {
    color: "#ffffff",
  },
  pageEllipsis: {
    fontSize: 13,
    color: "#6b7b8d",
    paddingHorizontal: 4,
  },
  detailLoadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailContainer: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  detailBody: {
    flex: 1,
    flexDirection: "row",
  },
  detailBodyPortrait: {
    flexDirection: "column",
  },
  detailIdentity: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: 1,
  },
  detailIdentityContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  detailIdentityPortrait: {
    borderRightWidth: 0,
    borderBottomWidth: 1,
  },
  detailInformation: {
    flex: 1,
    minWidth: 0,
  },
  detailColumnTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  detailBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1a202c",
  },
  detailScroll: {
    padding: 20,
    flexGrow: 1,
  },
  detailImagePlaceholder: {
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    overflow: "hidden",
    alignSelf: "center",
  },
  detailProductName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
    textAlign: "center",
  },
  detailBarcodeCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  detailSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inventoryTitle: {
    marginTop: 2,
  },
  detailInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  detailInfoLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  detailInfoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1a202c",
    maxWidth: "60%",
    textAlign: "right",
  },
  detailInfoValueBold: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 12,
  },
  barcodeRow: {
    width: "100%",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  barcodeCaption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  barcodeText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a202c",
    fontFamily: "monospace",
  },
  barcodeType: {
    fontSize: 12,
    color: "#6b7b8d",
  },
  barcodeFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  barcodeFooterHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  barcodeFooterTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  barcodeEmptyText: {
    fontSize: 13,
    paddingVertical: 8,
  },
  variationModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  variationModal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    borderRadius: 12,
    padding: 16,
  },
  variationModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  variationModalHeading: {
    flex: 1,
    marginRight: 12,
  },
  variationModalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  variationModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  variationCloseBtn: {
    padding: 4,
  },
  variationList: {
    marginTop: 12,
    maxHeight: 400,
  },
  variationRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  variationImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  variationImage: {
    width: "100%",
    height: "100%",
  },
  variationInfo: {
    flex: 1,
  },
  variationName: {
    fontSize: 13,
    fontWeight: "600",
  },
  variationPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#17386b",
    marginTop: 2,
  },
  variationStock: {
    fontSize: 11,
    marginTop: 2,
  },
});
