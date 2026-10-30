const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    console,
    Date,
    ...globals,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const clock = load("src/lib/backup/nct-schedule.ts");
test("HH:mm validation and Philippine display handle midnight, noon and boundaries", () => {
  for (const time of ["00:00", "12:00", "19:00", "23:59"])
    assert.equal(clock.isBackupTime(time), true);
  for (const time of ["24:00", "12:60", "7:00", "19:00:00", "", null])
    assert.equal(clock.isBackupTime(time), false);
  assert.equal(clock.backupTimeLabel("00:00"), "12:00 AM");
  assert.equal(clock.backupTimeLabel("12:00"), "12:00 PM");
});
test("custom cutoffs use Philippine time independently of the device timezone", () => {
  assert.equal(
    clock.nctBackupReference(new Date("2026-10-31T01:29:59Z"), "09:30"),
    "nct-daily:2026-10-30",
  );
  assert.equal(
    clock.nctBackupReference(new Date("2026-10-31T01:30:00Z"), "09:30"),
    "nct-daily:2026-10-31",
  );
  assert.equal(
    clock.nctBackupReference(new Date("2026-10-30T16:00:00Z"), "00:00"),
    "nct-daily:2026-10-31",
  );
  assert.equal(
    clock.nextNctBackupAt(null, new Date("2026-10-31T01:00Z"), "09:30").toISOString(),
    "2026-10-31T01:30:00.000Z",
  );
});
test("moving the time later cannot run another backup for an already completed scheduled date", () => {
  const next = clock.nextNctBackupAt(
    "2026-10-31T10:00Z",
    new Date("2026-10-31T13:00Z"),
    "21:00",
    "2026-10-31",
  );
  assert.equal(next.toISOString(), "2026-11-01T13:00:00.000Z");
  assert.equal(
    clock.nctBackupReference(new Date("2026-10-31T14:00Z"), "21:00"),
    "nct-daily:2026-10-31",
  );
});
test("catch-up before today's cutoff covers yesterday without suppressing today", () => {
  assert.equal(
    clock
      .nextNctBackupAt("2026-10-28T11:00Z", new Date("2026-10-31T01:00Z"), "19:00", "2026-10-28")
      .toISOString(),
    "2026-10-30T11:00:00.000Z",
  );
  assert.equal(
    clock.nctBackupReference(new Date("2026-10-31T01:00Z"), "19:00"),
    "nct-daily:2026-10-30",
  );
  assert.equal(
    clock
      .nextNctBackupAt("2026-10-31T01:00Z", new Date("2026-10-31T02:00Z"), "19:00", "2026-10-30")
      .toISOString(),
    "2026-10-31T11:00:00.000Z",
  );
});
function serviceHarness() {
  const state = {
    device: { deviceId: "device", branchId: 1 },
    online: true,
    cached: null,
    denied: false,
    puts: 0,
  };
  const schedule = {
    branchId: 1,
    time: "09:30",
    timeZone: "Asia/Manila",
    revision: "r1",
    updatedAt: "2026-10-31T00:00:00Z",
  };
  state.response = { ok: true, status: 200, data: schedule };
  state.get = async () => state.response;
  const { BackupScheduleService } = load("src/lib/services/backup-schedule.service.ts", {
    "@/lib/api/http": {
      api: {
        get: () => state.get(),
        put: async () => {
          state.puts++;
          return state.response;
        },
      },
    },
    "@/lib/stores/device-store": { useDeviceStore: { getState: () => ({ device: state.device }) } },
    "@/lib/stores/backup-settings-store": {
      useBackupSettingsStore: {
        getState: () => ({
          setSchedule: (value) => {
            state.cached = value;
          },
        }),
      },
    },
    "./network.service": { useNetworkStore: { getState: () => ({ isOnline: state.online }) } },
    "./authorization.service": {
      requirePermission: async () => {
        if (state.denied) throw Error("Not permitted");
      },
    },
    "@/lib/backup/nct-schedule": clock,
    "./nct-scope": { isNctPos: () => true },
    "./action-audit": { withNctActionAudit: (_entity, operations) => operations },
  });
  return { state, schedule, service: BackupScheduleService };
}
test("offline, failed and wrong-branch refreshes preserve the last complete schedule", async () => {
  const { state, service } = serviceHarness();
  await service.refresh();
  const saved = state.cached;
  state.online = false;
  assert.equal(await service.refresh(), null);
  await assert.rejects(service.save({ id: 1, time: "10:00", revision: "r1" }), /Connect to OMS/);
  assert.equal(state.puts, 0);
  state.online = true;
  state.response = { ok: false, status: 503 };
  await service.refresh();
  assert.equal(state.cached, saved);
  state.response = { ok: true, data: { ...saved, branchId: 2 } };
  assert.equal(await service.refresh(), null);
  assert.equal(state.cached, saved);
});
test("permissions and optimistic conflicts prevent an unconfirmed local schedule change", async () => {
  const { state, service } = serviceHarness();
  await service.refresh();
  const saved = state.cached;
  state.denied = true;
  await assert.rejects(service.save({ id: 1, time: "10:00", revision: "r1" }), /Not permitted/);
  assert.equal(state.puts, 0);
  state.denied = false;
  state.response = { ok: false, status: 409 };
  await assert.rejects(service.save({ id: 1, time: "10:00", revision: "r1" }), /changed elsewhere/);
  assert.equal(state.cached, saved);
});
test("a delayed refresh cannot overwrite a newly acknowledged save", async () => {
  const { state, service, schedule } = serviceHarness();
  let release;
  state.get = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = service.refresh();
  state.response = { ok: true, data: { ...schedule, time: "10:00", revision: "r2" } };
  await service.save({ id: 1, time: "10:00", revision: "r1" });
  release({ ok: true, data: schedule });
  assert.equal(await pending, null);
  assert.equal(state.cached.time, "10:00");
});
test("offline scheduler uses cached time and persists the exact scheduled date only after local export", async () => {
  const calls = [];
  class Now extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-10-31T01:30Z"]));
    }
  }
  const settings = {
    hydrated: true,
    lastAutoBackupAt: null,
    lastScheduledDate: null,
    markAutoBackup(date) {
      calls.push("mark:" + date);
      this.lastScheduledDate = date;
      this.lastAutoBackupAt = new Now().toISOString();
    },
    setCloudError(error) {
      throw Error(error);
    },
  };
  const { runScheduledBackupCheck } = load(
    "src/lib/services/auto-backup.service.ts",
    {
      "@/lib/backup/recovery.service": {
        RecoveryService: { createAutoBackup: async (reference) => calls.push(reference) },
      },
      "@/lib/stores/backup-settings-store": {
        useBackupSettingsStore: { getState: () => settings },
        cachedBranchBackupTime: () => "09:30",
      },
      "@/lib/stores/backup-list-store": {
        useBackupListStore: { getState: () => ({ refresh: async () => {} }) },
      },
      "./sync-queue.service": { SyncQueueService: { processPending: async () => {} } },
      "react-native": { AppState: { currentState: "active" } },
      "./nct-scope": { isNctPos: () => true },
      "@/lib/backup/nct-schedule": clock,
      "./backup-schedule.service": {
        BackupScheduleService: {
          refresh: async () => {
            throw Error("Offline");
          },
        },
      },
      "@/lib/stores/device-store": {
        useDeviceStore: { getState: () => ({ device: { deviceId: "d", branchId: 1 } }) },
      },
    },
    { Date: Now },
  );
  await runScheduledBackupCheck();
  await runScheduledBackupCheck();
  assert.deepEqual(calls, ["nct-daily:2026-10-31", "mark:2026-10-31"]);
});
