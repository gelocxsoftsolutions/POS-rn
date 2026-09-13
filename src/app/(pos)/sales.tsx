import React, { useState, useCallback } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, BottomSheet } from "@/components/ui/modal";
import { useCartStore } from "@/lib/stores/cart-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { PosCartItem, PaymentMethodType } from "@/lib/types/pos";

const { width } = Dimensions.get("window");
const GRID_COLUMNS = width >= 768 ? 3 : 2;

const DEMO_PRODUCTS: PosCartItem[] = [
  { productId: "1", name: "Fresh Salmon Fillet", sku: "SAL-001", barcode: "123456", unitPrice: 450, quantity: 0, maxQuantity: 50 },
  { productId: "2", name: "Tuna Belly (Toro)", sku: "TUN-001", barcode: "123457", unitPrice: 680, quantity: 0, maxQuantity: 30 },
  { productId: "3", name: "Shrimp (Large)", sku: "SHR-001", barcode: "123458", unitPrice: 320, quantity: 0, maxQuantity: 100 },
  { productId: "4", name: "Squid (Fresh)", sku: "SQU-001", barcode: "123459", unitPrice: 220, quantity: 0, maxQuantity: 75 },
  { productId: "5", name: "Milkfish (Bangus)", sku: "MIL-001", barcode: "123460", unitPrice: 150, quantity: 0, maxQuantity: 60 },
  { productId: "6", name: "Crab (Mud Crab)", sku: "CRA-001", barcode: "123461", unitPrice: 380, quantity: 0, maxQuantity: 25 },
  { productId: "7", name: "Octopus (Small)", sku: "OCT-001", barcode: "123462", unitPrice: 290, quantity: 0, maxQuantity: 40 },
  { productId: "8", name: "Fish Balls (Pack)", sku: "FBA-001", barcode: "123463", unitPrice: 120, quantity: 0, maxQuantity: 200 },
];

export default function SalesScreen() {
  const [search, setSearch] = useState("");
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("CASH");
  const [customerName, setCustomerName] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const cart = useCartStore();
  const cashier = useAuthStore((s) => s.cashier);

  const filteredProducts = DEMO_PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddToCart = useCallback(
    (product: PosCartItem) => {
      cart.addItem(product);
    },
    [cart]
  );

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      Alert.alert("Empty Cart", "Add items to the cart before checkout.");
      return;
    }
    setCheckoutVisible(true);
  };

  const handleConfirmSale = () => {
    const total = cart.total();
    const paid = parseFloat(paidAmount) || total;
    if (paid < total) {
      Alert.alert("Insufficient Payment", "Paid amount is less than total.");
      return;
    }
    setLastReceipt({
      receiptNumber: "RCP-" + Date.now().toString().slice(-8),
      items: [...cart.items],
      subtotal: total,
      tax: total * 0.12,
      total: total * 1.12,
      paidAmount: paid,
      change: paid - total * 1.12,
      paymentMethod,
      customerName,
      cashierName: cashier?.name ?? "Cashier",
      date: new Date().toISOString(),
    });
    setCheckoutVisible(false);
    setReceiptVisible(true);
    cart.clear();
    setCustomerName("");
    setPaidAmount("");
    setPaymentMethod("CASH");
  };

  const renderProduct = ({ item }: { item: PosCartItem }) => {
    const inCart = cart.items.find((i) => i.productId === item.productId);
    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => handleAddToCart(item)}
        activeOpacity={0.7}
      >
        <View style={styles.productImage}>
          <Ionicons name="fish" size={32} color="#17386b" />
        </View>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>₱{item.unitPrice.toFixed(2)}</Text>
        <View style={styles.productFooter}>
          <Badge
            label={item.maxQuantity > 0 ? "In Stock" : "Out"}
            color={item.maxQuantity > 0 ? "#28a745" : "#dc3545"}
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
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
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

      <View style={styles.layout}>
        <View style={styles.productSection}>
          <FlatList
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item.productId}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.productRow}
            contentContainerStyle={styles.productList}
          />
        </View>

        <Card style={styles.cartPanel}>
          <View style={styles.cartHeader}>
            <Ionicons name="cart" size={20} color="#17386b" />
            <Text style={styles.cartTitle}>Cart ({cart.items.length})</Text>
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
                    <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>₱{item.unitPrice.toFixed(2)}</Text>
                  </View>
                  <View style={styles.cartItemActions}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => cart.updateQuantity(item.productId, item.quantity - 1)}
                    >
                      <Ionicons name="remove" size={14} color="#17386b" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
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
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.cartSummary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>₱{cart.total().toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (12%)</Text>
              <Text style={styles.summaryValue}>₱{(cart.total() * 0.12).toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₱{(cart.total() * 1.12).toFixed(2)}</Text>
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

      <BottomSheet visible={checkoutVisible} onClose={() => setCheckoutVisible(false)}>
        <Text style={styles.checkoutTitle}>Checkout</Text>

        <TextInput
          style={styles.checkoutInput}
          placeholder="Customer name (optional)"
          placeholderTextColor="#b0b8c1"
          value={customerName}
          onChangeText={setCustomerName}
        />

        <Text style={styles.checkoutLabel}>Payment Method</Text>
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
          style={styles.checkoutInput}
          placeholder="Paid amount"
          placeholderTextColor="#b0b8c1"
          value={paidAmount}
          onChangeText={setPaidAmount}
          keyboardType="numeric"
        />

        <View style={styles.checkoutSummary}>
          <Text style={styles.checkoutTotal}>
            Total: ₱{(cart.total() * 1.12).toFixed(2)}
          </Text>
          {parseFloat(paidAmount) > 0 && (
            <Text style={styles.checkoutChange}>
              Change: ₱{(parseFloat(paidAmount) - cart.total() * 1.12).toFixed(2)}
            </Text>
          )}
        </View>

        <Button title="Confirm Sale" onPress={handleConfirmSale} icon="checkmark-circle" />
      </BottomSheet>

      <Modal visible={receiptVisible} onClose={() => setReceiptVisible(false)}>
        {lastReceipt && (
          <View style={styles.receiptContent}>
            <Text style={styles.receiptStore}>NCT Seafoods</Text>
            <Text style={styles.receiptNumber}>{lastReceipt.receiptNumber}</Text>
            <View style={styles.receiptDivider} />
            {lastReceipt.items.map((item: PosCartItem, idx: number) => (
              <View key={idx} style={styles.receiptItem}>
                <Text style={styles.receiptItemName}>{item.name} ×{item.quantity}</Text>
                <Text style={styles.receiptItemPrice}>₱{(item.unitPrice * item.quantity).toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.receiptDivider} />
            <View style={styles.receiptItem}>
              <Text style={styles.receiptItemName}>Subtotal</Text>
              <Text style={styles.receiptItemPrice}>₱{lastReceipt.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.receiptItem}>
              <Text style={styles.receiptItemName}>Tax (12%)</Text>
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
            <Text style={styles.receiptFooter}>Thank you for your purchase!</Text>
            <Button title="Done" onPress={() => setReceiptVisible(false)} style={{ marginTop: 16 }} />
          </View>
        )}
      </Modal>
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
    marginHorizontal: 12,
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
  receiptContent: {
    alignItems: "center",
  },
  receiptStore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
  },
  receiptNumber: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 4,
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
  receiptItemName: {
    fontSize: 13,
    color: "#4a5568",
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
  },
});
