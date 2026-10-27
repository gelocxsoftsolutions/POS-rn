const fs = require("node:fs");
const path = require("node:path");
const prettier = require("../../nctalavera-system/node_modules/prettier");
const workspace = path.resolve(__dirname, "..");
const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(folder, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const posFiles = [
  "src/lib/permissions/nct-permission-map.ts",
  "src/lib/services/end-of-day-sync.service.ts",
  "src/lib/db/local-operation.ts", "src/lib/services/action-audit.ts", "src/lib/services/audit-sync.service.ts",
  "src/lib/services/employee-sync.service.ts", "src/lib/services/nct-backup.service.ts", "src/lib/services/nct-checkout.service.ts",
  "src/lib/services/nct-sale-payload.ts", "src/lib/services/nct-scope.ts", "src/lib/services/nct-sync-coordinator.ts",
  "src/lib/services/nct-transfer-receive.service.ts", "src/lib/backup/nct-schedule.ts", "src/lib/backup/nct-restore.service.ts",
].map((file) => path.join(workspace, file));
const omsFiles = walk(path.join(workspace, "oms-staging/src")).filter((file) => /nct-|sales-report|sale-contract|pos-summary-report/.test(file));
const tests = walk(path.join(workspace, "tests")).filter((file) => /phase1-.*\.cjs$/.test(file));
(async () => {
  for (const file of [...posFiles, ...omsFiles, ...tests]) {
    const input = fs.readFileSync(file, "utf8");
    const formatted = await prettier.format(input, { filepath: file, printWidth: 100, tabWidth: 2, semi: true, singleQuote: false, trailingComma: "all" });
    if (input !== formatted) fs.writeFileSync(file, formatted);
  }
  console.log("Formatted new Phase 1 files using existing OMS Prettier. No dependencies installed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
