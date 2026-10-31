import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { query } from "@/lib/db/connection";
import { EmployeeSyncService } from "@/lib/services/employee-sync.service";
import { EmployeePinService } from "@/lib/services/employee-pin.service";
import { usePosTheme } from "@/lib/stores/ui-store";
import { EmployeePinEditor } from "./employee-pin-editor";

interface Employee { id: string; displayName: string; username: string | null; pinLoginEnabled: number }

export function RegistrationPinSetup({ onComplete }: { onComplete: () => void }) {
  const theme = usePosTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError(""); setLoaded(false);
    try {
      if (!await EmployeeSyncService.refresh()) throw new Error("Connect to OMS and refresh to load the employees assigned to this device. Activation is already complete; do not register again.");
      setEmployees(await query<Employee>("SELECT id, displayName, username, pinLoginEnabled FROM Cashier WHERE active = 1 AND employeeId LIKE 'oms:%' ORDER BY displayName COLLATE NOCASE ASC"));
      setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load assigned employees."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const ready = loaded && !busy && employees.every(employee => employee.pinLoginEnabled === 1);
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 24, alignItems: "center" }}>
    <View style={{ width: "100%", maxWidth: 640, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 24 }}>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>Set up employee PINs</Text>
      <Text style={{ color: theme.muted, marginTop: 10, lineHeight: 22 }}>Device activated. Set a six-digit PIN for each assigned employee who needs one. Existing PINs can be kept or changed. Saved changes also apply to their other assigned devices.</Text>
      {busy && <ActivityIndicator style={{ marginTop: 16 }} color={theme.accent} />}
      {!!error && <Text accessibilityRole="alert" style={{ color: theme.accent, marginTop: 12 }}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()} style={{ paddingVertical: 14 }}><Text style={{ color: theme.accent, fontWeight: "700" }}>Refresh assigned employees</Text></TouchableOpacity>
      {loaded && !employees.length && <Text style={{ color: theme.muted }}>No employees are assigned. Assign employees through OMS and refresh, or continue using the device recovery administrator.</Text>}
      {employees.map(employee => <View key={employee.id} style={{ borderTopWidth: 1, borderColor: theme.border, paddingVertical: 16 }}>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}>{employee.displayName}</Text>
        {!!employee.username && <Text style={{ color: theme.muted, marginTop: 4 }}>@{employee.username}</Text>}
        <Text style={{ color: theme.muted, marginTop: 4 }}>{employee.pinLoginEnabled ? "PIN already configured — keep it or change it below." : "PIN setup required before employee sign-in."}</Text>
        <EmployeePinEditor userId={employee.id} registration onSaved={() => void load()} />
      </View>)}
      <TouchableOpacity accessibilityRole="button" disabled={!ready} onPress={() => { EmployeePinService.endRegistration(); onComplete(); }} style={{ backgroundColor: theme.primary, opacity: ready ? 1 : 0.5, borderRadius: 10, padding: 14, marginTop: 16 }}><Text style={{ color: theme.onPrimary, fontWeight: "800", textAlign: "center" }}>Continue to sign in</Text></TouchableOpacity>
    </View>
  </ScrollView>;
}
