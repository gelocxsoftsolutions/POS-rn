const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");
const omsRequire = createRequire(path.resolve(__dirname, "../../nctalavera-system/package.json"));
function load(file, requireModule = require) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(output.outputText, { exports, require: requireModule, Date, Number, Math });
  return exports;
}
const { nctSalePayload } = load(path.resolve(__dirname, "../src/lib/services/nct-sale-payload.ts"));
const { saleContract } = load(
  path.resolve(__dirname, "../oms-staging/src/server/pos/sale-contract.ts"),
  omsRequire,
);
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
assert.equal(saleContract.safeParse(payload).success, true);
assert.equal(saleContract.safeParse({ ...payload, total: 150 }).success, false);
assert.equal(
  saleContract.safeParse({ ...payload, items: [{ variationId: 12, qty: 1.5, unitPrice: 100 }] })
    .success,
  false,
);
assert.equal(saleContract.safeParse({ ...payload, subtotal: 149 }).success, false);
assert.throws(() => nctSalePayload({ ...sale, deviceId: null }), /original branch or device/);
assert.throws(
  () => nctSalePayload({ ...sale, items: [{ sku: "LOCAL-1", quantity: 2, unitPrice: 75 }] }),
  /not linked/,
);
assert.equal(
  saleContract.safeParse(
    nctSalePayload({
      ...sale,
      subtotal: 0.3,
      discount: 0,
      total: 0.3,
      items: [{ sku: "12", quantity: 3, unitPrice: 0.1 }],
    }),
  ).success,
  true,
);
console.log("Passed 9 NCT receipt contract/payload checks. No network or database used.");
