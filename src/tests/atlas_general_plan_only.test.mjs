import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import https from 'node:https';
import net from 'node:net';import cp from 'node:child_process';
import {createPlan,GOVERNOR_CONTRACT} from '../lib/atlasGeneralGovernance/PlanOnlyGovernor.mjs';
const mission=requests=>({missionId:'test-mission',ownerId:'test-owner',requests});

test('single capability proposes the specialized engine without a mandatory general chain',()=>{
 const p=createPlan(mission([{id:'find-video',capability:'video.search'}]));
 assert.deepEqual(p.proposedEngines,['video_search']);assert.equal(p.steps.length,1);
 assert.equal(p.steps[0].selectionReason,'ONLY_CATALOG_CAPABILITY_MATCH');
 assert.equal(p.mode,'PLAN_ONLY');assert.equal(p.executionEnabled,false);
});
test('explicit cross-engine dependencies retain specialized engines and are topologically ordered',()=>{
 const p=createPlan(mission([{id:'combine',capability:'results.federation',dependsOn:['people','industry']},
  {id:'people',capability:'people.search'},{id:'industry',capability:'industrial.search'}]));
 assert.deepEqual(p.steps.map(s=>s.id),['people','industry','combine']);
 assert.deepEqual(p.proposedEngines,['people','industrial','cross_engine']);
 assert.ok(p.steps.every(s=>s.executionAuthorized===false));
});
test('no measurement, identity verification or cost authorization is invented',()=>{
 const p=createPlan(mission([{id:'find',capability:'people.search'}]));
 assert.equal(p.identityVerification,'NOT_PERFORMED');assert.equal(p.authorization,'NOT_GRANTED');
 assert.equal(p.steps[0].measuredLatencyMs,null);assert.equal(p.steps[0].measuredQuality,null);
 assert.equal(p.steps[0].estimatedCostUsd,null);assert.equal(p.runtimeLimitsEnforced,false);
 assert.ok(p.blockers.includes('COST_EFFECTS_AND_PROVIDER_QUOTAS_NOT_VERIFIED'));
});
test('unknown capability stays unresolved and cannot silently invoke all engines',()=>{
 const p=createPlan(mission([{id:'unknown',capability:'unsupported.automatic.action'}]));
 assert.equal(p.steps[0].proposalStatus,'CAPABILITY_GAP');assert.deepEqual(p.proposedEngines,[]);
 assert.ok(p.blockers.includes('UNRESOLVED_CAPABILITIES'));
});
test('requested engine preference must match capability and still grants no permission',()=>{
 const input=mission([{id:'find',capability:'people.search',preferredEngineId:'people'}]);
 const p=createPlan(input);assert.equal(p.steps[0].proposedEngineId,'people');
 assert.equal(p.steps[0].executionAuthorized,false);
 assert.throws(()=>createPlan(mission([{id:'find',capability:'people.search',preferredEngineId:'social_publisher'}])),/MISMATCH/);
 assert.throws(()=>createPlan({...input,execute:true}),/UNSUPPORTED_PLAN_FIELD/);
});
test('paid calls, external execution, writes, callbacks and accessors are rejected',()=>{
 const m=mission([{id:'find',capability:'people.search'}]);
 for(const constraints of [{externalCostLimitUsd:1},{allowExternalCalls:true},{allowWrites:true}])
  assert.throws(()=>createPlan({...m,constraints}),/NOT_AUTHORIZED/);
 assert.throws(()=>createPlan({...m,adapter:()=>{throw Error('NEVER_CALL');}}),/PLAIN_DATA/);
 let getterCalls=0;const input={...m};Object.defineProperty(input,'execute',{enumerable:true,get(){getterCalls++;return true;}});
 assert.throws(()=>createPlan(input),/PLAIN_DATA/);assert.equal(getterCalls,0);
});
test('invalid dependencies, cycles, duplicate steps and invalid limits fail closed',()=>{
 const one={id:'one',capability:'people.search'};
 assert.throws(()=>createPlan(mission([one,one])),/DUPLICATE_PLAN_STEP/);
 assert.throws(()=>createPlan(mission([{...one,dependsOn:['missing']}])),/UNKNOWN_PLAN_DEPENDENCY/);
 assert.throws(()=>createPlan(mission([{...one,dependsOn:['one']}])),/CYCLIC_PLAN/);
 assert.throws(()=>createPlan({...mission([one]),constraints:{missionDeadlineMs:Infinity}}),/PLAIN_DATA/);
 assert.throws(()=>createPlan({...mission([one]),constraints:{maxResultsPerEngine:101}}),/INVALID_PLAN_LIMIT/);
 assert.throws(()=>createPlan({...mission([one,{id:'video',capability:'video.search'}]),constraints:{maxEngines:1}}),/ENGINE_LIMIT/);
});
test('proposal is deterministic and immutable without changing caller input',()=>{
 const m=mission([{id:'find',capability:'people.search'}]),before=JSON.stringify(m);
 const p=createPlan(m);assert.equal(JSON.stringify(p),JSON.stringify(createPlan(m)));
 assert.equal(JSON.stringify(m),before);
 assert.throws(()=>{p.steps[0].executionAuthorized=true;},TypeError);
 assert.throws(()=>{p.constraints.allowWrites=true;},TypeError);
 assert.equal(GOVERNOR_CONTRACT.productionIntegration,false);
});
test('fresh governor import and planning cause zero network, processes, writes or engine bindings',async()=>{
 const count={network:0,process:0,filesystemWrites:0},restores=[];
 function guard(obj,key,kind){const old=obj[key];obj[key]=()=>{count[kind]++;throw Error('FORBIDDEN_SIDE_EFFECT');};restores.push(()=>obj[key]=old);}
 try{
  guard(globalThis,'fetch','network');for(const api of [http,https])for(const key of ['get','request'])guard(api,key,'network');
  guard(net.Socket.prototype,'connect','network');
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])guard(cp,key,'process');
  for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','unlink','unlinkSync','mkdir','mkdirSync','rm','rmSync','createWriteStream','write','writeSync'])guard(fs,key,'filesystemWrites');
  for(const key of ['writeFile','appendFile','rename','unlink','mkdir','rm'])guard(fs.promises,key,'filesystemWrites');
  const fresh=await import('../lib/atlasGeneralGovernance/PlanOnlyGovernor.mjs?isolated-probe');
  for(const capability of ['people.search','industrial.search','social.publish','video.production','knowledge.query.plan'])
   assert.equal(fresh.createPlan(mission([{id:'propose',capability}])).executionEnabled,false);
  assert.deepEqual(count,{network:0,process:0,filesystemWrites:0});
  assert.equal('executePlan' in fresh,false);assert.equal('registerAdapter' in fresh,false);
  console.log('PLAN_ONLY_EFFECT_PROBE='+JSON.stringify({...count,engineBindings:'NONE',engineCalls:0}));
 }finally{for(const restore of restores.reverse())restore();}
});
