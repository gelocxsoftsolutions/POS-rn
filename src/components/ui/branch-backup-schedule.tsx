import React, { useCallback, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button } from "./button";
import { usePosTheme } from "@/lib/stores/ui-store";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { BackupScheduleService } from "@/lib/services/backup-schedule.service";
import { backupTimeLabel, isBackupTime, DEFAULT_NCT_BACKUP_TIME } from "@/lib/backup/nct-schedule";

export function BranchBackupSchedule() {
  const theme = usePosTheme();
  const branchId = useDeviceStore((state) => state.device.branchId);
  const cached = useBackupSettingsStore((state) => state.schedule);
  const online = useNetworkStore((state) => state.isOnline);
  const [time, setTime] = useState("");
  const [revision, setRevision] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadedBranchId, setLoadedBranchId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setLoaded(false);
    setError("");
    setMessage("");
    try {
      const schedule = await BackupScheduleService.refresh();
      if (!schedule)
        throw new Error(
          "Connect to OMS to load the current branch time. Offline backups keep their last saved schedule.",
        );
      setTime(schedule.time);
      setRevision(schedule.revision);
      setLoaded(true);
      setLoadedBranchId(schedule.branchId);
    } catch (e) {
      setLoaded(false);
      setError(e instanceof Error ? e.message : "Unable to load branch time.");
    } finally {
      setBusy(false);
    }
  }, [branchId]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  async function save() {
    if (!branchId || loadedBranchId !== branchId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const schedule = await BackupScheduleService.save({ id: branchId, time, revision });
      setTime(schedule.time);
      setRevision(schedule.revision);
      setMessage(
        "Saved for all POS devices in this branch. Connected devices receive the time on their next schedule refresh.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save branch time.");
      setLoaded(false);
    } finally {
      setBusy(false);
    }
  }
  const effective = cached?.branchId === branchId ? cached : null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.text, fontWeight: "800" }}>
        Branch daily backup time — Philippine time
      </Text>
      <Text style={{ color: theme.muted }}>
        Saved time: {backupTimeLabel(effective?.time ?? DEFAULT_NCT_BACKUP_TIME)}
        {effective ? "" : " (default)"}. This time is shared by all NCT POS devices in the branch.
      </Text>
      <Text style={{ color: theme.muted }}>
        Enter 24-hour time, for example 18:30 for 6:30 PM. An OMS connection is required to save.
      </Text>
      <TextInput
        accessibilityLabel="Daily branch backup time in Philippine time"
        value={time}
        onChangeText={setTime}
        placeholder="HH:mm"
        placeholderTextColor={theme.muted}
        maxLength={5}
        autoCorrect={false}
        editable={!busy && loaded && online}
        style={{
          color: theme.text,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 8,
          padding: 10,
          width: 140,
        }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          title="Save Branch Time"
          onPress={() => void save()}
          disabled={
            busy || !loaded || loadedBranchId !== branchId || !online || !isBackupTime(time)
          }
        />
        <Button
          title="Refresh Time"
          variant="secondary"
          onPress={() => void refresh()}
          disabled={busy || !online}
        />
      </View>
      {busy ? <Text style={{ color: theme.muted }}>Updating schedule…</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
          {error}
        </Text>
      ) : null}
      {message ? <Text style={{ color: theme.text }}>{message}</Text> : null}
    </View>
  );
}
