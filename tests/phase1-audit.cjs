const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name in mocks) return mocks[name];
        throw new Error(name);
      },
      JSON,
      Object,
      String,
    },
  );
  return exports;
}
let stored;
const actor = { cashierId: "employee-1", cashierName: "Test Employee", roleId: "role-1" };
const store = { useCashierStore: { getState: () => ({ session: actor }) } };
const { AuditService } = load("src/lib/services/audit.service.ts", {
  "@/lib/repositories/audit.repository": {
    AuditRepository: { create: async (value) => (stored = value) },
  },
  "./nct-scope": { isNctPos: () => true },
  "@/lib/stores/device-store": {
    useDeviceStore: { getState: () => ({ device: { deviceId: "device-1", branchId: 1 } }) },
  },
  "@/lib/stores/cashier-store": store,
});
const events = [];
const { withNctActionAudit } = load("src/lib/services/action-audit.ts", {
  "./audit.service": { AuditService: { log: async (...args) => events.push(args) } },
  "./nct-scope": { isNctPos: () => true },
  "@/lib/stores/cashier-store": store,
});
(async () => {
  const catalog = load("src/lib/permissions/catalog.ts", {});
  const { mapNctPermissions } = load("src/lib/permissions/nct-permission-map.ts", {
    "./catalog": catalog,
  });
  const cashierPermissions = mapNctPermissions([
    "VIEW_POS",
    "CREATE_POS_SALES",
    "VIEW_POS_SALES_HISTORY",
  ]);
  assert.equal(cashierPermissions.includes("POS_SALES"), true);
  assert.equal(cashierPermissions.includes("POS_BACKUP"), false);
  assert.equal(mapNctPermissions(["MANAGE_POS_DEVICES"]).includes("POS_BACKUP"), true);
  assert.equal(mapNctPermissions(["page:sales", "UNKNOWN_CODE"]).length, 0);
  await AuditService.log(
    "SALE_CREATED",
    "Completed",
    undefined,
    undefined,
    JSON.stringify({
      entityType: "Sale",
      entityId: "sale-1",
      password: "SECRET",
      pin: "123456",
      rawInput: "do not capture",
    }),
  );
  assert.equal(stored.cashierId, "employee-1");
  const metadata = JSON.parse(stored.metadata);
  assert.equal(metadata.branchId, 1);
  assert.equal(metadata.deviceId, "device-1");
  assert.equal(metadata.entityId, "sale-1");
  assert.equal(metadata.password, undefined);
  assert.equal(metadata.pin, undefined);
  assert.equal(metadata.rawInput, undefined);
  const cashier = withNctActionAudit("Cashier", { loginPin: async () => ({ success: false }) });
  await cashier.loginPin("SECRET_PIN");
  assert.equal(JSON.stringify(events).includes("SECRET_PIN"), false);
  assert.equal(JSON.parse(events[0][4]).outcome, "FAILED");
  const sale = withNctActionAudit("Sale", {
    create: async () => ({ success: true, sale: { id: "sale-2" } }),
  });
  await sale.create({ password: "SECRET_PASSWORD" });
  assert.equal(JSON.parse(events[1][4]).entityId, "sale-2");
  assert.equal(JSON.stringify(events).includes("SECRET_PASSWORD"), false);
  console.log(
    "Passed NCT audit actor/target attribution, failure outcome and credential-exclusion checks. No network/database used.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
