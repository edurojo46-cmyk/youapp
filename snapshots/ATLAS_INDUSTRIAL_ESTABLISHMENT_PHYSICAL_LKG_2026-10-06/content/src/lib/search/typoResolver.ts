import { CANONICAL_ENTITIES_V2 } from '../atlasBootstrap/entityResolverV2';
import { CANONICAL_WORKS_ONTOLOGY } from './canonicalWorksCatalog';

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function calculateSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

export interface TypoCorrection {
  rawQuery: string;
  normalizedQuery: string;
  corrections: {
    raw: string;
    canonical: string;
    type: 'ENTITY' | 'WORK';
    confidence: number;
  }[];
}

export function resolveTypos(rawQuery: string): TypoCorrection | null {
  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return null;

  const result: TypoCorrection = {
    rawQuery,
    normalizedQuery: rawQuery,
    corrections: []
  };

  // 1. Find best fuzzy entity
  let bestEntityMatch: { entity: string, score: number, rawTokens: string[], startIndex: number } | null = null;
  let secondBestEntityScore = 0;

  for (const entityDef of CANONICAL_ENTITIES_V2) {
    const canonicalName = entityDef.name || entityDef.id;
    const aliases = [canonicalName, ...entityDef.aliases];
    
    for (const alias of aliases) {
      const aliasTokens = tokenize(alias);
      if (aliasTokens.length === 0) continue;
      
      for (let i = 0; i <= tokens.length - aliasTokens.length; i++) {
        const querySlice = tokens.slice(i, i + aliasTokens.length);
        const queryStr = querySlice.join(' ');
        const aliasStr = aliasTokens.join(' ');
        
        const score = calculateSimilarity(queryStr, aliasStr);
        if (score > (bestEntityMatch?.score || 0)) {
          if (canonicalName !== bestEntityMatch?.entity) {
            secondBestEntityScore = bestEntityMatch?.score || 0;
          }
          bestEntityMatch = {
            entity: canonicalName,
            score,
            rawTokens: querySlice,
            startIndex: i
          };
        } else if (score > secondBestEntityScore && score !== bestEntityMatch?.score && canonicalName !== bestEntityMatch?.entity) {
          secondBestEntityScore = score;
        }
      }
    }
  }

  const AMBIGUITY_MARGIN = 0.15;
  const CONFIDENCE_THRESHOLD = 0.75;

  let correctedQuery = rawQuery;

  if (bestEntityMatch && bestEntityMatch.score >= CONFIDENCE_THRESHOLD && (bestEntityMatch.score - secondBestEntityScore) >= AMBIGUITY_MARGIN) {
    const rawMatchedString = bestEntityMatch.rawTokens.join(' ');
    result.corrections.push({
      raw: rawMatchedString,
      canonical: bestEntityMatch.entity,
      type: 'ENTITY',
      confidence: bestEntityMatch.score
    });

    const re = new RegExp(bestEntityMatch.rawTokens.join('\\s*'), 'i');
    correctedQuery = correctedQuery.replace(re, bestEntityMatch.entity);

    // 2. Find best fuzzy work for THIS entity
    const remainingTokens = [...tokens];
    remainingTokens.splice(bestEntityMatch.startIndex, bestEntityMatch.rawTokens.length);
    
    if (remainingTokens.length > 0) {
      let bestWorkMatch: { work: string, score: number, rawTokens: string[] } | null = null;
      let secondBestWorkScore = 0;

      const entityWorks = CANONICAL_WORKS_ONTOLOGY.filter(w => w.artist === bestEntityMatch!.entity);
      
      for (const workDef of entityWorks) {
        const aliases = [workDef.canonicalTitle, ...workDef.aliases];
        
        for (const alias of aliases) {
          const aliasTokens = tokenize(alias);
          if (aliasTokens.length === 0) continue;
          
          // Try matching exact lengths first, but also allow smaller slices if needed.
          // For simplicity, we match the exact token length of the alias.
          // If the typo merged tokens (e.g. boemian rapsody vs bohemian rhapsody, length is 2 vs 2), it works.
          for (let i = 0; i <= remainingTokens.length - aliasTokens.length; i++) {
            const querySlice = remainingTokens.slice(i, i + aliasTokens.length);
            const queryStr = querySlice.join(' ');
            const aliasStr = aliasTokens.join(' ');
            
            const score = calculateSimilarity(queryStr, aliasStr);
            if (score > (bestWorkMatch?.score || 0)) {
              if (workDef.canonicalTitle !== bestWorkMatch?.work) {
                secondBestWorkScore = bestWorkMatch?.score || 0;
              }
              bestWorkMatch = {
                work: workDef.canonicalTitle,
                score,
                rawTokens: querySlice
              };
            } else if (score > secondBestWorkScore && score !== bestWorkMatch?.score && workDef.canonicalTitle !== bestWorkMatch?.work) {
              secondBestWorkScore = score;
            }
          }
        }
      }

      if (bestWorkMatch && bestWorkMatch.score >= CONFIDENCE_THRESHOLD && (bestWorkMatch.score - secondBestWorkScore) >= AMBIGUITY_MARGIN) {
        result.corrections.push({
          raw: bestWorkMatch.rawTokens.join(' '),
          canonical: bestWorkMatch.work,
          type: 'WORK',
          confidence: bestWorkMatch.score
        });

        const reWork = new RegExp(bestWorkMatch.rawTokens.join('\\s*'), 'i');
        correctedQuery = correctedQuery.replace(reWork, bestWorkMatch.work);
      }
    }
  }

  result.normalizedQuery = correctedQuery;
  
  if (result.corrections.length > 0) {
    return result;
  }

  return null;
}
