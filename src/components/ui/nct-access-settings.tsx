import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./card";
import { EmployeePinEditor } from "./employee-pin-editor";
import { usePosTheme } from "@/lib/stores/ui-store";
import { EmployeeSyncService } from "@/lib/services/employee-sync.service";
import { getApiConfig } from "@/lib/api/http";
import { POS_PERMISSIONS } from "@/lib/permissions/catalog";
import { getNctSettingsDirectory, type SettingsEmployee, type SettingsRole } from "@/lib/permissions/settings-access";

export function NctAccessSettings({ section, builtInSuperAdmin }: {
  section: "users" | "permissions";
  builtInSuperAdmin: boolean;
}) {
  const theme = usePosTheme();
  const [employees, setEmployees] = useState<SettingsEmployee[]>([]);
  const [roles, setRoles] = useState<SettingsRole[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (fromOms: boolean) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      if (fromOms && !await EmployeeSyncService.refresh()) {
        setNotice("OMS could not be refreshed. Showing the last saved device directory; reconnect and try again.");
      } else if (fromOms) setNotice("Employee assignments and permissions refreshed from OMS.");
      const directory = await getNctSettingsDirectory(builtInSuperAdmin);
      setEmployees(directory.employees); setRoles(directory.roles);
      setSelectedRole((current) => directory.roles.some((role) => role.id === current) ? current : directory.roles[0]?.id ?? "");
    } catch {
      setError("Unable to load the employee directory. Previously loaded information has been retained. Try Refresh from OMS again.");
    } finally { setBusy(false); }
  }, [builtInSuperAdmin]);
  useEffect(() => { void load(false); }, [load]);

  const openOms = async () => {
    try {
      const url = new URL(getApiConfig().baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid OMS URL");
      await Linking.openURL(new URL("/pos", url.origin).toString());
    } catch { setError("Unable to open OMS. Check the OMS server address in Settings → OMS & Synchronization."); }
  };
  const buttonStyle = { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, opacity: busy ? 0.6 : 1 };
  const role = roles.find((item) => item.id === selectedRole);
  return <Card style={{ marginBottom: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 16 }}>
    <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>{section === "users" ? "OMS Employees" : "Roles & Permissions"}</Text>
    <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>View the employees assigned to this device and their saved access. Manage Employees, branch POS access and role grants in OMS, then refresh here.</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 14 }}>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => void load(true)}><Text style={{ color: theme.text, fontWeight: "700" }}>Refresh from OMS</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={buttonStyle} onPress={() => void openOms()}><Text style={{ color: theme.text, fontWeight: "700" }}>Manage in OMS</Text></TouchableOpacity>
      {busy && <ActivityIndicator color={theme.accent} accessibilityLabel="Loading employee access" />}
    </View>
    {error && <Text accessibilityRole="alert" style={{ color: theme.accent, marginBottom: 12 }}>{error}</Text>}
    {notice && <Text style={{ color: theme.muted, marginBottom: 12 }}>{notice}</Text>}
    {section === "users" ? <>
      {builtInSuperAdmin && <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.surfaceAlt, marginBottom: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "800" }}>Super Admin · Built-in device account</Text>
        <Text style={{ color: theme.muted, marginTop: 4 }}>All {POS_PERMISSIONS.length} POS permissions are enabled. This recovery account is separate from the OMS employee directory.</Text>
      </View>}
      <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>{employees.length} assigned OMS employee(s)</Text>
      {!busy && !employees.length && <Text style={{ color: theme.muted }}>No assigned employees are saved on this device. Check this device’s employee assignments in OMS and refresh while connected.</Text>}
      {employees.map((employee) => <View key={employee.id} style={{ borderTopWidth: 1, borderColor: theme.border, paddingVertical: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "700" }}>{employee.displayName}</Text>
        <Text style={{ color: theme.muted, marginTop: 3 }}>{employee.username ? `@${employee.username} · ` : ""}{employee.roleName}</Text>
        <EmployeePinEditor userId={employee.id} builtInSuperAdmin={builtInSuperAdmin} />
      </View>)}
    </> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {roles.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === selectedRole }} onPress={() => setSelectedRole(item.id)} style={{ ...buttonStyle, backgroundColor: item.id === selectedRole ? theme.primary : theme.surfaceAlt }}><Text style={{ color: item.id === selectedRole ? theme.onPrimary : theme.text, fontWeight: "700" }}>{item.name}</Text></TouchableOpacity>)}
      </ScrollView>
      {role ? <>
        <Text style={{ color: theme.muted, marginBottom: 12 }}>{role.builtIn ? "All POS permissions are enabled for the built-in Super Admin. OMS-dependent catalog and inventory rules still apply." : "Saved OMS role grants are shown below. Refresh after changing this role in OMS."}</Text>
        {POS_PERMISSIONS.map((permission) => {
          const granted = role.permissions.includes(permission.code);
          return <View key={permission.code} accessibilityLabel={`${permission.name}: ${granted ? "Allowed" : "Not granted"}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: theme.border }}>
            <Ionicons name={granted ? "checkmark-circle" : "remove-circle-outline"} size={22} color={granted ? theme.accent : theme.muted} />
            <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: "700" }}>{permission.name}</Text><Text style={{ color: theme.muted, fontSize: 12, marginTop: 3 }}>{permission.description}</Text></View>
            <Text style={{ color: granted ? theme.accent : theme.muted, fontSize: 12 }}>{granted ? "Allowed" : "Not granted"}</Text>
          </View>;
        })}
      </> : !busy && <Text style={{ color: theme.muted }}>No assigned OMS roles are saved yet. Refresh after assigning employees in OMS.</Text>}
    </>}
  </Card>;
}
