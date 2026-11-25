import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as registry from '../lib/atlasGeneralGovernance/EngineCapabilityRegistry.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));

test('initial catalog references existing implementations, preserving separate authorities',()=>{
 const engines=registry.listEngines();
 assert.equal(new Set(engines.map(e=>e.id)).size,engines.length);
 assert.equal(engines.length,15);
 for(const e of engines){
  assert.ok(e.capabilities.length>0);assert.equal(e.executionEnabled,false);
  assert.equal(e.operationalStatus,'UNKNOWN');assert.equal(e.certification.status,'NOT_IMPORTED');
  assert.equal(e.externalCost,'UNKNOWN');assert.equal(e.effects,'UNKNOWN');
  for(const p of e.implementationReferences)assert.equal(fs.existsSync(path.join(root,p)),true,p);
 }
});
test('existing registries are references, with no duplicate source or action definitions',()=>{
 const refs=registry.REGISTRY_CONTRACT.existingRegistryReferences;
 assert.equal(refs.length,4);
 assert.equal(new Set(refs.map(r=>r.scope)).size,4);
 for(const r of refs){assert.equal(fs.existsSync(path.join(root,r.path)),true);assert.equal(r.authority,'EXISTING_REGISTRY');}
 assert.equal('MOTOR_TEMPLATES' in registry,false);assert.equal('getAdapter' in registry,false);
});
test('capability lookup separates social discovery, publishing, planning and retrieval',()=>{
 assert.deepEqual(registry.findCapabilities({capability:'social.publish'}).map(e=>e.id),['social_publisher']);
 assert.deepEqual(registry.findCapabilities({capability:'people.search'}).map(e=>e.id),['people']);
 const q=registry.getEngine('query_fabric');assert.ok(q.capabilities.includes('knowledge.query.plan'));
 assert.ok(q.capabilities.includes('knowledge.query.retrieve'));
 assert.ok(registry.getEngine('general_objective').risks.includes('CURRENT_EXECUTE_MISSION_ALSO_EXECUTES_ADAPTERS'));
 assert.deepEqual(registry.findCapabilities({capability:'unsupported'}),[]);
});
test('all execution decisions fail closed, including unknown engines and capabilities',()=>{
 for(const e of registry.listEngines())for(const capability of e.capabilities){
  const decision=registry.inspectExecutionEligibility(e.id,capability);
  assert.equal(decision.authorized,false);assert.equal(decision.executionEnabled,false);
  assert.equal(decision.knownCapability,true);assert.ok(decision.blockers.includes('SHADOW_CATALOG_ONLY'));
 }
 assert.ok(registry.inspectExecutionEligibility('missing','x').blockers.includes('UNKNOWN_ENGINE'));
 assert.ok(registry.inspectExecutionEligibility('people','social.publish').blockers.includes('UNKNOWN_CAPABILITY'));
 assert.throws(()=>registry.getEngine({}),/INVALID_ENGINE/);
 assert.throws(()=>registry.inspectExecutionEligibility('people',()=>{}),/INVALID_CAPABILITY/);
});
test('callers cannot activate, mutate or certify entries and nested metadata',()=>{
 assert.throws(()=>{registry.getEngine('people').executionEnabled=true;},TypeError);
 assert.throws(()=>{registry.getEngine('people').capabilities.push('social.publish');},TypeError);
 assert.throws(()=>{registry.getEngine('people').certification.status='PASS';},TypeError);
 assert.throws(()=>{registry.listEngines().push({});},TypeError);
 assert.equal(registry.inspectExecutionEligibility('people','people.search').authorized,false);
});
test('fresh import and queries perform zero network, process, database or filesystem writes',async()=>{
 const counters={network:0,process:0,filesystemWrites:0},restores=[];
 function guard(obj,key,kind){const old=obj[key];obj[key]=()=>{counters[kind]++;throw Error('FORBIDDEN_SIDE_EFFECT');};restores.push(()=>obj[key]=old);}
 try{
  guard(globalThis,'fetch','network');guard(http,'request','network');guard(http,'get','network');
  guard(https,'request','network');guard(https,'get','network');guard(net.Socket.prototype,'connect','network');
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])guard(cp,key,'process');
  for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','unlink','unlinkSync','mkdir','mkdirSync','rm','rmSync','createWriteStream','write','writeSync'])guard(fs,key,'filesystemWrites');
  for(const key of ['writeFile','appendFile','rename','unlink','mkdir','rm'])guard(fs.promises,key,'filesystemWrites');
  const fresh=await import('../lib/atlasGeneralGovernance/EngineCapabilityRegistry.mjs?isolated-probe');
  fresh.listEngines();fresh.findCapabilities({domain:'people'});fresh.getEngine('industrial');
  for(const e of fresh.listEngines())for(const c of e.capabilities)fresh.inspectExecutionEligibility(e.id,c);
  assert.deepEqual(counters,{network:0,process:0,filesystemWrites:0});
  assert.equal('execute' in fresh,false);assert.equal('registerAdapter' in fresh,false);
  console.log('SHADOW_EFFECT_PROBE='+JSON.stringify({...counters,engineCalls:0,engineBindings:'NONE'}));
 }finally{for(const restore of restores.reverse())restore();}
 const source=fs.readFileSync(path.join(root,'src/lib/atlasGeneralGovernance/EngineCapabilityRegistry.mjs'),'utf8');
 assert.equal(/^\s*import\s/m.test(source),false);
 assert.equal(/\b(?:require|eval|setInterval|setTimeout)\s*\(/.test(source),false);
});
