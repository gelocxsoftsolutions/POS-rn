const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
function load(file, mocks = {}, suffix = '') {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => { if (id in mocks) return mocks[id]; throw new Error('Unexpected dependency: ' + id); }, module, module.exports);
  return module.exports;
}
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const statement of load('src/lib/db/schema.ts').CREATE_TABLES) sql.exec(statement);
const run = (q, p = []) => sql.prepare(q).run(...p);
const first = async (q, p = []) => sql.prepare(q).get(...p) ?? null;
const query = async (q, p = []) => sql.prepare(q).all(...p);
const db = { getFirstAsync: first, runAsync: async (q, p) => run(q, p), withTransactionAsync: async work => { sql.exec('BEGIN'); try { await work(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
run("INSERT INTO StoreSettings(id,businessId,operatingMode) VALUES ('default','business-a','INDEPENDENT')");
run("INSERT INTO Device(id,deviceName) VALUES ('original-device','Till')");
run("INSERT INTO Product(id,sku,name,businessId,identitySource) VALUES ('local','123','Local fish','business-a','LOCAL')");
run("INSERT INTO Barcode(id,productId,barcode) VALUES ('barcode','local','1234567890123')");
run("INSERT INTO PosInventory(id,productId,availableQty,soldQty) VALUES ('stock','local',11,2)");
run("INSERT INTO InventoryLedger(id,movementType,productId,quantity) VALUES ('ledger','SALE','local',-2)");
run("INSERT INTO Sale(id,receiptNumber,businessId,originMode,deviceId,total) VALUES ('sale','receipt','business-a','INDEPENDENT','original-device',200)");
run("INSERT INTO SaleItem(id,saleId,productId,quantity) VALUES ('item','sale','local',2)");
const preserved = ['Product','Barcode','PosInventory','InventoryLedger','Sale','SaleItem'];
const snapshot = () => JSON.stringify(preserved.map(table => sql.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
const original = snapshot();
const { applyModeSwitchInDatabase } = load('src/lib/business/mode-switch-storage.ts');
const connection = { businessId: 'business-a', deviceId: 'cloud-device', deviceName: 'Till', operatingMode: 'NCT_DEPENDENT', oms: { deviceId: 'oms-device', branchId: 42, apiKey: 'fixture' } };
const input = { requestId: 'switch-one', previousMode: 'INDEPENDENT', nextMode: 'NCT_DEPENDENT', connection, actor: { id: 'admin', name: 'Administrator' } };
(async () => {
  await assert.rejects(applyModeSwitchInDatabase(db, { ...input, connection: { ...connection, businessId: 'other-business' } }), /another business/);
  await applyModeSwitchInDatabase(db, input);
  await applyModeSwitchInDatabase(db, input);
  assert.equal(snapshot(), original, 'Switch and retry must preserve all historical and stock rows');
  assert.equal((await first('SELECT COUNT(*) n FROM OperatingModeAudit')).n, 1);
  assert.equal((await first("SELECT operatingMode FROM StoreSettings")).operatingMode, 'NCT_DEPENDENT');
  assert.ok(await first("SELECT id FROM Device WHERE id='original-device'"));
  await applyModeSwitchInDatabase(db, { ...input, requestId: 'switch-two', previousMode: 'NCT_DEPENDENT', nextMode: 'INDEPENDENT', connection: { ...connection, operatingMode: 'INDEPENDENT', oms: null } });
  assert.equal(snapshot(), original, 'Return to independent must preserve all data');
  await assert.rejects(applyModeSwitchInDatabase(db, input), /older mode/);
  const mocks = {
    '@/lib/db/connection': { queryFirst: first, query, execute: async (q, p) => run(q, p) },
    uuid: { v4: randomUUID },
    '@/lib/api/http': {},
    '@/lib/repositories/inventory.repository': {},
    '@/lib/repositories/product.repository': { ProductRepository: { update: async (id, data) => { for (const [key,value] of Object.entries(data)) if (value !== undefined) run(`UPDATE Product SET ${key}=? WHERE id=?`, [value,id]); } } },
    '@/lib/repositories/transfer.repository': {},
    '@/lib/repositories/device.repository': {},
    '@/lib/repositories/barcode.repository': { BarcodeRepository: { findByBarcode: code => first('SELECT * FROM Barcode WHERE barcode=?',[code]), upsert: async ({ productId,barcode }) => run('INSERT INTO Barcode(id,productId,barcode) VALUES (?,?,?)',[randomUUID(),productId,barcode]) } },
    '@/lib/repositories/product-image.repository': {},
    '@/lib/repositories/product-price.repository': { ProductPriceRepository: { upsert: async () => {} } },
    'expo-file-system': {}, 'react-native': { Platform: { OS: 'web' } },
    '@/lib/business/configuration.service': { BusinessConfigurationService: { current: () => ({ businessId: 'business-a' }) } },
  };
  const { upsertProductFromVariation } = load('src/lib/services/oms-sync.service.ts', mocks, '\nexport { upsertProductFromVariation };');
  const oms = await upsertProductFromVariation({ id: '123', productName: 'OMS fish', barcode: '1234567890123' });
  assert.notEqual(oms.id, 'local');
  const nct = await first('SELECT * FROM Product WHERE id=?',[oms.id]);
  assert.match(nct.sku, /^NCT:123:/);
  assert.equal(nct.omsVariationId, '123');
  const again = await upsertProductFromVariation({ id: '123', productName: 'Updated OMS fish', barcode: '1234567890123' });
  assert.equal(again.id, oms.id, 'Next sync reuses OMS identity despite prefixed SKU');
  assert.equal((await first("SELECT name FROM Product WHERE id='local'")).name, 'Local fish');
  assert.equal((await first("SELECT productId FROM Barcode WHERE id='barcode'")).productId, 'local');
  assert.equal((await first("SELECT availableQty FROM PosInventory WHERE id='stock'")).availableQty, 11);
  let savedIntent = null, applied = false, confirmationFails = true, backups = 0, modeLoads = 0;
  let cloud = { ...connection, operatingMode: 'INDEPENDENT', oms: null };
  const transitions = load('src/lib/business/device-transition.ts');
  const service = load('src/lib/services/dealership-mode-switch.service.ts', {
    '@/lib/db/connection': { getDatabase: async () => db, queryFirst: first },
    '@/lib/stores/cashier-store': { useCashierStore: { getState: () => ({ session: { isSuperAdmin: true, cashierId: 'admin', cashierName: 'Admin' } }) } },
    '@/lib/stores/cart-store': { useCartStore: { getState: () => ({ items: [] }) } },
    '@/lib/stores/device-store': { useDeviceStore: { getState: () => ({ device: {}, setDevice: () => {} }) } },
    '@/lib/business/configuration.service': { BusinessConfigurationService: { load: async () => { modeLoads++; } } },
    '@/lib/business/mode-switch-storage': { applyModeSwitchInDatabase },
    '@/lib/business/device-transition': transitions,
    './dealership-cloud.service': {
      getCloudConnection: () => cloud, saveCloudConnection: async value => { cloud = value; },
      readModeSwitchIntent: async () => savedIntent, saveModeSwitchIntent: async value => { savedIntent = value; },
      modeSwitchRequest: async (code, action) => {
        assert.equal(code, 'test-key');
        if (action === 'apply') applied = true;
        if (action === 'confirm' && confirmationFails) { confirmationFails = false; throw new Error('Connection interrupted'); }
        return { requestId: 'recoverable-switch', previousMode: 'INDEPENDENT', nextMode: 'NCT_DEPENDENT', applied, connection: applied ? connection : null };
      },
    },
    '@/lib/backup/recovery.service': { RecoveryService: { queueBackupUpload: async () => { backups++; } } },
    './sync-queue.service': { SyncQueueService: { processPending: async () => {} } },
    './sync-worker': { pauseSyncForModeSwitch: async () => () => {} },
  });
  const beforeRecovery = snapshot();
  await assert.rejects(service.switchDealershipMode('test-key'), /Connection interrupted/);
  assert.ok(savedIntent, 'Keep durable intent when acknowledgment fails');
  assert.equal(transitions.deviceTransitionActive(), true, 'Block inventory sync until configuration recovery');
  await service.resumePendingModeSwitch();
  assert.equal(savedIntent, null);
  assert.equal(transitions.deviceTransitionActive(), false);
  assert.equal(backups, 1, 'Recovery must reuse the original verified backup');
  assert.equal(modeLoads, 2);
  assert.equal(snapshot(), beforeRecovery, 'Interrupted operation and restart must preserve the database');
  console.log('Passed: both switch directions, idempotent recovery, foreign business rejection, stock/sales preservation, and OMS/local SKU and barcode collisions');
  sql.close();
})().catch(error => { console.error(error); process.exitCode=1; });
