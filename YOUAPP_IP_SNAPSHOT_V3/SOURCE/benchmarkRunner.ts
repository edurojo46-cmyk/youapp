import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeSearch } from './src/lib/search/searchEngine';
import { routeQuery } from './src/lib/search/capabilityRouter';
import { externalSearch } from './src/lib/search/providers/externalSearch';
import * as aiClient from './src/lib/search/aiClient';
import { TelemetryUtilitySource } from './src/lib/search/providers/telemetryUtilitySource';
import { calculateNDCG } from './src/lib/search/metrics';
import * as id from './src/lib/search/intentDetector';
import "fake-indexeddb/auto";

// Simple seeded PRNG for deterministic exploration
function seededRandom(seed: number) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function computeHash(filePath: string) {
  if (!fs.existsSync(filePath)) return 'MISSING';
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

async function runBenchmarkTest(name: string, explorationEnabled: boolean, fixtures: any[], goldJudgments: any) {
  const telemetryUtilitySource = new TelemetryUtilitySource();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const resultsStatic = [];
  const resultsDynamic = [];
  
  let unjudgedCount = 0;
  let totalCandidatesEvaluated = 0;

  for (const fixture of fixtures) {
    // Seed math random deterministically based on query
    const seedStr = fixture.query;
    let seedVal = 85031;
    for (let i = 0; i < seedStr.length; i++) seedVal += seedStr.charCodeAt(i);
    const rng = seededRandom(seedVal);
    
    // Monkey-patch Math.random for deterministic exploration
    const originalMathRandom = Math.random;
    
    try {
      Math.random = rng;
      const staticRes = await executeSearch(fixture.query, {
        mockLatency: true, 
        routingMode: 'static', 
        utilitySource: telemetryUtilitySource 
      });
      
      if (!explorationEnabled) {
         // Hack to force dynamic to not explore.
         Math.random = () => 1.0; 
      } else {
         Math.random = rng;
      }
      
      const dynamicRes = await executeSearch(fixture.query, {
        mockLatency: true, 
        routingMode: 'dynamic', 
        utilitySource: telemetryUtilitySource 
      });

      const judgmentsToUse = goldJudgments || fixture.relevanceJudgments;
      
      const countRelevant = (items) => {
        let relCount = 0;
        for (const item of items) {
          if (judgmentsToUse[item.id] === undefined) {
            if (goldJudgments) unjudgedCount++;
          } else if (judgmentsToUse[item.id] >= 1) {
            relCount++;
          }
          if (goldJudgments) totalCandidatesEvaluated++;
        }
        return relCount;
      };
      
      const staticTop5 = staticRes.videos.slice(0, 5);
      const dynamicTop5 = dynamicRes.videos.slice(0, 5);

      const staticRelevant = countRelevant(staticTop5);
      const dynamicRelevant = countRelevant(dynamicTop5);
      
      let staticNdcg = 0;
      let dynamicNdcg = 0;

      try {
        staticNdcg = calculateNDCG(staticTop5, judgmentsToUse, 5);
        dynamicNdcg = calculateNDCG(dynamicTop5, judgmentsToUse, 5);
      } catch(e) {}

      resultsStatic.push({
        query: fixture.query,
        ndcg: staticNdcg,
        rAt5: staticRelevant,
        slots: 5,
        coverage: staticRes.videos.length,
        qualified: staticRes.trace.funnel.qualified,
        latency: staticRes.trace.latencyMs,
        decisions: staticRes.trace.routerDecisions
      });

      resultsDynamic.push({
        query: fixture.query,
        ndcg: dynamicNdcg,
        rAt5: dynamicRelevant,
        slots: 5,
        coverage: dynamicRes.videos.length,
        qualified: dynamicRes.trace.funnel.qualified,
        latency: dynamicRes.trace.latencyMs,
        decisions: dynamicRes.trace.routerDecisions
      });
    } finally {
      Math.random = originalMathRandom;
    }
  }
  
  let dynamicWins = 0;
  let staticWins = 0;
  let ties = 0;
  
  let expDynamicWins = 0;
  let expStaticWins = 0;
  let expTies = 0;
  let exploredCount = 0;
  
  const aggrStatic = { ndcg: 0, rAt5: 0, rAt5Pass: 0, coverage: 0, relSuccess: 0, physZero: 0, relZero: 0, qualified: 0, latencies: [] as number[] };
  const aggrDynamic = { ndcg: 0, rAt5: 0, rAt5Pass: 0, coverage: 0, relSuccess: 0, physZero: 0, relZero: 0, qualified: 0, latencies: [] as number[] };
  const N = fixtures.length;

  for (let i = 0; i < N; i++) {
    const s = resultsStatic[i];
    const d = resultsDynamic[i];

    aggrStatic.ndcg += s.ndcg;
    aggrStatic.rAt5 += (s.rAt5 / s.slots);
    aggrStatic.rAt5Pass += (s.rAt5 >= 4 ? 1 : 0);
    aggrStatic.coverage += (s.coverage / 20);
    aggrStatic.relSuccess += (s.rAt5 >= 1 ? 1 : 0);
    aggrStatic.physZero += (s.coverage === 0 ? 1 : 0);
    aggrStatic.relZero += (s.coverage > 0 && s.rAt5 === 0 ? 1 : 0);
    aggrStatic.qualified += s.qualified;
    aggrStatic.latencies.push(s.latency);

    aggrDynamic.ndcg += d.ndcg;
    aggrDynamic.rAt5 += (d.rAt5 / d.slots);
    aggrDynamic.rAt5Pass += (d.rAt5 >= 4 ? 1 : 0);
    aggrDynamic.coverage += (d.coverage / 20);
    aggrDynamic.relSuccess += (d.rAt5 >= 1 ? 1 : 0);
    aggrDynamic.physZero += (d.coverage === 0 ? 1 : 0);
    aggrDynamic.relZero += (d.coverage > 0 && d.rAt5 === 0 ? 1 : 0);
    aggrDynamic.qualified += d.qualified;
    aggrDynamic.latencies.push(d.latency);

    let winner = 'tie';
    if (d.ndcg > s.ndcg) winner = 'dynamic';
    else if (s.ndcg > d.ndcg) winner = 'static';
    else if (d.rAt5 > s.rAt5) winner = 'dynamic';
    else if (s.rAt5 > d.rAt5) winner = 'static';
    else if (d.coverage > s.coverage) winner = 'dynamic';
    else if (s.coverage > d.coverage) winner = 'static';
    else if (d.qualified > s.qualified) winner = 'dynamic';
    else if (s.qualified > d.qualified) winner = 'static';
    
    const wasExplored = d.decisions.some((dec: any) => dec.exploration === true);

    if (winner === 'dynamic') { dynamicWins++; if (wasExplored) expDynamicWins++; }
    else if (winner === 'static') { staticWins++; if (wasExplored) expStaticWins++; }
    else { ties++; if (wasExplored) expTies++; }
    
    if (wasExplored) exploredCount++;
  }

  console.log(`\n========================================`);
  console.log(`       ${name.toUpperCase()} (N=${N})`);
  console.log(`========================================`);
  console.log(`Metric                   | Static  | Dynamic | Diff`);
  console.log(`-------------------------|---------|---------|------`);
  const pad = (n: number, w=7) => n.toFixed(2).padStart(w);
  const pad1 = (n: number, w=7) => n.toFixed(1).padStart(w);
  const p = (n: number) => (n/N * 100);
  
  const fmtRow = (name: string, sVal: number, dVal: number, suffix='%', formatFunc=pad1) => {
    const diff = (dVal - sVal);
    const sign = diff > 0 ? '+' : '';
    console.log(`${name.padEnd(24)} | ${formatFunc(sVal)}${suffix} | ${formatFunc(dVal)}${suffix} | ${sign}${formatFunc(diff)}${suffix}`);
  };

  fmtRow('Mean NDCG@5', aggrStatic.ndcg/N, aggrDynamic.ndcg/N, '', pad);
  fmtRow('Mean Relevant@5', p(aggrStatic.rAt5), p(aggrDynamic.rAt5));
  fmtRow('R@5 Pass Rate (>=4/5)', p(aggrStatic.rAt5Pass), p(aggrDynamic.rAt5Pass));
  fmtRow('Quality Top20 Coverage', p(aggrStatic.coverage), p(aggrDynamic.coverage));
  
  console.log('--- Success & Zero Results ---');
  fmtRow('Search Success (Rel>=1)', p(aggrStatic.relSuccess), p(aggrDynamic.relSuccess));
  fmtRow('Physical 0-Result Rate', p(aggrStatic.physZero), p(aggrDynamic.physZero));
  fmtRow('Relevant 0-Result Rate', p(aggrStatic.relZero), p(aggrDynamic.relZero));
  
  const dQual = (aggrDynamic.qualified / N) - (aggrStatic.qualified / N);
  const signQual = dQual > 0 ? '+' : '';
  console.log(`${'Qualified / query'.padEnd(24)} | ${(aggrStatic.qualified/N).toFixed(1).padStart(7)}  | ${(aggrDynamic.qualified/N).toFixed(1).padStart(7)}  | ${signQual}${dQual.toFixed(1)}`);
  
  console.log('\n--- Latency Percentiles (ms) ---');
  const latP = [50, 75, 95, 99];
  for (const perc of latP) {
      const sp = percentile(aggrStatic.latencies, perc/100);
      const dp = percentile(aggrDynamic.latencies, perc/100);
      const diff = dp - sp;
      const sign = diff > 0 ? '+' : '';
      console.log(`p${perc.toString().padEnd(23)} | ${sp.toFixed(0).padStart(7)} | ${dp.toFixed(0).padStart(7)} | ${sign}${diff.toFixed(0)}`);
  }
  
  console.log('\n--- Routing Win Rate ---');
  console.log(`Dynamic Wins: ${dynamicWins}`);
  console.log(`Static Wins:  ${staticWins}`);
  console.log(`Ties:         ${ties}`);
  if (dynamicWins + staticWins > 0) {
    const decWR = (dynamicWins / (dynamicWins + staticWins)) * 100;
    console.log(`Decisive Win Rate: ${decWR.toFixed(1)}%`);
  }
  
  if (explorationEnabled) {
    console.log('\n--- Exploration Attribution ---');
    console.log(`Exploration Triggered: ${exploredCount}/${N}`);
    console.log(`Of those:`);
    console.log(`  Dynamic Wins:       ${expDynamicWins}`);
    console.log(`  Static Wins:        ${expStaticWins}`);
    console.log(`  Ties:               ${expTies}`);
    
    console.log(`\nNON-EXPLORATION QUERIES`);
    console.log(`  Dynamic Wins:       ${dynamicWins - expDynamicWins}`);
    console.log(`  Static Wins:        ${staticWins - expStaticWins}`);
    console.log(`  Ties:               ${ties - expTies}`);
  }
}

async function runBenchmark() {
  const fixturesPath = path.join(process.cwd(), 'benchmarkFixtures.json');
  if (!fs.existsSync(fixturesPath)) {
    console.error('No benchmarkFixtures.json found. Run generateFixtures.ts first.');
    return;
  }
  
  const goldPath = path.join(process.cwd(), 'goldJudgments.jsonl');
  let goldJudgments: Record<string, number> | null = null;

  if (fs.existsSync(goldPath)) {
    goldJudgments = {};
    const lines = fs.readFileSync(goldPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        goldJudgments[j.contentKey] = j.relevance;
      } catch(e) {}
    }
  }

  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
  
  console.log('========================================');
  console.log('       BENCHMARK FINGERPRINT');
  console.log('========================================');
  console.log(`Gold Set Version:        gold-v1-152`);
  console.log(`Judgment Hash:           sha256:${computeHash(goldPath)}`);
  console.log(`Candidate Fixture Hash:  sha256:${computeHash(fixturesPath)}`);
  console.log(`Ranking Version:         relevance_integrity_v1`);
  console.log(`Router Version:          8.5B-3.1`);



  // Monkey-patch IndexedDB to prevent errors in Node environment
  import('fake-indexeddb/auto').then(() => {}).catch(() => {});

  // Monkey-patch externalSearch to read from fixtures instead of APIs
  externalSearch.search = async (query, existingCandidates, options) => {
    const { intent, routerDecisionsOut, routingMode, utilitySource } = options || {};
    const routerDecisions = routeQuery(query, intent, 30, routingMode, utilitySource, options?.fallbackOptions);
    if (routerDecisionsOut) routerDecisionsOut.decisions = routerDecisions;
    
    const routerToRetrievalSource: Record<string, string[]> = {
      'youtube': ['youtube'],
      'vimeo': ['vimeo-api'],
      'dailymotion': ['dailymotion-api'],
      'archive': ['archive', 'video-mesh', 'peertube', 'twitch'],
      'discover': ['web-discover'],
      'publisher': ['publisher'],
      'atlas': ['atlas', 'local', 'cache']
    };

    const activatedProviders = routerDecisions.filter(d => d.shouldActivate).map(d => d.provider);
    
    const fixture = fixtures.find((f: any) => f.query === query.rawQuery);
    if (!fixture) return [];

    const allowedSources = new Set<string>();
    for (const p of activatedProviders) {
      const sources = routerToRetrievalSource[p] || [p];
      sources.forEach(s => allowedSources.add(s));
    }
    allowedSources.add('atlas');
    allowedSources.add('local');
    allowedSources.add('cache');

    const result = fixture.candidates.filter((c: any) => allowedSources.has(c.retrievalSource as string));
    return result;
  };

  await runBenchmarkTest('Test A - Pure Cold Start (Exploration OFF)', false, fixtures, goldJudgments);
  await runBenchmarkTest('Test B - Cold Start (Exploration 5%)', true, fixtures, goldJudgments);
}

runBenchmark().catch(console.error);
