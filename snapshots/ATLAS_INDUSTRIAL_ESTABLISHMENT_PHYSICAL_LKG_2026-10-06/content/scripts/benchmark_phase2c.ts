import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { ResolvedSearchIntent } from '../src/lib/search/types';

// Let's test a set of Phase 2C queries
const TEST_QUERIES = [
    // --- Exact Works (Expected TP) ---
    { query: "fito paez polaroid de locura ordinaria", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "brillante sobre el mic", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "fito paez velez", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "the beatles making of", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "shakira en vivo", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "coldplay cover", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "charly garcia entrevista", category: "SEMANTIC_REPAIR_EXPECTED" },
    
    // --- Contextual Mentions (Expected TN) ---
    { query: "charly garcia fito paez", category: "SEMANTIC_NEGATIVE" },
    { query: "spinetta cover the beatles", category: "SEMANTIC_NEGATIVE" },
    { query: "entrevista a gustavo cerati", category: "SEMANTIC_NEGATIVE" }, // if we don't have "entrevista" as an exact content_type match for Cerati, this should be rejected or TN
    { query: "the beatles paul mccartney", category: "SEMANTIC_NEGATIVE" },
    { query: "shakira pique", category: "SEMANTIC_NEGATIVE" }
];

async function runBenchmark() {
    console.log(`\n=== V1.4 Phase 2C Benchmark (Cohort 500) ===\n`);
    
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    
    for (const q of TEST_QUERIES) {
        console.log(`\n--- DIAGNOSING: ${q.query} (${q.category}) ---`);
        const searchRes = await executeSearch(q.query, { forceExternal: true });
        const resolvedIntent = searchRes.intentData || exactWorkSearchGate.detectExactWork(q.query);
        const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(resolvedIntent as any, resolvedIntent as any);
        
        let passedGate = false;
        let finalPresent = false;
        let tpfpfntn = '';

        // Check if any results come from SEMANTIC_REPAIR and passed the exact work gate
        const semanticFound = searchRes.all.filter((r: any) => r.retrievalLane === 'SEMANTIC_REPAIR');
        
        if (q.category === 'SEMANTIC_REPAIR_EXPECTED') {
            if (semanticFound.length > 0) {
                const evalRes = exactWorkSearchGate.evaluateMandatoryGates(semanticFound[0], mandatoryGates);
                passedGate = evalRes.passed;
                if (passedGate) {
                    tp++; tpfpfntn = 'TP'; finalPresent = true;
                } else {
                    fn++; tpfpfntn = 'FN (Gate Failed)';
                }
            } else {
                fn++; tpfpfntn = 'FN (Not returned by Engine)';
            }
        } else {
            // Negative queries: we EXPECT them to fail the gate or not be returned
            if (semanticFound.length > 0) {
                const evalRes = exactWorkSearchGate.evaluateMandatoryGates(semanticFound[0], mandatoryGates);
                passedGate = evalRes.passed;
                if (passedGate) {
                    fp++; tpfpfntn = 'FP'; finalPresent = true;
                } else {
                    tn++; tpfpfntn = 'TN (Gate Failed)';
                }
            } else {
                tn++; tpfpfntn = 'TN (Not returned by Engine)';
            }
        }
        
        console.log(`mandatoryGateAccepted: ${passedGate}`);
        console.log(`finalResultPresent: ${finalPresent}`);
        console.log(`TP/FP/FN/TN: ${tpfpfntn}`);
    }
    
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
    
    console.log(`\n=== METRICS ===`);
    console.log(`TP: ${tp}, FP: ${fp}, FN: ${fn}, TN: ${tn}`);
    console.log(`Precision: ${(precision * 100).toFixed(2)}%`);
    console.log(`Recall: ${(recall * 100).toFixed(2)}%`);
    console.log(`FPR: ${(fpr * 100).toFixed(2)}%`);
}

runBenchmark().catch(console.error);
