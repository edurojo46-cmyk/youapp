/**
 * AGGL V1: deterministic, metadata-only mission proposal.
 * Imports the inert catalog only. Does not invoke specialized engines or adapters.
 * A proposal is neither authorization nor a runtime performance claim.
 */
import {findCapabilities, REGISTRY_CONTRACT} from './EngineCapabilityRegistry.mjs';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function assertData(value, seen = new Set(), depth = 0) {
  if (depth > 8) throw Error('PLAN_INPUT_TOO_DEEP');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { if(value.length>4000) throw Error('PLAN_STRING_TOO_LONG'); return; }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value)) throw Error('PLAN_REQUIRES_PLAIN_DATA');
  if (!Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error('PLAN_REQUIRES_PLAIN_DATA');
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 65) throw Error('PLAN_INPUT_TOO_LARGE');
  for (const key of Reflect.ownKeys(descriptors)) {
    const d = descriptors[key];
    if(typeof key!=='string' || d.get || d.set) throw Error('PLAN_REQUIRES_PLAIN_DATA');
    assertData(d.value, seen, depth+1);
  }
  seen.delete(value);
}
function object(value) { if(!value || Array.isArray(value) || typeof value!=='object') throw Error('PLAN_OBJECT_REQUIRED'); }
function fields(value, allowed) { for(const key of Object.keys(value)) if(!allowed.includes(key)) throw Error('UNSUPPORTED_PLAN_FIELD:'+key); }
function identifier(value) { if(typeof value!=='string'||!value.length||value.length>100||!/^[a-zA-Z0-9_.:-]+$/.test(value)) throw Error('INVALID_PLAN_IDENTIFIER'); return value; }
function bounded(value, fallback, min, max) { const n=value===undefined?fallback:value; if(!Number.isInteger(n)||n<min||n>max) throw Error('INVALID_PLAN_LIMIT'); return n; }
export const GOVERNOR_CONTRACT = freeze({
  version:'1.0.0',mode:'PLAN_ONLY',productionIntegration:false,
  executionEnabled:false,identityVerification:'NOT_PERFORMED',
  authority:'PROPOSAL_ONLY',ranking:'CAPABILITY_MATCH_ONLY',
  runtimeLimitsEnforced:false
});

export function createPlan(input) {
  assertData(input);object(input);fields(input,['missionId','ownerId','requests','constraints']);
  const missionId=identifier(input.missionId),ownerId=identifier(input.ownerId);
  if(!Array.isArray(input.requests)||input.requests.length<1||input.requests.length>20) throw Error('PLAN_REQUESTS_REQUIRED');
  const raw=input.constraints??{};object(raw);
  fields(raw,['externalCostLimitUsd','allowExternalCalls','allowWrites','missionDeadlineMs','maxResultsPerEngine','maxEngines']);
  if(raw.externalCostLimitUsd!==undefined&&raw.externalCostLimitUsd!==0) throw Error('PAID_EXECUTION_NOT_AUTHORIZED');
  if(raw.allowExternalCalls!==undefined&&raw.allowExternalCalls!==false) throw Error('EXTERNAL_EXECUTION_NOT_AUTHORIZED');
  if(raw.allowWrites!==undefined&&raw.allowWrites!==false) throw Error('WRITES_NOT_AUTHORIZED');
  const constraints={
    externalCostLimitUsd:0,allowExternalCalls:false,allowWrites:false,
    missionDeadlineMs:bounded(raw.missionDeadlineMs,30000,1,60000),
    maxResultsPerEngine:bounded(raw.maxResultsPerEngine,5,1,100),
    maxEngines:bounded(raw.maxEngines,3,1,15)
  };
  const requests=input.requests.map(request=>{
    object(request);fields(request,['id','capability','dependsOn','preferredEngineId']);
    const id=identifier(request.id),capability=identifier(request.capability);
    const dependencies=request.dependsOn??[];
    if(!Array.isArray(dependencies)||dependencies.length>20) throw Error('INVALID_PLAN_DEPENDENCIES');
    const dependsOn=dependencies.map(identifier);
    if(new Set(dependsOn).size!==dependsOn.length) throw Error('DUPLICATE_PLAN_DEPENDENCY');
    const preferredEngineId=request.preferredEngineId===undefined?null:identifier(request.preferredEngineId);
    return{id,capability,dependsOn,preferredEngineId};
  });
  const byId=new Map(requests.map(r=>[r.id,r]));
  if(byId.size!==requests.length) throw Error('DUPLICATE_PLAN_STEP');
  for(const r of requests)for(const id of r.dependsOn)if(!byId.has(id))throw Error('UNKNOWN_PLAN_DEPENDENCY');
  const ordered=[],visiting=new Set(),visited=new Set();
  function visit(r) {
    if(visiting.has(r.id)) throw Error('CYCLIC_PLAN');
    if(visited.has(r.id)) return;
    visiting.add(r.id);for(const id of r.dependsOn)visit(byId.get(id));visiting.delete(r.id);visited.add(r.id);ordered.push(r);
  }
  for(const r of requests)visit(r);
  const steps=ordered.map(r=>{
    const candidates=[...findCapabilities({capability:r.capability})].sort((a,b)=>a.id.localeCompare(b.id));
    if(r.preferredEngineId&&!candidates.some(e=>e.id===r.preferredEngineId))throw Error('PREFERRED_ENGINE_CAPABILITY_MISMATCH');
    const selected=r.preferredEngineId?candidates.find(e=>e.id===r.preferredEngineId):candidates.length===1?candidates[0]:null;
    return{
      id:r.id,capability:r.capability,dependsOn:r.dependsOn,
      proposedEngineId:selected?.id??null,
      proposalStatus:!candidates.length?'CAPABILITY_GAP':!selected?'ENGINE_CHOICE_REQUIRES_REVIEW':'CAPABILITY_MATCH_REQUIRES_REVIEW',
      selectionReason:r.preferredEngineId?'REQUESTED_PREFERENCE_WITH_CAPABILITY_MATCH':selected?'ONLY_CATALOG_CAPABILITY_MATCH':'NO_AUTOMATIC_WINNER',
      candidates:candidates.map(e=>({id:e.id,name:e.name,domain:e.domain,
        operationalStatus:e.operationalStatus,externalCost:e.externalCost,effects:e.effects,
        implementationReferences:e.implementationReferences,risks:e.risks})),
      measuredQuality:null,measuredLatencyMs:null,estimatedCostUsd:null,
      executionAuthorized:false,
      requiredChecks:[...REGISTRY_CONTRACT.policyRequirements]
    };
  });
  const proposedEngines=[...new Set(steps.map(s=>s.proposedEngineId).filter(Boolean))];
  if(proposedEngines.length>constraints.maxEngines)throw Error('PLAN_ENGINE_LIMIT_EXCEEDED');
  const blockers=['PLAN_ONLY_NO_EXECUTION','IDENTITY_AND_OWNER_SCOPE_NOT_VERIFIED',
    'NO_RUNTIME_AUTHORIZATION','COST_EFFECTS_AND_PROVIDER_QUOTAS_NOT_VERIFIED','NO_OPERATIONAL_EVIDENCE_IMPORTED'];
  if(steps.some(s=>s.proposalStatus==='CAPABILITY_GAP'))blockers.push('UNRESOLVED_CAPABILITIES');
  if(steps.some(s=>s.proposalStatus==='ENGINE_CHOICE_REQUIRES_REVIEW'))blockers.push('UNRESOLVED_ENGINE_CHOICE');
  return freeze({
    ...GOVERNOR_CONTRACT,missionId,ownerId,status:'PROPOSAL_REQUIRES_REVIEW',
    authorization:'NOT_GRANTED',proposedEngines,constraints,steps,blockers,
    stopConditions:['MISSING_AUTHORIZATION','UNKNOWN_COST_OR_SIDE_EFFECTS','MISSING_EVIDENCE',
      'DEADLINE_EXCEEDED','CANCELLATION_REQUESTED','CAPABILITY_GAP'],
    caveats:['Limits are proposed metadata, not runtime enforcement.',
      'Engine preference is advisory and cannot grant authorization.',
      'No fastest, best quality or zero-cost engine is claimed without measurements.',
      'Existing YOUAPP execution paths are unchanged.']
  });
}
