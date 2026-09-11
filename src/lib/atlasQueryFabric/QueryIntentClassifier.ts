import { AtlasCanonicalEntityType } from '../atlasSemantic/types';
import { QueryIntentResult, QueryIntentType } from './types';
import { SemanticConceptMap } from './SemanticConceptMap';

export class QueryIntentClassifier {
  /**
   * Classifies a natural language query into intent, entities, temporal constraints, and predicates.
   */
  public static classify(query: string): QueryIntentResult {
    const cleanQuery = query.trim();
    const lower = cleanQuery.toLowerCase();

    // 1. Detect "What do we know" patterns
    const isWhatDoWeKnow =
      /what\s+do\s+we\s+know\s+about/i.test(lower) ||
      /que\s+sabemos\s+(de|sobre)/i.test(lower) ||
      /qué\s+sabemos\s+(de|sobre)/i.test(lower) ||
      /resumen\s+de/i.test(lower);

    // 2. Detect contradiction check
    const isContradiction =
      /conflict/i.test(lower) ||
      /contradiction/i.test(lower) ||
      /dispute/i.test(lower) ||
      /disputa/i.test(lower) ||
      /conflicto/i.test(lower) ||
      /inconsistenc/i.test(lower);

    // 3. Detect temporal phrases & years
    let isTemporal = false;
    let temporalPhrase: string | undefined;
    let asOfDate: string | undefined;

    const yearMatch = cleanQuery.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      isTemporal = true;
      temporalPhrase = yearMatch[0];
      asOfDate = `${yearMatch[0]}-01-01T00:00:00Z`;
    } else if (
      /currently|actualmente|hoy|today|now|ahora|past|anterior|historico|histórico|history/i.test(lower)
    ) {
      isTemporal = true;
      temporalPhrase = 'CURRENT_OR_HISTORICAL';
    }

    // 4. Extract mapped predicates
    const extractedPredicates = SemanticConceptMap.mapTextToPredicates(lower);

    // 5. Extract entity candidate mentions
    const extractedEntities: string[] = [];
    const extractedEntityTypes: AtlasCanonicalEntityType[] = [];

    const stopWords = new Set([
      'what', 'who', 'where', 'when', 'why', 'how', 'que', 'qué', 'quien', 'quién',
      'donde', 'dónde', 'the', 'el', 'la', 'los', 'las', 'un', 'una', 'is', 'are',
      'does', 'do', 'did', 'has', 'have', 'had', 'works', 'trabaja', 'located', 'ubicado'
    ]);

    // A. Common prepositional and phrasing patterns
    const sanitizedQuery = cleanQuery.replace(/[¿?¡!]/g, ' ').trim();

    const entityExtractionRegexes = [
      /(?:about|sobre|de|for|para|is|es|who is|quien es|quién es|company|empresa|person|persona|at|en|in|into|works at|trabaja en|lives in|located in|ubicado en|does|hace)\s+["']?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s.-]+?)["']?(?:\?|$|\s+(?:in|en|at|with|con|role|cargo|located|ubicado|work|trabajar|have|tiene))/i,
      /["']([^"']+)["']/
    ];

    for (const regex of entityExtractionRegexes) {
      const match = sanitizedQuery.match(regex) || cleanQuery.match(regex);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (candidate.length >= 2 && !stopWords.has(candidate.toLowerCase())) {
          if (!extractedEntities.includes(candidate)) {
            extractedEntities.push(candidate);
          }
        }
      }
    }

    // B. Capitalized multi-word phrases (e.g. "Rossi Capital", "River Plate", "Jane Doe")
    const capMatches = sanitizedQuery.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ0-9]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ0-9]+)+)\b/g);
    if (capMatches) {
      for (const cm of capMatches) {
        const candidate = cm.trim();
        if (!stopWords.has(candidate.toLowerCase()) && !extractedEntities.includes(candidate)) {
          extractedEntities.push(candidate);
        }
      }
    }

    // Fallback: if no entity extracted, use full query if short
    if (extractedEntities.length === 0) {
      const words = sanitizedQuery.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0 && words.length <= 4) {
        extractedEntities.push(sanitizedQuery.replace(/[?.,!]/g, '').trim());
      }
    }

    // 6. Determine Primary Intent
    let primaryIntent: QueryIntentType = 'GENERAL_SEARCH';
    let confidence = 0.80;

    if (isWhatDoWeKnow) {
      primaryIntent = 'WHAT_DO_WE_KNOW';
      confidence = 0.95;
    } else if (isContradiction) {
      primaryIntent = 'CONTRADICTION_ANALYSIS';
      confidence = 0.90;
    } else if (/connected\s+to|connection\s+between|path\s+between|relacionado\s+con|c[oó]mo\s+se\s+conecta/i.test(lower)) {
      primaryIntent = 'MULTI_HOP_DISCOVERY';
      confidence = 0.90;
    } else if (isTemporal) {
      primaryIntent = 'TEMPORAL_QUERY';
      confidence = 0.85;
    } else if (
      extractedPredicates.includes('POSSIBLE_EXPANSION') ||
      extractedPredicates.includes('ACTIVE_HIRING_SIGNAL') ||
      extractedPredicates.includes('MULTI_OFFERING_PORTFOLIO') ||
      /parece\s+estar|señales|senales|signals|cartera|portfolio/i.test(lower)
    ) {
      primaryIntent = 'DISCOVER_BY_SIGNALS';
      confidence = 0.90;
    } else if (extractedPredicates.includes('WORKS_AT') || extractedPredicates.includes('LOCATED_IN')) {
      primaryIntent = 'RELATIONSHIP_TRAVERSAL';
      confidence = 0.88;
    } else if (extractedPredicates.includes('HAS_ROLE') || extractedPredicates.includes('INDUSTRY')) {
      primaryIntent = 'FACT_RETRIEVAL';
      confidence = 0.88;
    } else if (/who\s+is|quien\s+es|quién\s+es|what\s+is|que\s+es|qué\s+es/i.test(lower)) {
      primaryIntent = 'ENTITY_LOOKUP';
      confidence = 0.92;
    } else if (/find|buscar|discover|encuentra|listar/i.test(lower)) {
      primaryIntent = 'DISCOVER_BY_SIGNALS';
      confidence = 0.85;
    }

    return {
      primary_intent: primaryIntent,
      confidence,
      extracted_entities: extractedEntities,
      extracted_entity_types: extractedEntityTypes,
      extracted_concepts: [],
      extracted_predicates: extractedPredicates,
      temporal_phrase: temporalPhrase,
      as_of_date: asOfDate,
      is_temporal: isTemporal,
      is_contradiction_check: isContradiction,
      is_what_do_we_know: isWhatDoWeKnow
    };
  }
}
