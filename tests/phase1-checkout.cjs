const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency: ${name}`); }, Date, Math, Number, JSON, Error });
  return exports;
}
const database = new DatabaseSync(":memory:");
for (const sql of load("src/lib/db/schema.ts").CREATE_TABLES) database.exec(sql);
database.exec("PRAGMA foreign_keys=ON");
const business = load("src/lib/business/defaults.ts").DEFAULT_BUSINESS_CONFIGURATION;
database.exec("INSERT INTO Product(id,name,sku) VALUES ('p1','Test fish','12'),('p2','Test shrimp','13')");
database.exec("INSERT INTO PosInventory(id,productId,availableQty) VALUES ('i1','p1',5),('i2','p2',1)");
const tx = { runAsync: async (sql, params=[]) => database.prepare(sql).run(...params), getFirstAsync: async (sql, params=[]) => database.prepare(sql).get(...params) ?? null };
let tail = Promise.resolve();
const localTransaction = (work) => {
  const result = tail.then(async () => { database.exec("BEGIN"); try { const value = await work(tx); database.exec("COMMIT"); return value; } catch(error) { database.exec("ROLLBACK"); throw error; } });
  tail = result.catch(() => {}); return result;
};
const { createNctSale } = load("src/lib/services/nct-checkout.service.ts", {
  uuid: { v4: randomUUID }, "@/lib/db/local-operation": { localTransaction },
  "@/lib/repositories/sale.repository": { SaleRepository: { findById: async (id) => database.prepare("SELECT * FROM Sale WHERE id=?").get(id) } },
  "./authorization.service": { requirePermission: async () => {} },
  "@/lib/business/configuration.service": { BusinessConfigurationService: { current: () => business } },
});
const input = { cashierId: "user-1", cashierName: "Test Employee", deviceId: "device-1", branchId: 1, paymentMethod: "CASH", paidAmount: 200,
  items: [{ productId: "p1", productName: "Test fish", sku: "12", quantity: 2, unitPrice: 75 }], discount: 10 };
(async () => {
  const sale = await createNctSale(input);
  assert.equal(sale.success, true);
  assert.equal(sale.sale.total, 140);
  assert.equal(database.prepare("SELECT amount FROM Payment").get().amount, 140, "change is not sales revenue");
  assert.equal(database.prepare("SELECT availableQty FROM PosInventory WHERE productId='p1'").get().availableQty, 3);
  const count = (table) => database.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  for (const table of ["Sale", "SaleItem", "Receipt", "Payment", "InventoryLedger", "AuditLog"]) assert.equal(count(table), 1);
  const failed = await createNctSale({ ...input, items: [...input.items, { productId:"p2",productName:"Test shrimp",sku:"13",quantity:2,unitPrice:1 }] });
  assert.equal(failed.success, false);
  for (const table of ["Sale", "SaleItem", "Receipt", "Payment", "InventoryLedger", "AuditLog"]) assert.equal(count(table), 1, `${table} rolls back`);
  assert.equal(database.prepare("SELECT availableQty FROM PosInventory WHERE productId='p1'").get().availableQty, 3);
  const outcomes = await Promise.all([createNctSale(input), createNctSale(input)]);
  assert.equal(outcomes.filter((result)=>result.success).length, 1);
  assert.equal(count("Sale"), 2);
  assert.equal(database.prepare("SELECT availableQty FROM PosInventory WHERE productId='p1'").get().availableQty, 1);
  database.close();
  console.log("Passed SQLite checkout persistence, payment/change, atomic rollback and concurrent-stock checks. No OMS connection used.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
