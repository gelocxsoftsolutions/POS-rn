const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => mocks[name] ?? {},
    Date,
    Math,
    Number,
    JSON,
    Error,
    Object,
    Uint8Array,
    atob,
  });
  return exports;
}
const { nextNctBackupAt, nctBackupReference } = load("src/lib/backup/nct-schedule.ts");
assert.equal(
  nextNctBackupAt(null, new Date("2026-10-27T10:59:00Z")).toISOString(),
  "2026-10-27T11:00:00.000Z",
);
assert.equal(
  nextNctBackupAt("2026-10-27T11:05:00Z", new Date("2026-10-28T00:00:00Z")).toISOString(),
  "2026-10-28T11:00:00.000Z",
);
assert.equal(
  nextNctBackupAt("2026-10-25T11:05:00Z", new Date("2026-10-28T00:00:00Z")).toISOString(),
  "2026-10-26T11:00:00.000Z",
);
assert.equal(nctBackupReference(new Date("2026-10-27T10:59:00Z")), "nct-daily:2026-10-26");
assert.equal(nctBackupReference(new Date("2026-10-27T11:00:00Z")), "nct-daily:2026-10-27");
const schema = load("src/lib/db/schema.ts");
const source = new DatabaseSync(":memory:");
for (const sql of schema.CREATE_TABLES) source.exec(sql);
source.exec(`CREATE TABLE _meta(key TEXT PRIMARY KEY,v INTEGER); INSERT INTO _meta VALUES ('schema_version',${schema.SCHEMA_VERSION});
  INSERT INTO Device(id,branchId) VALUES ('device-1',1); INSERT INTO StoreSettings(id,businessId) VALUES ('default','nct-default');`);
const adapter = {
  getFirstAsync: async (sql) => source.prepare(sql).get(),
  getAllAsync: async (sql) => source.prepare(sql).all(),
};
const { inspectRestoreSource } = load("src/lib/backup/nct-restore.service.ts", {
  "@/lib/db/schema": schema,
});
const envelope = {
  businessId: "nct-default",
  deviceId: "device-1",
  totals: { sales: 0, saleTotal: 0, inventoryQuantity: 0, products: 0 },
};
const identity = { businessId: "nct-default", deviceId: "device-1", branchId: 1 };
(async () => {
  await inspectRestoreSource(adapter, envelope, identity);
  await assert.rejects(
    inspectRestoreSource(adapter, { ...envelope, deviceId: "other" }, identity),
    /identity/,
  );
  await assert.rejects(
    inspectRestoreSource(adapter, envelope, { ...identity, branchId: 2 }),
    /identity/,
  );
  await assert.rejects(
    inspectRestoreSource(
      adapter,
      { ...envelope, totals: { ...envelope.totals, sales: 1 } },
      identity,
    ),
    /totals/,
  );
  source.exec("UPDATE _meta SET v=999");
  await assert.rejects(inspectRestoreSource(adapter, envelope, identity), /schema/);
  source.close();
  console.log(
    "Passed Philippine backup schedule/catch-up and SQLite restore preflight identity/schema/totals checks. Device restore and OMS storage remain untested.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
