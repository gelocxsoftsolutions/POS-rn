const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/db', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, { exports, console: { error() {} }, require: (name) => {
    assert.ok(name in dependencies, `unexpected import: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

test('missing SQLite native module produces a versioned startup error without importing SQLite', async () => {
  const runtime = load('sqlite-runtime.ts', {
    'expo-constants': { __esModule: true, default: { expoVersion: 'test-version' } },
    expo: { requireOptionalNativeModule: () => null },
    'react-native': { Platform: { OS: 'android' } }
  });
  await assert.rejects(runtime.loadSqlite(), /Expo Go test-version/);
});

test('available native SQLite loads its JavaScript module', async () => {
  const sqlite = { openDatabaseAsync() {} };
  const runtime = load('sqlite-runtime.ts', {
    'expo-constants': { default: {} },
    expo: { requireOptionalNativeModule: () => ({}) },
    'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite': sqlite
  });
  assert.equal((await runtime.loadSqlite()).openDatabaseAsync, sqlite.openDatabaseAsync);
});

test('concurrent database callers share initialization and cannot see an unmigrated database', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let opens = 0;
  let first = true;
  const database = { execAsync: async () => { if (first) { first = false; await gate; } }, runAsync: async () => {}, closeAsync: async () => {} };
  const connection = load('connection.ts', {
    './sqlite-runtime': { loadSqlite: async () => ({ openDatabaseAsync: async () => { opens++; return database; } }) },
    '@/lib/storage/identity': { DATABASE_NAME: 'test' },
    './schema': { CREATE_TABLES: [], SCHEMA_VERSION: 1 }
  });
  const a = connection.getDatabase();
  const b = connection.getDatabase();
  await Promise.resolve();
  assert.throws(connection.getDb, /not initialized/);
  release();
  assert.equal(await a, database);
  assert.equal(await b, database);
  assert.equal(opens, 1);
});

test('failed database initialization closes its handle and can be retried', async () => {
  let opens = 0;
  let closes = 0;
  const healthy = { execAsync: async () => {}, runAsync: async () => {} };
  const broken = { execAsync: async () => { throw new Error('migration failure'); }, closeAsync: async () => { closes++; } };
  const connection = load('connection.ts', {
    './sqlite-runtime': { loadSqlite: async () => ({ openDatabaseAsync: async () => ++opens === 1 ? broken : healthy }) },
    '@/lib/storage/identity': { DATABASE_NAME: 'test' },
    './schema': { CREATE_TABLES: [], SCHEMA_VERSION: 1 }
  });
  await assert.rejects(connection.getDatabase(), /migration failure/);
  assert.throws(connection.getDb, /not initialized/);
  assert.equal(closes, 1);
  assert.equal(await connection.getDatabase(), healthy);
});
