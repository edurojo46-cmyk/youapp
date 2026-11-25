/**
 * DRAFT integration: no production route. Uses existing Auth JWT and canonical pilot.
 * Authority state lives in PostgreSQL, never a process-local "used" flag.
 * BLOCKED for activation: issuance/consumption add RPC requests outside the pilot's two GETs.
 */
import {createClient} from '@supabase/supabase-js';
import {createCanonicalReadPilot} from './CanonicalReadPilot.mjs';
import {createControlledReadExecution} from './ControlledReadExecutionAdapter.mjs';
const CAPABILITY='knowledge.query.retrieve',SCOPE='CANONICAL_ENTITIES_ONLY';
const UUID=/^[0-9a-f-]{36}$/i,ID=/^[a-zA-Z0-9_.:-]{1,100}$/;
function valid(a){
 return a?.approved===true&&UUID.test(a.ownerId)&&UUID.test(a.tenantId)&&
  ID.test(a.missionId)&&ID.test(a.taskId)&&a.scope===SCOPE&&
  Number.isSafeInteger(a.expiresAt)&&a.expiresAt>Date.now()&&a.expiresAt<=Date.now()+60000;
}
export function createCanonicalReadAuthority({url,publishableKey,accessToken,fetchImpl}){
 if(typeof fetchImpl!=='function'||typeof accessToken!=='string'||!accessToken||accessToken.length>16000)
  throw Error('REGISTERED_SESSION_AND_TRUSTED_TRANSPORT_REQUIRED');
 createCanonicalReadPilot({url,publishableKey,fetchImpl});
 const rpcFetch=async(raw,init={})=>{
  const target=new URL(typeof raw==='string'?raw:raw.url);
  if(target.origin!==url||!['/rest/v1/rpc/atlas_issue_canonical_read_v1','/rest/v1/rpc/atlas_consume_canonical_read_v1'].includes(target.pathname)||
   init.method!=='POST')throw Error('AUTHORITY_RPC_BOUNDARY');
  return fetchImpl(target.href,{...init,redirect:'error',signal:AbortSignal.timeout(5000)});
 };
 const client=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{headers:{Authorization:'Bearer '+accessToken},fetch:rpcFetch}});
 const args=a=>({p_tenant_id:a.tenantId,p_mission_id:a.missionId,p_task_id:a.taskId,
  p_expires_at_ms:a.expiresAt,p_capability:CAPABILITY,p_scope:SCOPE});
 async function authorize(decision){
  const a=decision?.approval;
  if(!valid(a)||decision.capability!==CAPABILITY||decision.scope!==SCOPE||
   decision.userId!==a.ownerId||decision.tenantId!==a.tenantId||
   decision.missionId!==a.missionId||decision.taskId!==a.taskId)return false;
  try{
   const {data,error}=await client.rpc('atlas_consume_canonical_read_v1',{...args(a),p_user_id:decision.userId});
   return !error&&data===true;
  }catch{return false;}
 }
 return Object.freeze({
  mode:'DRAFT_REQUIRES_UNAPPLIED_SQL',productionIntegration:false,
  async issueApproval(approval){
   if(!valid(approval))throw Error('SPECIFIC_CURRENT_APPROVAL_REQUIRED');
   const snapshot=Object.freeze({...approval});
   const {data,error}=await client.rpc('atlas_issue_canonical_read_v1',{...args(snapshot),p_approved:true});
   if(error||!valid(data)||Object.keys(snapshot).some(k=>data[k]!==snapshot[k]))
    throw Error('AUTHORITY_ISSUANCE_DENIED');
   return Object.freeze({...data});
  },
  authorize,
  createExecutor(){return createControlledReadExecution({url,publishableKey,fetchImpl,authorize});}
 });
}
