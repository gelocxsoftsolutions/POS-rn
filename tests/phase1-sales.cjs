const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, requireModule = require) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(output.outputText, { exports, require: requireModule, Date, Number, Math });
  return exports;
}
const { nctSalePayload } = load(path.resolve(__dirname, "../src/lib/services/nct-sale-payload.ts"));
const sale = {
  id: "3a2e277e-72e1-4ec4-a09c-e881105bf722",
  receiptNumber: "NCT-TEST-1",
  deviceId: "device-1",
  branchId: 1,
  cashierId: "employee-1",
  cashierName: "Test Employee",
  createdAt: "2026-10-27T10:00:00.000Z",
  paymentMethod: "CASH",
  subtotal: 150,
  discount: 10,
  tax: 0,
  total: 140,
  items: [{ sku: "12", quantity: 2, unitPrice: 75 }],
};
const payload = nctSalePayload(sale);
assert.equal(payload.clientSaleId, sale.id);
assert.equal(payload.createdAt, sale.createdAt);
assert.equal(payload.items[0].unitPrice, 75);
assert.equal(payload.total, 140);
assert.equal(payload.subtotal, 150);
assert.equal(payload.discount, 10);
assert.equal(payload.items[0].qty, 2);
assert.equal(payload.items[0].variationId, 12);
assert.throws(() => nctSalePayload({ ...sale, deviceId: null }), /original branch or device/);
assert.throws(
  () => nctSalePayload({ ...sale, items: [{ sku: "LOCAL-1", quantity: 2, unitPrice: 75 }] }),
  /not linked/,
);
assert.equal(
  nctSalePayload({
    ...sale,
    subtotal: 0.3,
    discount: 0,
    total: 0.3,
    items: [{ sku: "12", quantity: 3, unitPrice: 0.1 }],
  }).total,
  0.3,
);
console.log("Passed POS receipt payload identity, prices, totals and validation checks. OMS contract checks are held with the unpromoted OMS patches. No network or database used.");
