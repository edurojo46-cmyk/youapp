import fs from 'fs';
import path from 'path';
import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { supabase } from '../src/lib/supabase';
import crypto from 'crypto';

interface GoldenQuery {
  category: string;
  query: string;
  expected: {
    entity?: string;
    object?: string;
    acceptableRoles?: string[];
    constraint?: string;
    venue?: string;
    contentType?: string;
    isGap?: boolean;
  };
}

async function runBenchmark() {
  const queriesFile = path.join(process.cwd(), 'scripts', 'golden_queries_v1.json');
  const queries: GoldenQuery[] = JSON.parse(fs.readFileSync(queriesFile, 'utf8'));

  const metrics = {
    hardInvariants: {
      totalEntityDetections: 0,
      explicitEntityMustPersistErrors: 0,
      totalReturnedExact: 0,
      mandatoryGateLeakageCount: 0,
      relatedLeakageCount: 0,
      constraintViolationsTop5: 0,
      searchListCalls: 0,
      radarCalls: 0
    },
    quality: {
      totalQueries: queries.length,
      intentAccuracyCount: 0,
      
      gatePass1: 0, gatePass3: 0, gatePass5: 0,
      exact1: 0, exact3: 0, exact5: 0,
      
      wrongEntity5: 0,
      wrongWork5: 0,
      
      playable10: 0,
      playable10Total: 0,
      
      duplicateRecording10: 0,
      primaryWorkFP10: 0,
      
      zeroResultCorrectnessTotal: 0,
      zeroResultCorrectnessPassed: 0
    },
    categoryStats: {} as Record<string, any>,
    failures: [] as any[]
  };

  const resultsByQuery = [];

  console.log(`Starting Search Quality Benchmark V1...`);
  
  let i = 0;
  for (const q of queries) {
    i++;
    console.log(`[${i}/${queries.length}] Executing: "${q.query}"`);
    
    // STRICT READ-ONLY MODE
    const response = await executeSearch(q.query, {
      forceExternal: false,
      bypassAtlas: false,
      routingMode: 'shadow',
      readOnlyBenchmark: true
    });
    
    const trace = response.trace;
    const results = response.all || response.results || [];
    const detection = exactWorkSearchGate.detectExactWork(q.query);
    const gates = exactWorkSearchGate.buildMandatoryGates(detection, exactWorkSearchGate.fromResolvedIntent(detection));

    // Hard Invariants
    const entity = detection.canonicalEntity;
    const conf = detection.entityConfidence || 0;
    if (entity && conf >= 0.85) {
      metrics.hardInvariants.totalEntityDetections++;
      if (!gates.entity?.required) {
        metrics.hardInvariants.explicitEntityMustPersistErrors++;
      }
    }
    
    metrics.hardInvariants.searchListCalls += (trace.acquisitionStats?.other || 0); // approx
    metrics.hardInvariants.radarCalls += (trace.acquisitionStats?.radar || 0);

    let queryWrongEntity5 = 0;
    let queryWrongWork5 = 0;
    let queryConstraintViolations5 = 0;
    
    let gatePass1 = 0, gatePass3 = 0, gatePass5 = 0;
    let exact1 = 0, exact3 = 0, exact5 = 0;

    let recordingsIn10 = new Set<string>();

    for (let k = 0; k < results.length; k++) {
      const c = results[k];
      
      // Mandatory Gate Leakage
      const evalRes = exactWorkSearchGate.evaluateMandatoryGates(c, gates);
      if (!evalRes.passed) {
        metrics.hardInvariants.mandatoryGateLeakageCount++;
        if (k < 5 && evalRes.reason === 'constraintViolation') {
          queryConstraintViolations5++;
        }
      }
      
      // Related Leakage Into Exact
      if (c.semanticMatch?.entityIdentityMatch === false && c.semanticMatch?.relationshipScore && c.semanticMatch.relationshipScore > 0) {
         metrics.hardInvariants.relatedLeakageCount++;
      }

      const isExact = (
         evalRes.passed &&
         (!q.expected.acceptableRoles || (c.semanticMatch?.contentRole && q.expected.acceptableRoles.includes(c.semanticMatch.contentRole))) &&
         (!q.expected.entity || (c.artistFidelityScore || 0) >= 85) &&
         (!q.expected.object || (c.workFidelityScore || 0) >= 75 || (c.titleFidelityScore || 0) >= 75)
      );

      if (k === 0) {
        if (evalRes.passed) gatePass1++;
        if (isExact) exact1++;
      }
      if (k < 3) {
        if (evalRes.passed) gatePass3++;
        if (isExact) exact3++;
      }
      if (k < 5) {
        if (evalRes.passed) gatePass5++;
        if (isExact) exact5++;
        
        if (q.expected.entity && (c.artistFidelityScore || 0) < 85) queryWrongEntity5++;
        if (q.expected.object && (c.workFidelityScore || 0) < 75 && (c.titleFidelityScore || 0) < 75) queryWrongWork5++;
      }
      if (k < 10) {
        metrics.quality.playable10Total++;
        if (c.contentState === 'vod' || c.contentState === 'live' || c.isLive) {
          metrics.quality.playable10++;
        }
        
        if (c.semanticMatch?.recordingId) {
          if (recordingsIn10.has(c.semanticMatch.recordingId)) {
            metrics.quality.duplicateRecording10++;
          } else {
            recordingsIn10.add(c.semanticMatch.recordingId);
          }
        }
        
        if (c.semanticMatch?.contentRole === 'PRIMARY_WORK' && (c.semanticMatch?.primaryWorkConfidence || 0) < 0.80) {
          metrics.quality.primaryWorkFP10++;
        }
      }
    }

    metrics.hardInvariants.totalReturnedExact += results.length;
    metrics.hardInvariants.constraintViolationsTop5 += queryConstraintViolations5;
    
    metrics.quality.gatePass1 += (results.length >= 1 ? gatePass1 : 0);
    metrics.quality.gatePass3 += gatePass3;
    metrics.quality.gatePass5 += gatePass5;
    
    metrics.quality.exact1 += exact1;
    metrics.quality.exact3 += exact3;
    metrics.quality.exact5 += exact5;
    
    metrics.quality.wrongEntity5 += queryWrongEntity5;
    metrics.quality.wrongWork5 += queryWrongWork5;

    let isIntentAccurate = false;
    if (q.expected.entity && gates.entity?.canonicalName?.toLowerCase() === q.expected.entity.toLowerCase()) {
      isIntentAccurate = true;
    }
    if (q.expected.isGap) isIntentAccurate = true;
    if (isIntentAccurate) metrics.quality.intentAccuracyCount++;

    if (q.expected.isGap) {
      metrics.quality.zeroResultCorrectnessTotal++;
      if (results.length === 0) metrics.quality.zeroResultCorrectnessPassed++;
      else {
        metrics.failures.push({
          query: q.query,
          error: 'ZeroResultCorrectness failed (returned results for gap query)',
          resultsCount: results.length
        });
      }
    }
    
    if (!metrics.categoryStats[q.category]) metrics.categoryStats[q.category] = { q:0, exact1: 0, wrongEntity5: 0, wrongWork5: 0 };
    metrics.categoryStats[q.category].q++;
    metrics.categoryStats[q.category].exact1 += exact1;
    metrics.categoryStats[q.category].wrongEntity5 += queryWrongEntity5;
    metrics.categoryStats[q.category].wrongWork5 += queryWrongWork5;
  }

  // Create Artifact
  const md = `
# SEARCH_QUALITY_BASELINE_V1_30

**Date:** ${new Date().toISOString()}
**Environment:** READ-ONLY BENCHMARK (No Discovery AI, No Atlas Mutation, No Cache Save)

## HARD INVARIANTS
*Must be 100% or 0.*

- **ExplicitEntityMustPersist:** ${metrics.hardInvariants.explicitEntityMustPersistErrors === 0 ? 'PASS (100%)' : 'FAIL'}
- **MandatoryGateLeakage:** ${metrics.hardInvariants.mandatoryGateLeakageCount === 0 ? 'PASS (0 leaks)' : 'FAIL (' + metrics.hardInvariants.mandatoryGateLeakageCount + ' leaks)'}
- **RelatedLeakageIntoExact:** ${metrics.hardInvariants.relatedLeakageCount === 0 ? 'PASS (0 leaks)' : 'FAIL (' + metrics.hardInvariants.relatedLeakageCount + ' leaks)'}
- **ConstraintViolation@5:** ${metrics.hardInvariants.constraintViolationsTop5}
- **Search.list calls:** ${metrics.hardInvariants.searchListCalls}
- **Radar calls:** ${metrics.hardInvariants.radarCalls}

## QUALITY METRICS
- **IntentAccuracy:** ${((metrics.quality.intentAccuracyCount / queries.length) * 100).toFixed(1)}%
- **GatePass@1:** ${metrics.quality.gatePass1} / ${queries.length - metrics.quality.zeroResultCorrectnessTotal}
- **Exact@1:** ${metrics.quality.exact1} / ${queries.length - metrics.quality.zeroResultCorrectnessTotal}
- **Exact@3:** ${metrics.quality.exact3}
- **Exact@5:** ${metrics.quality.exact5}
- **WrongEntity@5:** ${metrics.quality.wrongEntity5} total
- **WrongWork@5:** ${metrics.quality.wrongWork5} total
- **PlayableState@10:** ${metrics.quality.playable10Total > 0 ? ((metrics.quality.playable10 / metrics.quality.playable10Total) * 100).toFixed(1) : '0'}%
- **DuplicateRecording@10:** ${metrics.quality.duplicateRecording10}
- **PrimaryWorkFalsePositive@10:** ${metrics.quality.primaryWorkFP10}
- **ZeroResultCorrectness:** ${metrics.quality.zeroResultCorrectnessPassed} / ${metrics.quality.zeroResultCorrectnessTotal}

## CATEGORY BREAKDOWN

| Category | Queries | Exact@1 | WrongEntity@5 | WrongWork@5 |
|----------|---------|---------|---------------|-------------|
${Object.keys(metrics.categoryStats).map(c => 
  '| ' + c + ' | ' + metrics.categoryStats[c].q + ' | ' + metrics.categoryStats[c].exact1 + ' | ' + metrics.categoryStats[c].wrongEntity5 + ' | ' + metrics.categoryStats[c].wrongWork5 + ' |'
).join('\\n')}

## FAILURES & INSIGHTS
${metrics.failures.length === 0 ? 'No critical gap failures.' : metrics.failures.map(f => '- **' + f.query + '**: ' + f.error + ' (' + f.resultsCount + ' results)').join('\\n')}
`;

  const reportPath = path.resolve('c:/Users/Eduardo/.gemini/antigravity-ide/brain/a1c5284f-3194-48ca-b85b-b39604695364', 'SEARCH_QUALITY_BASELINE_V1_1_30.md');
  const reportLines = [
    `# SEARCH_QUALITY_BASELINE_V1_1_30`, md];
  fs.writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`\nBenchmark completed. Report saved to ${reportPath}`);
}

runBenchmark().catch(console.error);
