import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductService } from "@/lib/services/product.service";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { useUiStore } from "@/lib/stores/ui-store";
import type { ProductDTO, ProductDetailDTO, CategoryDTO, BarcodeDTO } from "@/lib/types/inventory";

const { width } = Dimensions.get("window");
const GRID_COLUMNS = 2;
const GRID_CARD_WIDTH = (width - 48) / GRID_COLUMNS;

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
  const [loading, setLoading] = useState(true);
  const [detailProduct, setDetailProduct] = useState<ProductDetailDTO | null>(null);
  const [detailBarcodes, setDetailBarcodes] = useState<BarcodeDTO[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageSize = 20;
  const dark = useUiStore((s) => s.themeMode) === "dark";

  const loadProducts = useCallback(async () => {
    try {
      const filters: any = { page, pageSize };
      if (search) filters.search = search;
      if (selectedCategoryId) filters.categoryId = selectedCategoryId;

      const result = await ProductService.search(filters);
      let items = result.items;

      if (stockFilter === "In Stock") items = items.filter((p: any) => (p.availableQty ?? 0) > 0);
      else if (stockFilter === "Low") items = items.filter((p: any) => (p.availableQty ?? 0) > 0 && (p.availableQty ?? 0) <= (p.minimumStock ?? 0));
      else if (stockFilter === "Out of Stock") items = items.filter((p: any) => (p.availableQty ?? 0) <= 0);

      setProducts(items);
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadProducts(), loadCategories()]);
      setLoading(false);
    })();
  }, [loadProducts, loadCategories]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategoryId, stockFilter]);

  useEffect(() => {
    loadProducts();
  }, [page, loadProducts]);

  const openDetail = useCallback(async (product: ProductDTO) => {
    setDetailLoading(true);
    setDetailProduct(null);
    setDetailBarcodes([]);
    try {
      const full = await ProductService.getById(product.id);
      if (full) {
        setDetailProduct(full as ProductDetailDTO);
        try {
          const barcodes = await BarcodeRepository.findByProduct(product.id);
          setDetailBarcodes(barcodes);
        } catch { /* no barcodes */ }
      }
    } catch { /* use partial */ }
    setDetailLoading(false);
  }, []);

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
        <Card style={[styles.gridCard, { backgroundColor: dark ? "#0d1b2e" : "#ffffff" }]}>
          <View style={styles.gridImagePlaceholder}>
            <Ionicons name="fish" size={32} color="#17386b" />
          </View>
          <Text style={[styles.gridProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.gridProductPrice}>₱{(item.retailPrice ?? 0).toFixed(2)}</Text>
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
              <Ionicons name="fish" size={28} color="#17386b" />
            </View>
            <View style={styles.listInfo}>
              <Text style={[styles.listProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.listProductSku, { color: dark ? "#4a6785" : "#8e99a4" }]}>{item.sku}</Text>
              <View style={styles.listMeta}>
                <Text style={styles.listProductPrice}>₱{(item.retailPrice ?? 0).toFixed(2)}</Text>
                <Badge label={badge.label} color={badge.color} size="sm" />
              </View>
              {item.categoryName && (
                <Text style={styles.listCategory}>{item.categoryName}</Text>
              )}
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

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
      <View style={[styles.searchBar, { backgroundColor: dark ? "#0d1b2e" : "#ffffff", borderColor: dark ? "#1a2a42" : "#e2e8f0" }]}>
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

      <View style={styles.toggleRow}>
        <View style={styles.filterPills}>
          <FlatList
            data={allCategories}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.filterChip, { backgroundColor: dark ? "#0d1b2e" : "#f0f4ff", borderColor: dark ? "#1a2a42" : "#e2e8f0" }, selectedCategoryId === cat.id && styles.filterChipActive]}
                onPress={() => { setSelectedCategoryId(cat.id); setPage(1); }}
              >
                <Text style={[styles.filterText, { color: dark ? "#8e99a4" : "#6b7b8d" }, selectedCategoryId === cat.id && styles.filterTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id ?? "all"}
          />
        </View>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "grid" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons name="grid" size={18} color={viewMode === "grid" ? "#ffffff" : "#6b7b8d"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("list")}
          >
            <Ionicons name="list" size={18} color={viewMode === "list" ? "#ffffff" : "#6b7b8d"} />
          </TouchableOpacity>
        </View>
      </View>

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
            <Text style={[styles.filterText, { color: dark ? "#8e99a4" : "#6b7b8d" }, stockFilter === sf && styles.filterTextActive]}>
              {sf}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      ) : viewMode === "grid" ? (
        <FlatList
          key="grid"
          data={products}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
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
          data={products}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
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

      {totalPages > 1 && renderPageNumbers()}

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
              <Text style={[styles.detailHeaderTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{detailProduct.name}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.detailScroll}>
              <View style={styles.detailImagePlaceholder}>
                <Ionicons name="fish" size={64} color="#17386b" />
              </View>

              <Text style={[styles.detailProductName, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{detailProduct.name}</Text>

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
                  <Text style={[styles.detailInfoValueBold]}>₱{(detailProduct.retailPrice ?? 0).toFixed(2)}</Text>
                </View>
                <View style={[styles.detailInfoRow, { borderBottomColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
                  <Text style={[styles.detailInfoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Stock Level</Text>
                  <Text style={[styles.detailInfoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{(detailProduct as any).availableQty ?? 0}</Text>
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

              {detailBarcodes.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Barcodes</Text>
                  {detailBarcodes.map((bc) => (
                    <View key={bc.id} style={styles.barcodeRow}>
                      <Text style={styles.barcodeText}>{bc.barcode}</Text>
                      <Text style={styles.barcodeType}>{bc.type}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
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
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    margin: 16,
    marginBottom: 8,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterPills: {
    flex: 1,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "#f0f4ff",
    borderRadius: 8,
    marginLeft: 8,
  },
  viewToggleBtn: {
    padding: 8,
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: "#17386b",
  },
  filterRow: {
    maxHeight: 44,
  },
  stockFilterRow: {
    maxHeight: 44,
    marginBottom: 4,
  },
  stockFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7b8d",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  gridList: {
    padding: 12,
    paddingBottom: 8,
  },
  gridRow: {
    justifyContent: "space-between",
  },
  gridCard: {
    width: GRID_CARD_WIDTH,
    padding: 12,
    marginBottom: 12,
  },
  gridImagePlaceholder: {
    width: "100%",
    height: 100,
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
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
  },
  detailImagePlaceholder: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  detailProductName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
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
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
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
});
