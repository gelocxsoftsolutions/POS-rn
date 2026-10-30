const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite"),
  ts = require("typescript");
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
    Map,
    Set,
  });
  return exports;
}
const db = new DatabaseSync(":memory:");
for (const sql of load("src/lib/db/schema.ts").CREATE_TABLES) db.exec(sql);
db.exec(`INSERT INTO Product(id,name,sku) VALUES ('p1','Test fish','12'); INSERT INTO PosInventory(id,productId,availableQty) VALUES ('i1','p1',5);
  INSERT INTO Sale(id,receiptNumber,total,status,synced,originMode) VALUES ('s1','LOCAL-1',20,'COMPLETED',0,'NCT_DEPENDENT');
  INSERT INTO SaleItem(id,saleId,productId,quantity) VALUES ('sitem','s1','p1',2);
  INSERT INTO InventoryTransfer(id,transferNumber,status) VALUES ('t1','TRF-TEST-1','IN_TRANSIT'),('t2','TRF-TEST-2','IN_TRANSIT');
  INSERT INTO InventoryTransferItem(id,transferId,productId,allocatedQty) VALUES ('ti1','t1','p1',10),('ti2','t2','p1',3);`);
let failLedger = false,
  posts = 0;
const query = async (sql, params = []) => db.prepare(sql).all(...params);
const tx = {
  getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params),
  getAllAsync: query,
  runAsync: async (sql, params = []) => {
    if (failLedger && sql.includes("INSERT INTO InventoryLedger")) {
      failLedger = false;
      throw new Error("Simulated local write failure");
    }
    return db.prepare(sql).run(...params);
  },
};
const findById = async (id) => ({
  ...db.prepare("SELECT * FROM InventoryTransfer WHERE id=?").get(id),
  items: db
    .prepare(
      "SELECT i.*,p.sku productSku FROM InventoryTransferItem i JOIN Product p ON p.id=i.productId WHERE i.transferId=?",
    )
    .all(id),
});
const { receiveNctTransfer } = load("src/lib/services/nct-transfer-receive.service.ts", {
  uuid: { v4: randomUUID },
  "@/lib/api/http": {
    api: {
      post: async (_path, body) => {
        posts++;
        return {
          ok: true,
          data: {
            success: true,
            balances: [{ variationId: 12, qty: body.transferNumber === "TRF-TEST-1" ? 12 : 15 }],
            acknowledgedSaleIds: [],
          },
        };
      },
    },
  },
  "@/lib/db/connection": { query },
  "@/lib/db/local-operation": {
    localTransaction: async (work) => {
      db.exec("BEGIN");
      try {
        const result = await work(tx);
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  },
  "./nct-sync-coordinator": { serializeNctSync: (work) => work() },
  "@/lib/repositories/transfer.repository": { TransferRepository: { findById } },
  "@/lib/stores/device-store": {
    useDeviceStore: { getState: () => ({ device: { deviceId: "device-1", branchId: 1 } }) },
  },
  "@/lib/stores/cashier-store": {
    useCashierStore: { getState: () => ({ session: { cashierId: "user-1" } }) },
  },
});
(async () => {
  // OMS allocation tests remain with the unpromoted server patches.
  const result = await receiveNctTransfer(
    "t1",
    [{ itemId: "ti1", actualQty: 10 }],
    "Test Employee",
  );
  assert.equal(result.status, "RECEIVED");
  assert.equal(
    db.prepare("SELECT availableQty FROM PosInventory").get().availableQty,
    10,
    "apply canonical stock minus pending sale, never add transfer twice",
  );
  await receiveNctTransfer("t1", [{ itemId: "ti1", actualQty: 10 }], "Test Employee");
  assert.equal(posts, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM InventoryLedger").get().n, 1);
  await assert.rejects(
    receiveNctTransfer("t2", [{ itemId: "ti2", actualQty: 4 }], "Test Employee"),
    /valid received/,
  );
  failLedger = true;
  await assert.rejects(
    receiveNctTransfer("t2", [{ itemId: "ti2", actualQty: 3 }], "Test Employee"),
    /Simulated/,
  );
  assert.equal(
    db.prepare("SELECT status FROM InventoryTransfer WHERE id='t2'").get().status,
    "IN_TRANSIT",
  );
  assert.equal(db.prepare("SELECT availableQty FROM PosInventory").get().availableQty, 10);
  await receiveNctTransfer("t2", [{ itemId: "ti2", actualQty: 3 }], "Test Employee");
  assert.equal(db.prepare("SELECT availableQty FROM PosInventory").get().availableQty, 13);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM InventoryLedger").get().n, 2);
  db.close();
  console.log(
    "Passed SQLite transfer snapshot, local retry, quantity validation and rollback checks. OMS receipt responses were mocked.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
