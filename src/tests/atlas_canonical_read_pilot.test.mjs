import test from 'node:test';import assert from 'node:assert/strict';
import {createCanonicalReadPilot} from '../lib/atlasGeneralGovernance/CanonicalReadPilot.mjs';
const url='https://jtnurafmngaxdwlzpvxv.supabase.co',key='sb_publishable_TEST_ONLY',owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',entity='33333333-3333-4333-8333-333333333333';
function fixture({user={id:owner,is_anonymous:false,app_metadata:{}},rows=[{canonical_entity_id:entity,tenant_id:owner,canonical_name:'Entidad de prueba',entity_type:'COMPANY',status:'ACTIVE'}],authError=false}={}){
 const calls=[];const pilot=createCanonicalReadPilot({url,publishableKey:key,fetchImpl:async(raw,init)=>{const u=new URL(raw);calls.push({url:u,method:init.method,authorization:new Headers(init.headers).get('Authorization'),signal:init.signal});const auth=u.pathname==='/auth/v1/user';return new Response(JSON.stringify(auth?(authError?{message:'invalid JWT'}:user):rows),{status:auth&&authError?401:200,headers:{'Content-Type':'application/json'}});}});
 return{pilot,calls};
}
test('actual SDK path verifies the session then performs one scoped GET of at most five rows',async()=>{
 const f=fixture(),r=await f.pilot.read('TEST_USER_TOKEN');
 assert.equal(r.identityVerified,true);assert.equal(r.rows.length,1);assert.deepEqual(r.verifiedFacts,[]);
 assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.method==='GET'&&c.signal instanceof AbortSignal));
 assert.ok(f.calls.every(c=>c.authorization==='Bearer TEST_USER_TOKEN'));
 const q=f.calls[1].url;assert.equal(q.searchParams.get('limit'),'5');assert.equal(q.searchParams.get('tenant_id'),'eq.'+owner);
 assert.equal(q.searchParams.get('select').includes('metadata'),false);assert.equal('tenant_id' in r.rows[0],false);
 assert.equal('execute' in f.pilot,false);
});
test('anonymous or invalid sessions cannot query knowledge',async()=>{
 for(const options of [{user:{id:owner,is_anonymous:true,app_metadata:{}}},{authError:true}]){
  const f=fixture(options);await assert.rejects(f.pilot.read('TEST_USER_TOKEN'),/REGISTERED_SESSION/);
  assert.equal(f.calls.length,1);
 }
});
test('tenant is taken only from the verified Auth response and not user_metadata',async()=>{
 const f=fixture({user:{id:owner,is_anonymous:false,app_metadata:{},user_metadata:{tenant_id:other}}});
 await f.pilot.read('TEST_USER_TOKEN');assert.equal(f.calls[1].url.searchParams.get('tenant_id'),'eq.'+owner);
 const g=fixture({user:{id:owner,is_anonymous:false,app_metadata:{tenant_id:other}},rows:[]});
 await g.pilot.read('TEST_USER_TOKEN');assert.equal(g.calls[1].url.searchParams.get('tenant_id'),'eq.'+other);
});
test('wrong project and privileged API keys cannot configure this pilot',()=>{
 assert.throws(()=>createCanonicalReadPilot({url:'https://another.supabase.co',publishableKey:key}),/PUBLIC_YOUAPP/);
 assert.throws(()=>createCanonicalReadPilot({url,publishableKey:'sb_secret_TEST_ONLY'}),/PUBLIC_YOUAPP/);
 const privileged='header.'+btoa(JSON.stringify({role:'service_role'}))+'.signature';
 assert.throws(()=>createCanonicalReadPilot({url,publishableKey:privileged}),/PUBLIC_YOUAPP/);
});
test('cross-tenant rows and oversized result sets are rejected entirely',async()=>{
 const wrong={canonical_entity_id:entity,tenant_id:other,status:'ACTIVE'};
 await assert.rejects(fixture({rows:[wrong]}).pilot.read('TEST_USER_TOKEN'),/BOUNDARY/);
 const row={canonical_entity_id:entity,tenant_id:owner,status:'ACTIVE'};
 await assert.rejects(fixture({rows:Array(6).fill(row)}).pilot.read('TEST_USER_TOKEN'),/BOUNDARY/);
});
test('empty authorized response means no visible records and not proven absence of knowledge',async()=>{
 const r=await fixture({rows:[]}).pilot.read('TEST_USER_TOKEN');
 assert.equal(r.status,'NO_VISIBLE_RECORDS');assert.equal(r.identityVerified,true);assert.equal(r.rows.length,0);
});
test('untrusted markup is returned as data and response projection excludes metadata',async()=>{
 const f=fixture({rows:[{canonical_entity_id:entity,tenant_id:owner,canonical_name:'<script>untrusted</script>',entity_type:'PERSON',status:'ACTIVE',metadata:{private:'NEVER_RETURN'}}]});
 const r=await f.pilot.read('TEST_USER_TOKEN');assert.equal(r.rows[0].name,'<script>untrusted</script>');
 assert.equal(JSON.stringify(r).includes('NEVER_RETURN'),false);
});
