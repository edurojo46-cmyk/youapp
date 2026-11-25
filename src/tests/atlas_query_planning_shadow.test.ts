import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import https from 'node:https';import net from 'node:net';import cp from 'node:child_process';
import {QueryIntentClassifier} from '../lib/atlasQueryFabric/QueryIntentClassifier.ts';
import {StructuredQueryPlanner} from '../lib/atlasQueryFabric/StructuredQueryPlanner.ts';
import {buildQueryPlanShadow} from '../lib/atlasGeneralGovernance/QueryPlanningShadowAdapter.ts';
const owner='11111111-1111-4111-8111-111111111111';
const input=(query='Qué sabemos sobre Empresa de Ejemplo')=>({missionId:'isolated-query-example',ownerId:owner,query});

test('existing Query Fabric functions are used and their plan is returned without retrieval',()=>{
 const classify=QueryIntentClassifier.classify,plan=StructuredQueryPlanner.plan;let classifications=0,plans=0;
 QueryIntentClassifier.classify=(...args)=>{classifications++;return classify.apply(QueryIntentClassifier,args);};
 StructuredQueryPlanner.plan=(...args)=>{plans++;return plan.apply(StructuredQueryPlanner,args);};
 try{const r=buildQueryPlanShadow(input());assert.equal(classifications,1);assert.equal(plans,1);
 assert.equal(r.queryPlan.tenant_id,owner);assert.equal(r.queryPlan.original_query,input().query);
 assert.deepEqual(r.governancePlan.proposedEngines,['query_fabric']);assert.equal(r.status,'SHADOW_QUERY_PLAN_READY');
 }finally{QueryIntentClassifier.classify=classify;StructuredQueryPlanner.plan=plan;}
});
test('safe defaults restrict traversal and do not treat hypotheses as verified facts',()=>{
 const r=buildQueryPlanShadow(input());assert.equal(r.queryPlan.max_hops,1);
 assert.equal(r.queryPlan.include_inferences,false);assert.equal(r.queryPlan.include_claims,false);
 assert.equal(r.retrievalAuthorized,false);assert.equal(r.executionEnabled,false);
 assert.equal(r.identityVerification,'NOT_PERFORMED');assert.deepEqual(r.resultRecords,[]);
 assert.deepEqual(r.verifiedFacts,[]);assert.equal(r.observationsCreated,false);
 assert.ok(Number.isFinite(r.planningDurationMs)&&r.planningDurationMs>=0);
});
test('complex plans remain blocked by the local probe even when the legacy cost flag allows them',()=>{
 const plan=StructuredQueryPlanner.plan;
 StructuredQueryPlanner.plan=(...args)=>({...plan.apply(StructuredQueryPlanner,args),cost_estimate:{estimated_nodes:51,estimated_queries:3,allowed:true}});
 try{const r=buildQueryPlanShadow(input());assert.equal(r.status,'SHADOW_QUERY_PLAN_BLOCKED');assert.equal(r.retrievalAuthorized,false);}
 finally{StructuredQueryPlanner.plan=plan;}
});
test('invalid ownership, excessive query length and traversal limits fail before planning',()=>{
 for(const value of [{...input(),ownerId:''},{...input(),ownerId:'not-a-uuid'},input('x'.repeat(501)),{...input(),maxHops:3},{...input(),maxHops:0},{...input(),maxHops:1.5}])
 assert.throws(()=>buildQueryPlanShadow(value));
});
test('execution injection and callbacks are not accepted as query options',()=>{
 assert.throws(()=>buildQueryPlanShadow({...input(),execute:true} as any),/UNSUPPORTED/);
 assert.throws(()=>buildQueryPlanShadow({...input(),adapter:()=>{}} as any),/UNSUPPORTED/);
 let calls=0;const value={...input()};Object.defineProperty(value,'query',{get(){calls++;return 'x';}});
 assert.throws(()=>buildQueryPlanShadow(value),/UNSUPPORTED/);assert.equal(calls,0);
});
test('owner mismatch in an unexpected legacy planner response blocks the proposal',()=>{
 const plan=StructuredQueryPlanner.plan;
 StructuredQueryPlanner.plan=(...args)=>({...plan.apply(StructuredQueryPlanner,args),tenant_id:'22222222-2222-4222-8222-222222222222'});
 try{assert.equal(buildQueryPlanShadow(input()).status,'SHADOW_QUERY_PLAN_BLOCKED');}
 finally{StructuredQueryPlanner.plan=plan;}
});
test('output cannot be modified into an executable or approved plan',()=>{
 const r=buildQueryPlanShadow(input());assert.throws(()=>{(r as any).retrievalAuthorized=true;},TypeError);
 assert.throws(()=>{(r.queryPlan as any).tenant_id='another';},TypeError);
});
test('local planning under I/O guards makes no network, subprocess or filesystem writes',()=>{
 const counters={network:0,subprocess:0,filesystemWrites:0},restores:Array<()=>void>=[];
 function guard(obj:any,key:string,kind:keyof typeof counters){const old=obj[key];obj[key]=()=>{counters[kind]++;throw Error('FORBIDDEN_IO');};restores.push(()=>obj[key]=old);}
 try{
  guard(globalThis,'fetch','network');for(const api of [http,https])for(const key of ['get','request'])guard(api,key,'network');guard(net.Socket.prototype,'connect','network');
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])guard(cp,key,'subprocess');
  for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','unlink','unlinkSync','mkdir','mkdirSync','rm','rmSync','createWriteStream','write','writeSync'])guard(fs,key,'filesystemWrites');
  for(const key of ['writeFile','appendFile','rename','unlink','mkdir','rm'])guard(fs.promises,key,'filesystemWrites');
  const r=buildQueryPlanShadow(input());assert.deepEqual(counters,{network:0,subprocess:0,filesystemWrites:0});
  assert.equal(r.resultRecords.length,0);console.log('QUERY_PLANNING_IO_PROBE='+JSON.stringify({...counters,retrievalCalls:0,verifiedFacts:0}));
 }finally{for(const restore of restores.reverse())restore();}
});
