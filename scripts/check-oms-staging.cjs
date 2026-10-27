// Typecheck the staging patch against OMS without modifying its source or database.
const fs = require("node:fs");
const path = require("node:path");
const oms = path.resolve(__dirname, "../../nctalavera-system");
const overlay = path.resolve(__dirname, "../oms-staging");
const ts = require(path.join(oms, "node_modules/typescript"));
const config = ts.readConfigFile(path.join(oms, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, oms);
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
const files = walk(path.join(overlay, "src"));
const patches = new Map(files.map((file) => [path.join(oms, path.relative(overlay, file)).toLowerCase(), file]));
const options = { ...parsed.options, incremental: false, noEmit: true };
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host), exists = host.fileExists.bind(host);
host.readFile = (file) => readFile(patches.get(path.resolve(file).toLowerCase()) ?? file);
host.fileExists = (file) => patches.has(path.resolve(file).toLowerCase()) || exists(file);
// New folders must be visible to the module resolver, too.
const directoryExists = host.directoryExists?.bind(host);
host.directoryExists = (folder) => directoryExists?.(folder) || files.some((file) => path.join(oms, path.relative(overlay, file)).toLowerCase().startsWith(path.resolve(folder).toLowerCase() + path.sep));
const roots = [...new Set([...parsed.fileNames, ...files.map((file) => path.join(oms, path.relative(overlay, file)))])];
const program = ts.createProgram(roots, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const changed = diagnostics.filter((d) => d.file && patches.has(path.resolve(d.file.fileName).toLowerCase()));
const format = { getCanonicalFileName: (file) => file, getCurrentDirectory: () => oms, getNewLine: () => "\n" };
fs.writeFileSync(path.resolve(__dirname, "../docs/phase1/oms-typecheck.log"), ts.formatDiagnostics(diagnostics, format));
console.log(`OMS diagnostics: ${diagnostics.length}; in patched files: ${changed.length}`);
if (changed.length) console.log(ts.formatDiagnostics(changed, format));
process.exitCode = changed.length ? 1 : 0;
