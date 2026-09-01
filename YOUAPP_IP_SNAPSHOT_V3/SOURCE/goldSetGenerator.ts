import { executeSearch } from './src/lib/search/searchEngine';
import { externalSearch } from './src/lib/search/providers/externalSearch';
import { routeQuery } from './src/lib/search/capabilityRouter';
import fs from 'fs';
import path from 'path';
import { ContentItem } from './src/lib/search/types';

async function generateGoldSet() {
  const fixturesPath = path.join(process.cwd(), 'benchmarkFixtures.json');
  if (!fs.existsSync(fixturesPath)) {
    console.error('No se encontró benchmarkFixtures.json. Ejecuta generateFixtures.ts primero.');
    return;
  }
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
  console.log(`Generando pool ciego a partir de ${fixtures.length} fixtures sin usar red...`);

  // Monkey-patch externalSearch to read from fixtures instead of APIs
  externalSearch.search = async (query, existingCandidates, signal, intent, providerStatuses, routerDecisionsOut, routingMode, utilitySource) => {
    const routerDecisions = routeQuery(query, intent, 30, routingMode, utilitySource);
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
    
    const fixture = fixtures.find(f => f.query === query.rawQuery);
    if (!fixture) return [];

    const allowedSources = new Set<string>();
    for (const p of activatedProviders) {
      const sources = routerToRetrievalSource[p] || [p];
      sources.forEach(s => allowedSources.add(s));
    }
    allowedSources.add('atlas');
    allowedSources.add('local');
    allowedSources.add('cache');

    const result = fixture.candidates.filter(c => allowedSources.has(c.retrievalSource as string));
    return result;
  };
  
  const poolData = [];
  
  for (const fixture of fixtures) {
    const q = fixture.query;
    console.log(`Evaluando: "${q}"...`);
    
    // 1. Run Static
    const staticRes = await executeSearch(q, { forceExternal: true, routingMode: 'static', fixtureData: fixture });
    
    // 2. Run Dynamic
    const dynamicRes = await executeSearch(q, { forceExternal: true, routingMode: 'dynamic', fixtureData: fixture });
    
    // 3. Union & Dedup
    const candidateMap = new Map<string, any>();
    
    // Helper to strip sensitive info
    const addCandidate = (item: ContentItem) => {
      if (!candidateMap.has(item.id)) {
        // Blind the candidate
        candidateMap.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          date: item.publishDate || 'Sin fecha',
          duration: item.duration,
          thumbnail: item.thumbnail
        });
      }
    };
    
    staticRes.all.forEach(addCandidate);
    dynamicRes.all.forEach(addCandidate);
    
    // 4. Randomize order
    const blindedCandidates = Array.from(candidateMap.values());
    for (let i = blindedCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [blindedCandidates[i], blindedCandidates[j]] = [blindedCandidates[j], blindedCandidates[i]];
    }
    
    poolData.push({
      queryId: fixture.query,
      query: fixture.query,
      candidates: blindedCandidates
    });
    
    // Pausa
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const finalData = {
    version: "gold-v1-152",
    pool: poolData
  };
  
  const outputPath = path.join(process.cwd(), 'unlabelledCandidates.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2), 'utf-8');
  console.log(`Pool generado ciego y randomizado en ${outputPath}`);
}

generateGoldSet().catch(console.error);
