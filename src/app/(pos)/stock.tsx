import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryService } from "@/lib/services/inventory.service";
import { ProductService } from "@/lib/services/product.service";
import type { InventoryDTO, ProductDTO } from "@/lib/types/inventory";

interface StockDisplayItem {
  id: string;
  name: string;
  sku: string;
  available: number;
  minimum: number;
  allocated: number;
  sold: number;
}

export default function StockScreen() {
  const [search, setSearch] = useState("");
  const [stockItems, setStockItems] = useState<StockDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      <Card style={[styles.stockCard, (isLow || isOut) && styles.stockCardAlert]}>
        <View style={styles.stockHeader}>
          <View style={styles.stockInfo}>
            <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.stockSku}>{item.sku}</Text>
          </View>
          <Badge label={status.label} color={status.color} />
        </View>
        <View style={styles.stockDetails}>
          <View style={styles.stockDetailItem}>
            <Text style={styles.stockDetailLabel}>Available</Text>
            <Text style={[styles.stockDetailValue, (isLow || isOut) && { color: status.color }]}>
              {item.available}
            </Text>
          </View>
          <View style={styles.stockDetailItem}>
            <Text style={styles.stockDetailLabel}>Min Stock</Text>
            <Text style={styles.stockDetailValue}>{item.minimum}</Text>
          </View>
          <View style={styles.stockDetailItem}>
            <Text style={styles.stockDetailLabel}>Allocated</Text>
            <Text style={styles.stockDetailValue}>{item.allocated}</Text>
          </View>
          <View style={styles.stockDetailItem}>
            <Text style={styles.stockDetailLabel}>Sold</Text>
            <Text style={styles.stockDetailValue}>{item.sold}</Text>
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
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search inventory..."
          placeholderTextColor="#b0b8c1"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#8e99a4" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>{stockItems.length}</Text>
          <Text style={styles.summaryLabel}>Total Items</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: "#dc3545" }]}>
            {stockItems.filter((s) => s.available === 0).length}
          </Text>
          <Text style={styles.summaryLabel}>Out of Stock</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: "#ffc107" }]}>
            {stockItems.filter((s) => s.available > 0 && s.available <= s.minimum).length}
          </Text>
          <Text style={styles.summaryLabel}>Low Stock</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderStock}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No stock items found</Text>
          </View>
        }
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
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
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
  stockCardAlert: {
    borderLeftWidth: 3,
    borderLeftColor: "#dc3545",
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
