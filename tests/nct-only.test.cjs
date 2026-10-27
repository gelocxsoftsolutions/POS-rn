const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

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

test('legacy independent configuration cannot enable dealership features', () => {
  const { capabilitiesFor, assertCapability } = load('lib/business/capabilities.ts');
  for (const mode of ['NCT_DEPENDENT', 'INDEPENDENT']) {
    const caps = capabilitiesFor(mode);
    assert.equal(caps.manageLocalCatalog, false);
    assert.equal(caps.manageLocalInventory, false);
    assert.equal(caps.uploadBackups, false);
    assert.equal(caps.uploadEndOfDay, false);
    assert.equal(caps.receiveNctTransfers, true);
    assert.equal(caps.importNctCatalog, true);
    assert.throws(() => assertCapability(mode, 'manageLocalCatalog'), /NCT OMS-dependent/);
  }
});

test('legacy cloud jobs are retained as failed while NCT inventory still syncs', async () => {
  const retained = [], sent = [], synced = [];
  const { SyncQueueService } = load('lib/services/sync-queue.service.ts', {
    '@/lib/repositories/sync-queue.repository': { SyncQueueRepository: {
      getPending: async () => [
        { id: '1', entityType: 'EndOfDay', entityId: 'eod' },
        { id: '2', entityType: 'DatabaseBackup', entityId: 'backup' },
        { id: '3', entityType: 'Inventory', entityId: 'stock', payload: '{"qty":3}' }
      ],
      markEntityFailed: async (type, id) => retained.push([type, id]),
      markProcessing: async () => {},
      markSynced: async id => synced.push(id)
    } },
    '@/lib/api/http': { api: { put: async (url, body) => { sent.push([url, body.qty]); return { ok: true }; } } }
  });
  const result = await SyncQueueService.processPending();
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 2);
  assert.deepEqual(retained, [['EndOfDay', 'eod'], ['DatabaseBackup', 'backup']]);
  assert.deepEqual(sent, [['/api/pos/inventory', 3]]);
  assert.deepEqual(synced, ['3']);
});

test('end of day creates a local backup without any cloud queue dependency', async () => {
  let backups = 0;
  const { EndOfDayService } = load('lib/backup/end-of-day.service.ts', {
    '@/lib/db/connection': { queryFirst: async () => ({ grossSales: 10 }), query: async () => [] },
    '@/lib/business/configuration.service': { BusinessConfigurationService: { current: () => ({ businessId: 'nct' }) } },
    './recovery.service': { RecoveryService: { createAutoBackup: async () => { backups++; return { file: { uri: 'local-backup' } }; } } }
  });
  const result = await EndOfDayService.closeLocally({ businessDate: '2026-10-28' });
  assert.equal(backups, 1);
  assert.equal(result.backup.fileUri, 'local-backup');
  assert.equal(result.summary.grossSales, 10);
});

test('already queued independent sales cannot replay into NCT OMS', async () => {
  const retained = [];
  const { SyncQueueService } = load('lib/services/sync-queue.service.ts', {
    '@/lib/repositories/sync-queue.repository': { SyncQueueRepository: {
      getPending: async () => [{ id: 'legacy-job', entityType: 'Sale', entityId: 'legacy-sale' }],
      markEntityFailed: async (type, id) => retained.push([type, id])
    } },
    '@/lib/api/http': { api: {} },
    '@/lib/db/connection': { queryFirst: async () => ({ id: 'legacy-sale', originMode: 'INDEPENDENT' }) }
  });
  const result = await SyncQueueService.processPending();
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(retained, [['Sale', 'legacy-sale']]);
});
