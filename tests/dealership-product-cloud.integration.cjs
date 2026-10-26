const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require','module','exports',source)(id => id in mocks ? mocks[id] : require(id),module,module.exports);
  return module.exports;
}
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const statement of load('src/lib/db/schema.ts').CREATE_TABLES) sql.exec(statement);
const run = (q,p=[]) => sql.prepare(q).run(...p);
const first = (q,p=[]) => sql.prepare(q).get(...p) ?? null;
const db = { getFirstAsync: async(q,p)=>first(q,p), runAsync: async(q,p)=>run(q,p), withTransactionAsync: async work=>{sql.exec('BEGIN');try{await work();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}} };
let mode = 'INDEPENDENT', allowed = true;
const capabilities = load('src/lib/business/capabilities.ts');
const { LocalCatalogService } = load('src/lib/services/local-catalog.service.ts', {
  uuid: { v4: randomUUID }, '@/lib/db/connection': { getDatabase: async()=>db },
  '@/lib/business/configuration.service': { BusinessConfigurationService:{current:()=>({businessId:'dealer',operatingMode:mode})} },
  '@/lib/business/capabilities':capabilities,
  '@/lib/services/authorization.service':{ requirePermission:async()=>{if(!allowed)throw Error('Permission denied');} },
  '@/lib/stores/cashier-store':{useCashierStore:{getState:()=>({session:{cashierId:'admin',cashierName:'Admin'}})}}
});
(async()=>{
  const id = await LocalCatalogService.create({name:'Fish',sku:'FISH',barcode:'12345',price:80,openingStock:10});
  run("INSERT INTO Sale(id,receiptNumber,total) VALUES ('sale','receipt',80)");
  run("INSERT INTO SaleItem(id,saleId,productId,productName,unitPrice) VALUES ('item','sale',?,'Fish',80)",[id]);
  const history = JSON.stringify(sql.prepare('SELECT * FROM SaleItem').all());
  await LocalCatalogService.update(id,{name:'Fresh fish',sku:'FISH-NEW',barcode:'54321',price:100,openingStock:12,expectedStock:10});
  assert.equal(first('SELECT name FROM Product WHERE id=?',[id]).name,'Fresh fish');
  assert.equal(first('SELECT availableQty FROM PosInventory WHERE productId=?',[id]).availableQty,12);
  assert.equal(first("SELECT quantity FROM InventoryLedger WHERE movementType='ADJUSTMENT'").quantity,2);
  assert.equal(first("SELECT price FROM ProductPrice WHERE active=1 AND productId=?",[id]).price,100);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM SaleItem').all()),history);
  const input={name:'Changed',sku:'OTHER',barcode:'54321',price:200,openingStock:12,expectedStock:12};
  await assert.rejects(LocalCatalogService.update(id,{...input,expectedStock:10}),/Stock changed/);
  await assert.rejects(LocalCatalogService.update('foreign',input),/belong/);
  const other=await LocalCatalogService.create({name:'Other',sku:'OTHER',price:1,openingStock:1});
  await assert.rejects(LocalCatalogService.update(id,input),/UNIQUE/);
  assert.equal(first('SELECT name FROM Product WHERE id=?',[id]).name,'Fresh fish','Failed edit rolls back all changes');
  mode='NCT_DEPENDENT';await assert.rejects(LocalCatalogService.update(id,input),/unavailable/);
  mode='INDEPENDENT';allowed=false;await assert.rejects(LocalCatalogService.update(id,input),/Permission denied/);
  let cloud={serverUrl:'https://example.test',deviceId:'device',deviceKey:'fixture',operatingMode:'INDEPENDENT',oms:null};
  let status=200, returnedId='device';
  const originalFetch=global.fetch;
  global.fetch=async(url,options)=>{assert.equal(url,'https://example.test/api/pos/dealership/connection');assert.equal(options.headers['x-dealership-key'],'fixture');return{ok:status===200,json:async()=>({deviceId:returnedId})};};
  try {
    const {useOmsConnectionStore:store}=load('src/lib/stores/oms-connection-store.ts',{
      '@/lib/storage/app-storage':{}, '@/lib/services/dealership-cloud.service':{getCloudConnection:()=>cloud},
      '@/lib/api/http':{setApiConfig:()=>{throw Error('Cloud status must not overwrite OMS sync credentials');}}
    });
    assert.equal(await store.getState().checkConnection(),'connected');
    cloud={...cloud,operatingMode:'NCT_DEPENDENT'};assert.equal(await store.getState().checkConnection(),'connected');
    status=401;assert.equal(await store.getState().checkConnection(),'offline');
    status=200;returnedId='other';assert.equal(await store.getState().checkConnection(),'offline');
    global.fetch=async()=>{throw Error('No network');};assert.equal(await store.getState().checkConnection(),'offline');
  } finally {global.fetch=originalFetch;sql.close();}
  console.log('Passed: independent product editing, audited stock changes, sale history preservation, rollback, permissions, and cloud connection status in both modes');
})().catch(error=>{console.error(error);process.exitCode=1;});
