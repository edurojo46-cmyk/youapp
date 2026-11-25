/**
 * Opt-in local planning probe. No retrieval, DB client, network or production route.
 * Reuses Query Fabric's existing classifier and planner.
 */
import {createPlan} from './PlanOnlyGovernor.mjs';
import {QueryIntentClassifier} from '../atlasQueryFabric/QueryIntentClassifier.ts';
import {StructuredQueryPlanner} from '../atlasQueryFabric/StructuredQueryPlanner.ts';

interface Input {missionId:string;ownerId:string;query:string;maxHops?:number;}
function freeze<T>(value:T):T {
 if(value && typeof value==='object' && !Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);Object.freeze(value);
 }
 return value;
}
export function buildQueryPlanShadow(input:Input) {
 if(!input || typeof input!=='object' || Array.isArray(input) ||
   ![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('PLAIN_QUERY_INPUT_REQUIRED');
 for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(input))){
  if(!['missionId','ownerId','query','maxHops'].includes(key)||descriptor.get||descriptor.set)
   throw Error('UNSUPPORTED_QUERY_INPUT');
 }
 if(typeof input.ownerId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.ownerId))
  throw Error('OWNER_UUID_CONTEXT_REQUIRED');
 if(typeof input.query!=='string'||!input.query.trim()||input.query.length>500)
  throw Error('BOUNDED_QUERY_REQUIRED');
 const maxHops=input.maxHops??1;
 if(!Number.isInteger(maxHops)||maxHops<1||maxHops>2)throw Error('QUERY_HOP_LIMIT');
 const started=performance.now();
 const governancePlan=createPlan({missionId:input.missionId,ownerId:input.ownerId,
  requests:[{id:'query-plan',capability:'knowledge.query.plan'}],
  constraints:{externalCostLimitUsd:0,allowExternalCalls:false,allowWrites:false,maxEngines:1}});
 if(governancePlan.proposedEngines.length!==1||governancePlan.proposedEngines[0]!=='query_fabric')
  throw Error('QUERY_PLANNER_CAPABILITY_CHANGED');
 const intent=QueryIntentClassifier.classify(input.query);
 const queryPlan=StructuredQueryPlanner.plan(input.query,intent,input.ownerId,{
  max_hops:maxHops,include_contradictions:true,include_inferences:false,include_claims:false,temporal_mode:'CURRENT'
 });
 const limits={maxQueryCharacters:500,maxHops:2,maxEstimatedNodes:50,maxEstimatedQueries:5};
 const nodes=queryPlan.cost_estimate.estimated_nodes,queries=queryPlan.cost_estimate.estimated_queries;
 const withinLimits=queryPlan.tenant_id===input.ownerId&&Number.isFinite(nodes)&&nodes>=0&&nodes<=limits.maxEstimatedNodes
  &&Number.isFinite(queries)&&queries>=0&&queries<=limits.maxEstimatedQueries
  &&queryPlan.max_hops<=maxHops&&queryPlan.cost_estimate.allowed===true;
 return freeze({
  mode:'SHADOW_LOCAL_QUERY_PLANNING',status:withinLimits?'SHADOW_QUERY_PLAN_READY':'SHADOW_QUERY_PLAN_BLOCKED',
  productionIntegration:false,executionEnabled:false,retrievalAuthorized:false,
  identityVerification:'NOT_PERFORMED',governancePlan,queryPlan,
  limits,complexityEstimateWithinLimits:withinLimits,
  classificationBasis:'EXISTING_HEURISTICS_NOT_FACT_VERIFICATION',
  planningDurationMs:performance.now()-started,
  resultRecords:[],verifiedFacts:[],observationsCreated:false,
  notes:['Only local planning functions were invoked.',
   'Owner UUID is planning context; authentication and tenant membership are not verified here.',
   'Planner cost_estimate.allowed refers to heuristic complexity, not spending or retrieval authorization.',
   'No deadline or limit is imposed on existing YOUAPP workers by this isolated probe.']
 });
}
