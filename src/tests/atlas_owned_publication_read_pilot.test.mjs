import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnedPublicationReadPilot,createCanonicalReadPilot} from '../lib/atlasGeneralGovernance/CanonicalReadPilot.mjs';
const url='https://jtnurafmngaxdwlzpvxv.supabase.co',owner='11111111-1111-4111-8111-111111111111',tenant='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
function fixture({rows=[{id,owner_id:owner,title:'Mi video',media_bytes:42,created_at:'2026-10-31T00:00:00Z',media_path:'DO_NOT_EXPOSE',approval_nonce:'DO_NOT_EXPOSE'}],anonymous=false}={}){
 const calls=[];const config={url,publishableKey:'sb_publishable_TEST_ONLY',fetchImpl:async(raw,init)=>{const u=new URL(raw);calls.push({url:u,method:init.method});return new Response(JSON.stringify(u.pathname==='/auth/v1/user'?{id:owner,is_anonymous:anonymous,app_metadata:{tenant_id:tenant}}:rows),{status:200,headers:{'Content-Type':'application/json'}});}};
 return{calls,pilot:createOwnedPublicationReadPilot(config),canonical:createCanonicalReadPilot(config)};
}
test('owned video source filters verified user ID, independently of organization tenant',async()=>{
 const f=fixture(),r=await f.pilot.read('TEST_TOKEN');assert.equal(f.calls.length,2);
 const q=f.calls[1].url;assert.equal(q.pathname,'/rest/v1/youapp_social_publishing_posts');
 assert.equal(q.searchParams.get('owner_id'),'eq.'+owner);assert.equal(q.searchParams.has('tenant_id'),false);
 assert.equal(q.searchParams.get('limit'),'5');assert.equal(q.searchParams.get('order'),'created_at.desc');
 assert.ok(f.calls.every(c=>c.method==='GET'));assert.equal(r.source,'owned_publication_drafts');
 assert.equal(r.rows[0].name,'Mi video');assert.equal(r.rows[0].status,'SAVED_METADATA');
});
test('private file paths, approvals and publication claims are not exposed or invented',async()=>{
 const r=await fixture().pilot.read('TEST_TOKEN');assert.equal(JSON.stringify(r).includes('DO_NOT_EXPOSE'),false);
 assert.deepEqual(r.verifiedFacts,[]);assert.equal(r.rows[0].mediaBytes,42);
 const f=fixture({rows:[{id,owner_id:owner,title:'Borrador',media_bytes:null}]});
 assert.equal((await f.pilot.read('TEST_TOKEN')).rows[0].mediaBytes,null);
});
test('other-owner records and excessive responses block instead of bypassing isolation',async()=>{
 await assert.rejects(fixture({rows:[{id,owner_id:tenant,title:'Otro'}]}).pilot.read('TEST_TOKEN'),/BOUNDARY/);
 await assert.rejects(fixture({rows:Array(6).fill({id,owner_id:owner})}).pilot.read('TEST_TOKEN'),/BOUNDARY/);
});
test('anonymous sessions cannot read saved video metadata',async()=>{
 const f=fixture({anonymous:true});await assert.rejects(f.pilot.read('TEST_TOKEN'),/REGISTERED_SESSION/);
 assert.equal(f.calls.length,1);
});
test('empty owned source remains empty without silently falling back to the canonical graph',async()=>{
 const f=fixture({rows:[]}),r=await f.pilot.read('TEST_TOKEN');assert.equal(r.status,'NO_VISIBLE_RECORDS');
 assert.equal(f.calls.length,2);assert.equal(r.source,'owned_publication_drafts');
 assert.ok(f.calls.every(c=>c.url.pathname!=='/rest/v1/atlas_canonical_entities'));
});
