const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const ts = require("typescript"), { DatabaseSync } = require("node:sqlite");
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { if (name in mocks) return mocks[name]; throw Error(name); } });
  return exports;
}
const catalog = load("src/lib/permissions/catalog.ts"), local = load("src/lib/permissions/local-super-admin.ts");
const db = new DatabaseSync(":memory:");
for (const statement of load("src/lib/db/schema.ts").CREATE_TABLES) db.exec(statement);
db.exec(`INSERT INTO Role(id,name) VALUES ('oms-role:manager','OMS Manager'),('oms-role:orphan','OMS Unassigned'),('local-role','Local');
INSERT INTO Cashier(id,employeeId,displayName,roleId,active,pinHash) VALUES
('employee','oms:1','Assigned Employee','oms-role:manager',1,'private'),
('inactive','oms:2','Inactive Employee','oms-role:manager',0,'private'),
('local','local:3','Local Account','local-role',1,'private');
INSERT INTO Permission(id,code,name) VALUES ('sale','POS_SALES','Sales'),('unknown','UNKNOWN','Unknown');
INSERT INTO RolePermission(roleId,permissionId) VALUES ('oms-role:manager','sale'),('oms-role:manager','unknown'),('oms-role:orphan','sale');`);
let failRead = false;
const access = load("src/lib/permissions/settings-access.ts", {
  "./catalog": catalog, "./local-super-admin": local,
  "@/lib/db/connection": { query: async (sql) => { if (failRead) throw Error("Simulated read failure"); return db.prepare(sql).all(); } },
});
const screen = ts.createSourceFile("settings.tsx", fs.readFileSync(path.resolve(__dirname, "../src/app/(pos)/settings.tsx"), "utf8"), ts.ScriptTarget.Latest, true);
let sections;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(screen) === "SETTINGS_SECTIONS") {
    sections = node.initializer.elements.map(element => Object.fromEntries(element.properties.filter(p => ["id", "adminOnly"].includes(p.name.getText(screen))).map(p => [p.name.getText(screen), p.name.getText(screen) === "id" ? p.initializer.text : p.initializer.kind === ts.SyntaxKind.TrueKeyword])));
  }
  ts.forEachChild(node, visit);
}
visit(screen);assert.ok(sections?.length >= 17);
const denied = { isSuperAdmin: false, nct: true, canManageUsers: false, canManageSettings: false, canViewAudit: false, canManageBackups: false };
for (const section of sections) assert.equal(access.canOpenSettingsSection(section, { ...denied, isSuperAdmin: true }), true, `Super Admin sees ${section.id}`);
for (const id of ["users", "permissions", "database", "audit", "oms", "tax"]) assert.equal(access.canOpenSettingsSection(sections.find(s => s.id === id), denied), false, `Restricted employee cannot see ${id}`);
assert.equal(access.canOpenSettingsSection({ id: "permissions", adminOnly: true }, { ...denied, canManageUsers: true }), true);
assert.equal(access.canOpenSettingsSection({ id: "permissions", adminOnly: true }, { ...denied, nct: false, canManageUsers: true }), false);
(async () => {
  const directory = await access.getNctSettingsDirectory(true);
  assert.equal(directory.employees.length, 1);assert.equal(directory.employees[0].id, "employee");
  assert.ok(!("pinHash" in directory.employees[0]));
  const superAdmin = directory.roles.find(role => role.builtIn);
  assert.equal(superAdmin.permissions.length, catalog.POS_PERMISSIONS.length);
  for (const permission of catalog.POS_PERMISSIONS) assert.ok(superAdmin.permissions.includes(permission.code));
  const manager = directory.roles.find(role => role.id === "oms-role:manager");
  assert.equal(manager.permissions.join(), "POS_SALES");assert.equal(directory.roles.length, 2);
  assert.equal((await access.getNctSettingsDirectory(false)).roles.some(role => role.builtIn), false);
  failRead = true;await assert.rejects(() => access.getNctSettingsDirectory(true));
  console.log(`Passed Super Admin visibility for ${sections.length} real settings sections, restricted-user checks, all ${catalog.POS_PERMISSIONS.length} built-in permissions and SQLite employee/role/cache isolation. No OMS writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
