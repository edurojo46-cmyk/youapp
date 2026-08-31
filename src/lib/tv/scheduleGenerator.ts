import { parseSignalPrompt } from './signalUnderstanding';
import { optimizeSchedule } from './scheduleOptimizer';
import { executeSearch } from '../search/searchEngine';
import type { ScheduleBlock, CustomSignal } from './signalTypes';
import type { ContentItem } from '../search/types';
import { evaluateCoverage, chooseRadarQuery } from './radarPlanner';
import { calculateBaseRanking } from '../search/rankingEngine';

export async function generateSchedule(prompt: string, options?: { trafficClass?: 'organic' | 'benchmark' | 'synthetic' }): Promise<CustomSignal> {
  const request = parseSignalPrompt(prompt);
  
  let candidatePool: { item: ContentItem, topic: string }[] = [];
  let successCount = 0;
  
  // 1. MESH SEARCH (NO YOUTUBE)
  for (const sq of request.subQueries) {
    try {
      let resultsResponse = await executeSearch(sq.query, {
        routingMode: 'dynamic',
        trafficClass: options?.trafficClass || 'organic',
        excludeProviders: ['youtube'],
        queryContext: {
          source: 'tv_signal',
          parentTopic: request.mainTopic,
          intentHint: sq.intentHint,
          needsDocumentary: sq.needsDocumentary,
          entities: sq.entities
        }
      });
      
      let results = resultsResponse.videos || resultsResponse.all.filter(c => c.type !== 'article');
      
      if (results.length > 0) {
        successCount++;
        results.forEach(item => {
          candidatePool.push({ item, topic: sq.query });
        });
      }
    } catch (err: any) {
      console.error(`[ScheduleGenerator] Mesh failed to fetch topic: ${sq.query}`, err);
    }
  }
  
  // 2. COVERAGE ANALYSIS
  const coverage = evaluateCoverage(request, candidatePool.map(c => c.item));
  console.log(`[ScheduleGenerator] Coverage Analysis:`, coverage);
  
  // 3. RADAR PLANNER (MAX 1 YOUTUBE SEARCH)
  const isMeshSufficient = coverage.semanticCoverage >= 80 && coverage.durationCoverage >= 80 && coverage.mainTopicCovered;
  
  if (!isMeshSufficient) {
    const radarPlan = chooseRadarQuery(request, coverage);
    console.log(`[ScheduleGenerator] Radar Planner triggered: "${radarPlan.query}" (Reason: ${radarPlan.reason})`);
    
    try {
      let resultsResponse = await executeSearch(radarPlan.query, {
        routingMode: 'dynamic',
        trafficClass: options?.trafficClass || 'organic',
        forceProviders: ['youtube'],
        queryContext: {
          source: 'tv_signal',
          parentTopic: request.mainTopic,
          // Extract all unique entities from all subQueries
          entities: Array.from(new Map(
            request.subQueries.flatMap(sq => sq.entities || []).map(e => [e.canonical, e])
          ).values())
        }
      });
      
      let results = resultsResponse.videos || resultsResponse.all.filter(c => c.type !== 'article');
      
      // 4. BLOCK AFFINITY: Distribución inteligente al pool global
      for (const item of results) {
        let bestTopic = request.subQueries[0]?.query || request.mainTopic;
        let bestScore = -1;
        
        for (const sq of request.subQueries) {
          const sqQuery = { rawQuery: sq.query, normalizedQuery: sq.query.toLowerCase(), terms: sq.query.split(' ') } as any;
          const sqIntent = { 
            topics: [request.mainTopic, sq.query], 
            entities: sq.entities || [],
            primaryIntent: sq.intentHint || 'HISTORY' 
          } as any;
          
          const clonedItem = { ...item };
          const ranked = calculateBaseRanking([clonedItem], sqQuery, sqIntent);
          const score = ranked[0].relevanceScore || 0;
          
          if (score > bestScore) {
            bestScore = score;
            bestTopic = sq.query;
          }
        }
        
        // Asignar al mejor topic si superó el umbral
        if (bestScore >= 40) {
          item.relevanceScore = bestScore;
          candidatePool.push({ item, topic: bestTopic });
        }
      }
    } catch (err) {
      console.error(`[ScheduleGenerator] Radar failed:`, err);
    }
  } else {
    console.log(`[ScheduleGenerator] Radar skipped! Mesh coverage is sufficient.`);
  }

  if (candidatePool.length === 0) {
     throw new Error("No encontré contenido de calidad para tu señal.");
  }
  
  // 5. Shuffle pool slightly for diversity before optimization
  candidatePool = candidatePool.sort(() => Math.random() - 0.5);
  
  // 6. Schedule Optimizer
  const schedule = optimizeSchedule(candidatePool, {
    durationTargetMin: request.durationTargetMin
  });
  
  if (schedule.length === 0) {
     throw new Error("No pude generar una programación válida con los resultados encontrados.");
  }
  
  // 7. Build and return the signal
  const signal: CustomSignal = {
    id: crypto.randomUUID(),
    name: request.mainTopic || prompt.substring(0, 50),
    prompt: request.originalPrompt,
    visibility: 'private',
    duration_target: request.durationTargetMin,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    schedule,
    // Add radarConsumed for invariant tracking
    radarConsumed: isMeshSufficient ? 0 : 1,
    independentSemanticCoverage: coverage.semanticCoverage,
    understandingRequest: request as any
  };
  
  return signal;
}
