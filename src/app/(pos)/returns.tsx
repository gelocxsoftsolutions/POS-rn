import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ReceiptQrScannerModal } from "@/components/ui/receipt-qr-scanner-modal";
import { BarcodeScannerModal } from "@/components/ui/barcode-scanner-modal";
import { UsbBarcodeScannerInput } from "@/components/ui/usb-barcode-scanner-input";
import { ReturnService } from "@/lib/services/return.service";
import { SaleService } from "@/lib/services/sale.service";
import { ProductService } from "@/lib/services/product.service";
import { InventoryService } from "@/lib/services/inventory.service";
import { SettingsService, type ResolvedSettings } from "@/lib/services/settings.service";
import { printReceiptPaper } from "@/lib/printing/print-receipt-paper";
import { useIsDarkTheme, usePosTheme } from "@/lib/stores/ui-store";
import { useRolePermissions } from "@/lib/permissions/use-role-permissions";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { normalizeScannedCode } from "@/lib/barcodes/normalize-scanned-code";
import type { SaleDTO } from "@/lib/types/sales";
import type { ProductDTO } from "@/lib/types/inventory";
import type { PosCartItem, PaymentMethodType } from "@/lib/types/pos";
import type { ReturnCondition, ReturnRequestDTO, ReturnRequestStatus } from "@/lib/types/returns";

type FlowStep = "scan" | "items" | "replacement" | "review" | "approve" | "done";

const PAGE_SIZE = 20;

const RETURN_REASONS = ["Defective", "Wrong item", "Damaged", "Changed mind", "Other"] as const;
const RETURN_CONDITIONS: ReturnCondition[] = ["NEW", "USED", "DAMAGED", "DEFECTIVE"];

const STATUS_COLORS: Record<ReturnRequestStatus, string> = {
  PENDING_APPROVAL: "#f0ad4e",
  APPROVED: "#17a2b8",
  COMPLETED: "#28a745",
  REJECTED: "#dc3545",
  CANCELLED: "#6b7b8d",
};

const STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  PENDING_APPROVAL: "Awaiting code",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const peso = (value: number) => `₱${value.toFixed(2)}`;

const paymentMethodLabel = (method: PaymentMethodType | string) =>
  method === "DIGITAL" ? "GCash/QRPh" : method;

export default function ReturnsScreen() {
  const dark = useIsDarkTheme();
  const theme = usePosTheme();
  const permissions = useRolePermissions();
  const canApprove = permissions.has("POS_RETURNS_APPROVE");
  const selectedPrinter = usePrinterStore((state) => state.selectedPrinter);

  const [requests, setRequests] = useState<ReturnRequestDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const [flowVisible, setFlowVisible] = useState(false);
  const [step, setStep] = useState<FlowStep>("scan");
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const [receiptScannerVisible, setReceiptScannerVisible] = useState(false);
  const [productScannerVisible, setProductScannerVisible] = useState(false);
  const [manualReceipt, setManualReceipt] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleDTO | null>(null);
  const [returnedMap, setReturnedMap] = useState<Map<string, number>>(new Map());
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [reasonNotes, setReasonNotes] = useState("");
  const [condition, setCondition] = useState<ReturnCondition>("USED");

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [exchange, setExchange] = useState<PosCartItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("CASH");
  const [shortfallAccepted, setShortfallAccepted] = useState(false);

  const [activeRequest, setActiveRequest] = useState<ReturnRequestDTO | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedCodeExpiry, setGeneratedCodeExpiry] = useState<string | null>(null);
  const [exchangeSale, setExchangeSale] = useState<SaleDTO | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<ResolvedSettings | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadRequests = useCallback(async () => {
    try {
      const result = await ReturnService.list({ search, page, pageSize });
      setRequests(result.items);
      setTotal(result.total);
    } catch {
      // keep empty
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    setLoading(true);
    loadRequests().finally(() => setLoading(false));
  }, [loadRequests]);

  useEffect(() => {
    SettingsService.get().then(setReceiptSettings).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const resetFlow = useCallback(() => {
    setStep("scan");
    setFlowError(null);
    setScanError(null);
    setManualReceipt("");
    setSale(null);
    setReturnedMap(new Map());
    setReturnQty({});
    setReason(RETURN_REASONS[0]);
    setReasonNotes("");
    setCondition("USED");
    setProductSearch("");
    setProducts([]);
    setExchange([]);
    setPaymentMethod("CASH");
    setShortfallAccepted(false);
    setActiveRequest(null);
    setCodeInput("");
    setGeneratedCode(null);
    setGeneratedCodeExpiry(null);
    setExchangeSale(null);
    setBusy(false);
  }, []);

  const openFlow = useCallback(() => {
    resetFlow();
    setFlowVisible(true);
  }, [resetFlow]);

  const closeFlow = useCallback(() => {
    setFlowVisible(false);
    resetFlow();
    void loadRequests();
  }, [loadRequests, resetFlow]);

  const openRequest = useCallback(async (request: ReturnRequestDTO) => {
    if (request.status === "PENDING_APPROVAL" || request.status === "APPROVED") {
      resetFlow();
      setActiveRequest(request);
      setFlowVisible(true);
      setStep("approve");
      return;
    }
    if (request.status === "COMPLETED" && request.exchangeSaleId) {
      const saleDto = await SaleService.getById(request.exchangeSaleId);
      resetFlow();
      setActiveRequest(request);
      setExchangeSale(saleDto);
      setFlowVisible(true);
      setStep("done");
      return;
    }
    Alert.alert(
      `${request.returnNumber} — ${STATUS_LABELS[request.status]}`,
      [
        request.status === "REJECTED" && request.rejectionReason
          ? `Reason: ${request.rejectionReason}`
          : `Receipt ${request.receiptNumber} · ${peso(request.returnedTotal)} returned`,
      ].join("\n")
    );
  }, [resetFlow]);

  const handleReceiptLookup = useCallback(
    async (barcode: string) => {
      const normalized = normalizeScannedCode(barcode);
      if (!normalized) return;
      setScanError(null);
      const found = await SaleService.getByReceiptNumber(normalized);
      if (!found) {
        setScanError(`No receipt matched ${normalized}.`);
        return;
      }
      if (!found.items?.length) {
        setScanError("That receipt has no line items.");
        return;
      }
      const returned = await ReturnService.getReturnedQuantities(found.id);
      setSale(found);
      setReturnedMap(returned);
      setReturnQty({});
      setStep("items");
    },
    []
  );

  const handleManualLookup = useCallback(async () => {
    if (!manualReceipt.trim()) return;
    await handleReceiptLookup(manualReceipt);
  }, [handleReceiptLookup, manualReceipt]);

  const remainingFor = useCallback(
    (saleItemId: string, saleQty: number) => saleQty - (returnedMap.get(saleItemId) ?? 0),
    [returnedMap]
  );

  const selectedReturnItems = useMemo(
    () =>
      (sale?.items ?? [])
        .map((item) => ({ item, quantity: returnQty[item.id] ?? 0 }))
        .filter((row) => row.quantity > 0),
    [returnQty, sale]
  );

  const returnedTotal = useMemo(
    () => round2(selectedReturnItems.reduce((sum, row) => sum + row.quantity * row.item.unitPrice, 0)),
    [selectedReturnItems]
  );

  const replacementTotal = useMemo(
    () => round2(exchange.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)),
    [exchange]
  );

  const priceDifference = useMemo(() => round2(replacementTotal - returnedTotal), [replacementTotal, returnedTotal]);

  const loadCatalog = useCallback(async (term?: string) => {
    setCatalogLoading(true);
    try {
      const result = await ProductService.search({ search: term, page: 1, pageSize: 50 });
      const inventoryList = await InventoryService.listAll();
      const map = new Map<string, number>();
      inventoryList.forEach((inv) => map.set(inv.productId, inv.availableQty));
      setStockMap(map);
      setProducts(result.items);
    } catch {
      // keep previous
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== "replacement") return;
    const timeout = setTimeout(() => {
      void loadCatalog(productSearch.length > 0 ? productSearch : undefined);
    }, 250);
    return () => clearTimeout(timeout);
  }, [step, productSearch, loadCatalog]);

  const addToExchange = useCallback(
    (product: ProductDTO, quantity = 1) => {
      setExchange((current) => {
        const existing = current.find((i) => i.productId === product.id);
        const stock = stockMap.get(product.id) ?? 0;
        if (existing) {
          const nextQty = Math.min(existing.quantity + quantity, Math.max(stock, existing.quantity));
          return current.map((i) => (i.productId === product.id ? { ...i, quantity: nextQty } : i));
        }
        const item: PosCartItem = {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.sku,
          unitPrice: product.retailPrice ?? 0,
          quantity: Math.max(1, Math.min(quantity, stock || quantity)),
          maxQuantity: stock,
          imageUrl: product.imageUrl ?? undefined,
          productCode: product.productCode ?? null,
          description: product.description ?? null,
          weight: product.weight ?? null,
          unitName: product.unitName ?? null,
          categoryName: product.categoryName ?? null,
        };
        return [...current, item];
      });
      setFlowError(null);
    },
    [stockMap]
  );

  const handleProductScan = useCallback(
    async (barcode: string) => {
      const normalized = normalizeScannedCode(barcode);
      if (!normalized) return;
      const product = await ProductService.getByBarcode(normalized);
      if (!product) {
        setFlowError(`No product matched barcode ${normalized}.`);
        return;
      }
      addToExchange(product, 1);
    },
    [addToExchange]
  );

  const handleUsbScan = useCallback(
    (barcode: string) => {
      if (step === "scan") void handleReceiptLookup(barcode);
      else if (step === "replacement") void handleProductScan(barcode);
    },
    [handleProductScan, handleReceiptLookup, step]
  );

  const updateExchangeQty = useCallback((productId: string, quantity: number) => {
    setExchange((current) =>
      current
        .map((item) => {
          if (item.productId !== productId) return item;
          const max = Math.max(item.maxQuantity, 0);
          const next = Math.min(Math.max(quantity, 0), max || quantity);
          return { ...item, quantity: next };
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const submitRequest = useCallback(async () => {
    if (!sale) return;
    if (!selectedReturnItems.length) {
      setFlowError("Select at least one item to return.");
      return;
    }
    if (!exchange.length) {
      setFlowError("Select at least one replacement item.");
      return;
    }
    const finalReason = reason === "Other" ? reasonNotes.trim() : reason;
    if (!finalReason) {
      setFlowError("Describe the return reason.");
      return;
    }
    if (priceDifference < 0 && !shortfallAccepted) {
      setFlowError("The customer must accept the lower-priced exchange before continuing.");
      return;
    }

    setBusy(true);
    setFlowError(null);
    try {
      const result = await ReturnService.createRequest({
        saleId: sale.id,
        reason: finalReason,
        customerAcceptedShortfall: shortfallAccepted,
        items: selectedReturnItems.map((row) => ({
          saleItemId: row.item.id,
          quantity: row.quantity,
          condition,
        })),
        exchangeItems: exchange.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });
      if (!result.success || !result.request) {
        setFlowError(result.error ?? "Return request could not be created.");
        return;
      }
      setActiveRequest(result.request);
      setStep("approve");
    } finally {
      setBusy(false);
    }
  }, [condition, exchange, priceDifference, sale, selectedReturnItems, shortfallAccepted, reason, reasonNotes]);

  const handleGenerateCode = useCallback(async () => {
    if (!activeRequest) return;
    setBusy(true);
    setFlowError(null);
    try {
      const result = await ReturnService.generateApprovalCode(activeRequest.id);
      if (!result.success || !result.code) {
        setFlowError(result.error ?? "Approval code could not be generated.");
        return;
      }
      setGeneratedCode(result.code);
      setGeneratedCodeExpiry(result.expiresAt);
      const updated = await ReturnService.getById(activeRequest.id);
      if (updated) setActiveRequest(updated);
    } finally {
      setBusy(false);
    }
  }, [activeRequest]);

  const handleApprove = useCallback(async () => {
    if (!activeRequest) return;
    setBusy(true);
    setFlowError(null);
    try {
      const result = await ReturnService.approveWithCode(activeRequest.id, codeInput);
      if (!result.success || !result.request) {
        setFlowError(result.error ?? "Approval failed.");
        return;
      }
      setActiveRequest(result.request);
      setCodeInput("");
      setGeneratedCode(null);
      setGeneratedCodeExpiry(null);
    } finally {
      setBusy(false);
    }
  }, [activeRequest, codeInput]);

  const handleReject = useCallback(() => {
    if (!activeRequest) return;
    Alert.alert(
      "Reject return request",
      `Reject ${activeRequest.returnNumber}? The customer will not be able to exchange these items.`,
      [
        { text: "Keep pending", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const result = await ReturnService.reject(activeRequest.id);
              if (!result.success) {
                setFlowError(result.error ?? "Rejection failed.");
                return;
              }
              closeFlow();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [activeRequest, closeFlow]);

  const handleCancel = useCallback(() => {
    if (!activeRequest) return;
    Alert.alert("Cancel return request", `Cancel ${activeRequest.returnNumber}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const result = await ReturnService.cancel(activeRequest.id);
            if (!result.success) {
              setFlowError(result.error ?? "Cancellation failed.");
              return;
            }
            closeFlow();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [activeRequest, closeFlow]);

  const handleComplete = useCallback(async () => {
    if (!activeRequest) return;
    if (activeRequest.priceDifference > 0 && !paymentMethod) {
      setFlowError("Choose how the customer will pay the price difference.");
      return;
    }
    setBusy(true);
    setFlowError(null);
    try {
      const result = await ReturnService.completeExchange(activeRequest.id, { paymentMethod });
      if (!result.success || !result.request || !result.exchangeSale) {
        setFlowError(result.error ?? "The exchange could not be completed.");
        return;
      }
      setActiveRequest(result.request);
      setExchangeSale(result.exchangeSale);
      setStep("done");
    } finally {
      setBusy(false);
    }
  }, [activeRequest, paymentMethod]);

  const handlePrintExchangeReceipt = useCallback(async () => {
    if (!exchangeSale || printing) return;
    setPrinting(true);
    try {
      await printReceiptPaper({
        receipt: {
          receiptNumber: exchangeSale.receiptNumber,
          date: exchangeSale.createdAt,
          customerName: exchangeSale.customerName ?? undefined,
          cashierName: exchangeSale.cashierName,
          items: (exchangeSale.items ?? []).map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          subtotal: exchangeSale.subtotal,
          tax: exchangeSale.tax,
          total: exchangeSale.total,
          paidAmount: exchangeSale.paidAmount,
          change: exchangeSale.changeAmount,
          paymentMethod: exchangeSale.paymentMethod,
        },
        settings: receiptSettings
          ? {
              storeName: receiptSettings.storeName,
              address: receiptSettings.address ?? undefined,
              supportPhone: receiptSettings.supportPhone ?? undefined,
              receiptFooter: receiptSettings.receiptFooter ?? undefined,
              logoUri: receiptSettings.logoUri,
              headerMessage: receiptSettings.headerMessage,
              paperWidthMm: receiptSettings.paperWidthMm,
            }
          : null,
        printerAddress: selectedPrinter?.address ?? null,
      });
    } finally {
      setPrinting(false);
    }
  }, [exchangeSale, printing, receiptSettings, selectedPrinter]);

  const stepIndex: Record<FlowStep, number> = {
    scan: 0,
    items: 1,
    replacement: 2,
    review: 3,
    approve: 4,
    done: 5,
  };

  const stepTitles: Array<{ step: FlowStep; label: string }> = [
    { step: "scan", label: "Receipt" },
    { step: "items", label: "Items" },
    { step: "replacement", label: "Replacement" },
    { step: "review", label: "Review" },
    { step: "approve", label: "Approval" },
  ];

  const renderRequest = ({ item }: { item: ReturnRequestDTO }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={() => void openRequest(item)}>
      <Card style={[styles.requestCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.requestRow}>
          <View style={[styles.requestIcon, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="return-up-back" size={18} color={theme.accent} />
          </View>
          <View style={styles.requestInfo}>
            <Text style={[styles.requestNumber, { color: theme.text }]} numberOfLines={1}>
              {item.returnNumber}
            </Text>
            <Text style={[styles.requestMeta, { color: theme.muted }]}>
              Receipt {item.receiptNumber} · {new Date(item.createdAt).toLocaleString()}
            </Text>
            <Text style={styles.requestMetaFaint}>
              {item.items.length} returned · {item.exchangeItems.length} replacement
              {item.requestedByName ? ` · by ${item.requestedByName}` : ""}
            </Text>
          </View>
          <View style={styles.requestRight}>
            <Text style={[styles.requestDiff, { color: theme.primary }]}>
              {peso(item.priceDifference)}
            </Text>
            <Badge label={STATUS_LABELS[item.status]} color={STATUS_COLORS[item.status]} size="sm" />
            {item.approvedByName && item.status === "COMPLETED" ? (
              <Text style={styles.requestMetaFaint} numberOfLines={1}>
                approved by {item.approvedByName}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderStepHeader = () => (
    <View style={styles.stepHeader}>
      {stepTitles.map((entry, index) => {
        const active = stepIndex[step] >= index && step !== "done";
        const current = step === entry.step;
        return (
          <View key={entry.step} style={styles.stepChipWrap}>
            <View
              style={[
                styles.stepChip,
                {
                  backgroundColor: current ? theme.primary : active ? theme.surfaceAlt : "transparent",
                  borderColor: current ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.stepChipText,
                  { color: current ? theme.onPrimary : active ? theme.text : theme.muted },
                ]}
              >
                {index + 1}. {entry.label}
              </Text>
            </View>
            {index < stepTitles.length - 1 ? <View style={[styles.stepArrow, { backgroundColor: theme.border }]} /> : null}
          </View>
        );
      })}
    </View>
  );

  const renderScanStep = () => (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Scan the customer's receipt</Text>
      <Text style={[styles.stepHint, { color: theme.muted }]}>
        Scan the QR or barcode printed at the bottom of the receipt, or type the receipt number.
      </Text>

      <View style={[styles.scanCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="qr-code-outline" size={42} color={theme.accent} />
        <Text style={[styles.scanCardTitle, { color: theme.text }]}>Find the original sale</Text>
        <Button title="Scan Receipt QR" icon="scan" onPress={() => setReceiptScannerVisible(true)} />
        <View style={styles.manualRow}>
          <TextInput
            style={[
              styles.manualInput,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="Receipt number (e.g. RMBX9K2A)"
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            value={manualReceipt}
            onChangeText={setManualReceipt}
            onSubmitEditing={() => void handleManualLookup()}
            returnKeyType="search"
          />
          <Button title="Find" variant="secondary" onPress={() => void handleManualLookup()} />
        </View>
        {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
      </View>
    </View>
  );

  const renderItemsStep = () => {
    if (!sale) return null;
    const allReturned = sale.items.every((item) => remainingFor(item.id, item.quantity) <= 0);
    return (
      <View style={styles.stepBody}>
        <View style={[styles.receiptSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.receiptSummaryRow}>
            <View>
              <Text style={[styles.receiptSummaryNumber, { color: theme.text }]}>{sale.receiptNumber}</Text>
              <Text style={[styles.stepHint, { color: theme.muted }]}>
                {new Date(sale.createdAt).toLocaleString()} · {sale.cashierName}
              </Text>
            </View>
            <Text style={[styles.receiptSummaryTotal, { color: theme.primary }]}>{peso(sale.total)}</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.text }]}>Items to return</Text>
        {allReturned ? (
          <Text style={styles.errorText}>Every item on this receipt has already been returned.</Text>
        ) : null}

        <ScrollView style={styles.itemListScroll}>
          {sale.items.map((item) => {
            const remaining = remainingFor(item.id, item.quantity);
            const qty = returnQty[item.id] ?? 0;
            if (remaining <= 0) {
              return (
                <View key={item.id} style={[styles.lineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.lineInfo}>
                    <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text style={styles.lineMeta}>
                      {peso(item.unitPrice)} × {item.quantity} · fully returned
                    </Text>
                  </View>
                  <Badge label="Returned" color="#6b7b8d" size="sm" />
                </View>
              );
            }
            return (
              <View key={item.id} style={[styles.lineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.lineInfo}>
                  <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={styles.lineMeta}>
                    {peso(item.unitPrice)} × {item.quantity} · {remaining} returnable
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: theme.border }]}
                    onPress={() => setReturnQty((current) => ({ ...current, [item.id]: Math.max(qty - 1, 0) }))}
                  >
                    <Ionicons name="remove" size={16} color={theme.text} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, { color: theme.text }]}>{qty}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: theme.border }]}
                    onPress={() =>
                      setReturnQty((current) => ({ ...current, [item.id]: Math.min(qty + 1, remaining) }))
                    }
                  >
                    <Ionicons name="add" size={16} color={theme.text} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: theme.text }]}>Reason</Text>
        <View style={styles.chipRow}>
          {RETURN_REASONS.map((entry) => {
            const selected = reason === entry;
            return (
              <TouchableOpacity
                key={entry}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setReason(entry)}
              >
                <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{entry}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {reason === "Other" ? (
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            placeholder="Describe the reason..."
            placeholderTextColor={theme.muted}
            value={reasonNotes}
            onChangeText={setReasonNotes}
            multiline
          />
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.text }]}>Item condition</Text>
        <View style={styles.chipRow}>
          {RETURN_CONDITIONS.map((entry) => {
            const selected = condition === entry;
            return (
              <TouchableOpacity
                key={entry}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setCondition(entry)}
              >
                <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{entry}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderReplacementStep = () => (
    <View style={styles.stepBody}>
      <Text style={[styles.sectionLabel, { color: theme.text }]}>Replacement items</Text>
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.muted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search products..."
          placeholderTextColor={theme.muted}
          value={productSearch}
          onChangeText={setProductSearch}
        />
        <TouchableOpacity onPress={() => setProductScannerVisible(true)}>
          <Ionicons name="scan-outline" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {exchange.length > 0 ? (
        <View style={[styles.exchangeSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 0 }]}>Selected for exchange</Text>
          {exchange.map((item) => (
            <View key={item.productId} style={styles.exchangeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.lineMeta}>
                  {peso(item.unitPrice)} · stock {item.maxQuantity}
                </Text>
              </View>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={[styles.qtyBtn, { borderColor: theme.border }]}
                  onPress={() => updateExchangeQty(item.productId, item.quantity - 1)}
                >
                  <Ionicons name="remove" size={16} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.qtyValue, { color: theme.text }]}>{item.quantity}</Text>
                <TouchableOpacity
                  style={[styles.qtyBtn, { borderColor: theme.border }]}
                  onPress={() => updateExchangeQty(item.productId, item.quantity + 1)}
                >
                  <Ionicons name="add" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {catalogLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
      ) : (
        <ScrollView style={styles.productListScroll}>
          {products.map((product) => {
            const stock = stockMap.get(product.id) ?? 0;
            const inExchange = exchange.find((i) => i.productId === product.id);
            return (
              <TouchableOpacity
                key={product.id}
                style={[styles.productCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => addToExchange(product, 1)}
                disabled={stock <= 0 && !inExchange}
              >
                <View style={styles.lineInfo}>
                  <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={styles.lineMeta}>
                    {peso(product.retailPrice ?? 0)} · stock {stock}
                    {inExchange ? ` · ${inExchange.quantity} selected` : ""}
                  </Text>
                </View>
                <Ionicons
                  name={stock > 0 || inExchange ? "add-circle-outline" : "lock-closed-outline"}
                  size={22}
                  color={stock > 0 || inExchange ? theme.accent : theme.muted}
                />
              </TouchableOpacity>
            );
          })}
          {products.length === 0 ? (
            <Text style={[styles.stepHint, { color: theme.muted, textAlign: "center" }]}>No products found.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );

  const renderReviewStep = () => (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Review the exchange</Text>

      <View style={[styles.totalsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 0 }]}>Returning</Text>
        {selectedReturnItems.map((row) => (
          <View key={row.item.id} style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>
              {row.item.productName} × {row.quantity}
            </Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(round2(row.quantity * row.item.unitPrice))}</Text>
          </View>
        ))}
        <View style={[styles.totalRow, styles.totalRowStrong]}>
          <Text style={[styles.totalLabel, { color: theme.text }]}>Returned value</Text>
          <Text style={[styles.totalValue, { color: theme.text }]}>{peso(returnedTotal)}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 0 }]}>Replacement</Text>
        {exchange.map((item) => (
          <View key={item.productId} style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>
              {item.name} × {item.quantity}
            </Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(round2(item.quantity * item.unitPrice))}</Text>
          </View>
        ))}
        <View style={[styles.totalRow, styles.totalRowStrong]}>
          <Text style={[styles.totalLabel, { color: theme.text }]}>Replacement value</Text>
          <Text style={[styles.totalValue, { color: theme.text }]}>{peso(replacementTotal)}</Text>
        </View>
      </View>

      {priceDifference > 0 ? (
        <View style={[styles.outcomeCard, { backgroundColor: "rgba(23,162,184,0.08)", borderColor: "#17a2b8" }]}>
          <Ionicons name="cash-outline" size={20} color="#17a2b8" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outcomeTitle, { color: theme.text }]}>
              Customer adds {peso(priceDifference)}
            </Text>
            <Text style={[styles.stepHint, { color: theme.muted }]}>
              The replacement costs more, so the difference is collected as a top-up payment.
            </Text>
            <View style={styles.chipRow}>
              {(["CASH", "CARD", "DIGITAL"] as PaymentMethodType[]).map((method) => {
                const selected = paymentMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>
                      {paymentMethodLabel(method)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : priceDifference < 0 ? (
        <View style={[styles.outcomeCard, { backgroundColor: "rgba(240,173,78,0.10)", borderColor: "#f0ad4e" }]}>
          <Ionicons name="alert-circle-outline" size={20} color="#f0ad4e" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outcomeTitle, { color: theme.text }]}>
              Replacement is {peso(Math.abs(priceDifference))} lower
            </Text>
            <Text style={[styles.stepHint, { color: theme.muted }]}>
              The difference will not be refunded. Continuing requires the customer's agreement.
            </Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setShortfallAccepted((current) => !current)}
            >
              <Ionicons
                name={shortfallAccepted ? "checkbox-outline" : "square-outline"}
                size={20}
                color={shortfallAccepted ? "#28a745" : theme.muted}
              />
              <Text style={[styles.checkText, { color: theme.text }]}>
                Customer agrees to the lower-priced exchange
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.outcomeCard, { backgroundColor: "rgba(40,167,69,0.08)", borderColor: "#28a745" }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#28a745" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outcomeTitle, { color: theme.text }]}>Same price — smooth exchange</Text>
            <Text style={[styles.stepHint, { color: theme.muted }]}>
              Both totals match, so no payment or customer confirmation is needed.
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.approvalInfo, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.accent} />
        <Text style={[styles.stepHint, { color: theme.muted, flex: 1 }]}>
          Submitting puts the request on hold. A manager must then generate a one-time approval code before the
          exchange can be completed.
        </Text>
      </View>
    </View>
  );

  const renderApproveStep = () => {
    if (!activeRequest) return null;
    const approved = activeRequest.status === "APPROVED";
    return (
      <View style={styles.stepBody}>
        <View style={[styles.receiptSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.receiptSummaryRow}>
            <View>
              <Text style={[styles.receiptSummaryNumber, { color: theme.text }]}>{activeRequest.returnNumber}</Text>
              <Text style={[styles.stepHint, { color: theme.muted }]}>
                Receipt {activeRequest.receiptNumber} · requested by {activeRequest.requestedByName}
              </Text>
            </View>
            <Badge label={STATUS_LABELS[activeRequest.status]} color={STATUS_COLORS[activeRequest.status]} size="md" />
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>Returned value</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(activeRequest.returnedTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>Replacement value</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(activeRequest.replacementTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Difference</Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>{peso(activeRequest.priceDifference)}</Text>
          </View>
        </View>

        {activeRequest.status === "PENDING_APPROVAL" ? (
          <View style={[styles.codeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 0 }]}>Manager approval code</Text>
            <Text style={[styles.stepHint, { color: theme.muted }]}>
              A manager with approval rights generates a 6-character one-time code. Enter it below to authorize this
              return. Codes expire after 10 minutes.
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                style={[
                  styles.codeInput,
                  { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="XXXXXX"
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                value={codeInput}
                onChangeText={(value) => setCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              />
              <Button title="Approve" onPress={() => void handleApprove()} loading={busy} disabled={codeInput.length < 6} />
            </View>

            {canApprove ? (
              <View style={styles.managerBox}>
                <Text style={[styles.managerBoxTitle, { color: theme.text }]}>Manager tools</Text>
                <Button
                  title={generatedCode ? "Regenerate code" : "Generate approval code"}
                  variant="secondary"
                  icon="key-outline"
                  onPress={() => void handleGenerateCode()}
                  loading={busy}
                />
                {generatedCode ? (
                  <View style={[styles.generatedCodeBox, { borderColor: "#28a745" }]}>
                    <Text style={styles.generatedCode}>{generatedCode}</Text>
                    <Text style={styles.generatedCodeNote}>
                      Shown once — give this code to the cashier.
                      {generatedCodeExpiry
                        ? ` Valid until ${new Date(generatedCodeExpiry).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                        : ""}
                    </Text>
                  </View>
                ) : null}
                <Button title="Reject request" variant="danger" icon="close-circle-outline" onPress={handleReject} disabled={busy} />
              </View>
            ) : null}

            <Button title="Cancel request" variant="ghost" onPress={handleCancel} disabled={busy} />
          </View>
        ) : (
          <View style={[styles.codeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="checkmark-circle" size={36} color="#28a745" />
            <Text style={[styles.outcomeTitle, { color: theme.text, textAlign: "center" }]}>Approved</Text>
            <Text style={[styles.stepHint, { color: theme.muted, textAlign: "center" }]}>
              {activeRequest.approvedByName ? `Approved by ${activeRequest.approvedByName}. ` : ""}
              {activeRequest.priceDifference > 0
                ? `The customer pays ${peso(activeRequest.priceDifference)} via ${paymentMethodLabel(paymentMethod)}.`
                : "No payment is due."}
            </Text>
            {activeRequest.priceDifference > 0 ? (
              <View style={[styles.chipRow, { justifyContent: "center" }]}>
                {(["CASH", "CARD", "DIGITAL"] as PaymentMethodType[]).map((method) => {
                  const selected = paymentMethod === method;
                  return (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                          borderColor: selected ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setPaymentMethod(method)}
                    >
                      <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>
                        {paymentMethodLabel(method)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <Button
              title="Complete exchange"
              icon="swap-horizontal"
              onPress={() => void handleComplete()}
              loading={busy}
            />
            <Button title="Cancel request" variant="ghost" onPress={handleCancel} disabled={busy} />
          </View>
        )}
      </View>
    );
  };

  const renderDoneStep = () => {
    if (!activeRequest || !exchangeSale) return null;
    return (
      <View style={styles.stepBody}>
        <View style={[styles.doneCard, { backgroundColor: theme.surface, borderColor: "#28a745" }]}>
          <Ionicons name="checkmark-circle" size={54} color="#28a745" />
          <Text style={[styles.doneTitle, { color: theme.text }]}>Exchange completed</Text>
          <Text style={[styles.stepHint, { color: theme.muted, textAlign: "center" }]}>
            {activeRequest.returnNumber} · original receipt {activeRequest.receiptNumber}
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>Exchange receipt</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{exchangeSale.receiptNumber}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>Returned value</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(activeRequest.returnedTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.muted }]}>Replacement value</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{peso(activeRequest.replacementTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>
              {activeRequest.priceDifference > 0
                ? `Top-up paid (${paymentMethodLabel(exchangeSale.paymentMethod)})`
                : activeRequest.priceDifference < 0
                  ? "Shortfall accepted by customer"
                  : "Difference"}
            </Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>{peso(activeRequest.priceDifference)}</Text>
          </View>

          <View style={styles.doneActions}>
            <Button
              title={printing ? "Printing..." : "Print exchange receipt"}
              icon="print-outline"
              onPress={() => void handlePrintExchangeReceipt()}
              loading={printing}
            />
            <Button title="New return" variant="secondary" onPress={resetFlow} />
            <Button title="Close" variant="ghost" onPress={closeFlow} />
          </View>
        </View>
      </View>
    );
  };

  const flowBody: Record<FlowStep, React.ReactNode> = {
    scan: renderScanStep(),
    items: renderItemsStep(),
    replacement: renderReplacementStep(),
    review: renderReviewStep(),
    approve: renderApproveStep(),
    done: renderDoneStep(),
  };

  const canContinue =
    step === "items"
      ? selectedReturnItems.length > 0 && !(sale?.items.every((item) => remainingFor(item.id, item.quantity) <= 0) ?? false)
      : step === "replacement"
        ? exchange.length > 0
        : true;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.pageHeading}>
        <View>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Returns</Text>
          <Text style={[styles.pageSubtitle, { color: theme.muted }]}>
            Return requests, manager approvals, and exchanges
          </Text>
        </View>
        <View style={styles.headingActions}>
          <Text style={[styles.requestCount, { color: theme.muted }]}>{total} requests</Text>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.primary }]} onPress={openFlow}>
            <Ionicons name="add" size={20} color={theme.onPrimary} />
            <Text style={[styles.newBtnText, { color: theme.onPrimary }]}>New Return</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchTools}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.muted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search return or receipt number..."
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={theme.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <UsbBarcodeScannerInput onScan={handleUsbScan} dark={dark} disabled={flowVisible} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="return-up-back" size={48} color={theme.muted} />
              <Text style={[styles.emptyText, { color: theme.muted }]}>No return requests yet</Text>
              <Text style={[styles.emptyHint, { color: theme.muted }]}>
                Tap New Return and scan a receipt QR code to get started.
              </Text>
            </View>
          }
        />
      )}
      <PaginationControls
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        dark={dark}
      />

      <Modal visible={flowVisible} animationType="slide" onRequestClose={closeFlow}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.flowHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity
              onPress={closeFlow}
              style={[styles.headerIconBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
              <Ionicons name="close" size={20} color={theme.accent} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Ionicons name="return-up-back" size={17} color={theme.accent} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {step === "done" ? "Exchange complete" : "New return"}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.flowUsbRow}>
            <UsbBarcodeScannerInput
              onScan={handleUsbScan}
              dark={dark}
              compact
              disabled={step !== "scan" && step !== "replacement"}
            />
          </View>

          {step !== "done" ? renderStepHeader() : null}

          {flowError ? (
            <View style={[styles.flowError, { backgroundColor: "rgba(220,53,69,0.10)", borderColor: "#dc3545" }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc3545" />
              <Text style={styles.flowErrorText}>{flowError}</Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.flowScroll} keyboardShouldPersistTaps="handled">
            {flowBody[step]}
          </ScrollView>

          {step !== "done" && step !== "approve" ? (
            <View style={[styles.flowFooter, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <Button
                title="Back"
                variant="secondary"
                onPress={() => {
                  setFlowError(null);
                  setStep((current) => {
                    if (current === "items") return "scan";
                    if (current === "replacement") return "items";
                    if (current === "review") return "replacement";
                    return current;
                  });
                }}
                disabled={step === "scan" || busy}
                style={styles.footerBtn}
              />
              <Button
                title={
                  step === "scan"
                    ? "Find receipt"
                    : step === "items"
                      ? "Choose replacement"
                      : step === "replacement"
                        ? "Review exchange"
                        : "Submit for approval"
                }
                onPress={() => {
                  setFlowError(null);
                  if (step === "scan") void handleManualLookup();
                  else if (step === "items") setStep("replacement");
                  else if (step === "replacement") setStep("review");
                  else void submitRequest();
                }}
                loading={busy}
                disabled={step !== "scan" && !canContinue}
                style={styles.footerBtn}
              />
            </View>
          ) : null}
        </View>
      </Modal>

      <ReceiptQrScannerModal
        visible={receiptScannerVisible}
        dark={dark}
        onClose={() => setReceiptScannerVisible(false)}
        onScan={async (barcode) => {
          setReceiptScannerVisible(false);
          setTimeout(() => void handleReceiptLookup(barcode), 250);
        }}
      />
      <BarcodeScannerModal
        visible={productScannerVisible}
        dark={dark}
        onClose={() => setProductScannerVisible(false)}
        onScan={async (barcode) => {
          setProductScannerVisible(false);
          setTimeout(() => void handleProductScan(barcode), 250);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 12, marginTop: 3 },
  headingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  requestCount: { fontSize: 12, fontWeight: "600" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  newBtnText: { fontSize: 13, fontWeight: "700" },
  searchTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  list: { padding: 16, paddingTop: 8, flexGrow: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  emptyHint: { fontSize: 12, marginTop: 4, textAlign: "center" },
  requestCard: { padding: 14, marginBottom: 8, borderWidth: 1, borderRadius: 8 },
  requestRow: { flexDirection: "row", alignItems: "center" },
  requestIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  requestInfo: { flex: 1, minWidth: 0, paddingRight: 12 },
  requestNumber: { fontSize: 14, fontWeight: "700" },
  requestMeta: { fontSize: 12, marginTop: 2 },
  requestMetaFaint: { fontSize: 11, color: "#8e99a4", marginTop: 2 },
  requestRight: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  requestDiff: { fontSize: 15, fontWeight: "700" },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSpacer: { width: 38 },
  flowUsbRow: { paddingHorizontal: 16, paddingTop: 10 },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stepChipWrap: { flexDirection: "row", alignItems: "center" },
  stepChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepChipText: { fontSize: 10, fontWeight: "700" },
  stepArrow: { width: 8, height: 1.5, marginHorizontal: 1 },
  flowError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  flowErrorText: { flex: 1, color: "#dc3545", fontSize: 12, fontWeight: "600" },
  flowScroll: { padding: 16, paddingBottom: 24 },
  stepBody: { gap: 10 },
  stepTitle: { fontSize: 17, fontWeight: "700" },
  stepHint: { fontSize: 12, lineHeight: 17 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginTop: 6 },
  scanCard: {
    alignItems: "center",
    gap: 12,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  scanCardTitle: { fontSize: 15, fontWeight: "700" },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
  },
  receiptSummary: { padding: 14, borderRadius: 10, borderWidth: 1 },
  receiptSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receiptSummaryNumber: { fontSize: 15, fontWeight: "700" },
  receiptSummaryTotal: { fontSize: 17, fontWeight: "800" },
  itemListScroll: { maxHeight: 240 },
  productListScroll: { maxHeight: 260 },
  lineCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  lineInfo: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 13, fontWeight: "600" },
  lineMeta: { fontSize: 11, color: "#8e99a4", marginTop: 2 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { fontSize: 14, fontWeight: "700", minWidth: 20, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: "top",
  },
  exchangeSummary: { padding: 12, borderRadius: 10, borderWidth: 1, gap: 6 },
  exchangeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  totalsCard: { padding: 14, borderRadius: 10, borderWidth: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  totalRowStrong: { borderTopWidth: 1, borderTopColor: "rgba(128,128,128,0.2)", marginTop: 4, paddingTop: 7 },
  totalLabel: { fontSize: 13, flex: 1, paddingRight: 8 },
  totalValue: { fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginVertical: 8 },
  outcomeCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  outcomeTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  checkText: { fontSize: 13, fontWeight: "600", flex: 1 },
  approvalInfo: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  codeCard: { padding: 16, borderRadius: 10, borderWidth: 1, gap: 12, alignItems: "stretch" },
  managerBox: {
    borderWidth: 1,
    borderColor: "#17a2b8",
    borderRadius: 10,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(23,162,184,0.05)",
  },
  managerBoxTitle: { fontSize: 13, fontWeight: "700" },
  generatedCodeBox: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    backgroundColor: "rgba(40,167,69,0.06)",
  },
  generatedCode: { fontSize: 30, fontWeight: "900", letterSpacing: 8, color: "#28a745" },
  generatedCodeNote: { fontSize: 11, color: "#6b7b8d", textAlign: "center", marginTop: 6 },
  doneCard: { padding: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "stretch", gap: 4 },
  doneTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", marginTop: 8 },
  doneActions: { marginTop: 16, gap: 10 },
  flowFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
  },
  footerBtn: { flex: 1 },
  errorText: { color: "#dc3545", fontSize: 12, fontWeight: "600" },
});
