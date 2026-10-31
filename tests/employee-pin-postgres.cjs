// Actual Prisma/PostgreSQL reads; credential and audit writes are intercepted.
// Requires Docker and the existing staging app. Never updates an employee PIN.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const oms = path.resolve(__dirname, '../../nctalavera-system');
const sources = {
  route: fs.readFileSync(path.join(oms, 'src/app/api/pos/users/pin/route.ts'), 'utf8'),
  directory: fs.readFileSync(path.join(oms, 'src/server/pos/employee-directory.ts'), 'utf8'),
};
const runtime = `
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const ts=require('/app/node_modules/typescript'),vm=require('vm'),assert=require('assert/strict');
const db=new PrismaClient(),sources=${JSON.stringify(sources)};
const load=(source,imports)=>{const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,console,require(name){if(name in imports)return imports[name];if(name==='node:crypto')return require(name);if(['zod','@prisma/client','@trpc/server'].includes(name))return require('/app/node_modules/'+name);throw Error(name)}});return exports;};
(async()=>{
 assert.equal(new URL(process.env.DATABASE_URL).hostname,'staging_db');
 const [target]=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return tx.$queryRaw\`SELECT d.id AS "deviceId",p.id AS "userId" FROM pos.pos_devices d JOIN pos.pos_user_assignments a ON a."deviceId"=d.id AND a."isActive"=true JOIN pos.pos_users p ON p.id=a."userId" AND p.active=true AND p."branchId"=d."branchId" JOIN pos.employee_pos_access x ON x.pos_user_id=p.id JOIN public.users e ON e.id=x.employee_id AND e."isActive"=true AND e."isOnHold"=false WHERE d.status<>'DISABLED' AND d."deviceSecretHash" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dealership.dealership_devices z WHERE z."posDeviceId"=d.id) LIMIT 1\`;});
 assert.ok(target,'An assigned staging NCT device is required');
 let interceptedUpdate=false,interceptedAudit=false;
 const safeDb={
  $queryRaw:db.$queryRaw.bind(db), dealershipDevice:db.dealershipDevice,
  $transaction:fn=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   return fn({$queryRaw:tx.$queryRaw.bind(tx),posDevice:tx.posDevice,posRole:tx.posRole,
    posUser:{updateMany:async({where,data})=>{assert.ok(where.id.in.includes(target.userId));assert.match(data.pinHash,/^[a-f0-9]{64}$/);interceptedUpdate=true;return{count:1}}},
    posAuditLog:{create:async({data})=>{assert.equal(data.action,'EMPLOYEE_PIN_CHANGED');assert.ok(!JSON.stringify(data).includes('123456'));interceptedAudit=true;return{id:'fixture-audit'}}}
   });
  })
 };
 const directory=load(sources.directory,{'~/server/db':{db:safeDb}});
 const {POST}=load(sources.route,{
  '~/server/db':{db:safeDb},'next/server':{NextResponse:{json:(body,options)=>({body,status:options.status})}},
  '~/lib/pos-auth':{isAuthorizedPOS:async()=>({ok:true,deviceId:target.deviceId})},
  '~/server/pos/scope':{posStorageScope:{getStore:()=>undefined}},
  '~/server/pos/employee-directory':directory,
  '~/server/services/crypto.service':{cryptoService:{verifyToken:async(value,verifier)=>{assert.equal(value,'isolated-registration-proof');assert.ok(verifier);return true}}},
  '~/lib/security/rateLimiter':{rateLimitOrError:()=>({ok:true})}
 });
 const response=await POST({json:async()=>({userId:target.userId,newPin:'123456',deviceSecret:'isolated-registration-proof'})});
 assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(interceptedUpdate&&interceptedAudit);
 console.log(JSON.stringify({passed:'Actual PIN handler reaches credential/audit writes through real Prisma/PostgreSQL reads',databaseMode:'READ ONLY',authentication:'fixture device proof',credentialAndAuditWrites:'intercepted; zero database writes'}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());`;
const result = cp.spawnSync('docker', ['exec', '-i', 'nct_nextjs_app_staging', 'node'], { input: runtime, encoding: 'utf8', maxBuffer: 1024 * 1024 });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exitCode = result.status ?? 1;
