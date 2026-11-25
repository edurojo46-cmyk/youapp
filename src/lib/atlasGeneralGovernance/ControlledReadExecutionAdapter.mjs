/**
 * Isolated one-shot bridge. No route, UI or production integration.
 * Constructor transport and authorizer are TRUSTED host dependencies, never mission input.
 * Injecting a transport is not proof that it is simulated; tests use an in-memory fixture.
 * Planner permission remains NOT_GRANTED. Only this bounded canonical pilot is delegated.
 */
import {planDynamicAgents} from './DynamicAgentPlanner.mjs';
import {createCanonicalReadPilot} from './CanonicalReadPilot.mjs';
const CAPABILITY='knowledge.query.retrieve',SCOPE='CANONICAL_ENTITIES_ONLY';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function plain(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('INVALID_READ_APPROVAL');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of Reflect.ownKeys(descriptors)){
  const d=descriptors[key];if(typeof key!=='string'||!keys.includes(key)||d.get||d.set)throw Error('INVALID_READ_APPROVAL');
 }
}
async function boundedAuth(response,signal){
 const reader=response.body?.getReader();if(!reader)throw Error('AUTH_RESPONSE_REQUIRED');
 const chunks=[];let size=0;
 try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done)break;
  size+=part.value.length;if(size>65536){await reader.cancel();throw Error('AUTH_RESPONSE_TOO_LARGE');}chunks.push(part.value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return new Response(bytes,{status:response.status,headers:response.headers,statusText:response.statusText});
}
export function createControlledReadExecution({url,publishableKey,fetchImpl,authorize}){
 if(typeof fetchImpl!=='function'||typeof authorize!=='function')throw Error('TRUSTED_TRANSPORT_AND_AUTHORIZER_REQUIRED');
 // Validate the existing pilot configuration without performing requests.
 createCanonicalReadPilot({url,publishableKey,fetchImpl});
 let used=false;
 return Object.freeze({async execute(input){
  plain(input,['mission','approval','accessToken']);
  const plan=planDynamicAgents(input.mission,{maxAgents:1,maxConcurrentAgents:1});
  const agent=plan.agents[0],constraints=plan.governancePlan.constraints;
  if(plan.agentCount!==1||agent.capability!==CAPABILITY||agent.proposedEngineId!=='query_fabric'||agent.dependsOn.length)
   throw Error('CAPABILITY_DISABLED');
  // Pilot always requests five rows; reject a stricter planner budget rather than relaxing it.
  if(constraints.maxResultsPerEngine<5)throw Error('PILOT_LIMIT_INCOMPATIBLE');
  const approval=input.approval;
  plain(approval,['approved','missionId','taskId','ownerId','tenantId','scope','expiresAt']);
  if(approval.approved!==true||approval.missionId!==plan.missionId||approval.taskId!==agent.taskId||
   approval.ownerId!==plan.ownerId||!UUID.test(approval.ownerId)||!UUID.test(approval.tenantId)||
   approval.scope!==SCOPE||!Number.isSafeInteger(approval.expiresAt)||
   approval.expiresAt<=Date.now()||approval.expiresAt>Date.now()+60000)throw Error('EXPLICIT_SCOPED_APPROVAL_REQUIRED');
  if(typeof input.accessToken!=='string'||!input.accessToken||input.accessToken.length>16000)throw Error('SESSION_REQUIRED');
  const grant=Object.freeze({...approval}),token=input.accessToken;
  if(used)throw Error('ONE_SHOT_READ_ALREADY_USED');used=true;
  const deadline=AbortSignal.timeout(Math.min(constraints.missionDeadlineMs,grant.expiresAt-Date.now()));
  let verifiedUser=null,authorized=false;
  const transport=async(raw,init={})=>{
   deadline.throwIfAborted();
   const target=new URL(raw),signal=AbortSignal.any([deadline,init.signal].filter(Boolean));
   if(target.origin!==url||init.method!=='GET'||init.body)throw Error('READ_TRANSPORT_BLOCKED');
   if(target.pathname==='/rest/v1/atlas_canonical_entities'){
    if(!verifiedUser||verifiedUser.id!==grant.ownerId||verifiedUser.tenantId!==grant.tenantId)
     throw Error('VERIFIED_OWNER_SCOPE_REQUIRED');
    const decision=Object.freeze({missionId:plan.missionId,taskId:agent.taskId,capability:CAPABILITY,
     userId:verifiedUser.id,tenantId:verifiedUser.tenantId,scope:SCOPE,approval:grant});
    if(await authorize(decision)!==true)throw Error('TRUSTED_AUTHORIZATION_DENIED');
    deadline.throwIfAborted();authorized=true;
   }else if(target.pathname!=='/auth/v1/user')throw Error('CAPABILITY_DISABLED');
   const response=await fetchImpl(raw,{...init,signal});
   if(target.pathname==='/auth/v1/user'){
    const bounded=await boundedAuth(response,signal);
    if(bounded.ok){
     const user=await bounded.clone().json();
     if(user.is_anonymous===false&&UUID.test(user.id)){
      verifiedUser=Object.freeze({id:user.id,tenantId:user.app_metadata?.tenant_id??user.id});
     }
    }
    return bounded;
   }
   return response;
  };
  let onAbort;
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('CONTROLLED_READ_DEADLINE'));deadline.addEventListener('abort',onAbort,{once:true});});
  try{
   const pilot=createCanonicalReadPilot({url,publishableKey,fetchImpl:transport});
   const result=await Promise.race([pilot.read(token),cancelled]);
   deadline.throwIfAborted();
   if(!authorized||!result.identityVerified||result.scope!==SCOPE)throw Error('READ_NOT_AUTHORIZED');
   // Receipt only: no token, identity, row IDs, names, or source payload are retained.
   return Object.freeze({mode:'CONTROLLED_CANONICAL_READ',status:result.status,identityVerified:true,
    authorizationVerified:true,plannerExecutionEnabled:false,otherCapabilitiesEnabled:false,
    productionIntegration:false,rowCount:result.rows.length,maxRows:5,requests:result.requests,
    maxRequests:2,responseLimitBytes:65536,requestTimeoutMs:5000,
    deadlineMs:constraints.missionDeadlineMs,writes:0,record:'IN_MEMORY_REDACTED_RECEIPT'});
  }catch{throw Error('CONTROLLED_READ_DENIED_OR_FAILED');}
  finally{deadline.removeEventListener('abort',onAbort);}
 }});
}
