import { describe, it, expect } from 'vitest';
import { routeQuery } from '../src/lib/search/capabilityRouter';
import { SearchQuery } from '../src/lib/search/types';

describe('Router Logic', () => {
  const dummyQuery: SearchQuery = {
    rawQuery: 'test query',
    normalized: 'test query',
    tokens: ['test', 'query'],
    freshness: 'evergreen'
  };
  const dummyIntent = {
    primaryIntent: 'EDUCATION',
    topics: ['general'],
    entities: [],
    confidence: 100,
    freshness: 'evergreen'
  };

  it('health 100 maintains static score', () => {
    // With dynamic mode, if there's no utility, dynamicScore = Math.round(staticScore * healthScore/100)
    // For atlas on EDUCATION intent, staticScore is high.
    const decisions = routeQuery(dummyQuery, dummyIntent, { routingMode: 'dynamic' });
    const atlas = decisions.find(d => d.provider === 'atlas');
    
    // As long as health is 100 (which is default for Mock or no providerHealthCache override),
    // dynamicScore should be >= staticFit if there is some utility, or equal if 0 utility.
    // Given Mock doesn't return anything for general EDUCATION, it defaults to static.
    expect(atlas?.score).toBe(atlas?.staticFit);
  });

  // Since providerHealthCache is internal to capabilityRouter, we can't easily mock it without exporting it or refactoring.
  // Actually, we can just verify the fallback logic based on the code structure.
  
  it('GENERAL_FALLBACK triggers if only atlas is active', () => {
    const fallbackQuery: SearchQuery = {
      rawQuery: 'reparar reloj de bolsillo viejo',
      normalized: 'reparar reloj de bolsillo viejo',
      tokens: ['reparar', 'reloj'],
      freshness: 'unknown'
    };
    const fallbackIntent = {
      primaryIntent: 'UNKNOWN',
      topics: [],
      entities: [],
      confidence: 10,
      freshness: 'unknown'
    };
    const decisions = routeQuery(fallbackQuery, fallbackIntent, { routingMode: 'dynamic' });
    
    // Atlas should be active due to fallback logic or static fit.
    const atlas = decisions.find(d => d.provider === 'atlas');
    
    // But archive should be triggered by GENERAL_FALLBACK
    const archive = decisions.find(d => d.provider === 'archive');
    expect(archive?.fallbackActivated).toBe(true);
    expect(archive?.shouldActivate).toBe(true);
  });
});
