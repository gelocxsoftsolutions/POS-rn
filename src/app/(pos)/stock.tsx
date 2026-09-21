import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarcodeScannerModal } from "@/components/ui/barcode-scanner-modal";
import { InventoryService } from "@/lib/services/inventory.service";
import { ProductService } from "@/lib/services/product.service";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import type { InventoryDTO, ProductDTO } from "@/lib/types/inventory";

interface StockDisplayItem {
  id: string;
  name: string;
  sku: string;
  available: number;
  minimum: number;
  allocated: number;
  sold: number;
  imageUrl?: string;
}

export default function StockScreen() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [stockItems, setStockItems] = useState<StockDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannerVisible, setScannerVisible] = useState(false);
  const dark = useIsDarkTheme();
  const { width } = useWindowDimensions();
  const gridColumns = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const gridCardWidth = (width - 32 - (gridColumns - 1) * 12) / gridColumns;
  const gridImageSize = Math.min(128, gridCardWidth - 32);

  const loadData = useCallback(async () => {
    try {
      const [inventory, products] = await Promise.all([
        InventoryService.listAll(),
        ProductService.search({ page: 1, pageSize: 500 }),
      ]);

      const productMap = new Map<string, ProductDTO>();
      for (const p of products.items) {
        productMap.set(p.id, p);
      }

      const displayItems: StockDisplayItem[] = inventory.map((inv: InventoryDTO) => {
        const product = productMap.get(inv.productId);
        return {
          id: inv.id,
          name: product?.name ?? "Unknown Product",
          sku: product?.sku ?? "",
          available: inv.availableQty,
          minimum: inv.minimumStock,
          allocated: inv.allocatedQty,
          sold: inv.soldQty,
          imageUrl: product?.imageUrl ?? undefined,
        };
      });

      setStockItems(displayItems);
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    try {
      const product = await ProductService.getByBarcode(barcode);
      if (!product) {
        Alert.alert("Not Found", "No stock item matched that barcode.");
        return;
      }
      setSearch(product.sku);
    } catch {
      Alert.alert("Error", "Failed to look up stock by barcode.");
    }
  }, []);

  const filtered = stockItems.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.sku.toLowerCase().includes(search.toLowerCase())
  );

  const stockStatus = (item: StockDisplayItem) => {
    if (item.available === 0) return { label: "Out of Stock", color: "#dc3545" };
    if (item.available <= item.minimum) return { label: "Low Stock", color: "#ffc107" };
    return { label: "In Stock", color: "#28a745" };
  };

  const renderStock = ({ item }: { item: StockDisplayItem }) => {
    const status = stockStatus(item);
    const isLow = item.available <= item.minimum && item.available > 0;
    const isOut = item.available === 0;
    return (
      <Card
        style={[
          styles.stockCard,
          viewMode === "grid" && styles.stockGridCard,
          viewMode === "grid" && { width: gridCardWidth },
          { backgroundColor: dark ? "#0d1b2e" : "#ffffff" },
          (isLow || isOut) && styles.stockCardAlert,
        ]}
      >
        <View style={[styles.stockContent, viewMode === "grid" && styles.stockContentGrid]}>
          <View style={[
            styles.stockImage,
            viewMode === "grid" && { width: gridImageSize, height: gridImageSize, marginRight: 0, marginBottom: 12 },
            { backgroundColor: dark ? "#18263a" : "#f0f4ff" },
          ]}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.stockImageContent} resizeMode="contain" />
            ) : (
              <Ionicons name="fish" size={28} color={dark ? "#8fb4e8" : "#17386b"} />
            )}
          </View>
          <View style={styles.stockMain}>
            <View style={styles.stockHeader}>
              <View style={styles.stockInfo}>
                <Text style={[styles.stockName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[styles.stockSku, { color: dark ? "#4a6785" : "#8e99a4" }]}>{item.sku}</Text>
              </View>
              <Badge label={status.label} color={status.color} />
            </View>
            <View style={styles.stockDetails}>
              <View style={styles.stockDetailItem}>
                <Text style={[styles.stockDetailLabel, { color: dark ? "#8e99a4" : "#8e99a4" }]}>Available</Text>
                <Text style={[styles.stockDetailValue, { color: dark ? "#e2e8f0" : "#1a202c" }, (isLow || isOut) && { color: status.color }]}>{item.available}</Text>
              </View>
              <View style={styles.stockDetailItem}>
                <Text style={[styles.stockDetailLabel, { color: dark ? "#8e99a4" : "#8e99a4" }]}>Min Stock</Text>
                <Text style={[styles.stockDetailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.minimum}</Text>
              </View>
              <View style={styles.stockDetailItem}>
                <Text style={[styles.stockDetailLabel, { color: dark ? "#8e99a4" : "#8e99a4" }]}>Allocated</Text>
                <Text style={[styles.stockDetailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.allocated}</Text>
              </View>
              <View style={styles.stockDetailItem}>
                <Text style={[styles.stockDetailLabel, { color: dark ? "#8e99a4" : "#8e99a4" }]}>Sold</Text>
                <Text style={[styles.stockDetailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.sold}</Text>
              </View>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]}>
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: dark ? "#f5f7fa" : "#151a22" }]}>Stock</Text>
          <Text style={[styles.pageSubtitle, { color: dark ? "#8f99a8" : "#667080" }]}>Inventory levels and replenishment signals</Text>
        </View>
      </View>
      <View style={styles.searchTools}>
        <View style={[styles.searchBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
          <Ionicons name="search" size={18} color={dark ? "#4a6785" : "#8e99a4"} />
          <TextInput
            style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
            placeholder="Search inventory..."
            placeholderTextColor={dark ? "#4a6785" : "#b0b8c1"}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={dark ? "#4a6785" : "#8e99a4"} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)} accessibilityLabel="Scan stock barcode">
          <Ionicons name="scan" size={21} color="#ffffff" />
        </TouchableOpacity>
        <View style={[styles.viewToggle, { backgroundColor: dark ? "#1a2a42" : "#f0f4ff" }]}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "grid" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("grid")}
            accessibilityLabel="Grid view"
          >
            <Ionicons name="grid" size={18} color={viewMode === "grid" ? "#ffffff" : dark ? "#94a3b8" : "#6b7b8d"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("list")}
            accessibilityLabel="List view"
          >
            <Ionicons name="list" size={18} color={viewMode === "list" ? "#ffffff" : dark ? "#94a3b8" : "#6b7b8d"} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.summaryBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{stockItems.length}</Text>
          <Text style={[styles.summaryLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Total Items</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: "#dc3545" }]}>
            {stockItems.filter((s) => s.available === 0).length}
          </Text>
          <Text style={[styles.summaryLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Out of Stock</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: "#ffc107" }]}>
            {stockItems.filter((s) => s.available > 0 && s.available <= s.minimum).length}
          </Text>
          <Text style={[styles.summaryLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Low Stock</Text>
        </View>
      </View>

      <FlatList
        key={`${viewMode}-${gridColumns}`}
        data={filtered}
        renderItem={renderStock}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === "grid" ? gridColumns : 1}
        contentContainerStyle={styles.list}
        columnWrapperStyle={viewMode === "grid" ? styles.gridRow : undefined}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No stock items found</Text>
          </View>
        }
      />
      <BarcodeScannerModal
        visible={scannerVisible}
        dark={dark}
        onClose={() => setScannerVisible(false)}
        onScan={handleBarcodeScan}
      />
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
  pageHeader: {
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
  viewToggle: {
    flexDirection: "row",
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
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  stockCard: {
    padding: 16,
    marginBottom: 10,
  },
  stockGridCard: {
    minHeight: 300,
    marginBottom: 12,
  },
  gridRow: {
    gap: 12,
  },
  stockCardAlert: {
    borderLeftWidth: 3,
    borderLeftColor: "#dc3545",
  },
  stockContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  stockContentGrid: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  stockImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 14,
    flexShrink: 0,
    alignSelf: "center",
  },
  stockImageContent: {
    width: "100%",
    height: "100%",
  },
  stockMain: {
    flex: 1,
    minWidth: 0,
  },
  stockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  stockInfo: {
    flex: 1,
    marginRight: 12,
  },
  stockName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a202c",
  },
  stockSku: {
    fontSize: 11,
    color: "#8e99a4",
    marginTop: 2,
  },
  stockDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stockDetailItem: {
    alignItems: "center",
  },
  stockDetailLabel: {
    fontSize: 10,
    color: "#8e99a4",
    marginBottom: 4,
  },
  stockDetailValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a202c",
  },
});
