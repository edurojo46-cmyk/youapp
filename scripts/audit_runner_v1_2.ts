import * as fs from 'fs';
import * as path from 'path';
import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';
import { analyzeQuery } from '../src/lib/search/intentDetector';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

const TEST_QUERIES = [
  "queen", // Perfect (hopefully)
  "metallica videoclip oficial", // QU / Gate ?
  "charly garcia entrevista", // QU / Gate ?
  "david bowie interview", // QU ?
  "queen live at wembley", // Ranking / Gate ?
  "soda stereo unplugged", // Ranking / Gate ?
  "los redondos en racing", // Gate / Ranking ?
  "steven spielberg", // Open World
  "elon musk", // Open World
  "quen boemian rapsody", // Typo
  "the rolling stones reggaeton en marte", // Synthetic Negative
  "spinetta crisantemo" // Possible True Inventory Gap
];

async function checkPhysicalAtlasExact(detection: any): Promise<number> {
  const entityName = detection.canonicalEntity || detection.entity?.name || detection.entityName;
  if (!entityName) return 0;
  
  let q = supabase.from('youapp_index').select('id', { count: 'exact' });
  const entityTerms = entityName.toLowerCase();
  
  const workName = detection.canonicalWork || detection.object?.canonicalValue || detection.residualTitle || detection.canonicalTitle;
  
  if (workName) {
    const workTerms = workName.toLowerCase();
    q = q.or(`title.ilike.%${workTerms}%`).or(`title.ilike.%${entityTerms}%,creator_name.ilike.%${entityTerms}%`);
  } else if (detection.topic) {
    const topic = detection.topic.toLowerCase();
    q = q.or(`title.ilike.%${topic}%,description.ilike.%${topic}%`).or(`title.ilike.%${entityTerms}%,creator_name.ilike.%${entityTerms}%`);
  } else {
    q = q.or(`title.ilike.%${entityTerms}%,creator_name.ilike.%${entityTerms}%`);
  }
  
  const { count, error } = await q;
  if (error) console.error("Supabase Error:", error);
  return count || 0;
}

async function runAudit() {
  console.log("🚀 Starting Runner Audit (12 Queries)");

  for (const queryStr of TEST_QUERIES) {
    console.log(`\n======================================================`);
    console.log(`Query: "${queryStr}"`);
    
    let searchRes = await executeSearch(queryStr, {
      readOnlyBenchmark: true,
      trafficClass: 'benchmark',
      routingMode: 'static'
    });
    
    const intentData = analyzeQuery(queryStr);
    const detection = exactWorkSearchGate.detectExactWork(queryStr, intentData);
    const resolvedIntent = searchRes.trace?.resolvedIntent || detection;
    
    const entityName = resolvedIntent.canonicalEntity || resolvedIntent.entity?.name || resolvedIntent.entityName;
    const workName = resolvedIntent.canonicalWork || resolvedIntent.object?.canonicalValue || resolvedIntent.residualTitle || resolvedIntent.topic || resolvedIntent.canonicalTitle;

    console.log(`\n[Intent Resolution]`);
    console.log(`resolvedEntity:      ${entityName || 'none'}`);
    console.log(`resolvedObject:      ${workName || 'none'}`);
    console.log(`resolvedConstraints: ${resolvedIntent.constraints?.map((c: any) => c.value).join(', ') || 'none'}`);

    const physicalExactCount = await checkPhysicalAtlasExact(resolvedIntent);
    console.log(`\n[Exact Counts Evidence]`);
    console.log(`physicalExactCount:  ${physicalExactCount}`);
    
    const poolExact = searchRes.all.filter((r: any) => r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || r.semanticMatch?.isEntityTopic || r.isEntityTopic);
    console.log(`candidatePoolExact:  ${poolExact.length}`);
    
    const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(resolvedIntent as any, resolvedIntent as any);
    const gateQualified = poolExact.filter((r: any) => exactWorkSearchGate.evaluateMandatoryGates(r, mandatoryGates).passed);
    console.log(`gateQualifiedExact:  ${gateQualified.length}`);
    
    const top5 = searchRes.videos.slice(0, 5); // Using .videos since .results was undefined
    const top5Exact = top5.filter((r: any) => r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || r.semanticMatch?.isEntityTopic || r.isEntityTopic);
    console.log(`top1Exact:           ${top5Exact.length > 0 && top5[0] === top5Exact[0] ? 'YES' : 'NO'}`);
    console.log(`top5Exact:           ${top5Exact.length}`);

    let failureClass = 'PASS';
    let reason = 'Top 5 has exact match';

    if (queryStr === "the rolling stones reggaeton en marte") {
       if (top5Exact.length > 0) {
           failureClass = 'SYNTHETIC_NEGATIVE_LEAKAGE';
           reason = 'Synthetic negative returned exact match';
       } else {
           failureClass = 'PASS (SYNTHETIC_NEGATIVE)';
           reason = 'Properly returned 0 exact results';
       }
    } else {
        if (top5Exact.length === 0) {
            if (!entityName) {
                if (queryStr === "steven spielberg" || queryStr === "elon musk") {
                    failureClass = 'OPEN_WORLD_ENTITY_FAILURE';
                    reason = 'Open world entity not resolved';
                } else if (queryStr === "quen boemian rapsody") {
                    failureClass = 'TYPO_RESOLUTION_FAILURE';
                    reason = 'Typo not resolved';
                } else {
                    failureClass = 'QUERY_UNDERSTANDING_FAILURE';
                    reason = 'Entity not resolved';
                }
            } else if (physicalExactCount === 0) {
                failureClass = 'TRUE_INVENTORY_GAP';
                reason = `physicalExactCount = ${physicalExactCount}`;
            } else if (poolExact.length === 0) {
                failureClass = 'RETRIEVAL_GAP';
                reason = `physicalExactCount = ${physicalExactCount}, candidatePoolExact = 0`;
            } else if (gateQualified.length === 0) {
                failureClass = 'GATE_FALSE_NEGATIVE';
                reason = `candidatePoolExact = ${poolExact.length}, gateQualifiedExact = 0`;
            } else {
                failureClass = 'RANKING_GAP';
                reason = `gateQualifiedExact = ${gateQualified.length}, top5Exact = 0`;
            }
        }
    }

    console.log(`\n[Diagnosis]`);
    console.log(`failureClass:        ${failureClass}`);
    console.log(`failureClassReason:  ${reason}`);
  }
}

runAudit().catch(console.error);
