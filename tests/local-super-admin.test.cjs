const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText, { exports, TextEncoder, require(name) {
    if (name in dependencies) return dependencies[name];
    if (name === '@/lib/permissions/local-super-admin') return identity;
    throw new Error(`Unexpected import: ${name}`);
  } });
  return exports;
}
const identity = load('lib/permissions/local-super-admin.ts');
const admin = { cashierId: identity.SUPER_ADMIN_ID, isSuperAdmin: true };

test('local administrator exemption requires both reserved identity and admin flag', async () => {
  let session = admin;
  const { requirePermission } = load('lib/services/authorization.service.ts', {
    '@/lib/stores/cashier-store': { useCashierStore: { getState: () => ({ session }) } },
    '@/lib/services/permission.service': { PermissionService: { hasPermission: async () => false } },
    './nct-scope': { isNctPos: () => true },
    '@/lib/repositories/cashier.repository': { CashierRepository: { findById: async () => null } },
  });
  await requirePermission('POS_BACKUP');
  session = { cashierId: 'employee', isSuperAdmin: true };
  await assert.rejects(requirePermission('POS_BACKUP'), /no longer has NCT POS access/);
  session = { cashierId: identity.SUPER_ADMIN_ID, isSuperAdmin: false };
  await assert.rejects(requirePermission('POS_BACKUP'), /no longer has NCT POS access/);
});

test('successful OMS directory refresh preserves local admin but revokes missing employees', async () => {
  let session = admin;
  let cleared = 0;
  const { EmployeeSyncService } = load('lib/services/employee-sync.service.ts', {
    '@/lib/api/http': { api: { get: async () => ({ ok: true, data: { users: [], roles: [] } }) } },
    '@/lib/db/connection': { execute: async () => {}, getDatabase: async () => ({ withTransactionAsync: async fn => fn() }) },
    './nct-scope': { isNctPos: () => true },
    '@/lib/permissions/catalog': { POS_PERMISSIONS: [] },
    './network.service': { useNetworkStore: { getState: () => ({ isOnline: true }) } },
    '@/lib/db/local-operation': { serializeLocalOperation: async fn => fn() },
    '@/lib/permissions/nct-permission-map': {},
    '@/lib/stores/cashier-store': { useCashierStore: { getState: () => ({ session, clearSession: () => cleared++ }) } },
    '@/lib/stores/auth-store': { useAuthStore: { getState: () => ({ signOut: () => {} }) } },
  });
  assert.equal(await EmployeeSyncService.refresh(), true);
  assert.equal(cleared, 0);
  session = { cashierId: 'missing-employee', roleId: 'oms-role:1' };
  await EmployeeSyncService.refresh();
  assert.equal(cleared, 1);
});
