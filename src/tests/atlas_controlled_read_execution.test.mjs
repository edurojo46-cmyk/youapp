import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import net from 'node:net';import http from 'node:http';import https from 'node:https';
import {createControlledReadExecution} from '../lib/atlasGeneralGovernance/ControlledReadExecutionAdapter.mjs';
const url='https://jtnurafmngaxdwlzpvxv.supabase.co',owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const mission=()=>({missionId:'controlled-read-test',ownerId:owner,requests:[{id:'read',capability:'knowledge.query.retrieve'}]});
const approval=()=>({approved:true,missionId:'controlled-read-test',taskId:'read',ownerId:owner,tenantId:owner,scope:'CANONICAL_ENTITIES_ONLY',expiresAt:Date.now()+10000});
function fixture({user={id:owner,is_anonymous:false,app_metadata:{}},rows=[],decision=true,authStatus=200,slow=false}={}){
 const calls=[],decisions=[];
 const executor=createControlledReadExecution({url,publishableKey:'sb_publishable_TEST_ONLY',
  authorize:async d=>{decisions.push(d);return decision;},
  fetchImpl:async(raw,init)=>{
   calls.push({path:new URL(raw).pathname,method:init.method,query:new URL(raw).searchParams,signal:init.signal});
   if(slow)return new Promise(()=>{});
   return new Response(JSON.stringify(new URL(raw).pathname==='/auth/v1/user'?user:rows),
    {status:new URL(raw).pathname==='/auth/v1/user'?authStatus:200,headers:{'Content-Type':'application/json'}});
  }});
 return{executor,calls,decisions,run:(overrides={})=>executor.execute({mission:mission(),approval:approval(),accessToken:'TEST_ONLY_NOT_A_SESSION',...overrides})};
}
test('single canonical delegation requires verified identity and trusted explicit authorization; receipt is redacted',async()=>{
 const f=fixture({rows:[{canonical_entity_id:'33333333-3333-4333-8333-333333333333',tenant_id:owner,canonical_name:'DO_NOT_LOG',entity_type:'PERSON',status:'ACTIVE'}]});
 const r=await f.run();assert.equal(r.rowCount,1);assert.equal(r.authorizationVerified,true);assert.equal(r.identityVerified,true);
 assert.equal(r.plannerExecutionEnabled,false);assert.equal(r.otherCapabilitiesEnabled,false);
 assert.deepEqual(f.calls.map(c=>c.method),['GET','GET']);assert.equal(f.calls[1].query.get('limit'),'5');
 assert.equal(f.calls[1].query.get('tenant_id'),'eq.'+owner);assert.equal(f.decisions.length,1);
 assert.equal(f.decisions[0].userId,owner);assert.ok(Object.isFrozen(f.decisions[0].approval));
 for(const secret of [owner,'TEST_ONLY_NOT_A_SESSION','DO_NOT_LOG'])assert.equal(JSON.stringify(r).includes(secret),false);
 console.log('CONTROLLED_READ_TEST_RECEIPT='+JSON.stringify(r));
 await assert.rejects(f.run(),/ONE_SHOT/);assert.equal(f.calls.length,2);
});
test('missing, false, stale or mismatched explicit approval causes zero transport calls',async()=>{
 for(const patch of [{approved:false},{missionId:'wrong'},{taskId:'wrong'},{ownerId:other},{expiresAt:0},{scope:'OWNED_VIDEO_DRAFT_METADATA_ONLY'}]){
  const f=fixture();await assert.rejects(f.run({approval:{...approval(),...patch}}),/APPROVAL/);assert.equal(f.calls.length,0);
 }
 const f=fixture();await assert.rejects(f.run({approval:null}),/APPROVAL/);assert.equal(f.calls.length,0);
});
test('failed, anonymous or different authenticated identities cannot reach the data table',async()=>{
 for(const options of [{user:{id:owner,is_anonymous:true}},{user:{id:other,is_anonymous:false}},{authStatus:401},
  {user:{id:owner,is_anonymous:false,app_metadata:{tenant_id:other}}}]){
  const f=fixture(options);await assert.rejects(f.run(),/DENIED_OR_FAILED/);assert.equal(f.calls.length,1);assert.equal(f.decisions.length,0);
 }
 const f=fixture({decision:false});await assert.rejects(f.run(),/DENIED_OR_FAILED/);
 assert.equal(f.decisions.length,1);assert.equal(f.calls.length,1);
});
test('all other capacities, multiple tasks, engine overrides, write flags and incompatible limits fail closed',async()=>{
 for(const m of [
  {...mission(),requests:[{id:'publish',capability:'social.publish'}]},
  {...mission(),requests:[{id:'read',capability:'knowledge.query.retrieve'},{id:'x',capability:'people.search'}]},
  {...mission(),requests:[{id:'read',capability:'knowledge.query.retrieve',preferredEngineId:'people'}]},
  {...mission(),constraints:{allowWrites:true}},
  {...mission(),constraints:{maxResultsPerEngine:1}}
 ]){
  const f=fixture();await assert.rejects(f.run({mission:m}));assert.equal(f.calls.length,0);
 }
 assert.throws(()=>createControlledReadExecution({url,publishableKey:'sb_secret_TEST',fetchImpl:async()=>{},authorize:async()=>true}),/PUBLIC_YOUAPP/);
 assert.throws(()=>createControlledReadExecution({url,publishableKey:'sb_publishable_TEST_ONLY'}),/TRUSTED_TRANSPORT/);
});
test('inherited pilot row isolation and adapter total deadline remain active',async()=>{
 const f=fixture({rows:[{canonical_entity_id:'33333333-3333-4333-8333-333333333333',tenant_id:other,status:'ACTIVE'}]});
 await assert.rejects(f.run(),/DENIED_OR_FAILED/);
 const g=fixture({slow:true});const keepAlive=setTimeout(()=>{},200);
 try{await assert.rejects(g.run({mission:{...mission(),constraints:{missionDeadlineMs:20}}}),/DENIED_OR_FAILED/);}
 finally{clearTimeout(keepAlive);}
 assert.equal(g.calls.length,1);
});
test('simulated execution performs zero real network calls or filesystem writes',async()=>{
 const restores=[],counts={network:0,writes:0};
 function guard(obj,key,kind){const old=obj[key];obj[key]=()=>{counts[kind]++;throw Error('FORBIDDEN');};restores.push(()=>obj[key]=old);}
 try{
  guard(globalThis,'fetch','network');guard(net.Socket.prototype,'connect','network');
  for(const api of [http,https])for(const key of ['get','request'])guard(api,key,'network');
  for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','unlink','unlinkSync','mkdir','mkdirSync','rm','rmSync','write','writeSync','createWriteStream'])guard(fs,key,'writes');
  for(const key of ['writeFile','appendFile','rename','unlink','mkdir','rm'])guard(fs.promises,key,'writes');
  const f=fixture();await f.run();assert.deepEqual(counts,{network:0,writes:0});
  console.log('CONTROLLED_READ_EFFECTS='+JSON.stringify(counts));
 }finally{for(const restore of restores.reverse())restore();}
});
