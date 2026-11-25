import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import crypto from 'node:crypto';
import {createCanonicalReadAuthority} from '../lib/atlasGeneralGovernance/CanonicalReadAuthority.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const url='https://jtnurafmngaxdwlzpvxv.supabase.co';
const mission=(user=owner,capability='knowledge.query.retrieve')=>({missionId:'authority-test',ownerId:user,requests:[{id:'read',capability}]});
const approval=()=>({approved:true,ownerId:owner,tenantId:owner,missionId:'authority-test',taskId:'read',scope:'CANONICAL_ENTITIES_ONLY',expiresAt:Date.now()+10000});
// Test-only transactional model. It does NOT execute or certify the PostgreSQL draft.
function fixture(){
 const records=new Map(),calls=[],state={user:owner,tenant:owner,deny:false},effects={realNetwork:0};
 const oldFetch=globalThis.fetch;
 const fetchImpl=async(raw,init)=>{
  const path=new URL(raw).pathname;calls.push(path);
  const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(path==='/auth/v1/user')return json({id:state.user,is_anonymous:false,app_metadata:{tenant_id:state.tenant}});
  if(path==='/rest/v1/atlas_canonical_entities')return json([]);
  const p=JSON.parse(init.body),key=[state.user,state.tenant,p.p_mission_id,p.p_task_id].join('|');
  if(path.endsWith('/atlas_issue_canonical_read_v1')){
   // Mirrors the draft ACL: authenticated callers cannot issue grants.
   return new Response(JSON.stringify({code:'42501',message:'permission denied'}),
    {status:403,headers:{'Content-Type':'application/json'}});
  }
  if(path.endsWith('/atlas_consume_canonical_read_v1')){
   // Yield BEFORE CAS: independently constructed executors race for one shared record.
   await Promise.resolve();const a=records.get(key);
   const pass=!state.deny&&a&&!a.used&&p.p_user_id===state.user&&p.p_tenant_id===state.tenant&&
    p.p_expires_at_ms===a.expiresAt&&a.expiresAt>Date.now()&&p.p_capability==='knowledge.query.retrieve'&&p.p_scope==='CANONICAL_ENTITIES_ONLY';
   if(pass)a.used=true;return json(Boolean(pass));
  }
  throw Error('UNEXPECTED_TRANSPORT');
 };
 const authority=createCanonicalReadAuthority({url,publishableKey:'sb_publishable_TEST_ONLY',accessToken:'TEST_ONLY',fetchImpl});
 const run=(a,m=mission())=>authority.createExecutor().execute({mission:m,approval:a,accessToken:'TEST_ONLY'});
 // Existing-grant fixtures exercise consumption only; they are not an issuer or admin.
 const seedApproval=()=>{const a=approval();records.set([owner,owner,a.missionId,a.taskId].join('|'),{...a,used:false});return a;};
 return{authority,run,state,calls,effects,seedApproval};
}
test('valid: preexisting test-fixture grant permits one bounded canonical pilot and leaves protected modules unchanged',async()=>{
 const f=fixture(),a=f.seedApproval(),r=await f.run(a);
 assert.equal(r.authorizationVerified,true);assert.equal(r.identityVerified,true);assert.equal(r.maxRows,5);assert.equal(r.requests,2);
 assert.equal(r.otherCapabilitiesEnabled,false);assert.equal(r.productionIntegration,false);
 assert.equal(f.calls.filter(p=>p==='/rest/v1/atlas_canonical_entities').length,1);
 assert.equal(f.calls.filter(p=>p.includes('/rpc/')).length,1); // consume only, no issuer available
 for(const [p,expected] of Object.entries({
  'ControlledReadExecutionAdapter.mjs':'2e872553276217c7bf6b74f328d4e0df20c55a4733c3cbc7c494e3515356660a',
  'CanonicalReadPilot.mjs':'3d416ccded5158c9524ad9768e4259b12f3883fd47797423db75e7884fdf032e',
  'DynamicAgentPlanner.mjs':'9b6bee194b1f73918a8c18cbbc34d9323e0efcdad24edf052995d99d83f939c1'})){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../lib/atlasGeneralGovernance/'+p,import.meta.url))).digest('hex'),expected);
 }
 console.log('AUTHORITY_RESULT='+JSON.stringify({transport:'SIMULATED',canonicalReads:1,pilotRequests:2,extraAuthorityRPCs:1,productionEnabled:false,sqlApplied:false}));
});
test('denied: authority refusal cannot reach canonical data',async()=>{
 const f=fixture(),a=f.seedApproval();f.state.deny=true;
 await assert.rejects(f.run(a));assert.equal(f.calls.includes('/rest/v1/atlas_canonical_entities'),false);
});
test('expired: stale approval is rejected before Auth or consume transport',async()=>{
 const f=fixture(),a=f.seedApproval(),n=f.calls.length;
 await assert.rejects(f.run({...a,expiresAt:Date.now()-1}));assert.equal(f.calls.length,n);
});
test('different user: modified owner cannot consume an approval issued to another authenticated user',async()=>{
 const f=fixture(),a=f.seedApproval();f.state.user=other;f.state.tenant=owner;
 await assert.rejects(f.run({...a,ownerId:other},mission(other)));assert.equal(f.calls.includes('/rest/v1/atlas_canonical_entities'),false);
});
test('different tenant: altered tenant binding cannot consume the original grant',async()=>{
 const f=fixture(),a=f.seedApproval();f.state.tenant=other;
 await assert.rejects(f.run({...a,tenantId:other}));assert.equal(f.calls.includes('/rest/v1/atlas_canonical_entities'),false);
});
test('reuse: a new executor cannot replay or reissue the consumed tuple',async()=>{
 const f=fixture(),a=f.seedApproval();await f.run(a);
 await assert.rejects(f.run(a));await assert.rejects(f.authority.issueApproval(a));
 assert.equal(f.calls.filter(p=>p==='/rest/v1/atlas_canonical_entities').length,1);
});
test('concurrency: independent executors sharing the simulated CAS produce exactly one read',async()=>{
 const f=fixture(),a=f.seedApproval();
 const results=await Promise.allSettled(Array.from({length:8},()=>f.run(a)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(f.calls.filter(p=>p==='/rest/v1/atlas_canonical_entities').length,1);
});
test('different capability: publication is rejected before any authority or pilot request',async()=>{
 const f=fixture(),a=f.seedApproval(),n=f.calls.length;
 await assert.rejects(f.run(a,mission(owner,'social.publish')));assert.equal(f.calls.length,n);
});
test('security: authenticated client p_approved=true cannot issue without independent authority',async()=>{
 const sql=fs.readFileSync(new URL('../../supabase/atlas_canonical_read_authority_v1.DRAFT.sql',import.meta.url),'utf8');
 const issuer=sql.match(/CREATE FUNCTION public\.atlas_issue_canonical_read_v1[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
 assert.ok(issuer,'issuer definition required');
 const executable=issuer.replace(/--[^\n]*/g,'').replace(/\s+/g,'');
 assert.equal(executable,'BEGINRETURNNULL;END;');
 assert.doesNotMatch(executable,/INSERT|UPDATE|EXECUTE|jsonb_build_object/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.atlas_issue_canonical_read_v1\(uuid,text,text,bigint,text,text,boolean\) FROM PUBLIC,anon,authenticated,service_role;/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.atlas_issue_canonical_read_v1/);
 const f=fixture();
 await assert.rejects(f.authority.issueApproval(approval()),/AUTHORITY_ISSUANCE_DENIED/);
 assert.deepEqual(f.calls,['/rest/v1/rpc/atlas_issue_canonical_read_v1']);
 console.log('SECURITY_FIX_RESULT='+JSON.stringify({authenticatedSelfApproval:'DENIED',trustedIssuer:'ABSENT_BLOCKED',canonicalReads:0,sqlApplied:false}));
});
