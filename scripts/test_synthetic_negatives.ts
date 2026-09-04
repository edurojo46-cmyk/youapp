import { executeSearch } from '../src/lib/search/searchEngine';
import { analyzeQuery } from '../src/lib/search/intentDetector';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

async function run() {
  const queries = [
    "the rolling stones reggaeton en marte",
    "osvaldo pugliese trap session",
    "mozart cumbia villera",
    "charly garcia kpop",
    "metallica cantando la yumba"
  ];

  for (const q of queries) {
    console.log(`\n\n--- TESTING: ${q} ---`);
    const searchRes = await executeSearch(q, {
      readOnlyBenchmark: true,
      trafficClass: 'benchmark',
      routingMode: 'static'
    });

    const top5 = searchRes.videos.slice(0, 5);
    const top5ExactList = top5.filter((r: any) => r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || r.semanticMatch?.isEntityTopic || r.isEntityTopic);
    
    if (top5ExactList.length > 0) {
      console.log(`LEAKAGE DETECTED in '${q}'! Returned ${top5ExactList.length} exact results:`);
      
      const intentData = analyzeQuery(q);
      const detection = exactWorkSearchGate.detectExactWork(q, intentData);
      const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(detection, detection as any);
      
      console.log("Detection:", JSON.stringify(detection, null, 2));
      console.log("Gates:", JSON.stringify(mandatoryGates, null, 2));
      
      for (const res of top5ExactList) {
         console.log(`\nResult ID: ${res.id}`);
         console.log(`Title: ${res.title}`);
         const evalRes = exactWorkSearchGate.evaluateMandatoryGates(res, mandatoryGates);
         console.log("Gate Eval:", JSON.stringify(evalRes, null, 2));
      }
    } else {
      console.log(`PASS (No exact leaks for '${q}')`);
    }
  }
}

run().catch(console.error);
