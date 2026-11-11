import {Router} from 'express';import {z} from 'zod';import {auth,roles,fail} from './middleware.js';import {postFinancial} from './posting.js';import {config} from './config.js';import {prisma} from './db.js';
export const financialRouter=Router();financialRouter.use(auth);
// Admins and explicitly provisioned demo operators may choose an active
// customer account as the target of a simulated deposit.
financialRouter.get('/demo-funding/accounts',roles('ADMIN','DEMO_OPERATOR'),async(_req,res)=>{
  const rows=await prisma.account.findMany({
    where:{status:'ACTIVE',currency:'INR'},
    include:{owner:{select:{name:true,email:true}}},
    orderBy:{createdAt:'desc'},
    take:500
  });
  res.json({success:true,data:rows.map(a=>({
    id:a.id,accountNumber:a.accountNumber,accountHolderName:a.owner.name,
    email:a.owner.email,balanceMinor:a.balanceMinor.toString(),currency:a.currency
  }))});
});

const schema=z.object({senderAccountId:z.uuid().optional(),receiverAccountId:z.uuid().optional(),amountMinor:z.string().regex(/^\d+$/),currency:z.literal('INR'),description:z.string().max(250).optional()}).strict();
async function handle(req:any,res:any,operation:'TRANSFER'|'DEPOSIT'|'WITHDRAWAL'){const v=schema.safeParse(req.body);if(!v.success)return fail(res,'VALIDATION_ERROR','Invalid financial request',400,req.correlationId);const key=String(req.headers['idempotency-key']||'');if(key.trim().length<16||key.length>128)return fail(res,'VALIDATION_ERROR','Idempotency-Key must be 16–128 characters',400,req.correlationId);if(operation==='TRANSFER'&&(!v.data.senderAccountId||!v.data.receiverAccountId))return fail(res,'VALIDATION_ERROR','Sender and receiver are required',400,req.correlationId);if(operation==='WITHDRAWAL'&&!v.data.senderAccountId)return fail(res,'VALIDATION_ERROR','Sender account is required',400,req.correlationId);if(operation==='DEPOSIT'&&!v.data.receiverAccountId)return fail(res,'VALIDATION_ERROR','Target account is required',400,req.correlationId);if(operation==='DEPOSIT'){
  if(!['DEMO','TEST'].includes(config.appEnv))return fail(res,'FORBIDDEN','Simulated deposits are disabled outside DEMO/TEST environments',403,req.correlationId);
  const setting=await prisma.systemSetting.findUnique({where:{key:'DEMO_FUNDING_ENABLED'}});
  if(setting?.value!==true)return fail(res,'FORBIDDEN','Demo funding is disabled',403,req.correlationId);
}try{const result=await postFinancial({operation,actor:req.principal!,...v.data,key,correlationId:req.correlationId});return res.status(result.status).json({...(result.response as Record<string,unknown>),idempotentReplay:result.replay,correlationId:req.correlationId});}catch(e:any){return fail(res,e.code||'INTERNAL_ERROR',e.code==='INSUFFICIENT_FUNDS'?'Insufficient funds':e.message||'Request failed',e.status||500,req.correlationId);}}
financialRouter.post('/transfers',roles('CUSTOMER'),(req,res)=>handle(req,res,'TRANSFER'));financialRouter.post('/withdrawals',roles('CUSTOMER'),(req,res)=>handle(req,res,'WITHDRAWAL'));financialRouter.post('/deposits',roles('ADMIN','DEMO_OPERATOR'),(req,res)=>handle(req,res,'DEPOSIT'));
financialRouter.get('/transactions',roles('CUSTOMER'),async(req,res)=>{const accounts=await prisma.account.findMany({where:{ownerUserId:req.principal!.id},select:{id:true}});const ids=accounts.map(a=>a.id);const ledgers=await prisma.ledgerAccount.findMany({where:{accountId:{in:ids}},select:{id:true}});const entries=await prisma.ledgerEntry.findMany({where:{ledgerAccountId:{in:ledgers.map(l=>l.id)}},select:{transactionId:true}});const txs=await prisma.transaction.findMany({where:{id:{in:[...new Set(entries.map(e=>e.transactionId))]}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100});res.json({success:true,data:txs.map(t=>({...t,amountMinor:t.amountMinor.toString()})),pagination:{page:1,limit:100,total:txs.length}});});
financialRouter.get('/transaction-attempts',roles('CUSTOMER'),async(req,res)=>{const rows=await prisma.transactionAttempt.findMany({where:{principalId:req.principal!.id},orderBy:{createdAt:'desc'},take:100});res.json({success:true,data:rows.map(r=>({...r,amountMinor:r.amountMinor?.toString()||null}))});});
