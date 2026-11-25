import { supabase } from '../supabase';

export interface FacetedSearchParams {
  age_min?: number | null;
  age_max?: number | null;
  geography_id?: string | null;
  profession_ids?: string[] | null;
  relation_types?: string[] | null;
  social_platforms?: string[] | null;
  source_ids?: string[] | null;
  limit?: number;
  offset?: number;
}

export interface FacetedSearchResponse {
  results: any[];
  total_matching_subjects: number;
  facets: {
    professions: Record<string, number>;
    relations: Record<string, number>;
    sources: Record<string, number>;
    coverage_age: number;
    coverage_profession: number;
    coverage_verified_social: number;
    coverage_photo: number;
    coverage_public_contact: number;
    coverage_personal_web: number;
    coverage_commune: number;
  };
}

export class FacetedSearchAPI {
  static async search(params: FacetedSearchParams): Promise<FacetedSearchResponse> {
    const { data, error } = await supabase.rpc('search_argentina_people_v1', {
      p_age_min: params.age_min || null,
      p_age_max: params.age_max || null,
      p_geography_id: params.geography_id || null,
      p_profession_ids: params.profession_ids && params.profession_ids.length > 0 ? params.profession_ids : null,
      p_relation_types: params.relation_types && params.relation_types.length > 0 ? params.relation_types : null,
      p_social_platforms: params.social_platforms && params.social_platforms.length > 0 ? params.social_platforms : null,
      p_source_ids: params.source_ids && params.source_ids.length > 0 ? params.source_ids : null,
      p_limit: params.limit || 25,
      p_offset: params.offset || 0
    });

    if (error) {
      console.error('Error in FacetedSearchAPI:', error);
      throw error;
    }

    return data as FacetedSearchResponse;
  }
}
