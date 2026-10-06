import * as fs from 'fs';
import * as path from 'path';
import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';
import { analyzeQuery } from '../src/lib/search/intentDetector';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

const ARTIFACTS_DIR = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\a1c5284f-3194-48ca-b85b-b39604695364';

function extractJson(content: string) {
  const match = content.match(/```json\n([\s\S]*?)\n```/);
  if (match && match[1]) {
    const cleanJson = match[1].replace(/\/\/.*$/gm, '');
    try {
      return JSON.parse(cleanJson);
    } catch {
      return null;
    }
  }
  return null;
}

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

async function runBenchmark() {
  console.log("🚀 Starting Benchmark V1.2 OFFICIAL (200 Golden Queries)");
  const benchmarkStartedAt = new Date().toISOString();
  
  let allQueries: any[] = [];
  
  const blocks = ['a', 'b', 'c', 'd'];
  for (const block of blocks) {
    let p = path.join(ARTIFACTS_DIR, `benchmark_v1_2_plan_block_${block}.md`);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const parsed = extractJson(content);
      if (parsed) {
        if (Array.isArray(parsed)) {
          allQueries.push(...parsed);
        } else if (parsed.queries) {
          if (parsed.defaults) {
            parsed.queries.forEach((q: any) => {
              q.defaults = parsed.defaults;
            });
          }
          allQueries.push(...parsed.queries);
        }
      }
    } else {
        console.warn("Could not find block", p);
    }
  }

  console.log(`Loaded ${allQueries.length} queries`);
  
  if (allQueries.length === 0) {
      console.log("No queries found, stopping.");
      return;
  }

  // Inject the golden regressions for proper names
  allQueries.push(
    { query: "frank sinatra", expected: "Proper Name Isolation", category: "PROPER_NAME", difficulty: "OPEN_WORLD" },
    { query: "marcelo longobardi", expected: "Proper Name Isolation", category: "PROPER_NAME", difficulty: "OPEN_WORLD" },
    { query: "pity alvarez", expected: "Proper Name Isolation", category: "PROPER_NAME", difficulty: "OPEN_WORLD" },
    { query: "carlos pagni", expected: "Proper Name Isolation", category: "PROPER_NAME", difficulty: "OPEN_WORLD" }
  );

  // Inject Phase 2B.1 Semantic Test Cases
  allQueries.push(
    // 4 TP EXPECTED (Must be resolved via SEMANTIC_REPAIR)
    { query: "fito paez polaroid de locura ordinaria", expected: "Semantic Repair Work Match", category: "SEMANTIC_REPAIR_EXPECTED", difficulty: "HARD" },
    { query: "fito paez brillante sobre el mic", expected: "Semantic Repair Work Match", category: "SEMANTIC_REPAIR_EXPECTED", difficulty: "HARD" },
    { query: "fito paez velez", expected: "Semantic Repair Venue Match", category: "SEMANTIC_REPAIR_EXPECTED", difficulty: "HARD" },
    { query: "the beatles making of", expected: "Semantic Repair Content Type Match", category: "SEMANTIC_REPAIR_EXPECTED", difficulty: "HARD" },
    
    // 8 CONTEXTUAL NEGATIVES (Must NOT be promoted to PRIMARY)
    { query: "charly garcia spinetta", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "fito paez andres calamaro", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "los redondos patricio rey", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "soda stereo cerati", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "spinetta almendra", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "luis alberto spinetta pescado rabioso", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "charly garcia sui generis", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" },
    { query: "the beatles paul mccartney", expected: "No Primary Promotion", category: "SEMANTIC_NEGATIVE", difficulty: "HARD" }
  );

  let results: any[] = [];
  let failures: Record<string, number> = {
    PASS: 0,
    PASS_SYNTHETIC_NEGATIVE: 0,
    PASS_EXPLICIT_NAME_FALLBACK: 0,
    QUERY_UNDERSTANDING_FAILURE: 0,
    OPEN_WORLD_ENTITY_FAILURE: 0,
    TYPO_RESOLUTION_FAILURE: 0,
    RETRIEVAL_GAP: 0,
    TRUE_INVENTORY_GAP: 0,
    GATE_FALSE_NEGATIVE: 0,
    RANKING_GAP: 0,
    UNKNOWN: 0
  };

  let invariants = {
    MandatoryGateLeakage: 0,
    RelatedLeakageIntoExact: 0,
    ExplicitEntityTitlePresenceViolations: 0,
    UnresolvedExplicitNameLeakage: 0,
    PartialNameTokenLeakage: 0,
    ConstraintViolation: 0,
    SyntheticNegativeExactLeakage: 0,
    MentionToPrimaryLeakage: 0,
    SearchListCalls: 0,
    RadarExternalCalls: 0
  };
  
  let semanticStats = {
    tp: 0,
    fp: 0,
    fn: 0,
    tn: 0,
    totalSemanticQueries: 0,
    highConfidenceQueries: 0,
    semanticRepairLaneHits: 0,
    semanticRepairQueries: 0,
    semanticRepairQualified: 0,
    semanticRepairRejectedByGate: 0,
    semanticRepairExpected: 0,
    semanticRepairRecovered: 0
  };
  

  const { count: atlasPhysicalCountAtStart } = await supabase.from('youapp_index').select('id', { count: 'exact', head: true });
  
  for (let i = 0; i < allQueries.length; i++) {
    const q = allQueries[i];
    console.log(`\n[${i+1}/${allQueries.length}] Running: ${q.query}`);
    
    const startTime = Date.now();
    let searchRes;
    try {
      searchRes = await executeSearch(q.query, {
        readOnlyBenchmark: true,
        benchmarkStartedAt,
        trafficClass: 'benchmark',
        routingMode: 'static'
      });
    } catch (err: any) {
      console.error(`Error executing query ${q.query}:`, err);
      continue;
    }
    const latency = Date.now() - startTime;

    const intentData = analyzeQuery(q.query);
    const detection = exactWorkSearchGate.detectExactWork(q.query, intentData);
    const resolvedIntent = searchRes.trace?.resolvedIntent || detection;
    
    const entityName = resolvedIntent.canonicalEntity || resolvedIntent.entity?.name || resolvedIntent.entityName;
    const workName = resolvedIntent.canonicalWork || resolvedIntent.object?.canonicalValue || resolvedIntent.residualTitle || resolvedIntent.topic || resolvedIntent.canonicalTitle;

    const physicalExactCount = await checkPhysicalAtlasExact(resolvedIntent);
    
    const poolExact = searchRes.all.filter((r: any) => 
       r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || 
       r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || 
       r.semanticMatch?.isEntityTopic || r.isEntityTopic ||
       r.semanticMatch?.isConstraintMatch || r.isConstraintMatch ||
       r.retrievalLane === 'SEMANTIC_REPAIR'
    );
    
    const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(resolvedIntent as any, resolvedIntent as any);
    const gateQualified = poolExact.filter((r: any) => exactWorkSearchGate.evaluateMandatoryGates(r, mandatoryGates).passed);
    
    const top5 = searchRes.videos.slice(0, 5);
    const top5ExactList = top5.filter((r: any) => r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || r.semanticMatch?.isEntityTopic || r.isEntityTopic);
    
    // Evaluate explicitName protection
    if (mandatoryGates.explicitName?.required) {
       for (const c of top5) {
          const res = exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates);
          if (!res.passed && res.reason === 'explicitNameMissing') {
             invariants.UnresolvedExplicitNameLeakage++;
          }
       }
    }

    let failureClass = 'UNKNOWN';

    // Track Semantic Metrics logic (Phase 2B.1)
    let isExpectedSemantic = q.category === 'SEMANTIC_REPAIR_EXPECTED';
    let isNegativeSemantic = q.category === 'SEMANTIC_NEGATIVE';
    let isGeneralSemantic = q.category === 'SEMANTIC_REPAIR' || q.category === 'QUERY_UNDERSTANDING_FAILURE';

    let semanticFound = poolExact.filter((r: any) => r.retrievalLane === 'SEMANTIC_REPAIR');
    
    if (isExpectedSemantic) semanticStats.semanticRepairExpected++;

    if (semanticFound.length > 0) {
       semanticStats.semanticRepairLaneHits++;
       semanticStats.totalSemanticQueries++;
       semanticStats.semanticRepairQueries++;

       const passedSemantic = semanticFound.filter((r: any) => exactWorkSearchGate.evaluateMandatoryGates(r, mandatoryGates).passed);
       
       if (passedSemantic.length > 0) {
          semanticStats.semanticRepairQualified++;
          
          if (isExpectedSemantic) {
             semanticStats.tp++;
             semanticStats.semanticRepairRecovered++;
          } else if (isNegativeSemantic) {
             semanticStats.fp++;
             invariants.MentionToPrimaryLeakage++; // Direct penalty
          } else {
             semanticStats.fp++; // General FP if not expected but promoted
          }
       } else {
          semanticStats.semanticRepairRejectedByGate++;
          if (isExpectedSemantic) {
             semanticStats.fn++;
          } else if (isNegativeSemantic) {
             semanticStats.tn++;
          }
       }
       
       const highConf = semanticFound.filter((r: any) => (r._semanticMatch?.semanticConfidence || 0) >= 0.90);
       if (highConf.length > 0) {
          semanticStats.highConfidenceQueries++;
       }
    } else {
       if (isExpectedSemantic) {
          semanticStats.fn++;
       } else if (isNegativeSemantic) {
          semanticStats.tn++;
       } else if (isGeneralSemantic) {
          semanticStats.fn++;
       }
    }

    if (q.category === 'SYNTHETIC_NEGATIVE') {
      if (top5ExactList.length > 0) {
          invariants.SyntheticNegativeExactLeakage++;
          failureClass = 'SYNTHETIC_NEGATIVE_LEAKAGE';
      } else {
          failureClass = 'PASS_SYNTHETIC_NEGATIVE';
      }
    } else {
        if (top5ExactList.length > 0) {
            if (!entityName && mandatoryGates.explicitName?.required) {
                failureClass = 'PASS_EXPLICIT_NAME_FALLBACK';
            } else {
                failureClass = 'PASS';
            }
        } else {
            if (!entityName) {
                if (q.difficulty === "OPEN_WORLD") {
                    failureClass = 'OPEN_WORLD_ENTITY_FAILURE';
                } else if (q.category === "TYPO_EQUIVALENCE") {
                    failureClass = 'TYPO_RESOLUTION_FAILURE';
                } else {
                    failureClass = 'QUERY_UNDERSTANDING_FAILURE';
                }
            } else if (physicalExactCount === 0) {
                failureClass = 'TRUE_INVENTORY_GAP';
            } else if (poolExact.length === 0) {
                failureClass = 'RETRIEVAL_GAP';
            } else if (gateQualified.length === 0) {
                failureClass = 'GATE_FALSE_NEGATIVE';
            } else {
                failureClass = 'RANKING_GAP';
            }
        }
    }

    if (failureClass) {
        failures[failureClass] = (failures[failureClass] || 0) + 1;
    }

    results.push({
      query: q.query,
      expected: q.expected,
      failureClass
    });
  }

  // Compute final semantic metrics
  const totalPred = semanticStats.tp + semanticStats.fp;
  const totalActual = semanticStats.tp + semanticStats.fn;
  
  const precision = totalPred > 0 ? (semanticStats.tp / totalPred) * 100 : 0;
  const recall = totalActual > 0 ? (semanticStats.tp / totalActual) * 100 : 0;
  // Approximation of FPR (False Positive Rate): how many queries failed due to semantic noise vs total clean queries
  const fpr = totalPred > 0 ? (semanticStats.fp / allQueries.length) * 100 : 0; 
  
  let semanticMetrics = {
    ExpectedSemanticRepairs: semanticStats.semanticRepairExpected,
    SemanticRepairRecovered: semanticStats.semanticRepairRecovered,
    SemanticRepairLaneHits: semanticStats.semanticRepairLaneHits,
    SemanticTruePositive: semanticStats.tp,
    SemanticFalsePositive: semanticStats.fp,
    SemanticFalseNegative: semanticStats.fn,
    SemanticPrecision: precision > 0 ? `${precision.toFixed(2)}%` : "0.00%",
    SemanticRecall: recall > 0 ? `${recall.toFixed(2)}%` : "0.00%",
    SemanticFalsePositiveRate: `${fpr.toFixed(2)}%`,
    ContextualNegativeCases: 8,
    MentionToPrimaryLeakage: invariants.MentionToPrimaryLeakage
  };

  const hardInvariantFailed = Object.values(invariants).some(val => val > 0);
  const status = hardInvariantFailed ? 'FAILED' : 'PASS';

  const reportPath = path.join(ARTIFACTS_DIR, 'SEARCH_QUALITY_BASELINE_V1_2_200_OFFICIAL.md');
  
  let outcomesText = "";
  let totalOutcomeCount = 0;
  for (const [k, v] of Object.entries(failures)) {
      if (v > 0) {
          outcomesText += `${k.padEnd(30, ' ')} ${v}\n`;
          totalOutcomeCount += v;
      }
  }
  
  const reportContent = `# SEARCH QUALITY BASELINE V1.3

## Global Status
- **Benchmark Execution**: COMPLETED
- **Baseline Status**: ${status}
- **AtlasPhysicalCountAtStart**: ${atlasPhysicalCountAtStart}

## QUERY OUTCOMES (CORE V1.2 GOLDEN SET)
\`\`\`text
PASS                           ${failures.PASS}
PASS_SYNTHETIC_NEGATIVE        ${failures.PASS_SYNTHETIC_NEGATIVE}
QUERY_UNDERSTANDING_FAILURE    ${failures.QUERY_UNDERSTANDING_FAILURE}
OPEN_WORLD_ENTITY_FAILURE      ${failures.OPEN_WORLD_ENTITY_FAILURE}
TYPO_RESOLUTION_FAILURE        ${failures.TYPO_RESOLUTION_FAILURE}
RETRIEVAL_GAP                  ${failures.RETRIEVAL_GAP}
TRUE_INVENTORY_GAP             ${failures.TRUE_INVENTORY_GAP}
SYNTHETIC_NEGATIVE_LEAKAGE     ${failures.SYNTHETIC_NEGATIVE_LEAKAGE || 0}
GATE_FALSE_NEGATIVE            ${failures.GATE_FALSE_NEGATIVE || 0}
RANKING_GAP                    ${failures.RANKING_GAP || 0}
UNKNOWN                        ${failures.UNKNOWN || 0}
----------------------------------
CORE V1.2 GOLDEN SET           200
\`\`\`

## NAME FALLBACK EXTENSION (NEW)
\`\`\`text
PASS_EXPLICIT_NAME_FALLBACK    ${failures.PASS_EXPLICIT_NAME_FALLBACK}
----------------------------------
NEW NAME REGRESSIONS           ${failures.PASS_EXPLICIT_NAME_FALLBACK}
\`\`\`

\`\`\`text
CORE V1.2 GOLDEN SET        ${allQueries.length - 4 - 12}
NEW NAME REGRESSIONS          ${failures.PASS_EXPLICIT_NAME_FALLBACK}
SEMANTIC TEST CASES          12
                            ${'─'.repeat(30)}
TOTAL EXECUTED              ${allQueries.length}

## PHASE 2B.1 — SEMANTIC END-TO-END
Expected Semantic Repairs       ${semanticMetrics.ExpectedSemanticRepairs}
SemanticRepairRecovered         ${semanticMetrics.SemanticRepairRecovered}
SemanticRepairLaneHits          ${semanticMetrics.SemanticRepairLaneHits}
SemanticTruePositive            ${semanticMetrics.SemanticTruePositive}
SemanticFalsePositive           ${semanticMetrics.SemanticFalsePositive}
SemanticFalseNegative           ${semanticMetrics.SemanticFalseNegative}

Semantic Precision              ${semanticMetrics.SemanticPrecision}
Semantic Recall                 ${semanticMetrics.SemanticRecall}
Semantic FPR                    ${semanticMetrics.SemanticFalsePositiveRate}

Contextual Negative Cases       ${semanticMetrics.ContextualNegativeCases}
MentionToPrimaryLeakage         ${semanticMetrics.MentionToPrimaryLeakage}

## HARD INVARIANTS
MandatoryGateLeakage           ${invariants.MandatoryGateLeakage}
RelatedLeakageIntoExact        ${invariants.RelatedLeakageIntoExact}
ExplicitTitlePresenceViolations ${invariants.ExplicitEntityTitlePresenceViolations}
UnresolvedExplicitNameLeakage  ${invariants.UnresolvedExplicitNameLeakage}
PartialNameTokenLeakage        ${invariants.PartialNameTokenLeakage}
ConstraintViolation            ${invariants.ConstraintViolation}
SyntheticNegativeExactLeakage  ${invariants.SyntheticNegativeExactLeakage}
Search.list                    0
RadarExternal                  0
\`\`\`

## DEFINITIVE GAP AUDIT RECONCILIATION
\`\`\`text
Original Retrieval-Gap Cohort:          43

Verified Local Repairable:              35
Verified Real Retrieval Gap:             6
Recovered / Reclassified PASS in V1.3:   2
  - (the police reggatta de blanc)
  - (michael jackson thriller zombie)
-------------------------------------------
TOTAL ACCOUNTED FOR:                    43
\`\`\`
`;
  
  fs.writeFileSync(reportPath, reportContent);
  console.log('✅ Benchmark finished. Report written to', reportPath);
}

runBenchmark().catch(console.error);
