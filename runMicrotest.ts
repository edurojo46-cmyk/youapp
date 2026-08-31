import { TEST_QUERIES, runSearchTest } from './src/lib/search/searchTestRunner';

async function main() {
  console.log("=== Ejecutando Microtest Stage 8.5A ===\n");
  const { results } = await runSearchTest(TEST_QUERIES, () => {}, undefined, 1, 'shadow');
  
  for (const r of results) {
    console.log(`\nQuery: ${r.query}`);
    console.log(`Temporal Intent: ${r.temporalIntent || 'UNKNOWN'} (Primary: ${r.detectedIntent || 'UNKNOWN'})`);
    if (r.funnel) {
      console.log(`Raw: ${r.funnel.raw}`);
      console.log(`Dedup: ${r.funnel.dedup}`);
      console.log(`Quality Drop: ${r.funnel.qualityDrop}`);
      console.log(`Relevance Drop: ${r.funnel.relevanceDrop}`);
      console.log(`Qualified: ${r.funnel.qualified}`);
      console.log(`Final: ${r.funnel.final}`);
    }
    console.log(`Coverage: ${r.qualityTop20Coverage}%`);
    console.log(`Relevant@5: ${r.relevantAt5}/5`);
    console.log(`Latency: ${r.latencyMs}ms`);
    
    console.log("\nTop 5 (Videos):");
    if (r.top5 && r.top5.length > 0) {
      r.top5.forEach((c: any, i: number) => {
        console.log(`  [${i + 1}] ${c.title?.substring(0, 50)}...`);
        console.log(`      Quality: ${c.qualityScore} | Relevance: ${c.relevanceScore}`);
        if (c.rankingBreakdown) {
          console.log(`      Breakdown: Semantic=${c.rankingBreakdown.semantic}, Title=${c.rankingBreakdown.title}, Topic=${c.rankingBreakdown.topic}, Entity=${c.rankingBreakdown.entityCentrality}, Intent=${c.rankingBreakdown.intent}, Temporal=${c.rankingBreakdown.temporal}`);
        }
        if (c.temporalReason) {
          console.log(`      Temporal Reason: ${c.temporalReason}`);
        }
      });
    } else {
      console.log("  (Sin resultados)");
    }

    if (r.newsContext && r.newsContext.length > 0) {
      console.log("\nNews Context (Articles):");
      r.newsContext.forEach((c: any, i: number) => {
        console.log(`  [${i + 1}] ${c.title?.substring(0, 50)}...`);
        console.log(`      Quality: ${c.qualityScore} | Relevance: ${c.relevanceScore}`);
        if (c.rankingBreakdown) {
          console.log(`      Breakdown: Semantic=${c.rankingBreakdown.semantic}, Title=${c.rankingBreakdown.title}, Topic=${c.rankingBreakdown.topic}, Entity=${c.rankingBreakdown.entityCentrality}, Intent=${c.rankingBreakdown.intent}, Temporal=${c.rankingBreakdown.temporal}`);
        }
      });
    }
    
    console.log("-".repeat(50));
  }
}

main().catch(console.error);
