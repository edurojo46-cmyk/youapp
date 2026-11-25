/**
 * ATLAS DYNAMIC AGENT PLANNER V1.
 * Metadata proposals only: no agents are spawned, no engine or provider is invoked.
 */
import {createPlan} from './PlanOnlyGovernor.mjs';
import {getEngine} from './EngineCapabilityRegistry.mjs';

function freeze(value) {
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);Object.freeze(value);
 }
 return value;
}
function limits(options) {
 if(!options||typeof options!=='object'||Array.isArray(options)||
  ![Object.prototype,null].includes(Object.getPrototypeOf(options)))throw Error('INVALID_AGENT_LIMITS');
 const descriptors=Object.getOwnPropertyDescriptors(options);
 for(const key of Reflect.ownKeys(descriptors)){
  const d=descriptors[key];
  if(typeof key!=='string'||!['maxAgents','maxConcurrentAgents'].includes(key)||d.get||d.set)
   throw Error('INVALID_AGENT_LIMITS');
 }
 const maxAgents=options.maxAgents??8,maxConcurrentAgents=options.maxConcurrentAgents??2;
 if(!Number.isInteger(maxAgents)||maxAgents<1||maxAgents>20||
  !Number.isInteger(maxConcurrentAgents)||maxConcurrentAgents<1||maxConcurrentAgents>maxAgents)
  throw Error('INVALID_AGENT_LIMITS');
 return{maxAgents,maxConcurrentAgents};
}
export function planDynamicAgents(mission,options={}) {
 const agentLimits=limits(options);
 // The existing governor validates plain input, dependencies, costs and capabilities.
 const governancePlan=createPlan(mission);
 if(governancePlan.steps.length>agentLimits.maxAgents)throw Error('AGENT_BUDGET_EXCEEDED');
 const agents=governancePlan.steps.map(step=>{
  const engine=step.proposedEngineId?getEngine(step.proposedEngineId):null;
  if(engine&&!engine.capabilities.includes(step.capability))throw Error('REGISTRY_CAPABILITY_CHANGED');
  return{
   agentId:'agent:'+step.id,taskId:step.id,capability:step.capability,
   proposedEngineId:engine?.id??null,
   kind:'TASK_PROPOSAL_NOT_RUNNING_PROCESS',
   dependsOn:step.dependsOn.map(id=>'agent:'+id),
   status:engine?'PROPOSED_REQUIRES_REVIEW':'BLOCKED_UNRESOLVED_CAPABILITY',
   executionAuthorized:false,selectionReason:step.selectionReason,
   requiredChecks:step.requiredChecks,
   operationalStatus:engine?.operationalStatus??'UNKNOWN',
   measuredQuality:null,measuredLatencyMs:null,estimatedCostUsd:null
  };
 });
 const unresolved=agents.some(a=>a.proposedEngineId===null);
 const stages=[];
 if(!unresolved){
  const pending=[...agents],completed=new Set();
  while(pending.length){
   const engineSlots=new Set(),selected=[];
   for(const agent of pending){
    if(selected.length>=agentLimits.maxConcurrentAgents)break;
    if(agent.dependsOn.every(id=>completed.has(id))&&!engineSlots.has(agent.proposedEngineId)){
     selected.push(agent);engineSlots.add(agent.proposedEngineId);
    }
   }
   if(!selected.length)throw Error('AGENT_DEPENDENCIES_UNSCHEDULABLE');
   stages.push({stage:stages.length+1,agentIds:selected.map(a=>a.agentId),executionAuthorized:false});
   for(const agent of selected){completed.add(agent.agentId);pending.splice(pending.indexOf(agent),1);}
  }
 }
 return freeze({
  version:'1.0.0',mode:'DYNAMIC_AGENT_PLAN_ONLY',
  missionId:governancePlan.missionId,ownerId:governancePlan.ownerId,
  status:unresolved?'BLOCKED_UNRESOLVED_CAPABILITIES':'AGENT_PROPOSAL_REQUIRES_REVIEW',
  executionEnabled:false,authorization:'NOT_GRANTED',
  identityVerification:'NOT_PERFORMED',productionIntegration:false,
  agentCount:agents.length,agentLimits,agents,stages,governancePlan,
  blockers:[...governancePlan.blockers,...(unresolved?['AGENT_CAPABILITY_GAP']:[])],
  notes:['One proposed agent per requested task; the count is not fixed.',
   'Stage concurrency is a proposal, not runtime enforcement.',
   'The same specialized engine is not proposed twice within one stage.',
   'No prompts, callbacks, executors, credentials or runtime agents are created.',
   'Capability matching does not establish the fastest or highest-quality engine.']
 });
}
