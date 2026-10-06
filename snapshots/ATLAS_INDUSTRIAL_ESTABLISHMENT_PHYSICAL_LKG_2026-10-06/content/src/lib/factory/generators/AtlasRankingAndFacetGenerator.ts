/**
 * ATLAS RANKING & FACET GENERATOR V1
 * 
 * Derives customized search relevance ranking policies and categorical facet buckets
 * based on the domain's purpose and target user needs.
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { AtlasDomainSpecification } from '../contracts/AtlasDomainSpecification';

export class AtlasRankingAndFacetGenerator {
  public static generateRankingAndFacets(intent: ParsedDomainIntent): {
    searchable_fields: string[];
    facets: string[];
    ranking_factors: AtlasDomainSpecification['ranking_factors'];
    default_sort: AtlasDomainSpecification['default_sort'];
    coverage_dimensions: string[];
  } {
    if (intent.entity_type === 'COMPANY' || intent.entity_type === 'SUPPLIER') {
      return {
        searchable_fields: [
          'company_name',
          'trade_name',
          'industry_sector',
          'products',
          'province',
          'city',
          'cuit'
        ],
        facets: [
          'industry_sector',
          'province',
          'certifications',
          'sipro_status'
        ],
        ranking_factors: [
          { field: 'company_name', weight: 0.30, match_type: 'fuzzy' },
          { field: 'products', weight: 0.30, match_type: 'fuzzy' },
          { field: 'industry_sector', weight: 0.20, match_type: 'exact' },
          { field: 'province', weight: 0.10, match_type: 'exact' },
          { field: 'certifications', weight: 0.10, match_type: 'exact' }
        ],
        default_sort: { field: 'company_name', direction: 'asc' },
        coverage_dimensions: [
          'LegalIdentity',
          'ActivityAndProducts',
          'Geography',
          'Certifications',
          'CommercialContact',
          'OfficialEvidence'
        ]
      };
    }

    return {
      searchable_fields: ['name', 'description'],
      facets: ['category'],
      ranking_factors: [{ field: 'name', weight: 1.0, match_type: 'fuzzy' }],
      default_sort: { field: 'name', direction: 'asc' },
      coverage_dimensions: ['Identity', 'Evidence']
    };
  }
}
