import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { IndependentOnboardingService } from "@/lib/business/independent-onboarding.service";
import { CashierService } from "@/lib/services/cashier.service";
import { useCashierStore } from "@/lib/stores/cashier-store";

type SetupStep = "loading" | "authorize" | "business" | "terminal" | "owner" | "receipt" | "review";

export default function IndependentSetup() {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const colors = useMemo(() => ({
    bg: dark ? "#07111f" : "#f8fbff",
    card: dark ? "#111c2e" : "#ffffff",
    input: dark ? "#0c1627" : "#f8fbff",
    text: dark ? "#f8fafc" : "#172033",
    muted: dark ? "#a8b4c5" : "#667085",
    border: dark ? "#2b3a50" : "#d9e2ec",
    accent: dark ? "#8abaff" : "#17386b",
  }), [dark]);
  const [step, setStep] = useState<SetupStep>("loading");
  const [authorizedSessionId, setAuthorizedSessionId] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [posSystemName, setPosSystemName] = useState("Dealership POS");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [branchName, setBranchName] = useState("Main Location");
  const [deviceName, setDeviceName] = useState("Checkout 1");
  const [ownerName, setOwnerName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [paperWidth, setPaperWidth] = useState<58 | 80>(58);
  const [taxRate, setTaxRate] = useState<0 | 0.12>(0);
  const [receiptFooter, setReceiptFooter] = useState("Thank you for your purchase!");

  useEffect(() => {
    IndependentOnboardingService.needsExistingInstallationAuthorization()
      .then((needed) => setStep(needed ? "authorize" : "business"))
      .catch((error) => Alert.alert("Setup error", error?.message ?? "Could not inspect this installation."));
  }, []);

  const field = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options: { placeholder?: string; secure?: boolean; keyboard?: "default" | "email-address" | "phone-pad" | "number-pad"; multiline?: boolean } = {}
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={options.placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={options.secure}
        keyboardType={options.keyboard}
        autoCapitalize={options.keyboard === "email-address" ? "none" : "sentences"}
        multiline={options.multiline}
        style={[styles.input, options.multiline && styles.multiline, { color: colors.text, backgroundColor: colors.input, borderColor: colors.border }]}
      />
    </View>
  );

  const authorize = async () => {
    setBusy(true);
    try {
      const result = await CashierService.loginSuperAdmin(adminUsername, adminPassword);
      if (!result.success) throw new Error(result.error);
      const sessionId = useCashierStore.getState().session?.sessionId;
      if (!sessionId) throw new Error("Authorization session was not created.");
      setAuthorizedSessionId(sessionId);
      setAdminPassword("");
      setStep("business");
    } catch (error: any) {
      Alert.alert("Authorization failed", error?.message ?? "Check the Super Admin credentials.");
    } finally {
      setBusy(false);
    }
  };

  const nextFromBusiness = () => {
    if (!businessName.trim() || !posSystemName.trim()) return Alert.alert("Required details", "Enter the business name and POS system name.");
    setStep("terminal");
  };
  const nextFromTerminal = () => {
    if (!branchName.trim() || !deviceName.trim()) return Alert.alert("Required details", "Enter a location and terminal name.");
    setStep("owner");
  };
  const nextFromOwner = () => {
    if (!ownerName.trim() || !ownerUsername.trim()) return Alert.alert("Required details", "Enter the owner name and username.");
    if (!/^\d{6}$/.test(pin)) return Alert.alert("Invalid PIN", "Use exactly 6 numbers for the owner PIN.");
    if (pin !== confirmPin) return Alert.alert("PIN mismatch", "The two owner PIN entries do not match.");
    setStep("receipt");
  };

  const finish = async () => {
    setBusy(true);
    try {
      await IndependentOnboardingService.complete({
        businessName, posSystemName, address, supportPhone: phone, contactEmail: email,
        branchName, deviceName, ownerName, ownerUsername, ownerPin: pin,
        paperWidthMm: paperWidth, receiptFooter, currencyCode: "PHP", taxRate,
      });
      if (authorizedSessionId) await CashierService.logout(authorizedSessionId);
      Alert.alert(
        "Independent POS is ready",
        "The dealership, local terminal, owner, and receipt defaults were saved. Sign in with the owner PIN. OMS backup access can be connected separately in Settings.",
        [{ text: "Continue to sign in", onPress: () => router.replace("/(auth)") }]
      );
    } catch (error: any) {
      Alert.alert("Setup could not be completed", error?.message ?? "Review the details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<SetupStep, string> = {
    loading: "Preparing setup", authorize: "Authorize changes", business: "Business profile",
    terminal: "Location & terminal", owner: "Create owner", receipt: "Receipt defaults", review: "Review setup",
  };
  const order: SetupStep[] = ["business", "terminal", "owner", "receipt", "review"];
  const index = order.indexOf(step);

  if (step === "loading") {
    return <View style={[styles.loading, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.accent} size="large" /><Text style={{ color: colors.muted }}>Checking local data…</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.accent} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{titles[step]}</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>Fully Independent POS · local setup</Text>
        </View>
        {index >= 0 ? <Text style={[styles.counter, { color: colors.muted }]}>{index + 1}/5</Text> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {step === "authorize" && <>
            <Ionicons name="shield-checkmark-outline" size={34} color={colors.accent} />
            <Text style={[styles.title, { color: colors.text }]}>Existing data detected</Text>
            <Text style={[styles.help, { color: colors.muted }]}>Re-enter Super Admin credentials before changing an existing installation. Products, stock, transfers, users, and sales will be preserved.</Text>
            {field("Super Admin username", adminUsername, setAdminUsername, { placeholder: "Username" })}
            {field("Super Admin password", adminPassword, setAdminPassword, { placeholder: "Password", secure: true })}
            <PrimaryButton label="Authorize and continue" onPress={authorize} busy={busy} />
          </>}
          {step === "business" && <>
            <Text style={[styles.title, { color: colors.text }]}>Name this dealership</Text>
            <Text style={[styles.help, { color: colors.muted }]}>These details appear throughout the app and on receipts. A stable business ID is generated separately from the editable name.</Text>
            {field("Business/display name *", businessName, setBusinessName, { placeholder: "Example Motors" })}
            {field("POS system name *", posSystemName, setPosSystemName)}
            {field("Address", address, setAddress, { multiline: true })}
            {field("Phone", phone, setPhone, { keyboard: "phone-pad" })}
            {field("Email", email, setEmail, { keyboard: "email-address" })}
            <PrimaryButton label="Continue" onPress={nextFromBusiness} />
          </>}
          {step === "terminal" && <>
            <Text style={[styles.title, { color: colors.text }]}>Identify this checkout</Text>
            <Text style={[styles.help, { color: colors.muted }]}>Location and terminal IDs remain stable even when these display names change.</Text>
            {field("Location/branch name *", branchName, setBranchName)}
            {field("Terminal name *", deviceName, setDeviceName)}
            <NavButtons back={() => setStep("business")} next={nextFromTerminal} />
          </>}
          {step === "owner" && <>
            <Text style={[styles.title, { color: colors.text }]}>Create the dealership owner</Text>
            <Text style={[styles.help, { color: colors.muted }]}>The owner can manage users, products, inventory, branding, receipts, and business settings.</Text>
            {field("Owner display name *", ownerName, setOwnerName)}
            {field("Owner username *", ownerUsername, setOwnerUsername, { placeholder: "owner" })}
            {field("6-digit sign-in PIN *", pin, setPin, { keyboard: "number-pad", secure: true })}
            {field("Confirm PIN *", confirmPin, setConfirmPin, { keyboard: "number-pad", secure: true })}
            <NavButtons back={() => setStep("terminal")} next={nextFromOwner} />
          </>}
          {step === "receipt" && <>
            <Text style={[styles.title, { color: colors.text }]}>Choose useful defaults</Text>
            <Text style={[styles.help, { color: colors.muted }]}>Currency starts as PHP. Choose tax only if it applies to this business; these settings do not by themselves establish tax compliance.</Text>
            <Text style={[styles.label, { color: colors.text }]}>Default tax treatment</Text>
            <View style={styles.choiceRow}>{([{ label: "No automatic tax", value: 0 }, { label: "VAT 12%", value: 0.12 }] as const).map((option) => <TouchableOpacity key={option.value} onPress={() => setTaxRate(option.value)} style={[styles.choice, { borderColor: taxRate === option.value ? colors.accent : colors.border, backgroundColor: colors.input }]}><Ionicons name={taxRate === option.value ? "radio-button-on" : "radio-button-off"} size={20} color={colors.accent} /><Text style={{ color: colors.text }}>{option.label}</Text></TouchableOpacity>)}</View>
            <Text style={[styles.label, { color: colors.text }]}>Thermal paper width</Text>
            <View style={styles.choiceRow}>{([58, 80] as const).map((width) => <TouchableOpacity key={width} onPress={() => setPaperWidth(width)} style={[styles.choice, { borderColor: paperWidth === width ? colors.accent : colors.border, backgroundColor: colors.input }]}><Ionicons name={paperWidth === width ? "radio-button-on" : "radio-button-off"} size={20} color={colors.accent} /><Text style={{ color: colors.text }}>{width} mm</Text></TouchableOpacity>)}</View>
            {field("Receipt footer", receiptFooter, setReceiptFooter, { multiline: true })}
            <NavButtons back={() => setStep("owner")} next={() => setStep("review")} />
          </>}
          {step === "review" && <>
            <Text style={[styles.title, { color: colors.text }]}>Ready for local sales</Text>
            <Text style={[styles.help, { color: colors.muted }]}>No OMS device registration will occur. Checkout, products, inventory, users, and receipts work locally and offline.</Text>
            <ReviewRow label="Business" value={businessName} colors={colors} />
            <ReviewRow label="POS name" value={posSystemName} colors={colors} />
            <ReviewRow label="Location" value={branchName} colors={colors} />
            <ReviewRow label="Terminal" value={deviceName} colors={colors} />
            <ReviewRow label="Owner" value={`${ownerName} (${ownerUsername.toLowerCase()})`} colors={colors} />
            <ReviewRow label="Receipt" value={`${paperWidth} mm · PHP · ${taxRate === 0.12 ? "VAT 12%" : "no automatic tax"}`} colors={colors} />
            <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.input }]}><Ionicons name="cloud-offline-outline" size={20} color={colors.accent} /><Text style={[styles.noticeText, { color: colors.muted }]}>OMS EOD/backup uploads require a separate backup connection. Local sales are never blocked by that connection.</Text></View>
            <NavButtons back={() => setStep("receipt")} next={finish} nextLabel="Create Independent POS" busy={busy} />
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return <TouchableOpacity disabled={busy} onPress={onPress} style={[styles.primary, busy && { opacity: 0.65 }]}>{busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{label}</Text><Ionicons name="arrow-forward" color="#fff" size={18} /></>}</TouchableOpacity>;
}

function NavButtons({ back, next, nextLabel = "Continue", busy }: { back: () => void; next: () => void; nextLabel?: string; busy?: boolean }) {
  return <View style={styles.nav}><TouchableOpacity onPress={back} disabled={busy} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity><View style={{ flex: 1 }}><PrimaryButton label={nextLabel} onPress={next} busy={busy} /></View></View>;
}

function ReviewRow({ label, value, colors }: { label: string; value: string; colors: { text: string; muted: string; border: string } }) {
  return <View style={[styles.review, { borderBottomColor: colors.border }]}><Text style={[styles.reviewLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.reviewValue, { color: colors.text }]}>{value || "Not set"}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  header: { minHeight: 76, paddingTop: Platform.OS === "android" ? 18 : 8, paddingHorizontal: 18, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, headerTitle: { fontSize: 18, fontWeight: "800" }, headerSub: { fontSize: 12, marginTop: 2 }, counter: { fontWeight: "700" },
  content: { padding: 18, paddingBottom: 40, alignItems: "center" }, card: { width: "100%", maxWidth: 620, borderWidth: 1, borderRadius: 18, padding: 20 },
  title: { fontSize: 23, fontWeight: "800", marginTop: 8, marginBottom: 6 }, help: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  field: { marginBottom: 15 }, label: { fontSize: 13, fontWeight: "700", marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, fontSize: 15 }, multiline: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" },
  primary: { minHeight: 50, borderRadius: 11, backgroundColor: "#17386b", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 8 }, primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  nav: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 4 }, secondary: { minHeight: 50, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" }, secondaryText: { color: "#52709c", fontWeight: "800" },
  choiceRow: { flexDirection: "row", gap: 10, marginBottom: 16 }, choice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  review: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, reviewLabel: { fontSize: 12, marginBottom: 3 }, reviewValue: { fontSize: 15, fontWeight: "700" },
  notice: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 18 }, noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
