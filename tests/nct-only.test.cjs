const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, { exports, console, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function queueDependencies(repository, overrides = {}) {
  return {
    '@/lib/repositories/sync-queue.repository': { SyncQueueRepository: repository },
    '@/lib/db/connection': { queryFirst: async () => null, execute: async () => {} },
    'expo-file-system': { File: class { constructor() { assert.fail('Unexpected file read'); } } },
    '@/lib/stores/backup-settings-store': { useBackupSettingsStore: { getState: () => ({ setCloudError() {} }) } },
    './nct-backup.service': { uploadNctBackup: async () => assert.fail('Unexpected backup upload') },
    './sale-sync.service': { SaleSyncService: { retrySale: async () => assert.fail('Unexpected sale upload') } },
    './nct-scope': { isNctPos: () => true },
    ...overrides,
  };
}

test('only NCT uploads are enabled and neither mode can manage local stock/catalog', () => {
  const { capabilitiesFor, assertCapability } = load('lib/business/capabilities.ts');
  for (const mode of ['NCT_DEPENDENT', 'INDEPENDENT']) {
    const caps = capabilitiesFor(mode);
    assert.equal(caps.manageLocalCatalog, false);
    assert.equal(caps.manageLocalInventory, false);
    assert.equal(caps.uploadBackups, mode === 'NCT_DEPENDENT');
    assert.equal(caps.uploadEndOfDay, mode === 'NCT_DEPENDENT');
    assert.throws(() => assertCapability(mode, 'manageLocalCatalog'), /NCT OMS-dependent/);
  }
});

test('legacy cloud jobs and independent sales are retained without file access or uploads', async () => {
  const retained = [];
  const { SyncQueueService } = load('lib/services/sync-queue.service.ts', queueDependencies({
    getPending: async (_limit, types) => {
      assert.deepEqual(Array.from(types), ['Sale', 'DatabaseBackup', 'EndOfDay']);
      return ['EndOfDay', 'DatabaseBackup', 'Sale'].map(type => ({ id: type, entityType: type, entityId: type }));
    },
    markEntityFailed: async (type, id) => retained.push([type, id]),
  }, { '@/lib/db/connection': { queryFirst: async () => ({ originMode: 'INDEPENDENT' }) } }));
  const result = await SyncQueueService.processPending();
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 3);
  assert.deepEqual(retained, ['EndOfDay', 'DatabaseBackup', 'Sale'].map(type => [type, type]));
});

test('deferred returns cannot starve NCT jobs and transient backups retry beyond five attempts', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE SyncQueue (id TEXT, entityType TEXT, status TEXT, retryCount INTEGER, maxRetries INTEGER, createdAt TEXT)');
    const insert = db.prepare('INSERT INTO SyncQueue VALUES (?, ?, ?, ?, 5, ?)');
    for (let i = 0; i < 60; i++) insert.run(`r${i}`, 'Return', 'PENDING', 0, '1');
    insert.run('backup', 'DatabaseBackup', 'PENDING', 9, '2');
    insert.run('failed', 'DatabaseBackup', 'FAILED', 9, '2');
    insert.run('sale', 'Sale', 'PENDING', 0, '3');
    const { SyncQueueRepository } = load('lib/repositories/sync-queue.repository.ts', {
      '@/lib/db/connection': { query: async (sql, values) => db.prepare(sql).all(...values) },
      uuid: { v4: () => 'unused' },
    });
    const rows = await SyncQueueRepository.getPending(50, ['Sale', 'DatabaseBackup', 'EndOfDay']);
    assert.deepEqual(rows.map(row => row.id), ['backup', 'sale']);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM SyncQueue WHERE entityType='Return'").get().n, 60);
  } finally { db.close(); }
});

test('NCT backup delivery is single-flight and acknowledged after upload', async () => {
  let uploads = 0;
  const synced = [], updates = [];
  const { SyncQueueService } = load('lib/services/sync-queue.service.ts', queueDependencies({
    getPending: async () => [{ id: 'job', entityType: 'DatabaseBackup', entityId: 'backup', payload: JSON.stringify({ scope: 'NCT', fileUri: 'local', idempotencyKey: 'stable' }) }],
    markProcessing: async () => {}, markSynced: async id => synced.push(id),
  }, {
    'expo-file-system': { File: class { async base64() { return 'snapshot'; } } },
    './nct-backup.service': { uploadNctBackup: async body => {
      uploads++;
      assert.equal(body.idempotencyKey, 'stable');
      assert.equal(body.contentBase64, 'snapshot');
      assert.equal(body.scope, undefined);
      assert.equal(synced.length, 0);
      return { backupId: 'remote' };
    } },
    '@/lib/db/connection': { execute: async (...args) => updates.push(args) },
  }));
  await Promise.all([SyncQueueService.processPending(), SyncQueueService.processPending()]);
  assert.equal(uploads, 1);
  assert.deepEqual(synced, ['job']);
  assert.equal(updates[0][1][0], 'remote');
});

test('end-of-day caller contract includes local backup and NCT-scoped closure', async () => {
  const backups = [], closures = [];
  const { EndOfDayService } = load('lib/backup/end-of-day.service.ts', {
    '@/lib/db/connection': { queryFirst: async () => ({ grossSales: 10 }), query: async () => [] },
    '@/lib/business/configuration.service': { BusinessConfigurationService: { current: () => ({ businessId: 'nct', operatingMode: 'NCT_DEPENDENT' }) } },
    '@/lib/stores/device-store': { useDeviceStore: { getState: () => ({ device: { deviceId: 'device', branchId: 1 } }) } },
    '@/lib/services/sync-queue.service': { SyncQueueService: { enqueue: async (...args) => { closures.push(args); return { id: 'closure' }; } } },
    './recovery.service': { RecoveryService: { createEndOfDayBackup: async key => { backups.push(key); return { file: { uri: 'local-backup' } }; } } },
    '@/lib/db/schema': { SCHEMA_VERSION: 11 },
    '@/lib/services/nct-scope': { isNctPos: () => true },
    '@/lib/stores/cashier-store': { useCashierStore: { getState: () => ({ session: { cashierId: 'employee' } }) } },
  });
  const result = await EndOfDayService.closeLocally({ businessDate: '2026-10-28', shiftId: 'shift' });
  assert.deepEqual(backups, ['eod:2026-10-28:shift']);
  assert.equal(result.backup.fileUri, 'local-backup');
  assert.equal(result.summary.grossSales, 10);
  assert.equal(closures[0][3].scope, 'NCT');
  assert.equal(closures[0][3].cashierId, 'employee');
});

test('worker discovers only unqueued NCT receipts and fetches transfers before stock', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE Sale (id TEXT, synced INTEGER, status TEXT, originMode TEXT, createdAt TEXT);
      CREATE TABLE SyncQueue (entityType TEXT, entityId TEXT, status TEXT);
      INSERT INTO Sale VALUES ('new',0,'COMPLETED','NCT_DEPENDENT','1'),
      ('queued',0,'COMPLETED','NCT_DEPENDENT','2'), ('conflict',0,'COMPLETED','NCT_DEPENDENT','3'),
      ('historical',0,'COMPLETED','INDEPENDENT','4');
      INSERT INTO SyncQueue VALUES ('Sale','queued','PENDING'),('Sale','conflict','FAILED');`);
    const steps = [];
    const state = { setIsSyncing() {}, setLastSyncTime() {}, refreshPendingCount: async () => {} };
    const { runSyncCycle } = load('lib/services/sync-worker.ts', {
      './oms-sync.service': { OmsSyncService: {
        syncPendingTransfers: async () => steps.push('transfers'),
        syncInventory: async () => steps.push('stock'),
        syncBranchProducts: async () => steps.push('catalog'),
      } },
      './sync-queue.service': { SyncQueueService: { processPending: async () => steps.push('queue') } },
      '@/lib/stores/device-store': { useDeviceStore: { getState: () => ({ device: { deviceId: 'd', branchId: 1 } }) } },
      './network.service': { useNetworkStore: { getState: () => ({ isOnline: true }) } },
      '@/lib/stores/sync-store': { useSyncStore: { getState: () => state } },
      '@/lib/db/connection': { query: async sql => db.prepare(sql).all() },
      './sale-sync.service': { SaleSyncService: { retrySale: async id => steps.push(id) } },
      './employee-sync.service': { EmployeeSyncService: { refresh: async () => {} } },
      './audit-sync.service': { syncNctAuditLogs: async () => {} },
      './end-of-day-sync.service': { syncNctEndOfDay: async () => steps.push('end-of-day') },
      './nct-scope': { isNctPos: () => true },
    });
    await Promise.all([runSyncCycle(), runSyncCycle()]);
    assert.deepEqual(steps, ['queue', 'new', 'end-of-day', 'transfers', 'stock', 'catalog']);
  } finally { db.close(); }
});

test('already synced sales reconcile stale queue entries without another upload', async () => {
  const marked = [];
  let released = false;
  const { SaleSyncService } = load('lib/services/sale-sync.service.ts', {
    '@/lib/repositories/sale.repository': { SaleRepository: { findById: async () => ({ synced: true }) } },
    '@/lib/repositories/sync-queue.repository': { SyncQueueRepository: { markEntitySynced: async (...args) => marked.push(args) } },
    '@/lib/services/sync-queue.service': {},
    '@/lib/services/oms-sync.service': {},
    '@/lib/services/nct-sale-payload': {},
    './nct-scope': { isNctPos: () => true },
    '@/lib/db/connection': {},
    '@/lib/services/sale-sync-lock': { acquireSaleSync: () => true, releaseSaleSync: () => { released = true; } },
  });
  const result = await SaleSyncService.retrySale('sale-1');
  assert.equal(result.success, true);
  assert.deepEqual(marked, [['Sale', 'sale-1']]);
  assert.equal(released, true);
});

test('NCT client source contains no dealership routes, imports or API routing', () => {
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(tsx?|js)$/.test(entry.name)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /dealership/i, file);
    }
  }
  inspect(path.join(__dirname, '../src'));
});
