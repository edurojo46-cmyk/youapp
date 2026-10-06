import { SmartPersonQueryRouter } from './SmartPersonQueryRouter';
import { FederatedPersonSearch } from './FederatedPersonSearch';
import type { FederatedSearchResponse, SearchMode } from './FederatedPersonSearch';
import type { ExternalSearchFilters } from './IExternalPersonSourceAdapter';
import { ProfessionConceptResolver } from './adapters/ProfessionConceptResolver';

export class NaturalLanguagePersonSearch {
  private federatedSearch: FederatedPersonSearch;
  private professionResolver: ProfessionConceptResolver;

  constructor() {
    this.federatedSearch = new FederatedPersonSearch();
    this.professionResolver = new ProfessionConceptResolver();
  }

  public async search(
    rawQuery: string,
    baseFilters: ExternalSearchFilters,
    mode: SearchMode = 'ALL_SOURCES',
    isAdmin: boolean = false
  ): Promise<{ results: FederatedSearchResponse; parsedQuery: any; usedGemini: boolean }> {
    
    if (!rawQuery.trim()) {
      // Empty query fallback
      return {
        results: await this.federatedSearch.search(baseFilters, mode, isAdmin),
        parsedQuery: null,
        usedGemini: false
      };
    }

    let usedGemini = false;
    let structuredQuery = await SmartPersonQueryRouter.evaluate(rawQuery);

    if (!structuredQuery) {
      structuredQuery = await SmartPersonQueryRouter.interpretWithGemini(rawQuery);
      usedGemini = true;
    }

    // Map to Atlas Filters
    const filters: ExternalSearchFilters = { ...baseFilters };

    if (structuredQuery.personName) filters.name = structuredQuery.personName;
    if (structuredQuery.personCategory) filters.personCategory = structuredQuery.personCategory;
    
    // Profession Concept Resolution
    if (structuredQuery.profession) {
      const resolved = await this.professionResolver.resolve(structuredQuery.profession);
      if (resolved && resolved.status === 'VERIFIED') {
        filters.profession = resolved.concept;
      } else {
        filters.profession = 'UNRESOLVED';
      }
    }
    
    if (structuredQuery.location) {
      filters.structured_location = filters.structured_location || {};
      if (structuredQuery.location.country) filters.structured_location.country = structuredQuery.location.country;
      if (structuredQuery.location.jurisdiction) filters.structured_location.jurisdiction = structuredQuery.location.jurisdiction;
      if (structuredQuery.location.neighborhood) filters.structured_location.neighborhood = structuredQuery.location.neighborhood;
    }

    // Call standard FederatedPersonSearch with structured filters
    const results = await this.federatedSearch.search(filters, mode, isAdmin);

    return {
      results,
      parsedQuery: structuredQuery,
      usedGemini
    };
  }
}
