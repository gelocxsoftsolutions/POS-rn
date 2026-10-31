import { formatAmount } from "@/lib/formatting/money";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DEFAULT_RECEIPT_TEMPLATE } from "@/lib/business/defaults";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import type { ReceiptTemplate } from "@/lib/business/types";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { usePosTheme } from "@/lib/stores/ui-store";
import { printReceiptPaper } from "@/lib/printing/print-receipt-paper";

const SAMPLE_RECEIPT = {
  receiptNumber: "SAMPLE-0001", date: new Date().toISOString(), customerName: "Sample Customer",
  cashierName: "Sample Cashier", subtotal: 1325, tax: 0, total: 1325, paidAmount: 1500,
  change: 175, paymentMethod: "CASH",
  items: [
    { name: "Long sample product description for wrapping", quantity: 2, unitPrice: 425 },
    { name: "Second variation", quantity: 1, unitPrice: 475 },
  ],
};

export default function ReceiptDesignerScreen() {
  const router = useRouter();
  const theme = usePosTheme();
  const session = useCashierStore((state) => state.session);
  const business = useBusinessConfigStore((state) => state.configuration);
  const printer = usePrinterStore((state) => state.selectedPrinter);
  const [template, setTemplate] = useState<ReceiptTemplate>(business.receiptTemplate);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);

  useEffect(() => {
    if (!session?.isSuperAdmin) router.replace("/(pos)/settings" as any);
  }, [router, session?.isSuperAdmin]);

  const settings = useMemo(() => ({
    storeName: business.businessName, address: business.address,
    supportPhone: business.supportPhone, taxLabel: "Tax",
    logoUri: business.receiptLogoUri || business.businessLogoUri,
    receiptFooter: template.footerMessage, ...template,
  }), [business, template]);
  useEffect(() => setLogoPreviewFailed(false), [settings.logoUri]);
  const previewLogo = settings.logoUri && !logoPreviewFailed
    ? { uri: settings.logoUri }
    : require("../../../assets/nct-seafoods-logo.png");

  const save = async () => {
    setSaving(true);
    try {
      await BusinessConfigurationService.saveReceiptTemplate(template);
      Alert.alert("Receipt template saved", "New receipts and actual print jobs will use this version.");
    } catch (error: any) {
      Alert.alert("Receipt designer", error?.message ?? "Unable to save the template.");
    } finally { setSaving(false); }
  };

  const testPrint = async () => {
    setPrinting(true);
    try {
      await printReceiptPaper({ receipt: SAMPLE_RECEIPT, settings, printerAddress: printer?.address });
    } finally { setPrinting(false); }
  };

  const surface = theme.surface;
  const border = theme.border;
  const text = theme.text;
  const muted = theme.muted;
  const setFlag = (key: keyof ReceiptTemplate, value: boolean) => setTemplate((current) => ({ ...current, [key]: value }));

  return <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity style={[styles.back, { borderColor: border, backgroundColor: surface }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={text} /></TouchableOpacity><View><Text style={[styles.title, { color: text }]}>Receipt Designer</Text><Text style={[styles.subtitle, { color: muted }]}>Structured thermal template — no executable HTML</Text></View></View>
    <View style={styles.columns}>
      <View style={[styles.card, styles.controls, { backgroundColor: surface, borderColor: border }]}>
        <Text style={[styles.sectionTitle, { color: text }]}>Content</Text>
        <Text style={[styles.label, { color: text }]}>Header message</Text><TextInput value={template.headerMessage} onChangeText={(headerMessage) => setTemplate((v) => ({ ...v, headerMessage }))} style={[styles.input, { color: text, borderColor: border, backgroundColor: theme.surfaceAlt }]} placeholder="Optional welcome message" placeholderTextColor={muted} />
        <Text style={[styles.label, { color: text }]}>Footer / thank-you message</Text><TextInput value={template.footerMessage} onChangeText={(footerMessage) => setTemplate((v) => ({ ...v, footerMessage }))} multiline style={[styles.input, styles.multiline, { color: text, borderColor: border, backgroundColor: theme.surfaceAlt }]} placeholderTextColor={muted} />
        <Text style={[styles.label, { color: text }]}>Paper width</Text><View style={styles.row}>{([58, 80] as const).map((width) => { const selected = template.paperWidthMm === width; return <TouchableOpacity key={width} style={[styles.choice, { borderColor: selected ? theme.accent : border, backgroundColor: selected ? theme.surfaceAlt : surface }]} onPress={() => setTemplate((v) => ({ ...v, paperWidthMm: width }))}><Text style={{ color: selected ? theme.accent : text }}>{width} mm</Text></TouchableOpacity>; })}</View>
        <Text style={[styles.label, { color: text }]}>Header alignment</Text><View style={styles.row}>{(["left", "center", "right"] as const).map((alignment) => { const selected = template.headerAlignment === alignment; return <TouchableOpacity key={alignment} style={[styles.choice, { borderColor: selected ? theme.accent : border, backgroundColor: selected ? theme.surfaceAlt : surface }]} onPress={() => setTemplate((v) => ({ ...v, headerAlignment: alignment }))}><Text style={{ color: selected ? theme.accent : text }}>{alignment}</Text></TouchableOpacity>; })}</View>
        {([
          ["Emphasize business name", "emphasizeBusinessName"], ["Show cashier", "showCashier"],
          ["Show customer", "showCustomer"], ["Show payment details", "showPaymentDetails"],
          ["Show receipt barcode", "showReceiptBarcode"], ["Show receipt QR", "showReceiptQr"],
        ] as Array<[string, keyof ReceiptTemplate]>).map(([label, key]) => <View key={key} style={styles.switchRow}><Text style={[styles.switchLabel, { color: text }]}>{label}</Text><Switch value={Boolean(template[key])} onValueChange={(value) => setFlag(key, value)} trackColor={{ false: theme.surfaceAlt, true: theme.primary }} thumbColor={Boolean(template[key]) ? theme.onPrimary : theme.muted} ios_backgroundColor={theme.surfaceAlt} /></View>)}
      </View>
      <View style={[styles.previewShell, { width: template.paperWidthMm === 80 ? 390 : 300 }]}>
        <Image source={previewLogo} style={styles.logo} resizeMode="contain" onError={() => setLogoPreviewFailed(true)} />
        <Text style={[styles.business, template.emphasizeBusinessName && { fontWeight: "900" }]}>{business.businessName}</Text>
        {template.headerMessage ? <Text style={[styles.centerText, { textAlign: template.headerAlignment }]}>{template.headerMessage}</Text> : null}
        <Text style={styles.centerText}>{business.address}</Text><Text style={styles.centerText}>{business.supportPhone}</Text>
        <Text style={styles.rule}>--------------------------------</Text><Text style={styles.centerText}>SAMPLE-0001</Text>
        {template.showCustomer ? <Text>Customer: Sample Customer</Text> : null}{template.showCashier ? <Text>Cashier: Sample Cashier</Text> : null}<Text style={styles.rule}>--------------------------------</Text>
        {SAMPLE_RECEIPT.items.map((item) => <View key={item.name} style={styles.item}><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.name}</Text><Text>{item.quantity} x PHP {formatAmount(item.unitPrice)}</Text></View><Text>PHP {formatAmount(item.quantity * item.unitPrice)}</Text></View>)}
        <Text style={styles.rule}>--------------------------------</Text><View style={styles.item}><Text style={styles.total}>TOTAL</Text><Text style={styles.total}>PHP 1325.00</Text></View>
        {template.showPaymentDetails ? <><View style={styles.item}><Text>Paid (CASH)</Text><Text>PHP 1500.00</Text></View><View style={styles.item}><Text>Change</Text><Text>PHP 175.00</Text></View></> : null}
        <Text style={[styles.footer, { textAlign: template.footerAlignment }]}>{template.footerMessage}</Text>
        <Text style={styles.previewNote}>{template.showReceiptBarcode ? "[CODE 128 RECEIPT BARCODE]" : ""}</Text><Text style={styles.previewNote}>{template.showReceiptQr ? "[RECEIPT QR]" : ""}</Text>
      </View>
    </View>
    <View style={styles.actions}><TouchableOpacity style={[styles.secondary, { borderColor: border, backgroundColor: theme.surfaceAlt }]} onPress={() => setTemplate({ ...DEFAULT_RECEIPT_TEMPLATE })}><Text style={{ color: text, fontWeight: "700" }}>Reset to default</Text></TouchableOpacity><TouchableOpacity style={[styles.test, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} disabled={printing} onPress={() => void testPrint()}><Text style={[styles.white, { color: theme.text }]}>{printing ? "Printing…" : "Test print"}</Text></TouchableOpacity><TouchableOpacity style={[styles.save, { backgroundColor: theme.primary }]} disabled={saving} onPress={() => void save()}><Text style={[styles.white, { color: theme.onPrimary }]}>{saving ? "Saving…" : "Save template"}</Text></TouchableOpacity></View>
    <Text style={[styles.disclaimer, { color: muted }]}>Receipt customization does not by itself establish tax or regulatory compliance.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 50, alignItems: "center" }, header: { width: "100%", maxWidth: 980, flexDirection: "row", alignItems: "center", marginBottom: 18 }, back: { width: 40, height: 40, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 12 }, title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12, marginTop: 2 },
  columns: { width: "100%", maxWidth: 980, flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "flex-start", justifyContent: "center" }, card: { borderWidth: 1, borderRadius: 10, padding: 18 }, controls: { flex: 1, minWidth: 300, maxWidth: 560 }, sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 }, label: { fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }, multiline: { minHeight: 74, textAlignVertical: "top" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 45 }, switchLabel: { flex: 1, fontSize: 13 },
  previewShell: { backgroundColor: "#ffffff", padding: 20, borderRadius: 4, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 }, logo: { width: 100, height: 70, alignSelf: "center" }, business: { textAlign: "center", fontSize: 17 }, centerText: { textAlign: "center", fontSize: 11 }, rule: { textAlign: "center", marginVertical: 8 }, item: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginVertical: 3 }, itemName: { overflow: "hidden" }, total: { fontSize: 15, fontWeight: "900" }, footer: { marginTop: 14, fontStyle: "italic" }, previewNote: { marginTop: 10, textAlign: "center", fontSize: 10 },
  actions: { width: "100%", maxWidth: 980, flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 18 }, secondary: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 }, test: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 }, save: { borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 }, white: { fontWeight: "800" }, disclaimer: { width: "100%", maxWidth: 980, marginTop: 12, fontSize: 11 },
});
