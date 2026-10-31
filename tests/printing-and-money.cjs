const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), cp = require("node:child_process"), ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require(name) { if (name in mocks) return mocks[name]; throw Error(name); },
  });
  return exports;
}
const money = load("src/lib/formatting/money.ts");
for (const [input, output] of [[0,"0.00"],[1000,"1,000.00"],[1234567.89,"1,234,567.89"],[-12345.6,"-12,345.60"],[999.999,"1,000.00"],[1.005,(1.005).toFixed(2)],[NaN,"0.00"]]) assert.equal(money.formatAmount(input), output);
const { formatEscPosReceipt } = load("src/lib/printers/escpos-receipt.ts", { "@/lib/formatting/money": money });
const receipt = { receiptNumber: "TEST-1", date: "2026-10-31T00:00:00Z", cashierName: "Test", paymentMethod: "CASH", items: [{ name: "Test fish", quantity: 2, unitPrice: 1234.5 }], subtotal: 2469, tax: 0, total: 2469, paidAmount: 3000, change: 531 };
const before = JSON.stringify(receipt), paper = formatEscPosReceipt(receipt, null);
assert.ok(paper.includes("PHP 1,234.50"));assert.ok(paper.includes("PHP 2,469.00"));assert.ok(paper.includes("PHP 3,000.00"));assert.equal(JSON.stringify(receipt), before, "formatting cannot mutate receipt math");
assert.ok(paper.split("\n").every(line => line.length <= 32));
const { encodeCode128B } = load("src/lib/barcodes/code128.ts");
const output = path.join(root, ".expo", "native-printer-tests");fs.mkdirSync(output, { recursive: true });
const harness = path.join(output, "Code128RasterHarness.java");
fs.writeFileSync(harness, `import com.nctseafoods.pos.Code128Raster; import java.util.Base64; import java.nio.charset.StandardCharsets;
public class Code128RasterHarness { public static void main(String[] args) { try { String value = new String(Base64.getDecoder().decode(args[0].substring(1)), StandardCharsets.UTF_8); System.out.print(Base64.getEncoder().encodeToString(Code128Raster.encode(value, Boolean.parseBoolean(args[1]), Integer.parseInt(args[2])))); } catch (IllegalArgumentException error) { System.err.print(error.getMessage()); System.exit(2); } } }`);
const executable = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? name + ".exe" : name) : name;
cp.execFileSync(executable("javac"), ["-d", output, path.join(root, "plugins/bluetooth-printer/Code128Raster.java"), harness]);
function render(value, showText = true) {
  const result = cp.spawnSync(executable("java"), ["-cp", output, "Code128RasterHarness", "v" + Buffer.from(value).toString("base64"), String(showText), "384"], { encoding: "utf8" });
  if (result.status !== 0) throw Error(result.stderr);
  return Buffer.from(result.stdout, "base64");
}
for (const value of ["ABC123", "NCTSK11015-AXMV", "NCTTPP(5U1015-2GOT", "A{B}123", "12345678901234567890123456789"]) {
  const bytes = render(value), width = bytes.readUInt16LE(8), height = bytes.readUInt16LE(10);
  assert.deepEqual([...bytes.subarray(4, 8)], [29,118,48,0]);assert.ok(width * 8 <= 384);assert.equal(height,80);
  const modules = encodeCode128B(value), total = modules.reduce((sum,v)=>sum+v,20), scale = Math.min(2, Math.floor(384 / total));
  const expected = Array(10 * scale).fill(0);modules.forEach((count,index)=>expected.push(...Array(count * scale).fill(index % 2 === 0 ? 1 : 0)));expected.push(...Array(10 * scale).fill(0));while(expected.length < width * 8) expected.push(0);
  for (let x=0;x<expected.length;x++) assert.equal((bytes[12 + Math.floor(x/8)] >> (7-x%8)) & 1, expected[x], value + " raster pixel " + x);
  for(let row=1;row<height;row++)assert.deepEqual(bytes.subarray(12+row*width,12+(row+1)*width),bytes.subarray(12,12+width));
  assert.ok(bytes.subarray(12+height*width).toString("ascii").includes(value));
}
const newBarcode = "NCTTPP(5U1015-2GOT";
assert.equal(encodeCode128B(newBarcode).reduce((sum,v)=>sum+v,0)*2,466,"reproduce old oversized native barcode");
assert.equal(render(newBarcode).readUInt16LE(8)*8,256,"new barcode raster fits 384-dot paper");
assert.ok(!render("ABC123",false).subarray(12+render("ABC123",false).readUInt16LE(8)*80).toString("ascii").includes("ABC123"));
for(const bad of ["", "Bad\ncode", "中文", "A".repeat(100)])assert.throws(()=>render(bad));
console.log("Passed monetary grouping/rounding and fixed-width receipt checks; compiled native Java raster matches Code 128/checksum pixels for old/new barcodes, fits 384 dots, and rejects unsupported/oversized data. No APK built; no physical printer tested.");
