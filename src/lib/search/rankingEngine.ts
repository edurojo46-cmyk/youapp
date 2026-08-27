import type { ContentItem, SearchQuery } from './types';

export function calculateRelevanceAndYouScore(items: ContentItem[], query: SearchQuery): ContentItem[] {
  return items.map(v => {
    let relevanceScore = 50; // Base score
    
    const title = v.title.toLowerCase();
    const desc = (v.description || '').toLowerCase();
    const qLower = query.normalizedQuery;
    
    // Coincidencia semántica simple
    if (title.includes(qLower)) relevanceScore += 30;
    else if (desc.includes(qLower)) relevanceScore += 15;
    
    // Bonus por coincidencia exacta
    if (title === qLower) relevanceScore += 20;

    if (relevanceScore > 100) relevanceScore = 100;
    
    // YouScore es la combinación de Quality y Relevance
    // Aquí el confidence no domina el ranking todavía (MVP).
    const qualityScore = v.qualityScore || 50;
    const youScore = (qualityScore * 0.4) + (relevanceScore * 0.6);

    return {
      ...v,
      relevanceScore,
      youScore,
      rankingVersion: 'you-score-v1'
    };
  });
}
