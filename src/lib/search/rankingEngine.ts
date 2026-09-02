import type { ContentItem, SearchQuery } from './types';
import type { QueryUnderstanding } from './intentDetector';

function calculateEntityCentrality(item: ContentItem, entities: any[], intentData?: QueryUnderstanding): number {
  if (!entities || entities.length === 0) return 0;
  
  // Deterministic V1 heuristic (0-100 max)
  let centrality = 0;
  const titleLower = item.title.toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const channelLower = (item.channelTitle || '').toLowerCase();
  
  for (const entityObj of entities) {
    const e = typeof entityObj === 'string'
      ? entityObj.toLowerCase()
      : (entityObj.name || entityObj.canonical || '').toLowerCase();
    
    if (!e) continue;
    
    // exact entity in title
    if (titleLower === e) {
      centrality += 35;
    } else if (titleLower.includes(e)) {
      // entity occupies much of title (>50% length)
      if (e.length > titleLower.length * 0.5) centrality += 15;
      
      // entity appears early in title (first 15 chars)
      if (titleLower.indexOf(e) <= 15) centrality += 10;
      
      // general mention in title
      centrality += 20; 
    }
    
    // repeated in description
    const descMatches = (descLower.match(new RegExp(e, 'g')) || []).length;
    if (descMatches > 1) centrality += 5;
    
    // creator/account matches entity
    if (channelLower.includes(e)) centrality += 20;
    
    // Atlas primary entity matching would go here (mocking +25 if source=atlas and title has it)
    if (item.retrievalSource === 'atlas' && titleLower.includes(e)) {
       centrality += 25;
    }
    
    // Entity in primary topic
    if (intentData?.topics?.some(t => t.toLowerCase().includes(e) || e.includes(t.toLowerCase().split('/')[0].trim()))) {
       centrality += 15;
    }
  }

  // Peripheral/context-only mention penalty
  if (titleLower.includes('+') || titleLower.includes('vs') || titleLower.split(',').length > 3) {
    // If it's a list of many things, it's less central
    if (!titleLower.startsWith((entities[0].name || entities[0].canonical || '').toLowerCase())) {
      centrality -= 20;
    }
  }
  
  // Many unrelated entities penalty
  if (entities.length > 2) {
    centrality -= 10;
  }

  return Math.max(0, Math.min(100, centrality));
}

export function calculateBaseRanking(items: ContentItem[], query: SearchQuery, intentData?: QueryUnderstanding): ContentItem[] {
  const qLower = query.normalizedQuery;
  
  return items.map(v => {
    // Normalize accents for matching
    const titleLower = v.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const descLower = (v.description || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // Quality Score calculation is separated (already calculated in Quality Engine, but default 50)
    const qualityScore = v.qualityScore || 50;

    // --- RELEVANCE SCORE CALCULATION ---
    let semanticSimilarity = 0;
    // Strip punctuation for better token matching
    const qClean = qLower.replace(/[.,:;!?()"']/g, '');
    const qTokens = qClean.split(/\s+/).filter(t => t.length > 2);
    const matchesTitle = qTokens.filter(t => titleLower.includes(t)).length;
    const matchesDesc = qTokens.filter(t => descLower.includes(t)).length;
    
    // Canonical Title Match (e.g. "Alike short film" -> core "alike", "Alike (2016)" -> canonical "alike")
    const formatRegex = /\b(short\s*film|cortometraje|corto|short|pelicula|movie|film|video|clip|full|completo|hd|4k|oficial|official)\b/gi;
    const queryCoreTitle = qClean.replace(formatRegex, '').trim().toLowerCase();
    const candidateCanonicalTitle = titleLower.replace(/\s*\(\d{4}\)|\s*\[\d{4}\]|\s*-\s*\d{4}/g, '').replace(/[.,:;!?()"']/g, '').trim();

    const isExactCanonicalMatch = queryCoreTitle.length >= 3 && (
      queryCoreTitle === candidateCanonicalTitle ||
      candidateCanonicalTitle.startsWith(queryCoreTitle) ||
      candidateCanonicalTitle === qClean
    );

    // Concept & Modifier Separation (e.g. "master teologia de la liberacion")
    const modifierRegex = /\b(master|máster|curso|clase|clases|seminario|diplomado|taller|tutorial|estudio|leccion|lecciones|charla|guia|manual|intro|introduccion)\b/gi;
    const coreSubjectTokens = qClean.replace(modifierRegex, ' ').split(/\s+/).filter(t => t.length > 2);
    const hasCoreSubject = coreSubjectTokens.length >= 2;

    const matchesCoreTitle = coreSubjectTokens.filter(t => titleLower.includes(t)).length;
    const matchesCoreDesc = coreSubjectTokens.filter(t => descLower.includes(t)).length;

    if (titleLower === qLower || isExactCanonicalMatch) {
      semanticSimilarity = 100;
    } else if (titleLower.includes(qLower) || (queryCoreTitle.length >= 3 && titleLower.includes(queryCoreTitle))) {
      semanticSimilarity = 85;
    } else if (hasCoreSubject) {
      // Si la búsqueda tiene sujeto central ("teología de la liberación"):
      if (matchesCoreTitle >= coreSubjectTokens.length) {
        // Coincidencia total en el sujeto central
        semanticSimilarity = 90;
        if (matchesTitle > matchesCoreTitle) semanticSimilarity = 100; // Bonus si también tiene el modificador
      } else if (matchesCoreTitle >= 1 || matchesCoreDesc >= coreSubjectTokens.length) {
        semanticSimilarity = 55;
      } else {
        // Si SOLO coincide con el modificador ("Master Psychologie", "Master Boot Record") -> Ruido semántico severo
        semanticSimilarity = 5;
      }
    } else if (qTokens.length > 0) {
      semanticSimilarity = (matchesTitle / qTokens.length) * 80;
      if (matchesTitle < qTokens.length && matchesDesc > 0) {
        semanticSimilarity += (matchesDesc / qTokens.length) * 20;
      }
    }

    
    let entityCentrality = 0;
    if (intentData?.entities && intentData.entities.length > 0) {
      entityCentrality = calculateEntityCentrality(v, intentData.entities, intentData);
    }
    
    let contextualEntityMatch = 0;
    if (query.context?.entities) {
      for (const entity of query.context.entities) {
        if (titleLower.includes(entity.canonical.toLowerCase())) {
          contextualEntityMatch = Math.max(contextualEntityMatch, 1.0);
        } else if (entity.aliases.some(a => titleLower.includes(a.toLowerCase()))) {
          contextualEntityMatch = Math.max(contextualEntityMatch, 0.85);
        }
      }
    }
    
    // Combine base semantic similarity with contextual entity match
    let finalSemantic = semanticSimilarity;
    if (query.context?.entities && query.context.entities.length > 0) {
      finalSemantic = (semanticSimilarity * 0.6) + (contextualEntityMatch * 40);
    }

    let topicMatch = 0;
    if (intentData?.topics && v.topics && v.topics.length > 0) {
      const match = intentData.topics.some(t => v.topics?.includes(t));
      if (match) topicMatch = 100;
    } else {
      // Neutral fallback for items without explicit topic taxonomy
      topicMatch = isExactCanonicalMatch ? 90 : Math.max(50, finalSemantic * 0.8);
    }
    
    // Boost topic match if we have a strong contextual entity match
    if (contextualEntityMatch > 0) {
      topicMatch = Math.max(topicMatch, contextualEntityMatch * 100);
    }

    let intentMatch = 50;
    if (intentData?.primaryIntent === 'NEWS' && v.category === 'news') intentMatch = 100;
    else if (intentData?.primaryIntent === 'TUTORIAL' && v.title.toLowerCase().includes('how to')) intentMatch = 100;
    else if (intentData?.primaryIntent === 'DOCUMENTARY' && (v.title.toLowerCase().includes('documentary') || (v.durationSeconds || 0) > 1200)) intentMatch = 100;
    else if (intentData?.primaryIntent === 'HISTORY' && (v.topics?.includes('History') || v.title.toLowerCase().match(/(history|empire|ancient|historia|imperio|antigua)/))) intentMatch = 100;
    else if (qClean.match(/short\s*film|cortometraje|corto/i) && ((v.durationSeconds || 0) < 1200 || v.title.match(/short|corto|film/i))) intentMatch = 90;
    else if (isExactCanonicalMatch) intentMatch = 80;

    const baseRelevance = Math.round(
      (finalSemantic * 0.4) + (topicMatch * 0.3) + (entityCentrality * 0.2) + (intentMatch * 0.1)
    );

    
    // --- TEMPORAL FIT CALCULATION ---
    let temporalFit = 50;
    let temporalReason = 'no_temporal_intent';
    let isTemporalIrrelevant = true;

    if (intentData?.temporal) {
      const tempIntent = intentData.temporal.intent;
      
      // Determine content age
      let ageDays = -1;
      let pubYear = -1;
      
      if (v.publishedAt) {
        const pubDate = new Date(v.publishedAt);
        if (!isNaN(pubDate.getTime())) {
          ageDays = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
          pubYear = pubDate.getFullYear();
        }
      }

      if (tempIntent === 'current') {
        isTemporalIrrelevant = false;
        if (ageDays >= 0) {
          if (ageDays <= 1) { temporalFit = 100; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
          else if (ageDays <= 3) { temporalFit = 85; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
          else if (ageDays <= 7) { temporalFit = 70; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
          else if (ageDays <= 30) { temporalFit = 30; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
          else if (ageDays <= 90) { temporalFit = 10; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
          else { temporalFit = 0; temporalReason = `age=${Math.round(ageDays)}d, current intent`; }
        } else {
          temporalFit = 30;
          temporalReason = 'missing publishedAt, current intent';
        }
      } else if (tempIntent === 'recent') {
        isTemporalIrrelevant = false;
        if (ageDays >= 0) {
          if (ageDays <= 7) { temporalFit = 100; temporalReason = `age=${Math.round(ageDays)}d, recent intent`; }
          else if (ageDays <= 30) { temporalFit = 80; temporalReason = `age=${Math.round(ageDays)}d, recent intent`; }
          else if (ageDays <= 90) { temporalFit = 50; temporalReason = `age=${Math.round(ageDays)}d, recent intent`; }
          else { temporalFit = 10; temporalReason = `age=${Math.round(ageDays)}d, recent intent`; }
        } else {
          temporalFit = 40;
          temporalReason = 'missing publishedAt, recent intent';
        }
      } else if (tempIntent === 'historical' && intentData.temporal.year) {
        isTemporalIrrelevant = false;
        const targetYear = intentData.temporal.year;
        
        let historicalScore = 50;
        let reasons = [`targetYear=${targetYear}`];
        
        if (titleLower.includes(targetYear.toString())) {
          historicalScore += 30;
          reasons.push('title_match');
        }
        if (descLower.includes(targetYear.toString())) {
          historicalScore += 10;
          reasons.push('desc_match');
        }
        if (intentData.entities.some(e => e.name.includes(targetYear.toString()))) {
          historicalScore += 20;
          reasons.push('entity_match');
        }
        
        if (pubYear === targetYear) {
          historicalScore += 20;
          reasons.push('pub_year_match');
        } else if (pubYear !== -1) {
          // If the query is explicitly about an event that year, but video is from way earlier, penalize.
          // If it's a newer video (e.g. 2026 looking back at 2024), we don't penalize.
          if (pubYear < targetYear) {
            historicalScore -= 30;
            reasons.push(`pub_year_old(${pubYear})`);
          } else if (pubYear > targetYear && titleLower.includes(pubYear.toString())) {
            // Explicitly about another year? Penalize!
            historicalScore -= 40;
            reasons.push(`explicit_wrong_year(${pubYear})`);
          }
        }
        
        temporalFit = Math.max(0, Math.min(100, historicalScore));
        temporalReason = reasons.join(', ');
      }
    }
    
    // --- FINAL RELEVANCE CALCULATION ---
    let relevanceScore = 0;
    
    // Dynamic weights depending on whether Temporal is irrelevant
    let wSemantic = 30;
    let wTitle = 15;
    let wTopic = 15;
    let wEntity = 15;
    let wIntent = 10;
    let wTemporal = 15;
    
    if (isTemporalIrrelevant) {
      // Redistribute the 15% temporal weight proportionally
      const totalRemaining = 85;
      wSemantic = Math.round((30 / totalRemaining) * 100); // 35
      wTitle = Math.round((15 / totalRemaining) * 100);    // 18
      wTopic = Math.round((15 / totalRemaining) * 100);    // 18
      wEntity = Math.round((15 / totalRemaining) * 100);   // 18
      wIntent = 100 - wSemantic - wTitle - wTopic - wEntity; // 11
      wTemporal = 0;
    }

    relevanceScore = (finalSemantic * (wSemantic/100)) + 
                     (entityCentrality * (wEntity/100)) + 
                     (topicMatch * (wTopic/100)) + 
                     (finalSemantic * (wTitle/100)) + // Using finalSemantic to cover title 
                     (intentMatch * (wIntent/100)) +
                     (temporalFit * (wTemporal/100));
                         
    relevanceScore = Math.min(100, Math.max(0, Math.round(relevanceScore)));

    // RankingScore = Relevance + Quality + IntentFit + ...
    const youScore = Math.round((qualityScore * 0.4) + (relevanceScore * 0.6));
    
    // Explanability
    const rankingBreakdown = {
      semantic: Math.round(finalSemantic),
      title: Math.round(finalSemantic),
      topic: Math.round(topicMatch),
      entityCentrality: Math.round(entityCentrality),
      intent: Math.round(intentMatch),
      temporal: Math.round(temporalFit),
      temporalReason,
      quality: qualityScore,
      relevance: relevanceScore,
      finalRank: youScore
    };

    return {
      ...v,
      relevanceScore,
      youScore,
      rankingVersion: 'you-score-v3-temporal',
      ...(import.meta.env?.DEV ? { rankingBreakdown } : {})

    };
  });
}
