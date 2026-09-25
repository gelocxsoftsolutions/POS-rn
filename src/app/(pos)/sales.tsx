import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { useAudioPlayer } from "expo-audio";
import { File } from "expo-file-system";
import QRCodeLib from "qrcode";
import { playFeedbackSound } from "@/lib/audio/feedback-sound";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/modal";
import { BarcodeScannerModal } from "@/components/ui/barcode-scanner-modal";
import { ReceiptPreviewModal } from "@/components/ui/receipt-preview-modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useCartStore } from "@/lib/stores/cart-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { ProductService } from "@/lib/services/product.service";
import { SaleService } from "@/lib/services/sale.service";
import { ReceiptService } from "@/lib/services/receipt.service";
import { SettingsService } from "@/lib/services/settings.service";
import { InventoryService } from "@/lib/services/inventory.service";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import type { PosCartItem, PaymentMethodType, ProductSort, StoreSettings } from "@/lib/types/pos";
import type { ProductDTO } from "@/lib/types/inventory";

const GRID_COLUMNS = 5;
const RECEIPT_WIDTH_MM = 58;
const RECEIPT_WIDTH_POINTS = Math.round((RECEIPT_WIDTH_MM / 25.4) * 72);
const RECEIPT_PREVIEW_WIDTH = Math.round((RECEIPT_WIDTH_MM / 25.4) * 160);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "name", label: "Name A-Z" },
  { value: "priceAsc", label: "Price Low-High" },
  { value: "priceDesc", label: "Price High-Low" },
  { value: "stockDesc", label: "Stock High-Low" },
];

const PAYMENT_KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"] as const;
const QUANTITY_KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"] as const;

const paymentMethodLabel = (method: PaymentMethodType | string) =>
  method === "DIGITAL" ? "GCash/QRPh" : method;

const toUniqueCartProducts = (items: ProductDTO[], stock: Map<string, number>): PosCartItem[] => {
  const uniqueProducts = new Map<string, PosCartItem>();
  items.forEach((product) => {
    if (uniqueProducts.has(product.id)) return;
    uniqueProducts.set(product.id, {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.sku,
      unitPrice: product.retailPrice ?? 0,
      quantity: 0,
      maxQuantity: stock.get(product.id) ?? 0,
      imageUrl: product.imageUrl ?? undefined,
      productCode: product.productCode ?? null,
      description: product.description ?? null,
      weight: product.weight ?? null,
      unitName: product.unitName ?? null,
      categoryName: product.categoryName ?? null,
    });
  });
  return Array.from(uniqueProducts.values());
};

export default function SalesScreen() {
  const checkoutSuccessPlayer = useAudioPlayer(
    require("../../../assets/sounds/cash-register-sound.wav")
  );
  const soundMuted = useUiStore((state) => state.soundMuted);
  const soundVolume = useUiStore((state) => state.soundVolume);
  const checkoutSoundVolume = useUiStore((state) => state.soundVolumes?.checkout ?? 1);
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
  const [printing, setPrinting] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [productSectionWidth, setProductSectionWidth] = useState(0);
  const [quantityItem, setQuantityItem] = useState<PosCartItem | null>(null);
  const [quantityInput, setQuantityInput] = useState("");
  const replaceQuantityOnNextKey = React.useRef(false);
  const [variationGroup, setVariationGroup] = useState<PosCartItem[] | null>(null);

  const cart = useCartStore();
  const cashier = useAuthStore((s) => s.cashier);
  const device = useDeviceStore((s) => s.device);
  const dark = useIsDarkTheme();
  const productPageSize = useUiStore((state) => state.pageSizes?.sales ?? 10);
  const setPageSize = useUiStore((state) => state.setPageSize);
  const lastSyncTime = useSyncStore((state) => state.lastSyncTime);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isPortrait = windowHeight > windowWidth;
  const isWideLayout = !isPortrait && windowWidth >= 768;
  const alertShowingRef = React.useRef(false);

  const loadProducts = useCallback(async () => {
    try {
      const result = await ProductService.search({ page: 1, pageSize: 100 });
      const inventoryList = await InventoryService.listAll();
      const stockMapLocal = new Map<string, number>();
      inventoryList.forEach((inv) => {
        stockMapLocal.set(inv.productId, inv.availableQty);
      });
      setStockMap(stockMapLocal);

      setProducts(toUniqueCartProducts(result.items, stockMapLocal));
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

      setProducts(toUniqueCartProducts(result.items, stockMapLocal));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, loadProducts]);

  useEffect(() => {
    if (lastSyncTime) void loadProducts();
  }, [lastSyncTime, loadProducts]);

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

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, PosCartItem[]>();
    for (const p of sortedProducts) {
      const key = (p.productCode ? p.productCode : p.name).toLowerCase().trim();
      const arr = groups.get(key);
      if (arr) arr.push(p);
      else groups.set(key, [p]);
    }
    const grouped = Array.from(groups.values()).map((group) => {
      group.sort((a, b) => a.name.localeCompare(b.name) || a.unitPrice - b.unitPrice);
      return group;
    });
    grouped.sort((a, b) => a[0].name.localeCompare(b[0].name));
    // Apply sort that is not name - for price/stock sort, sort groups by min/max of that
    if (sort === "priceAsc") grouped.sort((a, b) => Math.min(...a.map((x) => x.unitPrice)) - Math.min(...b.map((x) => x.unitPrice)));
    if (sort === "priceDesc") grouped.sort((a, b) => Math.max(...b.map((x) => x.unitPrice)) - Math.max(...a.map((x) => x.unitPrice)));
    if (sort === "stockDesc") grouped.sort((a, b) => Math.max(...b.map((x) => x.maxQuantity ?? 0)) - Math.max(...a.map((x) => x.maxQuantity ?? 0)));
    return grouped;
  }, [sortedProducts, sort]);

  const productTotalPages = Math.max(1, Math.ceil(groupedProducts.length / productPageSize));
  const productCardWidth = productSectionWidth > 0
    ? (productSectionWidth - (GRID_COLUMNS - 1) * 12) / GRID_COLUMNS
    : undefined;
  const productImageSize = Math.min(160, Math.max(72, (productCardWidth ?? 184) - 24));
  const pagedGroups = useMemo(
    () => groupedProducts.slice((productPage - 1) * productPageSize, productPage * productPageSize),
    [groupedProducts, productPage, productPageSize]
  );
  const checkoutSubtotal = cart.total();
  const checkoutTaxRate = settings?.taxRate ?? 0.12;
  const checkoutTaxAmount = checkoutSubtotal * checkoutTaxRate;
  const checkoutTotalAmount = checkoutSubtotal + checkoutTaxAmount;
  const checkoutItemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const parsedPaidAmount = Number.parseFloat(paidAmount);
  const hasPaidAmount = Number.isFinite(parsedPaidAmount) && paidAmount.length > 0;
  const checkoutChangeAmount = hasPaidAmount ? parsedPaidAmount - checkoutTotalAmount : 0;

  useEffect(() => {
    setProductPage(1);
  }, [search, sort]);

  useEffect(() => {
    setProductPage((page) => Math.min(page, productTotalPages));
  }, [productTotalPages]);

  const handleAddToCart = useCallback(
    (product: PosCartItem) => {
      const inCart = cartQtyByProductId.get(product.productId) ?? 0;
      const effective = (stockMap.get(product.productId) ?? product.maxQuantity) - inCart;

      if (effective <= 0) {
        Alert.alert("No Stock", `${product.name} has no remaining stock for this cart.`);
        return false;
      }

      cart.addItem(product);
      return true;
    },
    [cart, cartQtyByProductId, stockMap]
  );

  const openQuantityModal = useCallback((item: PosCartItem) => {
    setQuantityItem(item);
    setQuantityInput(String(item.quantity));
    replaceQuantityOnNextKey.current = true;
  }, []);

  const closeQuantityModal = useCallback(() => {
    setQuantityItem(null);
    setQuantityInput("");
  }, []);

  const handleQuantityKey = useCallback((key: typeof QUANTITY_KEYPAD_KEYS[number]) => {
    if (!quantityItem) return;
    if (key === "clear") {
      setQuantityInput("");
      replaceQuantityOnNextKey.current = false;
      return;
    }
    if (key === "backspace") {
      setQuantityInput((current) => current.slice(0, -1));
      replaceQuantityOnNextKey.current = false;
      return;
    }
    setQuantityInput((current) => {
      const base = replaceQuantityOnNextKey.current ? "" : current;
      replaceQuantityOnNextKey.current = false;
      const next = `${base}${key}`.replace(/^0+/, "");
      if (!next) return "";
      return String(Math.min(Number(next), quantityItem.maxQuantity));
    });
  }, [quantityItem]);

  const applyQuantity = useCallback(() => {
    if (!quantityItem) return;
    const nextQuantity = Math.min(Math.max(Number(quantityInput) || 1, 1), quantityItem.maxQuantity);
    cart.updateQuantity(quantityItem.productId, nextQuantity);
    closeQuantityModal();
  }, [cart, closeQuantityModal, quantityInput, quantityItem]);

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
          imageUrl: product.imageUrl ?? undefined,
          productCode: product.productCode ?? null,
          description: product.description ?? null,
          weight: product.weight ?? null,
          unitName: product.unitName ?? null,
          categoryName: product.categoryName ?? null,
        };

        if (handleAddToCart(item)) {
          openQuantityModal({
            ...item,
            quantity: 1,
          });
          // Default quantity input to 1 as requested
          setQuantityInput("1");
          replaceQuantityOnNextKey.current = true;
        }
      } catch {
        Alert.alert("Error", "Failed to look up product by barcode.");
      }
    },
    [cartQtyByProductId, handleAddToCart, openQuantityModal, stockMap]
  );

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      Alert.alert("Empty Cart", "Add items to the cart before checkout.");
      return;
    }
    setCheckoutVisible(true);
  };

  const appendPaidAmount = (value: string) => {
    setPaidAmount((current) => {
      if (value === "." && current.includes(".")) return current;
      const next = `${current}${value}`.replace(/^0+(?=\d)/, "");
      const [, decimals = ""] = next.split(".");
      return decimals.length > 2 ? current : next;
    });
  };

  const removePaidAmountDigit = () => setPaidAmount((current) => current.slice(0, -1));

  const playCheckoutSuccessSound = useCallback(async () => {
    await playFeedbackSound(checkoutSuccessPlayer, {
      muted: soundMuted,
      volume: soundVolume * checkoutSoundVolume,
    });
  }, [checkoutSuccessPlayer, soundMuted, soundVolume, checkoutSoundVolume]);

  const handleConfirmSale = async () => {
    const total = cart.total() * (1 + (settings?.taxRate ?? 0.12));
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
          unit: i.unitName ?? undefined,
          weight: i.weight ?? null,
        })),
        paidAmount: paid,
        deviceId: device.deviceId ?? undefined,
        branchId: device.branchId ?? undefined,
      });

        if (result.success && result.sale) {
        void playCheckoutSuccessSound();
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
        await loadProducts();
      } else {
        const msg = result.error ?? "Failed to create sale.";
        if (alertShowingRef.current) return;
        if (/not enough stock|insufficient/i.test(msg)) {
          // Auto-correct cart quantities that exceed available
          try {
            const availMatch = msg.match(/Available:\s*(\d+)/i);
            const groupMatch = msg.match(/group:([a-f0-9-]+)/i);
            if (availMatch) {
              const available = Number(availMatch[1]);
              if (Number.isFinite(available) && available >= 0) {
                const groupId = groupMatch ? groupMatch[1] : null;
                const { queryFirst } = await import("@/lib/db/connection");
                for (const cartItem of [...cart.items]) {
                  let shouldCap = false;
                  if (groupId) {
                    const prow = await queryFirst<{ productCode: string | null }>(`SELECT productCode FROM Product WHERE id = ?`, [cartItem.productId]);
                    const code = prow?.productCode ?? cartItem.productId;
                    if (code === groupId) shouldCap = true;
                  } else {
                    // No group specified, cap any item that exceeds available
                    if (cartItem.quantity > available) shouldCap = true;
                  }
                  if (shouldCap) {
                    const newQty = Math.min(cartItem.quantity, available);
                    if (newQty > 0) cart.updateQuantity(cartItem.productId, newQty);
                    else cart.removeItem(cartItem.productId);
                  }
                }
              }
            }
          } catch {}
          try {
            await loadProducts();
          } catch {}
        }
        alertShowingRef.current = true;
        Alert.alert("Not Enough Stock", msg, [
          { text: "OK", onPress: () => { alertShowingRef.current = false; } },
        ]);
        setTimeout(() => { alertShowingRef.current = false; }, 3000);
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setProcessing(false);
    }
  };

  const openScanner = useCallback(() => setScannerVisible(true), []);

  const closeBarcodeScanner = useCallback(() => setScannerVisible(false), []);

  const handleBarcodeCameraScan = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    await handleBarcodeScan(barcode);
  }, [handleBarcodeScan]);

  const handlePrintReceipt = async () => {
    if (!lastReceipt || printing) return;
    setPrinting(true);

    try {
      const logoSource = Image.resolveAssetSource(require("../../../assets/thermal-printer-logo.jpg"));
      let logoUri = Platform.OS === "web" ? logoSource.uri : "";
      if (Platform.OS !== "web") {
        try {
          const logoBase64 = await new File(logoSource.uri).base64();
          logoUri = `data:image/jpeg;base64,${logoBase64}`;
        } catch {
          logoUri = "";
        }
      }

      let qrSvg = "";
      try {
        qrSvg = await QRCodeLib.toString(String(lastReceipt.receiptNumber ?? lastReceipt.date ?? "receipt"), { type: "svg", margin: 1, width: 160 });
        // Ensure svg scales to container
        qrSvg = qrSvg.replace('<svg ', '<svg style="width:28mm;height:28mm;display:block;margin:0 auto;" ');
      } catch {
        qrSvg = "";
      }

      const receiptHeightMm = Math.max(150, 138 + lastReceipt.items.length * 11);
      const receiptHeightPoints = Math.round((receiptHeightMm / 25.4) * 72);
      const itemRows = lastReceipt.items.map((item: PosCartItem) => `
        <div class="item">
          <div class="item-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${item.quantity} x &#8369;${item.unitPrice.toFixed(2)}</span>
          </div>
          <strong>&#8369;${(item.unitPrice * item.quantity).toFixed(2)}</strong>
        </div>
      `).join("");

      const html = `<!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              @page { size: ${RECEIPT_WIDTH_MM}mm ${receiptHeightMm}mm; margin: 0; }
              * { box-sizing: border-box; }
              html, body { width: ${RECEIPT_WIDTH_MM}mm; margin: 0; padding: 0; background: #fff; color: #000; }
              body { padding: 4mm 3mm; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
              .center { text-align: center; }
              .logo { width: 24mm; height: 24mm; object-fit: contain; margin: 0 auto 1.5mm; display: block; }
              h1 { font-size: 12pt; margin: 0 0 1mm; }
              .meta { font-size: 7.5pt; line-height: 1.35; margin: 0; }
              .receipt-number { margin-top: 2mm; font-weight: 700; }
              .rule { border-top: 0.25mm dashed #000; margin: 2.5mm 0; }
              .item, .total-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 1.5mm; }
              .item-copy { min-width: 0; flex: 1; }
              .item-copy strong, .item-copy span { display: block; overflow-wrap: anywhere; }
              .item-copy span { font-size: 7.5pt; margin-top: 0.5mm; }
              .total { font-size: 11pt; font-weight: 700; margin-top: 2mm; }
              .footer { margin-top: 3mm; text-align: center; font-size: 8pt; }
              .qr { margin: 4mm 0 2mm; text-align: center; }
              .qr svg { width: 28mm; height: 28mm; }
              .qr-caption { font-size: 6.5pt; text-align: center; margin-top: 1mm; letter-spacing: 0.3pt; }
            </style>
          </head>
          <body>
            ${logoUri ? `<img class="logo" src="${logoUri}" />` : ""}
            <div class="center">
              <h1>${escapeHtml(settings?.storeName || "NCT Seafoods")}</h1>
              ${settings?.address ? `<p class="meta">${escapeHtml(settings.address)}</p>` : ""}
              ${settings?.supportPhone ? `<p class="meta">${escapeHtml(settings.supportPhone)}</p>` : ""}
              <p class="meta receipt-number">${escapeHtml(lastReceipt.receiptNumber)}</p>
              <p class="meta">${escapeHtml(new Date(lastReceipt.date).toLocaleString())}</p>
            </div>
            <div class="rule"></div>
            ${lastReceipt.customerName ? `<p class="meta">Customer: ${escapeHtml(lastReceipt.customerName)}</p>` : ""}
            <p class="meta">Cashier: ${escapeHtml(lastReceipt.cashierName)}</p>
            <div class="rule"></div>
            ${itemRows}
            <div class="rule"></div>
            <div class="total-row"><span>Subtotal</span><strong>&#8369;${lastReceipt.subtotal.toFixed(2)}</strong></div>
            <div class="total-row"><span>${escapeHtml(settings?.taxLabel || "Tax")}</span><strong>&#8369;${lastReceipt.tax.toFixed(2)}</strong></div>
            <div class="total-row total"><span>Total</span><span>&#8369;${lastReceipt.total.toFixed(2)}</span></div>
            <div class="total-row"><span>Paid (${escapeHtml(paymentMethodLabel(lastReceipt.paymentMethod))})</span><span>&#8369;${lastReceipt.paidAmount.toFixed(2)}</span></div>
            <div class="total-row"><span>Change</span><span>&#8369;${lastReceipt.change.toFixed(2)}</span></div>
            <div class="rule"></div>
            <p class="footer">${escapeHtml(settings?.receiptFooter || "Thank you for your purchase!")}</p>
            ${qrSvg ? `<div class="qr">${qrSvg}<div class="qr-caption">${escapeHtml(lastReceipt.receiptNumber)}</div></div>` : ""}
          </body>
        </html>`;

      let printerUrl: string | undefined;
      if (Platform.OS === "ios") {
        const printer = await Print.selectPrinterAsync();
        printerUrl = printer.url;
      }

      await Print.printAsync({
        html,
        printerUrl,
        width: RECEIPT_WIDTH_POINTS,
        height: receiptHeightPoints,
        margins: Platform.OS === "ios" ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined,
      });
    } catch (error: any) {
      const message = error?.message?.toLowerCase().includes("cancel")
        ? "Printer selection was cancelled."
        : "No thermal printer was selected or the print service is unavailable.";
      Alert.alert("Print Receipt", message);
    } finally {
      setPrinting(false);
    }
  };

  const renderProduct = ({ item }: { item: PosCartItem }) => {
    const stock = stockMap.get(item.productId) ?? item.maxQuantity;
    const effective = effectiveStock(item.productId, stock);
    const inCart = cart.items.find((i) => i.productId === item.productId);

    return (
      <TouchableOpacity
        style={[
          styles.productCard,
          effective <= 0 && styles.productCardDisabled,
          {
            width: productCardWidth,
            backgroundColor: dark ? "#141922" : "#ffffff",
            borderColor: dark ? "#28303d" : "#dde3ea",
          },
        ]}
        onPress={() => handleAddToCart(item)}
        activeOpacity={0.7}
        disabled={effective <= 0}
      >
        <View style={[styles.productImage, { width: productImageSize, height: productImageSize }]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.catalogImage} resizeMode="contain" />
          ) : (
            <Ionicons name="fish" size={32} color="#17386b" />
          )}
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

  const renderProductListItem = ({ item }: { item: PosCartItem }) => {
    const stock = stockMap.get(item.productId) ?? item.maxQuantity;
    const effective = effectiveStock(item.productId, stock);
    const inCart = cart.items.find((cartItem) => cartItem.productId === item.productId);

    return (
      <TouchableOpacity
        style={[
          styles.productCard,
          styles.productCardList,
          effective <= 0 && styles.productCardDisabled,
          {
            backgroundColor: dark ? "#141922" : "#ffffff",
            borderColor: dark ? "#28303d" : "#dde3ea",
          },
        ]}
        onPress={() => handleAddToCart(item)}
        activeOpacity={0.7}
        disabled={effective <= 0}
      >
        <View style={[styles.productImage, styles.productImageList]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.catalogImage} resizeMode="contain" />
          ) : (
            <Ionicons name="fish" size={30} color="#17386b" />
          )}
        </View>
        <View style={styles.productListDetails}>
          <Text style={[styles.productName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.productPrice}>₱{item.unitPrice.toFixed(2)}</Text>
          <View style={styles.productFooter}>
            <Badge
              label={effective > 0 ? `Stock: ${effective}` : "Out of Stock"}
              color={effective > 0 ? "#28a745" : "#dc3545"}
              size="sm"
            />
            {inCart && <Badge label={`×${inCart.quantity}`} color="#17386b" size="sm" />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleGroupPress = useCallback((group: PosCartItem[]) => {
    if (group.length === 1) {
      handleAddToCart(group[0]);
    } else {
      setVariationGroup(group);
    }
  }, [handleAddToCart]);

  const renderGroup = ({ item: group }: { item: PosCartItem[] }) => {
    const isMulti = group.length > 1;
    const base = group[0];
    const minPrice = Math.min(...group.map((g) => g.unitPrice));
    const maxPrice = Math.max(...group.map((g) => g.unitPrice));
    const totalStock = group.reduce((sum, g) => sum + (stockMap.get(g.productId) ?? g.maxQuantity), 0);
    const effectiveTotal = group.reduce((sum, g) => sum + effectiveStock(g.productId, stockMap.get(g.productId) ?? g.maxQuantity), 0);
    const cartCount = group.reduce((sum, g) => sum + (cart.items.find((i) => i.productId === g.productId)?.quantity ?? 0), 0);
    const priceText = isMulti ? `₱${minPrice.toFixed(2)} - ₱${maxPrice.toFixed(2)}` : `₱${base.unitPrice.toFixed(2)}`;

    if (viewMode === "list") {
      return (
        <TouchableOpacity
          style={[
            styles.productCard,
            styles.productCardList,
            effectiveTotal <= 0 && styles.productCardDisabled,
            { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" },
          ]}
          onPress={() => handleGroupPress(group)}
          activeOpacity={0.7}
          disabled={effectiveTotal <= 0 && !isMulti}
        >
          <View style={[styles.productImage, styles.productImageList]}>
            {base.imageUrl ? (
              <Image source={{ uri: base.imageUrl }} style={styles.catalogImage} resizeMode="contain" />
            ) : (
              <Ionicons name="fish" size={30} color="#17386b" />
            )}
          </View>
          <View style={styles.productListDetails}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.productName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{base.name}</Text>
              {isMulti && <Badge label={`${group.length} variations`} color="#6f42c1" size="sm" />}
            </View>
            {isMulti && (
              <Text style={[styles.productVariationSubtext, { color: dark ? "#94a3b8" : "#6b7b8d" }]} numberOfLines={1}>
                {group.map((g) => `${g.sku}${g.weight ? ` • ${g.weight}${g.unitName ?? ""}` : ""}`).join(" • ")}
              </Text>
            )}
            <Text style={styles.productPrice}>{priceText}</Text>
            <View style={styles.productFooter}>
              <Badge label={effectiveTotal > 0 ? `Stock: ${effectiveTotal}` : "Out of Stock"} color={effectiveTotal > 0 ? "#28a745" : "#dc3545"} size="sm" />
              {cartCount > 0 && <Badge label={`×${cartCount}`} color="#17386b" size="sm" />}
            </View>
          </View>
          {isMulti && <Ionicons name="chevron-forward" size={16} color="#8e99a4" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[
          styles.productCard,
          effectiveTotal <= 0 && styles.productCardDisabled,
          { width: productCardWidth, backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" },
        ]}
        onPress={() => handleGroupPress(group)}
        activeOpacity={0.7}
        disabled={effectiveTotal <= 0 && !isMulti}
      >
        <View style={[styles.productImage, { width: productImageSize, height: productImageSize }]}>
          {base.imageUrl ? (
            <Image source={{ uri: base.imageUrl }} style={styles.catalogImage} resizeMode="contain" />
          ) : (
            <Ionicons name="fish" size={32} color="#17386b" />
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Text style={[styles.productName, { color: dark ? "#e2e8f0" : "#1a202c", flex: 1 }]} numberOfLines={1}>{base.name}</Text>
          {isMulti && <Ionicons name="layers-outline" size={14} color="#6f42c1" />}
        </View>
        {isMulti && <Badge label={`${group.length} variations`} color="#6f42c1" size="sm" style={{ alignSelf: "flex-start", marginBottom: 4 }} />}
        <Text style={styles.productPrice}>{priceText}</Text>
        <View style={styles.productFooter}>
          <Badge label={effectiveTotal > 0 ? `Stock: ${effectiveTotal}` : "Out of Stock"} color={effectiveTotal > 0 ? "#28a745" : "#dc3545"} size="sm" />
          {cartCount > 0 && <Badge label={`×${cartCount}`} color="#17386b" size="sm" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]}>
      <View style={[styles.layout, { flexDirection: isPortrait ? "column" : isWideLayout ? "row" : "column" }]}>
        <View
          style={styles.productSection}
          onLayout={(event) => setProductSectionWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.pageHeading}>
            <View>
              <Text style={[styles.pageTitle, { color: dark ? "#f8fafc" : "#17202b" }]}>New Sale</Text>
              <Text style={[styles.pageSubtitle, { color: dark ? "#8f9baa" : "#667085" }]}>Select products and review the cart</Text>
            </View>
            <View style={[styles.viewToggle, { backgroundColor: dark ? "#18202c" : "#e8edf3" }]}>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === "grid" && styles.viewToggleButtonActive]}
                onPress={() => setViewMode("grid")}
                accessibilityLabel="Grid view"
              >
                <Ionicons name="grid" size={18} color={viewMode === "grid" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleButton, viewMode === "list" && styles.viewToggleButtonActive]}
                onPress={() => setViewMode("list")}
                accessibilityLabel="List view"
              >
                <Ionicons name="list" size={19} color={viewMode === "list" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.searchTools}>
            <View style={[styles.searchBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
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
            </View>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner} accessibilityLabel="Scan product barcode">
              <Ionicons name="scan" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            style={styles.sortScroller}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortBar}
          >
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.sortBtn,
                  { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#e2e8f0" },
                  sort === opt.value && styles.sortBtnActive,
                ]}
                onPress={() => setSort(opt.value)}
              >
                <Text style={[
                  styles.sortBtnText,
                  { color: dark ? "#9ca3af" : "#6b7b8d" },
                  sort === opt.value && styles.sortBtnTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#17386b" />
            </View>
          ) : (
            <>
            <FlatList
              key={`sales-products-${viewMode}`}
              style={styles.productGrid}
              data={pagedGroups}
              renderItem={renderGroup}
              keyExtractor={(item: PosCartItem[]) => item[0].productId}
              numColumns={viewMode === "grid" ? GRID_COLUMNS : 1}
              columnWrapperStyle={viewMode === "grid" ? styles.productRow : undefined}
              contentContainerStyle={styles.productList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color="#d1d9e6" />
                  <Text style={styles.emptyText}>No products found</Text>
                </View>
              }
            />
            <PaginationControls
              page={productPage}
              totalPages={productTotalPages}
              pageSize={productPageSize}
              onPageChange={setProductPage}
              onPageSizeChange={(size) => {
                setPageSize("sales", size);
                setProductPage(1);
              }}
              dark={dark}
            />
            </>
          )}
        </View>

        <Card style={[styles.cartPanel, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea", width: isWideLayout ? (windowWidth >= 1200 ? 480 : 440) : "100%", maxHeight: isWideLayout ? undefined : 420 }]}>
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
                    <View style={[styles.cartItemImage, { backgroundColor: dark ? "#202938" : "#f0f4ff" }]}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.catalogImage} resizeMode="contain" />
                      ) : (
                        <Ionicons name="fish" size={22} color={dark ? "#8fb4e8" : "#17386b"} />
                      )}
                    </View>
                    <View style={styles.cartItemInfo}>
                      <Text style={[styles.cartItemName, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.name}</Text>
                      {(item.sku || item.weight != null || item.unitName || item.description) && (
                        <Text style={[styles.cartItemVariation, { color: dark ? "#94a3b8" : "#6b7b8d" }]} numberOfLines={1}>
                          {item.sku ? `${item.sku}` : ""}
                          {item.weight != null ? ` • ${item.weight}${item.unitName ?? ""}` : item.unitName ? ` • ${item.unitName}` : ""}
                          {item.description ? ` • ${item.description}` : ""}
                        </Text>
                      )}
                      <Text style={[styles.cartItemPrice, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>₱{item.unitPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.cartItemActions}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cart.updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Ionicons name="remove" size={14} color="#17386b" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.qtyValueBtn, { borderColor: dark ? "#475569" : "#cbd5e1" }]}
                        onPress={() => openQuantityModal(item)}
                        accessibilityLabel={`Set quantity for ${item.name}`}
                      >
                        <Text style={[styles.qtyText, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.quantity}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => cart.updateQuantity(item.productId, Math.min(item.quantity + 1, item.maxQuantity))}
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
                <Text style={[styles.summaryLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Tax ({settings?.taxLabel || "VAT"} {(checkoutTaxRate * 100).toFixed(0)}%)</Text>
                <Text style={[styles.summaryValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{checkoutTaxAmount.toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={[styles.totalLabel, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Total</Text>
                <Text style={styles.totalValue}>₱{checkoutTotalAmount.toFixed(2)}</Text>
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

      <Modal visible={!!quantityItem} transparent animationType="fade" onRequestClose={closeQuantityModal}>
        <View style={styles.quantityModalOverlay}>
          <View style={[styles.quantityModal, { backgroundColor: dark ? "#141922" : "#ffffff" }]}>
            <View style={styles.quantityModalHeader}>
              <View style={styles.quantityModalHeading}>
                <Text style={[styles.quantityModalTitle, { color: dark ? "#f8fafc" : "#17202b" }]}>Set quantity</Text>
                <Text style={[styles.quantityModalProduct, { color: dark ? "#9ca3af" : "#667085" }]} numberOfLines={1}>{quantityItem?.name}</Text>
              </View>
              <TouchableOpacity style={styles.quantityCloseBtn} onPress={closeQuantityModal} accessibilityLabel="Close quantity keypad">
                <Ionicons name="close" size={22} color={dark ? "#cbd5e1" : "#475569"} />
              </TouchableOpacity>
            </View>

            <View style={[styles.quantityDisplay, { backgroundColor: dark ? "#0f1729" : "#f7f9fc", borderColor: dark ? "#334155" : "#dde3ea" }]}>
              <Text style={[styles.quantityDisplayValue, { color: dark ? "#f8fafc" : "#17202b" }]}>{quantityInput || "0"}</Text>
              <Text style={[styles.quantityAvailable, { color: dark ? "#9ca3af" : "#667085" }]}>Available: {quantityItem?.maxQuantity ?? 0}</Text>
            </View>

            <View style={styles.quantityKeypad}>
              {QUANTITY_KEYPAD_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.quantityKey, { backgroundColor: dark ? "#202938" : "#eef2f7", borderColor: dark ? "#334155" : "#dde3ea" }]}
                  onPress={() => handleQuantityKey(key)}
                >
                  {key === "backspace" ? (
                    <Ionicons name="backspace-outline" size={24} color={dark ? "#f8fafc" : "#17386b"} />
                  ) : (
                    <Text style={[styles.quantityKeyText, { color: dark ? "#f8fafc" : "#17202b" }]}>{key === "clear" ? "C" : key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.quantityApplyBtn} onPress={applyQuantity}>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
              <Text style={styles.quantityApplyText}>Apply quantity</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!variationGroup} transparent animationType="fade" onRequestClose={() => setVariationGroup(null)}>
        <View style={styles.variationModalOverlay}>
          <View style={[styles.variationModal, { backgroundColor: dark ? "#141922" : "#ffffff" }]}>
            <View style={styles.variationModalHeader}>
              <View style={styles.variationModalHeading}>
                <Text style={[styles.variationModalTitle, { color: dark ? "#f8fafc" : "#17202b" }]} numberOfLines={1}>{variationGroup?.[0].name}</Text>
                <Text style={[styles.variationModalSubtitle, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>{variationGroup?.length} variations</Text>
              </View>
              <TouchableOpacity style={styles.variationCloseBtn} onPress={() => setVariationGroup(null)}>
                <Ionicons name="close" size={20} color={dark ? "#cbd5e1" : "#475569"} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.variationList} showsVerticalScrollIndicator={false}>
              {variationGroup?.map((variant) => {
                const stock = stockMap.get(variant.productId) ?? variant.maxQuantity;
                const effective = effectiveStock(variant.productId, stock);
                const inCart = cart.items.find((i) => i.productId === variant.productId);
                return (
                  <TouchableOpacity
                    key={variant.productId}
                    style={[styles.variationRow, { backgroundColor: dark ? "#0f1729" : "#f8fafc", borderColor: dark ? "#1e293b" : "#e2e8f0" }, effective <= 0 && { opacity: 0.5 }]}
                    onPress={() => {
                      if (effective <= 0) return;
                      handleAddToCart(variant);
                      setVariationGroup(null);
                    }}
                    disabled={effective <= 0}
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
                      <Text style={styles.variationPrice}>₱{variant.unitPrice.toFixed(2)}</Text>
                      <Text style={[styles.variationStock, { color: effective > 0 ? "#16a34a" : "#dc2626" }]}>Stock: {effective}</Text>
                    </View>
                    <View style={styles.variationAdd}>
                      <Ionicons name="add-circle" size={28} color={effective > 0 ? "#17386b" : "#9ca3af"} />
                      {inCart && <Badge label={`×${inCart.quantity}`} color="#17386b" size="sm" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BottomSheet
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
        style={[styles.checkoutSheet, { backgroundColor: dark ? "#141922" : "#ffffff" }]}
      >
        <View style={[styles.checkoutLayout, { flexDirection: windowWidth >= 700 ? "row" : "column" }]}>
          <View style={styles.checkoutDetails}>
            <Text style={[styles.checkoutTitle, { color: dark ? "#f8fafc" : "#1a202c" }]}>Checkout</Text>

            <TextInput
              style={[styles.checkoutInput, { backgroundColor: dark ? "#0f1729" : "#f7f9fc", borderColor: dark ? "#334155" : "#e2e8f0", color: dark ? "#e2e8f0" : "#1a202c" }]}
              placeholder="Customer name (optional)"
              placeholderTextColor={dark ? "#6b7280" : "#b0b8c1"}
              value={customerName}
              onChangeText={setCustomerName}
            />

            <Text style={[styles.checkoutLabel, { color: dark ? "#9ca3af" : "#4a5568" }]}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              {(["CASH", "CARD", "DIGITAL"] as PaymentMethodType[]).map((method) => {
                const selected = paymentMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.paymentBtn,
                      { borderColor: dark ? "#475569" : "#17386b" },
                      selected && styles.paymentBtnActive,
                    ]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Ionicons
                      name={method === "CASH" ? "cash" : method === "CARD" ? "card" : "qr-code-outline"}
                      size={18}
                      color={selected ? "#ffffff" : dark ? "#cbd5e1" : "#17386b"}
                    />
                    <Text
                      style={[
                        styles.paymentBtnText,
                        { color: dark ? "#cbd5e1" : "#17386b" },
                        selected && styles.paymentBtnTextActive,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {paymentMethodLabel(method)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.checkoutLabel, { color: dark ? "#9ca3af" : "#4a5568" }]}>Order Summary</Text>
            <View style={[styles.checkoutBreakdown, { backgroundColor: dark ? "#0f1729" : "#f7f9fc", borderColor: dark ? "#334155" : "#e2e8f0" }]}>
              <View style={styles.checkoutBreakdownRow}>
                <Text style={[styles.checkoutBreakdownLabel, { color: dark ? "#94a3b8" : "#667085" }]}>Items</Text>
                <Text style={[styles.checkoutBreakdownValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{checkoutItemCount}</Text>
              </View>
              <View style={styles.checkoutBreakdownRow}>
                <Text style={[styles.checkoutBreakdownLabel, { color: dark ? "#94a3b8" : "#667085" }]}>Subtotal</Text>
                <Text style={[styles.checkoutBreakdownValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{checkoutSubtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.checkoutBreakdownRow}>
                <Text style={[styles.checkoutBreakdownLabel, { color: dark ? "#94a3b8" : "#667085" }]}>{settings?.taxLabel || "Tax"} ({(checkoutTaxRate * 100).toFixed(0)}%)</Text>
                <Text style={[styles.checkoutBreakdownValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{checkoutTaxAmount.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.checkoutSummary}>
              <Text style={[styles.checkoutTotal, { color: dark ? "#e2e8f0" : "#1a202c" }]}>
                Total: ₱{checkoutTotalAmount.toFixed(2)}
              </Text>
              <Text
                style={[
                  styles.checkoutChange,
                  { color: checkoutChangeAmount < 0 ? "#dc3545" : "#28a745" },
                  !hasPaidAmount && styles.checkoutChangeHidden,
                ]}
                accessibilityElementsHidden={!hasPaidAmount}
                importantForAccessibility={hasPaidAmount ? "auto" : "no-hide-descendants"}
              >
                Change: ₱{checkoutChangeAmount.toFixed(2)}
              </Text>
            </View>

            <Button
              title={processing ? "Processing..." : "Confirm Sale"}
              onPress={handleConfirmSale}
              icon="checkmark-circle"
              disabled={processing}
            />
          </View>

          <View style={[styles.checkoutKeypadPanel, { borderColor: dark ? "#334155" : "#e2e8f0", borderLeftWidth: windowWidth >= 700 ? 1 : 0, borderTopWidth: windowWidth >= 700 ? 0 : 1, paddingLeft: windowWidth >= 700 ? 20 : 0, paddingTop: windowWidth >= 700 ? 0 : 16 }]}>
            <Text style={[styles.keypadTitle, { color: dark ? "#f8fafc" : "#1a202c" }]}>Enter payment</Text>
            <View style={[styles.keypadDisplay, { backgroundColor: dark ? "#0f1729" : "#f4f7fb", borderColor: dark ? "#334155" : "#dbe3ec" }]}>
              <Text style={[styles.keypadAmount, { color: dark ? "#f8fafc" : "#17386b" }]} numberOfLines={1} adjustsFontSizeToFit>
                ₱{paidAmount || "0.00"}
              </Text>
            </View>
            <View style={styles.paymentKeypad}>
              {PAYMENT_KEYPAD_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.paymentKey, { backgroundColor: dark ? "#202938" : "#eef3f9", borderColor: dark ? "#38465a" : "#dbe3ec" }]}
                  onPress={() => key === "backspace" ? removePaidAmountDigit() : appendPaidAmount(key)}
                  accessibilityLabel={key === "backspace" ? "Delete last digit" : `Enter ${key}`}
                >
                  {key === "backspace" ? (
                    <Ionicons name="backspace-outline" size={24} color={dark ? "#f8fafc" : "#17386b"} />
                  ) : (
                    <Text style={[styles.paymentKeyText, { color: dark ? "#f8fafc" : "#17386b" }]}>{key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </BottomSheet>

      <BarcodeScannerModal
        visible={scannerVisible}
        dark={dark}
        onClose={closeBarcodeScanner}
        onScan={handleBarcodeCameraScan}
      />

      <ReceiptPreviewModal
        visible={receiptVisible}
        onClose={() => setReceiptVisible(false)}
        receipt={
          lastReceipt
            ? {
                receiptNumber: lastReceipt.receiptNumber,
                date: lastReceipt.date,
                customerName: lastReceipt.customerName,
                cashierName: lastReceipt.cashierName,
                items: lastReceipt.items.map((i: any) => ({
                  name: i.name,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                  sku: i.sku,
                  weight: i.weight,
                  unitName: i.unitName,
                  description: i.description,
                })),
                subtotal: lastReceipt.subtotal,
                tax: lastReceipt.tax,
                total: lastReceipt.total,
                paidAmount: lastReceipt.paidAmount,
                change: lastReceipt.change,
                paymentMethod: lastReceipt.paymentMethod,
              }
            : null
        }
        settings={
          settings
            ? {
                storeName: settings.storeName,
                address: settings.address,
                supportPhone: settings.supportPhone,
                receiptFooter: settings.receiptFooter,
                taxLabel: settings.taxLabel,
              }
            : null
        }
        onPrint={handlePrintReceipt}
        printing={printing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  pageHeading: {
    minHeight: 54,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  viewToggle: {
    width: 78,
    height: 38,
    padding: 3,
    borderRadius: 8,
    flexDirection: "row",
    flexShrink: 0,
  },
  viewToggleButton: {
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleButtonActive: {
    backgroundColor: "#17386b",
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
    marginTop: 12,
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
    backgroundColor: "#17386b",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    gap: 8,
  },
  sortScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 42,
    marginBottom: 8,
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
    padding: 16,
    gap: 16,
  },
  productSection: {
    flex: 1,
    minWidth: 0,
  },
  productGrid: {
    flex: 1,
  },
  productRow: {
    gap: 12,
    marginBottom: 12,
    justifyContent: "flex-start",
  },
  productCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  productCardList: {
    width: "100%",
    minHeight: 112,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  productCardDisabled: {
    opacity: 0.5,
  },
  productImage: {
    backgroundColor: "#f0f4ff",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "hidden",
    alignSelf: "center",
  },
  productImageList: {
    width: 88,
    height: 88,
    marginBottom: 0,
    marginRight: 12,
    flexShrink: 0,
  },
  productListDetails: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  catalogImage: {
    width: "100%",
    height: "100%",
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
  productPagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 4,
    paddingBottom: 2,
  },
  productPageBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e8eef8",
    alignItems: "center",
    justifyContent: "center",
  },
  productPageBtnDisabled: {
    opacity: 0.35,
  },
  productPageText: {
    minWidth: 92,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  cartPanel: {
    alignSelf: "stretch",
    padding: 16,
    borderWidth: 1,
    borderColor: "#dde3ea",
    borderRadius: 8,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
    minHeight: 80,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  cartItemImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
    flexShrink: 0,
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
  cartItemVariation: {
    fontSize: 10,
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
    color: "#1a202c",
  },
  qtyValueBtn: {
    minWidth: 36,
    height: 30,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  quantityModal: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 8,
    padding: 20,
  },
  quantityModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  quantityModalHeading: {
    flex: 1,
    minWidth: 0,
  },
  quantityModalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  quantityModalProduct: {
    fontSize: 12,
    marginTop: 3,
  },
  quantityCloseBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityDisplay: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  quantityDisplayValue: {
    fontSize: 30,
    fontWeight: "700",
  },
  quantityAvailable: {
    fontSize: 11,
    marginTop: 2,
  },
  quantityKeypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quantityKey: {
    width: "31%",
    height: 58,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityKeyText: {
    fontSize: 22,
    fontWeight: "700",
  },
  quantityApplyBtn: {
    height: 50,
    borderRadius: 8,
    backgroundColor: "#17386b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  quantityApplyText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
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
  checkoutSheet: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  checkoutLayout: {
    gap: 20,
  },
  checkoutDetails: {
    flex: 1,
    minWidth: 0,
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
  checkoutBreakdown: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
    gap: 5,
  },
  checkoutBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  checkoutBreakdownLabel: {
    flex: 1,
    fontSize: 12,
  },
  checkoutBreakdownValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  checkoutSummary: {
    alignItems: "center",
    minHeight: 58,
    marginBottom: 16,
  },
  checkoutTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a202c",
  },
  checkoutChange: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  checkoutChangeHidden: {
    opacity: 0,
  },
  checkoutKeypadPanel: {
    flex: 1,
    minWidth: 0,
  },
  keypadTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  keypadDisplay: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: 12,
  },
  keypadAmount: {
    width: "100%",
    textAlign: "right",
    fontSize: 24,
    fontWeight: "800",
  },
  paymentKeypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentKey: {
    width: "30%",
    flexGrow: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentKeyText: {
    fontSize: 19,
    fontWeight: "700",
  },
  barcodeModalContainer: {
    flex: 1,
  },
  barcodeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  barcodeHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  barcodeHeaderSpacer: {
    width: 40,
  },
  barcodeBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  barcodeScannerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  barcodeCameraCard: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 20,
  },
  barcodeCameraWrapper: {
    width: 440,
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0f1729",
  },
  barcodeCamera: {
    flex: 1,
  },
  barcodeCorner: {
    position: "absolute",
    width: 38,
    height: 28,
    borderColor: "#ffffff",
  },
  barcodeCornerTL: {
    top: 14,
    left: 14,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  barcodeCornerTR: {
    top: 14,
    right: 14,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  barcodeCornerBL: {
    bottom: 14,
    left: 14,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  barcodeCornerBR: {
    right: 14,
    bottom: 14,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderBottomRightRadius: 10,
  },
  barcodeScanLine: {
    position: "absolute",
    left: 32,
    right: 32,
    top: "50%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "#ffffff",
    opacity: 0.82,
  },
  barcodePermissionCard: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: "100%",
    maxWidth: 440,
    marginBottom: 20,
  },
  barcodePermissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  barcodePermissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 16,
  },
  barcodePermissionButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  barcodeTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  barcodeSubtitle: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  barcodeSubtitleCenter: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  barcodeCancelButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  barcodeCancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
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
    borderRadius: 8,
    width: RECEIPT_PREVIEW_WIDTH,
    maxWidth: "100%",
    maxHeight: "88%",
    overflow: "hidden",
  },
  receiptScroll: {
    maxHeight: "100%",
  },
  receiptContent: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  receiptLogo: {
    width: 104,
    height: 104,
    marginBottom: 8,
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
  receiptQR: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  receiptQRCaption: {
    fontSize: 9,
    color: "#475569",
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  receiptActions: {
    width: "100%",
    marginTop: 18,
  },
  printReceiptButton: {
    width: "100%",
  },
  receiptDoneButton: {
    width: "100%",
    marginTop: 8,
  },
  productVariationSubtext: {
    fontSize: 11,
    marginTop: 2,
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
  variationAdd: {
    alignItems: "center",
    gap: 4,
  },
});
