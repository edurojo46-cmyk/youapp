import { executeSearch } from '../search/searchEngine';
import type { CustomSignal, ScheduleBlock } from './signalTypes';
import { analyzeQuery } from '../search/intentDetector';

export async function generateSurpriseBlock(signal: CustomSignal, position: number): Promise<ScheduleBlock | null> {
  // Extract topics to form context
  const topics = signal.schedule.map(b => b.topic);
  const uniqueTopics = Array.from(new Set(topics));
  const contextQuery = uniqueTopics.join(' ');
  
  try {
    const intent = analyzeQuery(contextQuery);
    
    // We execute a dynamic search with heavy exploration weight to find something lateral
    const resultsResponse = await executeSearch('sorprendeme', {
      routingMode: 'dynamic'
    });
    const results = resultsResponse.all;
    
    // Filter out already used channels or too low quality
    const usedCreators = new Set(signal.schedule.map(b => b.contentItem.channelTitle || (b.contentItem as any).channelName || ''));
    
    // Quality & Diversity Gate (Phase 4B)
    const validCandidates = results.filter(r => {
      // Quality >= 60, Relevance >= 40 (Strict gate for surprise)
      if ((r.qualityScore || 100) < 60) return false;
      if ((r.relevanceScore || 0) < 40) return false;
      
      // Must not be from a creator already heavily dominating this signal
      if (usedCreators.has(r.channelTitle || (r as any).channelName || '')) return false;
      return true;
    });
    
    if (validCandidates.length === 0) return null;
    
    // Pick the best one
    const chosen = validCandidates[0];
    
    return {
      id: `surprise-${Date.now()}`,
      position: position, // will be recalculated by store
      startOffsetSec: 0,
      durationSec: chosen.durationSeconds || ((chosen as any).durationMs ? (chosen as any).durationMs / 1000 : 600),
      contentItem: chosen,
      topic: 'descubrimiento',
      role: 'discovery',
      generationReason: {
        topic: 'descubrimiento',
        reason: 'surprise_exploration',
        relevance: chosen.relevanceScore || 50,
        diversityBoost: 100
      }
    };
  } catch (err) {
    console.error('[SurpriseGenerator] Error fetching surprise block', err);
    return null;
  }
}
