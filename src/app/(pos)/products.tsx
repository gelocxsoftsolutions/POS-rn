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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductService } from "@/lib/services/product.service";
import type { ProductDTO, CategoryDTO } from "@/lib/types/inventory";

const { width } = Dimensions.get("window");

const STOCK_FILTERS = ["All", "In Stock", "Low", "Out of Stock"];

export default function ProductsScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const loadProducts = useCallback(async () => {
    try {
      const filters: any = { page, pageSize };
      if (search) filters.search = search;
      if (selectedCategoryId) filters.categoryId = selectedCategoryId;
      if (stockFilter === "In Stock") filters.stockStatus = "in_stock";
      if (stockFilter === "Low") filters.stockStatus = "low";
      if (stockFilter === "Out of Stock") filters.stockStatus = "out_of_stock";

      const result = await ProductService.search(filters);
      setProducts(result.items);
      setTotalPages(result.totalPages || 1);
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

  const stockStatus = (product: ProductDTO) => {
    const stock = product.retailPrice ?? 0;
    if (stock === 0) return { label: "Out of Stock", color: "#dc3545" };
    return { label: "In Stock", color: "#28a745" };
  };

  const renderProduct = ({ item }: { item: ProductDTO }) => {
    const status = stockStatus(item);
    return (
      <Card style={styles.productCard}>
        <View style={styles.productRow}>
          <View style={styles.productImage}>
            <Ionicons name="fish" size={28} color="#17386b" />
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.productSku}>{item.sku}</Text>
            <View style={styles.productMeta}>
              <Text style={styles.productPrice}>₱{(item.retailPrice ?? 0).toFixed(2)}</Text>
              <Badge label={status.label} color={status.color} size="sm" />
            </View>
            {item.categoryName && (
              <Text style={styles.stockText}>Category: {item.categoryName}</Text>
            )}
          </View>
        </View>
      </Card>
    );
  };

  const allCategories = [{ id: null, name: "All" } as any, ...categories];

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#b0b8c1"
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
            <Ionicons name="close-circle" size={18} color="#8e99a4" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={allCategories}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.filterChip, selectedCategoryId === cat.id && styles.filterChipActive]}
            onPress={() => { setSelectedCategoryId(cat.id); setPage(1); }}
          >
            <Text style={[styles.filterText, selectedCategoryId === cat.id && styles.filterTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.id ?? "all"}
      />

      <FlatList
        data={STOCK_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.stockFilterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: sf }) => (
          <TouchableOpacity
            style={[styles.filterChip, stockFilter === sf && styles.filterChipActive]}
            onPress={() => { setStockFilter(sf); setPage(1); }}
          >
            <Text style={[styles.filterText, stockFilter === sf && styles.filterTextActive]}>
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
      ) : (
        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="#d1d9e6" />
              <Text style={styles.emptyText}>No products found</Text>
            </View>
          }
        />
      )}

      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <Ionicons name="chevron-back" size={18} color={page === 1 ? "#d1d9e6" : "#17386b"} />
          </TouchableOpacity>
          <Text style={styles.pageText}>{page} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <Ionicons name="chevron-forward" size={18} color={page === totalPages ? "#d1d9e6" : "#17386b"} />
          </TouchableOpacity>
        </View>
      )}
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
  filterRow: {
    maxHeight: 44,
  },
  stockFilterRow: {
    maxHeight: 44,
    marginBottom: 8,
  },
  filterContent: {
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
  list: {
    padding: 16,
    paddingTop: 8,
  },
  productCard: {
    padding: 14,
    marginBottom: 10,
  },
  productRow: {
    flexDirection: "row",
  },
  productImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a202c",
  },
  productSku: {
    fontSize: 11,
    color: "#8e99a4",
    marginTop: 2,
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
  },
  stockText: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 4,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
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
  pageText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7b8d",
  },
});
