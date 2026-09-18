import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/modal";
import { useCartStore } from "@/lib/stores/cart-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { ProductService } from "@/lib/services/product.service";
import { SaleService } from "@/lib/services/sale.service";
import { ReceiptService } from "@/lib/services/receipt.service";
import { SettingsService } from "@/lib/services/settings.service";
import { InventoryService } from "@/lib/services/inventory.service";
import { useUiStore } from "@/lib/stores/ui-store";
import type { PosCartItem, PaymentMethodType, ProductSort, StoreSettings } from "@/lib/types/pos";
import type { ProductDTO } from "@/lib/types/inventory";

const { width } = Dimensions.get("window");
const GRID_COLUMNS = width >= 768 ? 3 : 2;

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "name", label: "Name A-Z" },
  { value: "priceAsc", label: "Price Low-High" },
  { value: "priceDesc", label: "Price High-Low" },
  { value: "stockDesc", label: "Stock High-Low" },
];

export default function SalesScreen() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("popular");
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("CASH");
  const [customerName, setCustomerName] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [products, setProducts] = useState<PosCartItem[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  const cart = useCartStore();
  const cashier = useAuthStore((s) => s.cashier);
  const device = useDeviceStore((s) => s.device);
  const dark = useUiStore((s) => s.themeMode) === "dark";

  const [permission, requestPermission] = useCameraPermissions();

  const loadProducts = useCallback(async () => {
    try {
      const result = await ProductService.search({ page: 1, pageSize: 100 });
      const inventoryList = await InventoryService.listAll();
      const stockMapLocal = new Map<string, number>();
      inventoryList.forEach((inv) => {
        stockMapLocal.set(inv.productId, inv.availableQty);
      });
      setStockMap(stockMapLocal);

      const items: PosCartItem[] = result.items.map((p: ProductDTO) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.sku,
        unitPrice: p.retailPrice ?? 0,
        quantity: 0,
        maxQuantity: stockMapLocal.get(p.id) ?? 0,
      }));
      setProducts(items);
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [settingsResult] = await Promise.all([SettingsService.get(), loadProducts()]);
      setSettings({
        storeName: settingsResult.storeName || "Store",
        storeCode: settingsResult.storeCode || "",
        currencyCode: settingsResult.currencyCode || "PHP",
        taxLabel: settingsResult.taxLabel || "VAT",
        supportPhone: settingsResult.supportPhone || "",
        address: settingsResult.address || "",
        receiptFooter: settingsResult.receiptFooter || "Thank you for your purchase!",
        taxRate: settingsResult.taxRate || 0,
      });
      setLoading(false);
    })();
  }, [loadProducts]);

  useEffect(() => {
    if (search.length === 0) {
      loadProducts();
      return;
    }
    const timeout = setTimeout(async () => {
      const result = await ProductService.search({ search, page: 1, pageSize: 100 });
      const inventoryList = await InventoryService.listAll();
      const stockMapLocal = new Map<string, number>();
      inventoryList.forEach((inv) => {
        stockMapLocal.set(inv.productId, inv.availableQty);
      });
      setStockMap(stockMapLocal);

      const items: PosCartItem[] = result.items.map((p: ProductDTO) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.sku,
        unitPrice: p.retailPrice ?? 0,
        quantity: 0,
        maxQuantity: stockMapLocal.get(p.id) ?? 0,
      }));
      setProducts(items);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, loadProducts]);

  const cartQtyByProductId = useMemo(
    () =>
      cart.items.reduce((map, item) => {
        map.set(item.productId, item.quantity);
        return map;
      }, new Map<string, number>()),
    [cart.items]
  );

  const effectiveStock = useCallback(
    (productId: string, stock: number) => {
      return stock - (cartQtyByProductId.get(productId) ?? 0);
    },
    [cartQtyByProductId]
  );

  const sortedProducts = useMemo(() => {
    const next = [...products];

    if (sort === "name") next.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "priceAsc") next.sort((a, b) => a.unitPrice - b.unitPrice);
    if (sort === "priceDesc") next.sort((a, b) => b.unitPrice - a.unitPrice);
    if (sort === "stockDesc")
      next.sort((a, b) => (b.maxQuantity ?? 0) - (a.maxQuantity ?? 0));

    return next.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search, sort]);

  const handleAddToCart = useCallback(
    (product: PosCartItem) => {
      const inCart = cartQtyByProductId.get(product.productId) ?? 0;
      const effective = (stockMap.get(product.productId) ?? product.maxQuantity) - inCart;

      if (effective <= 0) {
        Alert.alert("No Stock", `${product.name} has no remaining stock for this cart.`);
        return;
      }

      cart.addItem(product);
    },
    [cart, cartQtyByProductId, stockMap]
  );

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      try {
        const product = await ProductService.getByBarcode(barcode);
        if (!product) {
          Alert.alert("Not Found", "No product matched that barcode.");
          return;
        }

        const item: PosCartItem = {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: barcode,
          unitPrice: product.retailPrice ?? 0,
          quantity: 0,
          maxQuantity: stockMap.get(product.id) ?? 0,
        };

        handleAddToCart(item);
      } catch {
        Alert.alert("Error", "Failed to look up product by barcode.");
      }
    },
    [handleAddToCart, stockMap]
  );

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      Alert.alert("Empty Cart", "Add items to the cart before checkout.");
      return;
    }
    setCheckoutVisible(true);
  };

  const handleConfirmSale = async () => {
    const total = cart.total() * 1.12;
    const paid = parseFloat(paidAmount) || total;
    if (paid < total) {
      Alert.alert("Insufficient Payment", "Paid amount is less than total.");
      return;
    }
    setProcessing(true);
    try {
      const result = await SaleService.create({
        cashierId: cashier?.id ?? "",
        cashierName: cashier?.name ?? "Cashier",
        customerName: customerName || undefined,
        paymentMethod,
        items: cart.items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          sku: i.sku,
          barcode: i.barcode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        paidAmount: paid,
        deviceId: device.deviceId ?? undefined,
        branchId: device.branchId ?? undefined,
      });

      if (result.success && result.sale) {
        const receiptData = {
          receiptNumber: result.sale.receiptNumber,
          items: [...cart.items],
          subtotal: result.sale.subtotal,
          tax: result.sale.tax,
          total: result.sale.total,
          paidAmount: result.sale.paidAmount,
          change: result.sale.changeAmount,
          paymentMethod,
          customerName,
          cashierName: cashier?.name ?? "Cashier",
          date: result.sale.createdAt,
        };
        setLastReceipt(receiptData);
        setCheckoutVisible(false);
        setReceiptVisible(true);

        if (settings) {
          try {
            await ReceiptService.create(
              result.sale.id,
              settings.storeName,
              settings.storeCode,
              settings.address,
              settings.supportPhone,
              settings.receiptFooter
            );
          } catch {
            // receipt creation failed but sale was successful
          }
        }

        cart.clear();
        setCustomerName("");
        setPaidAmount("");
        setPaymentMethod("CASH");
      } else {
        Alert.alert("Error", result.error ?? "Failed to create sale.");
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setProcessing(false);
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Permission Required", "Camera permission is needed to scan barcodes.");
        return;
      }
    }
    setScannerVisible(true);
  };

  const renderProduct = ({ item }: { item: PosCartItem }) => {
    const stock = stockMap.get(item.productId) ?? item.maxQuantity;
    const effective = effectiveStock(item.productId, stock);
    const inCart = cart.items.find((i) => i.productId === item.productId);

    return (
      <TouchableOpacity
        style={[styles.productCard, effective <= 0 && styles.productCardDisabled, { backgroundColor: dark ? "#0f1729" : "#ffffff" }]}
        onPress={() => handleAddToCart(item)}
        activeOpacity={0.7}
        disabled={effective <= 0}
      >
        <View style={styles.productImage}>
          <Ionicons name="fish" size={32} color="#17386b" />
        </View>
        <Text style={[styles.productName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>₱{item.unitPrice.toFixed(2)}</Text>
        <View style={styles.productFooter}>
          <Badge
            label={effective > 0 ? `Stock: ${effective}` : "Out of Stock"}
            color={effective > 0 ? "#28a745" : "#dc3545"}
            size="sm"
          />
          {inCart && (
            <Badge label={`×${inCart.quantity}`} color="#17386b" size="sm" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
      <View style={[styles.searchBar, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#e2e8f0" }]}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
          placeholder="Search products..."
          placeholderTextColor={dark ? "#6b7280" : "#b0b8c1"}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#8e99a4" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Ionicons name="scan" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.sortBar}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.sortBtn, sort === opt.value && styles.sortBtnActive, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#e2e8f0" }]}
            onPress={() => setSort(opt.value)}
          >
            <Text style={[styles.sortBtnText, sort === opt.value && styles.sortBtnTextActive, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      ) : (
        <View style={styles.layout}>
          <View style={styles.productSection}>
            <FlatList
              data={sortedProducts}
              renderItem={renderProduct}
              keyExtractor={(item) => item.productId}
              numColumns={GRID_COLUMNS}
              columnWrapperStyle={styles.productRow}
              contentContainerStyle={styles.productList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color="#d1d9e6" />
                  <Text style={styles.emptyText}>No products found</Text>
                </View>
              }
            />
          </View>

          <Card style={[styles.cartPanel, { backgroundColor: dark ? "#0f1729" : "#ffffff" }]}>
            <View style={styles.cartHeader}>
              <Ionicons name="cart" size={20} color="#17386b" />
              <Text style={[styles.cartTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Cart ({cart.items.length})</Text>
              {cart.items.length > 0 && (
                <TouchableOpacity onPress={() => cart.clear()}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.cartItems} showsVerticalScrollIndicator={false}>
              {cart.items.length === 0 ? (
                <View style={styles.emptyCart}>
                  <Ionicons name="cart-outline" size={40} color="#d1d9e6" />
                  <Text style={styles.emptyCartText}>Cart is empty</Text>
                </View>
              ) : (
                cart.items.map((item) => (
                  <View key={item.productId} style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text style={[styles.cartItemName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.cartItemPrice, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>₱{item.unitPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.cartItemActions}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cart.updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Ionicons name="remove" size={14} color="#17386b" />
                      </TouchableOpacity>
                      <Text style={[styles.qtyText, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cart.updateQuantity(item.productId, item.quantity + 1)}
                      >
                        <Ionicons name="add" size={14} color="#17386b" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cartItemTotal}>
                      ₱{(item.unitPrice * item.quantity).toFixed(2)}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => cart.removeItem(item.productId)}
                    >
                      <Ionicons name="close" size={16} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.cartSummary}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Subtotal</Text>
                <Text style={[styles.summaryValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{cart.total().toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Tax ({settings?.taxLabel || "VAT"} {((settings?.taxRate || 0.12) * 100).toFixed(0)}%)</Text>
                <Text style={[styles.summaryValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{(cart.total() * (settings?.taxRate || 0.12)).toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={[styles.totalLabel, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Total</Text>
                <Text style={styles.totalValue}>₱{(cart.total() * (1 + (settings?.taxRate || 0.12))).toFixed(2)}</Text>
              </View>
            </View>

            <Button
              title="Checkout"
              onPress={handleCheckout}
              icon="card-outline"
              style={styles.checkoutBtn}
            />
          </Card>
        </View>
      )}

      <BottomSheet visible={checkoutVisible} onClose={() => setCheckoutVisible(false)}>
        <Text style={styles.checkoutTitle}>Checkout</Text>

        <TextInput
          style={[styles.checkoutInput, { backgroundColor: dark ? "#0f1729" : "#f7f9fc", borderColor: dark ? "#1e293b" : "#e2e8f0", color: dark ? "#e2e8f0" : "#1a202c" }]}
          placeholder="Customer name (optional)"
          placeholderTextColor={dark ? "#6b7280" : "#b0b8c1"}
          value={customerName}
          onChangeText={setCustomerName}
        />

        <Text style={[styles.checkoutLabel, { color: dark ? "#9ca3af" : "#4a5568" }]}>Payment Method</Text>
        <View style={styles.paymentMethods}>
          {(["CASH", "CARD", "DIGITAL"] as PaymentMethodType[]).map((method) => (
            <TouchableOpacity
              key={method}
              style={[styles.paymentBtn, paymentMethod === method && styles.paymentBtnActive]}
              onPress={() => setPaymentMethod(method)}
            >
              <Ionicons
                name={method === "CASH" ? "cash" : method === "CARD" ? "card" : "phone-portrait"}
                size={18}
                color={paymentMethod === method ? "#ffffff" : "#17386b"}
              />
              <Text style={[styles.paymentBtnText, paymentMethod === method && styles.paymentBtnTextActive]}>
                {method}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[styles.checkoutInput, { backgroundColor: dark ? "#0f1729" : "#f7f9fc", borderColor: dark ? "#1e293b" : "#e2e8f0", color: dark ? "#e2e8f0" : "#1a202c" }]}
          placeholder="Paid amount"
          placeholderTextColor={dark ? "#6b7280" : "#b0b8c1"}
          value={paidAmount}
          onChangeText={setPaidAmount}
          keyboardType="numeric"
        />

        <View style={styles.checkoutSummary}>
            <Text style={[styles.checkoutTotal, { color: dark ? "#e2e8f0" : "#1a202c" }]}>
            Total: ₱{(cart.total() * (1 + (settings?.taxRate || 0.12))).toFixed(2)}
          </Text>
          {parseFloat(paidAmount) > 0 && (
            <Text style={styles.checkoutChange}>
              Change: ₱{(parseFloat(paidAmount) - cart.total() * (1 + (settings?.taxRate || 0.12))).toFixed(2)}
            </Text>
          )}
        </View>

        <Button
          title={processing ? "Processing..." : "Confirm Sale"}
          onPress={handleConfirmSale}
          icon="checkmark-circle"
          disabled={processing}
        />
      </BottomSheet>

      <Modal visible={scannerVisible} animationType="slide" transparent>
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerContainer}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Scan Barcode</Text>
              <TouchableOpacity onPress={() => setScannerVisible(false)}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <CameraView
              style={styles.cameraView}
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e"] }}
              onBarcodeScanned={(scanned) => {
                if (scanned.data) {
                  setScannerVisible(false);
                  handleBarcodeScan(scanned.data);
                }
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={receiptVisible} transparent animationType="fade">
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptContainer, { backgroundColor: dark ? "#0f1729" : "#ffffff" }]}>
            {lastReceipt && (
              <ScrollView style={styles.receiptScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.receiptContent}>
                  <Text style={styles.receiptStore}>{settings?.storeName || "Store"}</Text>
                  {settings?.address ? <Text style={styles.receiptAddress}>{settings.address}</Text> : null}
                  {settings?.supportPhone ? <Text style={styles.receiptPhone}>{settings.supportPhone}</Text> : null}
                  <Text style={styles.receiptNumber}>{lastReceipt.receiptNumber}</Text>
                  <Text style={styles.receiptDate}>{new Date(lastReceipt.date).toLocaleString()}</Text>
                  {lastReceipt.customerName ? (
                    <Text style={styles.receiptCustomer}>Customer: {lastReceipt.customerName}</Text>
                  ) : null}
                  <Text style={styles.receiptCashier}>Cashier: {lastReceipt.cashierName}</Text>
                  <View style={styles.receiptDivider} />
                  {lastReceipt.items.map((item: PosCartItem, idx: number) => (
                    <View key={idx} style={styles.receiptItem}>
                      <View style={styles.receiptItemLeft}>
                        <Text style={styles.receiptItemName}>{item.name}</Text>
                        <Text style={styles.receiptItemQty}>×{item.quantity} @ ₱{item.unitPrice.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.receiptItemPrice}>₱{(item.unitPrice * item.quantity).toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={styles.receiptDivider} />
                  <View style={styles.receiptItem}>
                    <Text style={styles.receiptItemName}>Subtotal</Text>
                    <Text style={styles.receiptItemPrice}>₱{lastReceipt.subtotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.receiptItem}>
                    <Text style={styles.receiptItemName}>{settings?.taxLabel || "Tax"}</Text>
                    <Text style={styles.receiptItemPrice}>₱{lastReceipt.tax.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.receiptItem, { marginTop: 8 }]}>
                    <Text style={styles.receiptTotal}>Total</Text>
                    <Text style={styles.receiptTotal}>₱{lastReceipt.total.toFixed(2)}</Text>
                  </View>
                  <View style={styles.receiptItem}>
                    <Text style={styles.receiptItemName}>Paid ({lastReceipt.paymentMethod})</Text>
                    <Text style={styles.receiptItemPrice}>₱{lastReceipt.paidAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.receiptItem}>
                    <Text style={styles.receiptItemName}>Change</Text>
                    <Text style={styles.receiptItemPrice}>₱{lastReceipt.change.toFixed(2)}</Text>
                  </View>
                  <View style={styles.receiptDivider} />
                  <Text style={styles.receiptFooter}>{settings?.receiptFooter || "Thank you for your purchase!"}</Text>
                  <Button title="Done" onPress={() => setReceiptVisible(false)} style={{ marginTop: 16 }} />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
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
  scanBtn: {
    backgroundColor: "#17386b",
    borderRadius: 8,
    padding: 8,
    marginLeft: 8,
  },
  sortBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sortBtnActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7b8d",
  },
  sortBtnTextActive: {
    color: "#ffffff",
  },
  layout: {
    flex: 1,
    flexDirection: width >= 768 ? "row" : "column",
    padding: 16,
    gap: 16,
  },
  productSection: {
    flex: 1,
  },
  productRow: {
    gap: 12,
    marginBottom: 12,
  },
  productCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    maxWidth: width >= 768 ? undefined : (width - 56) / 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  productCardDisabled: {
    opacity: 0.5,
  },
  productImage: {
    height: 80,
    backgroundColor: "#f0f4ff",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
    marginTop: 4,
  },
  productFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  productList: {
    paddingBottom: 16,
  },
  cartPanel: {
    width: width >= 768 ? 320 : "100%",
    maxHeight: width >= 768 ? undefined : 300,
    padding: 16,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
  },
  clearText: {
    fontSize: 12,
    color: "#dc3545",
    fontWeight: "500",
  },
  cartItems: {
    flex: 1,
  },
  emptyCart: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyCartText: {
    fontSize: 13,
    color: "#b0b8c1",
    marginTop: 8,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1a202c",
  },
  cartItemPrice: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  cartItemActions: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "600",
    marginHorizontal: 8,
    color: "#1a202c",
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#17386b",
  },
  removeBtn: {
    marginLeft: 8,
    padding: 4,
  },
  cartSummary: {
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
    paddingTop: 12,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7b8d",
  },
  summaryValue: {
    fontSize: 12,
    color: "#1a202c",
  },
  totalRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a202c",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#17386b",
  },
  checkoutBtn: {
    marginTop: 12,
  },
  checkoutTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
  },
  checkoutInput: {
    backgroundColor: "#f7f9fc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1a202c",
    marginBottom: 12,
  },
  checkoutLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4a5568",
    marginBottom: 8,
  },
  paymentMethods: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#17386b",
    gap: 6,
  },
  paymentBtnActive: {
    backgroundColor: "#17386b",
  },
  paymentBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#17386b",
  },
  paymentBtnTextActive: {
    color: "#ffffff",
  },
  checkoutSummary: {
    alignItems: "center",
    marginBottom: 16,
  },
  checkoutTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a202c",
  },
  checkoutChange: {
    fontSize: 14,
    color: "#28a745",
    fontWeight: "600",
    marginTop: 4,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
  },
  scannerContainer: {
    flex: 1,
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 48 : 16,
    paddingBottom: 12,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  cameraView: {
    flex: 1,
  },
  receiptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  receiptContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    overflow: "hidden",
  },
  receiptScroll: {
    maxHeight: "100%",
  },
  receiptContent: {
    padding: 24,
    alignItems: "center",
  },
  receiptStore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
  },
  receiptAddress: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
    textAlign: "center",
  },
  receiptPhone: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptNumber: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 8,
  },
  receiptDate: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 4,
  },
  receiptCustomer: {
    fontSize: 12,
    color: "#4a5568",
    marginTop: 4,
  },
  receiptCashier: {
    fontSize: 12,
    color: "#4a5568",
    marginTop: 2,
  },
  receiptDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },
  receiptItem: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  receiptItemLeft: {
    flex: 1,
  },
  receiptItemName: {
    fontSize: 13,
    color: "#4a5568",
  },
  receiptItemQty: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptItemPrice: {
    fontSize: 13,
    color: "#1a202c",
    fontWeight: "500",
  },
  receiptTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
  },
  receiptFooter: {
    fontSize: 12,
    color: "#6b7b8d",
    fontStyle: "italic",
    textAlign: "center",
  },
});
