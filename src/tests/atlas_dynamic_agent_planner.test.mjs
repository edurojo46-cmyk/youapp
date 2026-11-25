import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import https from 'node:https';
import net from 'node:net';import cp from 'node:child_process';
import {planDynamicAgents} from '../lib/atlasGeneralGovernance/DynamicAgentPlanner.mjs';
const mission={missionId:'three-agent-isolated-test',ownerId:'TEST_OWNER_NOT_AUTHENTICATED',requests:[
 {id:'reconcile',capability:'results.federation',dependsOn:['people','industrial']},
 {id:'people',capability:'people.search'},
 {id:'industrial',capability:'industrial.search'}
]};
test('three agents are proposed with two independent tasks and dependent reconciliation',()=>{
 const p=planDynamicAgents(mission,{maxAgents:3,maxConcurrentAgents:2});
 assert.equal(p.agentCount,3);
 assert.deepEqual(p.agents.map(a=>a.proposedEngineId),['people','industrial','cross_engine']);
 assert.deepEqual(p.stages.map(s=>s.agentIds),[['agent:people','agent:industrial'],['agent:reconcile']]);
 assert.deepEqual(p.agents[2].dependsOn,['agent:people','agent:industrial']);
 assert.equal(p.mode,'DYNAMIC_AGENT_PLAN_ONLY');assert.equal(p.authorization,'NOT_GRANTED');
 assert.ok(p.agents.every(a=>!a.executionAuthorized&&a.kind==='TASK_PROPOSAL_NOT_RUNNING_PROCESS'));
});
test('agent count follows the mission instead of a fixed three-agent setup',()=>{
 const p=planDynamicAgents({missionId:'single',ownerId:'TEST',requests:[{id:'video',capability:'video.search'}]});
 assert.equal(p.agentCount,1);assert.equal(p.agents[0].proposedEngineId,'video_search');
});
test('proposed concurrency respects the cap and serializes repeated specialized engines',()=>{
 assert.equal(planDynamicAgents(mission,{maxAgents:3,maxConcurrentAgents:1}).stages.length,3);
 const p=planDynamicAgents({missionId:'same-engine',ownerId:'TEST',requests:[
  {id:'first',capability:'people.search'},{id:'second',capability:'people.search'}]});
 assert.deepEqual(p.stages.map(s=>s.agentIds),[['agent:first'],['agent:second']]);
});
test('unavailable capability blocks scheduling and never substitutes an unrelated engine',()=>{
 const p=planDynamicAgents({missionId:'gap',ownerId:'TEST',requests:[{id:'unknown',capability:'unsupported.task'}]});
 assert.equal(p.status,'BLOCKED_UNRESOLVED_CAPABILITIES');assert.equal(p.agents[0].proposedEngineId,null);
 assert.deepEqual(p.stages,[]);assert.equal(p.executionEnabled,false);
});
test('existing governor rejects cycles and execution injection; agent budgets fail closed',()=>{
 assert.throws(()=>planDynamicAgents({...mission,execute:true}),/UNSUPPORTED_PLAN_FIELD/);
 assert.throws(()=>planDynamicAgents({...mission,requests:[{id:'x',capability:'people.search',dependsOn:['x']}]}),/CYCLIC_PLAN/);
 assert.throws(()=>planDynamicAgents(mission,{maxAgents:2,maxConcurrentAgents:2}),/AGENT_BUDGET/);
 assert.throws(()=>planDynamicAgents(mission,{maxAgents:3,maxConcurrentAgents:4}),/INVALID_AGENT_LIMITS/);
 assert.throws(()=>planDynamicAgents({...mission,constraints:{allowExternalCalls:true}}),/NOT_AUTHORIZED/);
 let getterCalls=0;const options={};Object.defineProperty(options,'maxAgents',{get(){getterCalls++;return 3;}});
 assert.throws(()=>planDynamicAgents(mission,options),/INVALID_AGENT_LIMITS/);assert.equal(getterCalls,0);
});
test('planning is deterministic, immutable and does not invent authentication or measurements',()=>{
 const before=JSON.stringify(mission),p=planDynamicAgents(mission);
 assert.equal(JSON.stringify(mission),before);assert.equal(JSON.stringify(p),JSON.stringify(planDynamicAgents(mission)));
 assert.equal(p.identityVerification,'NOT_PERFORMED');
 assert.ok(p.agents.every(a=>a.measuredLatencyMs===null&&a.estimatedCostUsd===null&&a.measuredQuality===null));
 assert.throws(()=>{p.agents[0].executionAuthorized=true;},TypeError);
 assert.throws(()=>{p.stages[0].agentIds.push('injected');},TypeError);
});
test('fresh import and three-agent planning perform no network, subprocess or filesystem writes',async()=>{
 const counts={network:0,subprocess:0,filesystemWrites:0},restores=[];
 function guard(obj,key,kind){const old=obj[key];obj[key]=()=>{counts[kind]++;throw Error('FORBIDDEN_SIDE_EFFECT');};restores.push(()=>obj[key]=old);}
 try{
  guard(globalThis,'fetch','network');for(const api of [http,https])for(const key of ['get','request'])guard(api,key,'network');
  guard(net.Socket.prototype,'connect','network');
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])guard(cp,key,'subprocess');
  for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','unlink','unlinkSync','mkdir','mkdirSync','rm','rmSync','createWriteStream','write','writeSync'])guard(fs,key,'filesystemWrites');
  for(const key of ['writeFile','appendFile','rename','unlink','mkdir','rm'])guard(fs.promises,key,'filesystemWrites');
  const fresh=await import('../lib/atlasGeneralGovernance/DynamicAgentPlanner.mjs?isolated-probe');
  const p=fresh.planDynamicAgents(mission,{maxAgents:3,maxConcurrentAgents:2});
  assert.equal(p.agentCount,3);assert.deepEqual(counts,{network:0,subprocess:0,filesystemWrites:0});
  assert.equal('execute' in fresh,false);assert.equal('spawn' in fresh,false);
  console.log('DYNAMIC_AGENT_EFFECT_PROBE='+JSON.stringify({...counts,engineBindings:0,databaseClients:0,runningAgents:0}));
 }finally{for(const restore of restores.reverse())restore();}
 const source=fs.readFileSync(new URL('../lib/atlasGeneralGovernance/DynamicAgentPlanner.mjs',import.meta.url),'utf8');
 const imports=[...source.matchAll(/^import .* from '([^']+)'/gm)].map(m=>m[1]).sort();
 assert.deepEqual(imports,['./EngineCapabilityRegistry.mjs','./PlanOnlyGovernor.mjs']);
 assert.equal(/\b(?:require|eval|setInterval|setTimeout)\s*\(/.test(source),false);
});
