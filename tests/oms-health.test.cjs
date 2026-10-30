const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(
  fs.readFileSync(require('node:path').join(__dirname, '../src/lib/api/oms-health.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;

function setup(responses, deviceId = 'device /1') {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === './http') return { api: { get: async (path) => {
        calls.push(path);
        assert.ok(responses.length, 'unexpected API request');
        return responses.shift();
      } } };
      if (name === '@/lib/stores/device-store') return {
        useDeviceStore: { getState: () => ({ device: { deviceId } }) }
      };
      throw new Error(`Unexpected import: ${name}`);
    }
  });
  return { check: exports.checkOmsHealth, calls };
}

test('healthy server uses health endpoint only', async () => {
  const response = { ok: true, status: 200 };
  const { check, calls } = setup([response]);
  assert.equal(await check(), response);
  assert.deepEqual(calls, ['/api/pos/health']);
});

test('missing health route falls back to encoded device inventory', async () => {
  const response = { ok: true, status: 200, data: { data: [] } };
  const { check, calls } = setup([{ ok: false, status: 404 }, response]);
  assert.equal(await check(), response);
  assert.deepEqual(calls, ['/api/pos/health', '/api/pos/inventory?deviceId=device%20%2F1']);
});

test('authentication and server failures never trigger fallback', async () => {
  for (const status of [0, 401, 403, 500]) {
    const response = { ok: false, status };
    const { check, calls } = setup([response]);
    assert.equal(await check(), response);
    assert.equal(calls.length, 1);
  }
});

test('missing device identity preserves the health failure', async () => {
  const response = { ok: false, status: 404 };
  const { check, calls } = setup([response], null);
  assert.equal(await check(), response);
  assert.equal(calls.length, 1);
});

test('fallback preserves credential rejection and rejects malformed success', async () => {
  const rejected = { ok: false, status: 401 };
  const first = setup([{ ok: false, status: 404 }, rejected]);
  assert.equal(await first.check(), rejected);
  const second = setup([{ ok: false, status: 404 }, { ok: true, status: 200, data: { status: 'healthy' } }]);
  const result = await second.check();
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
});
