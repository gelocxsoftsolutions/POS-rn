const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('typescript'), crypto = require('node:crypto');
const oms = path.resolve(__dirname, '../../nctalavera-system');
const hash = pin => crypto.createHash('sha256').update(pin).digest('hex');
function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Buffer, TextEncoder, console, require(name) { if (name in imports) return imports[name]; throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const targetId = '11111111-1111-4111-8111-111111111111', actorId = '22222222-2222-4222-8222-222222222222';
async function serverTests() {
  let scope, authorized = true, registered = true, allowed = true, configured = true, assigned = true, disabled = false, auditFailure = false;
  let grants = [], events = [], updates = [], pins = [hash('123456'), hash('123456')];
  const target = { id: targetId, employeeId: 'oms:7', roleId: 'target-role', pinHash: hash('123456'), pinLoginEnabled: true };
  const actor = { id: actorId, employeeId: 'oms:8', roleId: 'actor-role', pinHash: hash('654321'), pinLoginEnabled: true };
  const db = {
    dealershipDevice: { findUnique: async () => null },
    async $queryRaw(strings) {
      if (strings.join('').includes('pg_advisory_xact_lock')) {
        assert.match(strings.join(''), /pg_advisory_xact_lock\(68173327\)::text/, 'Prisma cannot deserialize a PostgreSQL void result');
        return [{ lock: '' }];
      }
      return [{ id: targetId }, { id: 'linked-access-other-branch' }];
    },
    posDevice: { findUnique: async () => ({ status: disabled ? 'DISABLED' : 'ONLINE', deviceSecretHash: 'verifier' }) },
    posUser: { updateMany: async ({ where, data }) => { updates.push(where.id.in); let count = 0; pins = pins.map(pin => { if (pin !== data.pinHash) count++; return data.pinHash; }); target.pinHash = data.pinHash; return { count }; } },
    posAuditLog: { create: async ({ data }) => { if (auditFailure) throw Error('audit failed'); events.push(data); } },
    async $transaction(fn) { const previous = [...pins], oldHash = target.pinHash, previousEvents = [...events]; try { return await fn(this); } catch (e) { pins = previous; target.pinHash = oldHash; events = previousEvents; throw e; } },
  };
  const { POST } = load(path.join(oms, 'src/app/api/pos/users/pin/route.ts'), {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    'node:crypto': crypto, zod: require(require.resolve('zod', { paths: [oms] })),
    '~/server/db': { db }, '~/lib/pos-auth': { isAuthorizedPOS: async () => ({ ok: authorized, deviceId: registered ? 'device-1' : null }) },
    '~/server/pos/scope': { posStorageScope: { getStore: () => scope } },
    '~/server/pos/employee-directory': { employeeAccessReady: async () => configured, nctEmployeeDirectory: async () => ({ users: assigned ? [target, actor] : [actor], roles: [{ id: 'actor-role', permissions: grants }] }) },
    '~/server/services/crypto.service': { cryptoService: { verifyToken: async (value, verifier) => value === 'device-secret-proof-long-enough' && verifier === 'verifier' } },
    '~/lib/security/rateLimiter': { rateLimitOrError: () => ({ ok: allowed }) },
  });
  const post = input => POST({ json: async () => input });
  const admin = { userId: targetId, newPin: '112233', deviceSecret: 'device-secret-proof-long-enough' };
  scope = 'dealership'; assert.equal((await post(admin)).status, 403); scope = undefined;
  authorized = false; assert.equal((await post(admin)).status, 401); authorized = true;
  registered = false; assert.equal((await post(admin)).status, 401); registered = true;
  allowed = false; assert.equal((await post(admin)).status, 429); allowed = true;
  assert.equal((await post({ ...admin, newPin: '123' })).status, 400);
  assert.equal((await post({ ...admin, isSuperAdmin: true })).status, 400);
  configured = false; assert.equal((await post(admin)).status, 503); configured = true;
  assigned = false; assert.equal((await post(admin)).status, 403); assigned = true;
  disabled = true; assert.equal((await post(admin)).status, 403); disabled = false;
  assert.equal((await post({ ...admin, deviceSecret: 'wrong-secret-long-enough' })).status, 401);
  assert.equal(events.length, 0); assert.equal(updates.length, 0);
  assert.equal((await post({ userId: targetId, newPin: '112233', actorId, currentPin: '654321' })).status, 403);
  grants = ['MANAGE_POS_USERS'];
  assert.equal((await post({ userId: targetId, newPin: '112233', actorId, currentPin: '000000' })).status, 401);
  auditFailure = true; assert.equal((await post(admin)).status, 503); assert.equal(pins[0], hash('123456')); assert.equal(events.length, 0); auditFailure = false;
  assert.equal((await post(admin)).status, 200); assert.deepEqual(pins, [hash('112233'), hash('112233')]);
  assert.equal(events.length, 1); assert.equal(events[0].details.actorType, 'DEVICE_ADMIN'); assert.equal(events[0].cashierUserId, null);
  assert.equal((await post(admin)).status, 200); assert.equal(events.length, 1, 'same PIN retry is a no-op');
  assert.equal((await post({ userId: targetId, newPin: '223344', actorId, currentPin: '654321' })).status, 200);
  assert.equal(events[1].cashierUserId, actorId);
  grants = [];
  assert.equal((await post({ userId: targetId, newPin: '334455', actorId: targetId, currentPin: '223344' })).status, 200, 'employees can change their own PIN');
  const auditText = JSON.stringify(events); assert.ok(!auditText.includes('112233') && !auditText.includes('device-secret') && !auditText.includes(hash('334455')));
  console.log('Server PIN tests passed: device scope, credentials, permissions, shared access, retry and audit rollback.');
}
async function clientTests() {
  let online = true, session = { cashierId: actorId }, admin = false, verified = true, secret = 'device-secret-proof-long-enough', ack = true, refreshed = true;
  const requests = [], writes = [];
  const { EmployeePinService } = load(path.resolve(__dirname, '../src/lib/services/employee-pin.service.ts'), {
    '@noble/hashes/sha2.js': { sha256: bytes => crypto.createHash('sha256').update(bytes).digest() }, '@noble/hashes/utils.js': { bytesToHex: bytes => Buffer.from(bytes).toString('hex') },
    '@/lib/api/http': { api: { post: async (route, body) => { requests.push({ route, body }); return ack ? { ok: true, data: { success: true } } : { ok: false, error: { error: 'No access' } }; } } },
    '@/lib/stores/cashier-store': { useCashierStore: { getState: () => ({ session }) } }, '@/lib/stores/device-store': { useDeviceStore: { getState: () => ({ device: { deviceId: 'device-1', deviceSecret: secret } }) } },
    '@/lib/permissions/local-super-admin': { isLocalSuperAdmin: () => admin }, './cashier.service': { CashierService: { verifyCurrentUserPin: async () => ({ success: verified }) } },
    './employee-sync.service': { EmployeeSyncService: { refresh: async () => refreshed } }, './network.service': { useNetworkStore: { getState: () => ({ isOnline: online }) } }, './nct-scope': { isNctPos: () => true },
    '@/lib/db/connection': { execute: async (sql, params) => writes.push({ sql, params }) }, '@/lib/db/local-operation': { serializeLocalOperation: fn => fn() },
  });
  online = false; await assert.rejects(() => EmployeePinService.save(targetId, '112233', '654321'), /Connect/); assert.equal(requests.length, 0); online = true;
  await assert.rejects(() => EmployeePinService.save(targetId, '123', '654321'), /six-digit/);
  ack = false; await assert.rejects(() => EmployeePinService.save(targetId, '112233', '654321'), /No access/); assert.equal(writes.length, 0); ack = true;
  await EmployeePinService.save(targetId, '112233', '654321'); assert.equal(requests.at(-1).body.actorId, actorId); assert.equal(writes.at(-1).params[0], hash('112233'));
  admin = true; verified = false; const before = requests.length; await assert.rejects(() => EmployeePinService.save(targetId, '112233', 'password')); assert.equal(requests.length, before); verified = true;
  secret = null; await assert.rejects(() => EmployeePinService.save(targetId, '112233', 'password'), /Reconnect/); secret = 'device-secret-proof-long-enough';
  refreshed = false; assert.match(await EmployeePinService.save(targetId, '112233', 'password'), /saved in OMS/);
  assert.equal(requests.at(-1).body.deviceSecret, secret); assert.equal(requests.at(-1).body.currentPin, undefined, 'local admin password never uploaded');
  session = null;
  await assert.rejects(() => EmployeePinService.saveDuringRegistration(targetId, '112233'), /freshly activated/);
  assert.throws(() => EmployeePinService.beginRegistration('different-device'), /activation/);
  EmployeePinService.beginRegistration('device-1');
  await EmployeePinService.saveDuringRegistration(targetId, '112233');
  assert.equal(requests.at(-1).body.deviceSecret, secret); assert.equal(requests.at(-1).body.actorId, undefined);
  EmployeePinService.endRegistration();
  await assert.rejects(() => EmployeePinService.saveDuringRegistration(targetId, '112233'), /freshly activated/);
  console.log('POS PIN tests passed: online saves, reauthentication, proof selection and confirmed-save cache recovery.');
}
async function omsPolicyTests() {
  const procedure = { input() { return this; }, query(fn) { return fn; }, mutation(fn) { return fn; } };
  let created;
  const db = {
    legacyUser: { findUnique: async () => ({ id: 7, username: 'chris', first_name: 'Chris', last_name: 'Buenafe', isActive: true, isOnHold: false }) },
    posUser: { findUnique: async ({ where }) => where.id ? { id: targetId } : null, create: async ({ data }) => (created = { id: targetId, ...data }), update: async ({ data }) => data },
    $executeRaw: async () => 1, $queryRaw: async () => [{ displayName: 'Chris Buenafe' }], $transaction: async fn => fn(db),
  };
  const { createPosUserRouter } = load(path.join(oms, 'src/server/api/routers/pos-user.ts'), {
    '~/server/pos/dealership-procedure': { isDealershipOperator: ctx => !!ctx.dealership },
    zod: require(require.resolve('zod', { paths: [oms] })), '@trpc/server': require(require.resolve('@trpc/server', { paths: [oms] })),
    '~/server/api/trpc': { createTRPCRouter: value => value, protectedProcedure: procedure },
    '~/lib/permissions': { PERMISSIONS: { MANAGE_POS_USERS: 'MANAGE_POS_USERS' } },
    '~/server/pos/employee-directory': { employeeAccessReady: async () => true }, 'node:crypto': crypto,
  });
  const router = createPosUserRouter(), ctx = { db, session: { user: { id: '7', isAdmin: true } } };
  const input = { branchId: 1, employeeId: 7, username: 'old', displayName: 'Old', roleId: actorId, pinLoginEnabled: true, passwordLoginEnabled: false };
  await assert.rejects(() => router.createUser({ ctx, input: { ...input, pin: '123456' } }), e => e.code === 'BAD_REQUEST');
  await assert.rejects(() => router.updateUser({ ctx, input: { id: targetId, pin: '123456' } }), e => e.code === 'BAD_REQUEST');
  await assert.rejects(() => router.updateUser({ ctx, input: { id: targetId, password: 'password' } }), e => e.code === 'BAD_REQUEST');
  await router.createUser({ ctx, input }); assert.equal(created.displayName, 'Chris Buenafe'); assert.equal(created.pinLoginEnabled, false); assert.equal(created.passwordHash, null); assert.match(created.pinHash, /^[a-f0-9]{64}$/); assert.notEqual(created.pinHash, hash('123456'));
  await assert.rejects(() => router.createUser({ ctx: { ...ctx, dealership: true }, input }), e => e.code === 'BAD_REQUEST');
  await router.createUser({ ctx: { ...ctx, dealership: true }, input: { ...input, pin: '123456' } }); assert.equal(created.pinHash, hash('123456')); assert.equal(created.pinLoginEnabled, true);
  const changed = await router.updateUser({ ctx: { ...ctx, dealership: true }, input: { id: targetId, pin: '654321' } }); assert.equal(changed.pinHash, hash('654321'));
  console.log('OMS policy tests passed: NCT credentials editable only through POS, unconfigured new access, Dealership credential behavior preserved.');
}
(async () => { await serverTests(); await clientTests(); await omsPolicyTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
