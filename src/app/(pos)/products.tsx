import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const { width } = Dimensions.get("window");

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
  minStock: number;
}

const DEMO_PRODUCTS: Product[] = [
  { id: "1", name: "Fresh Salmon Fillet", sku: "SAL-001", price: 450, stock: 50, category: "Fish", minStock: 10 },
  { id: "2", name: "Tuna Belly (Toro)", sku: "TUN-001", price: 680, stock: 30, category: "Fish", minStock: 8 },
  { id: "3", name: "Shrimp (Large)", sku: "SHR-001", price: 320, stock: 100, category: "Shellfish", minStock: 15 },
  { id: "4", name: "Squid (Fresh)", sku: "SQU-001", price: 220, stock: 75, category: "Seafood", minStock: 12 },
  { id: "5", name: "Milkfish (Bangus)", sku: "MIL-001", price: 150, stock: 60, category: "Fish", minStock: 10 },
  { id: "6", name: "Crab (Mud Crab)", sku: "CRA-001", price: 380, stock: 5, category: "Shellfish", minStock: 8 },
  { id: "7", name: "Octopus (Small)", sku: "OCT-001", price: 290, stock: 40, category: "Seafood", minStock: 10 },
  { id: "8", name: "Fish Balls (Pack)", sku: "FBA-001", price: 120, stock: 200, category: "Processed", minStock: 30 },
  { id: "9", name: "Squid Rings (Pack)", sku: "SRG-001", price: 180, stock: 80, category: "Processed", minStock: 20 },
  { id: "10", name: "Prawns (Jumbo)", sku: "PRW-001", price: 520, stock: 0, category: "Shellfish", minStock: 10 },
];

const CATEGORIES = ["All", "Fish", "Shellfish", "Seafood", "Processed"];
const STOCK_FILTERS = ["All", "In Stock", "Low", "Out of Stock"];

export default function ProductsScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = DEMO_PRODUCTS.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    let matchesStock = true;
    if (stockFilter === "In Stock") matchesStock = p.stock > p.minStock;
    if (stockFilter === "Low") matchesStock = p.stock > 0 && p.stock <= p.minStock;
    if (stockFilter === "Out of Stock") matchesStock = p.stock === 0;
    return matchesSearch && matchesCategory && matchesStock;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stockStatus = (stock: number, min: number) => {
    if (stock === 0) return { label: "Out of Stock", color: "#dc3545" };
    if (stock <= min) return { label: "Low Stock", color: "#ffc107" };
    return { label: "In Stock", color: "#28a745" };
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const status = stockStatus(item.stock, item.minStock);
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
              <Text style={styles.productPrice}>₱{item.price.toFixed(2)}</Text>
              <Badge label={status.label} color={status.color} size="sm" />
            </View>
            <Text style={styles.stockText}>Stock: {item.stock}</Text>
          </View>
        </View>
      </Card>
    );
  };

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
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => { setSelectedCategory(cat); setPage(1); }}
          >
            <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item}
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

      <FlatList
        data={paginated}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />

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
