const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(require('node:path').join(__dirname, '../src/lib/permissions/navigation.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText, { exports: exportsObject });
const { permissionRedirect, isNavItemActive } = exportsObject;

test('denied dashboard with no permissions never redirects to itself', () => {
  for (const path of ['/', '/(pos)', '/(pos)/']) {
    assert.equal(permissionRedirect(path, true, []), null);
    assert.equal(permissionRedirect(path, true, ['/(pos)']), null);
  }
});
test('denied route redirects once to a permitted screen', () => {
  assert.equal(permissionRedirect('/', true, ['/(pos)/sales']), '/(pos)/sales');
  assert.equal(permissionRedirect('/sales', false, ['/(pos)/sales']), null);
  assert.equal(permissionRedirect('/settings', true, ['/(pos)/sales']), '/(pos)/sales');
});
test('route matching handles Expo groups, nested screens and trailing slashes', () => {
  assert.equal(isNavItemActive('/sales/123', '/(pos)/sales'), true);
  assert.equal(isNavItemActive('/(pos)/sales/', '/(pos)/sales'), true);
  assert.equal(isNavItemActive('/sales-extra', '/(pos)/sales'), false);
  assert.equal(isNavItemActive('/sales', '/(pos)'), false);
});
