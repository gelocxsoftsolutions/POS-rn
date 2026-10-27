import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { posStorageScope } from "~/server/pos/scope";
import { POST as dealershipReceive } from "~/server/pos/dealership-transfer-receive";
import { pendingNctAllocations } from "~/server/pos/nct-pending-allocations";

const schema=z.object({transferId:z.number().int().positive().optional(),transferNumber:z.string().min(1).max(50),deviceId:z.string().min(1),cashierId:z.string().max(100).optional(),cashierName:z.string().max(255).optional(),
  items:z.array(z.object({variationId:z.number().int().positive(),actualQty:z.number().int().min(0),notes:z.string().max(1000).optional()})).min(1),pendingSaleIds:z.array(z.string().uuid()).max(1000).default([])});
class ReceiptError extends Error {constructor(message:string,readonly status:number){super(message);}}
export async function POST(request:Request){
  if(posStorageScope.getStore()==='dealership')return dealershipReceive(request);
  const auth=await isAuthorizedPOS(request);
  if(!auth.ok||!auth.deviceId)return NextResponse.json({error:'Registered NCT device required'},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid complete transfer receipt'},{status:400});
  const input=parsed.data;
  if(input.deviceId!==auth.deviceId)return NextResponse.json({error:'Transfer device mismatch'},{status:403});
  try{
    const result=await db.$transaction(async tx=>{
      const [locked]=await tx.$queryRaw<Array<{id:number}>>`SELECT id FROM pos.inventory_transfers WHERE transfer_number=${input.transferNumber} FOR UPDATE`;
      if(!locked)throw new ReceiptError('Transfer not found',404);
      const transfer=await tx.inventoryTransfer.findUniqueOrThrow({where:{id:locked.id},include:{items:true}});
      const device=await tx.posDevice.findUnique({where:{id:auth.deviceId!},select:{branchId:true}});
      if((input.transferId&&input.transferId!==transfer.id)||transfer.targetDeviceId!==auth.deviceId||!device||transfer.targetBranchId!==Number(device.branchId))throw new ReceiptError('Transfer does not belong to this branch/device',403);
      if(transfer.direction!=='INVENTORY_TO_POS')throw new ReceiptError('Only inbound transfers can be received by POS',409);
      const actual=new Map(input.items.map(i=>[i.variationId,i]));
      const expected=new Map<number,number>();
      for(const i of transfer.items)expected.set(i.variationId,(expected.get(i.variationId)??0)+i.allocatedQty);
      if(actual.size!==input.items.length||actual.size!==expected.size||[...expected].some(([id,qty])=>!actual.has(id)||actual.get(id)!.actualQty>qty))throw new ReceiptError('Receipt must contain every variation and cannot exceed the approved allocation',400);
      if(transfer.status==='RECEIVED'){
        const recorded=new Map<number,number>();for(const i of transfer.items)recorded.set(i.variationId,(recorded.get(i.variationId)??0)+(i.receivedQty??0));
        if([...recorded].some(([id,qty])=>actual.get(id)?.actualQty!==qty))throw new ReceiptError('Transfer was already received with different quantities; reconcile in OMS',409);
      }else{
        if(!['APPROVED','IN_TRANSIT'].includes(transfer.status))throw new ReceiptError(`Cannot receive ${transfer.status} transfer`,409);
        const variations=await tx.productVariation.findMany({where:{id:{in:[...expected.keys()]}},select:{id:true,stockGroupId:true}});
        const byId=new Map(variations.map(v=>[v.id,v]));
        const shortages=new Map<string,number>();
        for(const [id,qty]of expected){const missing=qty-actual.get(id)!.actualQty;if(!missing)continue;if(!actual.get(id)!.notes?.trim())throw new ReceiptError('Explain each quantity discrepancy before receiving',400);const v=byId.get(id);if(!v)throw new ReceiptError('Transferred product no longer exists',409);const key=v.stockGroupId?.trim()?`group:${v.stockGroupId}`:`var:${id}`;shortages.set(key,(shortages.get(key)??0)+missing);}
        // Approval already allocated the full stock. Correct shortages, never credit it twice.
        for(const [groupKey,qty]of [...shortages].sort(([a],[b])=>a.localeCompare(b))){const update=await tx.posInventory.updateMany({where:{deviceId:auth.deviceId!,groupKey,qty:{gte:qty}},data:{qty:{decrement:qty}}});if(update.count!==1)throw new ReceiptError('Allocated stock changed; reconcile this discrepancy in OMS',409);}
        const remaining=new Map([...actual].map(([id,item])=>[id,item.actualQty]));
        for(const item of transfer.items){const qty=Math.min(item.allocatedQty,remaining.get(item.variationId)??0);remaining.set(item.variationId,(remaining.get(item.variationId)??0)-qty);await tx.inventoryTransferItem.update({where:{id:item.id},data:{receivedQty:qty,notes:actual.get(item.variationId)!.notes??item.notes}});}
        await tx.inventoryTransfer.update({where:{id:transfer.id},data:{status:'RECEIVED',receivedById:auth.deviceId,receivedByName:input.cashierName??null,receivedAt:new Date()}});
        await tx.posAuditLog.create({data:{deviceId:auth.deviceId,cashierUserId:input.cashierId??null,action:'TRANSFER_RECEIVED',entityType:'InventoryTransfer',entityId:String(transfer.id),details:{branchId:Number(device.branchId),items:input.items}}});
      }
      const unreceived = await pendingNctAllocations(tx, [auth.deviceId!]);
      const inventory=await tx.posInventory.findMany({where:{deviceId:auth.deviceId!},select:{variationId:true,qty:true,groupKey:true}});
      const balances=inventory.map((item)=>({variationId:item.variationId,qty:Math.max(0,item.qty-(unreceived.get(`${auth.deviceId}:${item.groupKey}`)??0))}));
      let acknowledgedSaleIds:string[]=[];
      const [ready]=await tx.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('pos.sale_sync_receipts') IS NOT NULL AS ready`;
      if(ready?.ready&&input.pendingSaleIds.length){const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT client_sale_id::text AS id FROM pos.sale_sync_receipts WHERE device_id=${auth.deviceId} AND client_sale_id::text IN (${Prisma.join(input.pendingSaleIds)})`);acknowledgedSaleIds=rows.map(row=>row.id);}
      return{success:true,transferNumber:transfer.transferNumber,balances,acknowledgedSaleIds};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return NextResponse.json(result);
  }catch(error){if(error instanceof ReceiptError)return NextResponse.json({error:error.message},{status:error.status});console.error('NCT transfer receipt failed',error);return NextResponse.json({error:'Transfer not acknowledged; retry the same receipt'},{status:503});}
}
