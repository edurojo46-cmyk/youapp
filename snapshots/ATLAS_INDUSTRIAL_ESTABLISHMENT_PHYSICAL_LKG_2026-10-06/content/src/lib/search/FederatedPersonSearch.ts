import { supabase } from '../supabase';
import type { ExternalPersonObservation, ExternalSearchFilters, IExternalPersonSourceAdapter } from './IExternalPersonSourceAdapter';
import { GitHubAdapter } from './adapters/GitHubAdapter';
import { WikidataAdapter } from './adapters/WikidataAdapter';
import { GlobalFilterPredicates } from './GlobalFilterPredicates';
import { OpenDatasetPersonAdapter } from './adapters/OpenDatasetPersonAdapter';
import { OrganizationTeamDiscoveryAdapter } from './adapters/OrganizationTeamDiscoveryAdapter';
import { GeminiGroundedPersonDiscoveryProvider } from './adapters/GeminiGroundedPersonDiscoveryProvider';
import { OrcidAdapter } from './adapters/OrcidAdapter';
import { QueryPlanner } from './QueryPlanner';
import { RelevanceEngine } from './RelevanceEngine';
import { PhotoDiscoveryEngine } from './PhotoDiscoveryEngine';
import { PublicContactDiscovery } from './PublicContactDiscovery';

export interface FederatedPersonSearchResult {
  display_name: string;
  profession: string | null;
  location: string | null;
  
  // Demographics (Age and DOB)
  date_of_birth?: string | null;
  age: number | 'UNKNOWN';
  age_range?: string | null;
  
  // Distinct Sex and Gender
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  gender?: string | 'UNKNOWN';
  
  // Photo
  photo_url?: string | null;
  
  // Social Profiles
  social_profiles?: any[];
  
  strong_identifiers?: {
    registry_id?: string;
    verified_url?: string;
  };
  atlas_person_id?: string;
  atlas_data?: any;
  external_sources: string[];
  external_data?: any[];
  origin_status?: string;
  possible_match_warning?: boolean;
  
  // Positive Semantic Evidence & Observability
  entity_type?: 'PERSON' | 'BUSINESS' | 'ORGANIZATION' | 'SERVICE' | 'UNKNOWN';
  work_evidence?: string;
  geography_evidence?: string;
  why_matched_work?: string;
  why_matched_geography?: string;
  discovered_by?: string;

  // Extra metadata
  attributes?: any;
  status?: string;
  has_photo_evidence?: boolean;
  coverage?: any;
  channel_eligibility?: any[];
  identifiers?: any[];
  product_fit?: any;
  nba?: any;
  intent?: any;
  tenant_id?: string;
}

export interface SourceTraceItem {
  planned: boolean;
  called: boolean;
  http_success: boolean;
  raw_results: number;
  valid_results: number;
  rejected_results: number;
  status: 'LIVE' | 'NOT_APPLICABLE' | 'BLOCKED_MISSING_CREDENTIALS' | 'ERROR';
  not_applicable_reason?: string;
}

export interface SourceTrace {
  providers_planned: string[];
  providers_called: string[];
  sources: {
    atlas: SourceTraceItem;
    gemini_web: SourceTraceItem;
    wikidata: SourceTraceItem;
    github: SourceTraceItem;
    orcid: SourceTraceItem;
  };
  diagnostics: {
    rejected_no_activity_evidence: number;
    rejected_geography: number;
    rejected_entity_type: number;
  };
}

export interface FederatedSearchResponse {
  confirmed_matches: FederatedPersonSearchResult[];
  potential_matches: FederatedPersonSearchResult[];
  out_of_range: FederatedPersonSearchResult[];
  businesses?: any[];
  source_trace: SourceTrace;
  
  stats: {
    atlas_results: number;
    external_results: number;
    unified_unique: number;
    sources_searched: number;
    sources_successful: number;
    sources_unavailable: number;
    sources_consulted: string[];
    sources_failed: string[];
    rejected_by_relevance: number;
    gemini_raw_results: number;
    gemini_valid_results: number;
  };
}

export type SearchMode = 'ATLAS_ONLY' | 'EXTERNAL_ONLY' | 'ALL_SOURCES';

export class FederatedPersonSearch {
  private adapters: IExternalPersonSourceAdapter[] = [];
  private geminiDiscovery: GeminiGroundedPersonDiscoveryProvider;
  private dbClient: any;

  constructor(injectedAdapters?: IExternalPersonSourceAdapter[], dbClient?: any) {
    this.dbClient = dbClient || supabase;
    this.geminiDiscovery = new GeminiGroundedPersonDiscoveryProvider();
    if (injectedAdapters) {
      this.adapters = injectedAdapters;
    } else {
      this.adapters.push(new GitHubAdapter());
      this.adapters.push(new OrcidAdapter());
      this.adapters.push(new WikidataAdapter());
      this.adapters.push(new OpenDatasetPersonAdapter());
      this.adapters.push(new OrganizationTeamDiscoveryAdapter());
    }
  }

  async search(
    filters: ExternalSearchFilters, 
    mode: SearchMode = 'ALL_SOURCES',
    isAdmin: boolean = false
  ): Promise<FederatedSearchResponse> {
    const stats = {
      atlas_results: 0,
      external_results: 0,
      unified_unique: 0,
      sources_searched: 0,
      sources_successful: 0,
      sources_unavailable: 0,
      sources_consulted: [] as string[],
      sources_failed: [] as string[],
      rejected_by_relevance: 0,
      gemini_raw_results: 0,
      gemini_valid_results: 0
    };

    const sourceTrace: SourceTrace = {
      providers_planned: [],
      providers_called: [],
      sources: {
        atlas: { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'LIVE' },
        gemini_web: { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'LIVE' },
        wikidata: { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'LIVE' },
        github: { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'NOT_APPLICABLE' },
        orcid: { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'NOT_APPLICABLE' }
      },
      diagnostics: {
        rejected_no_activity_evidence: 0,
        rejected_geography: 0,
        rejected_entity_type: 0
      }
    };

    let atlasResults: any[] = [];
    let externalResults: ExternalPersonObservation[] = [];
    let discoveredBusinesses: any[] = [];

    // Query Plan
    const intent = filters.query_intent;
    const plan = intent 
      ? QueryPlanner.plan(intent, this.adapters) 
      : { 
          executeAtlas: true, 
          executeExternalAdapters: this.adapters.map(a => a.getAdapterId()), 
          executeGemini: true, 
          plannedSources: ['ATLAS', 'GEMINI_WEB'], 
          notApplicableSources: [] 
        };

    sourceTrace.providers_planned = plan.plannedSources;

    // Set Not Applicable statuses
    for (const na of plan.notApplicableSources) {
      if (na === 'GITHUB_API') {
        sourceTrace.sources.github = { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'NOT_APPLICABLE', not_applicable_reason: 'Solo aplicable a desarrollo de software' };
      } else if (na === 'ORCID_PUBLIC_API') {
        sourceTrace.sources.orcid = { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'NOT_APPLICABLE', not_applicable_reason: 'Solo aplicable a perfiles académicos/investigación' };
      } else if (na === 'WIKIDATA_SPARQL') {
        sourceTrace.sources.wikidata = { planned: false, called: false, http_success: false, raw_results: 0, valid_results: 0, rejected_results: 0, status: 'NOT_APPLICABLE', not_applicable_reason: 'No aplicable a roles genéricos' };
      }
    }

    // 1. Parallel Provider Execution
    const parallelTasks: Promise<any>[] = [];

    // Atlas Task
    if (mode === 'ATLAS_ONLY' || mode === 'ALL_SOURCES') {
      sourceTrace.sources.atlas.planned = true;
      sourceTrace.sources.atlas.called = true;
      sourceTrace.providers_called.push('ATLAS');
      stats.sources_consulted.push('ATLAS');

      parallelTasks.push(
        this.searchAtlas(filters, isAdmin)
          .then(res => {
            atlasResults = res;
            sourceTrace.sources.atlas.http_success = true;
            sourceTrace.sources.atlas.raw_results = res.length;
            sourceTrace.sources.atlas.valid_results = res.length;
            stats.atlas_results = res.length;
          })
          .catch(err => {
            console.error('Error in Atlas search:', err);
            sourceTrace.sources.atlas.status = 'ERROR';
            stats.sources_failed.push('ATLAS');
          })
      );
    }

    // External Adapters Tasks (Wikidata, GitHub, ORCID, etc.)
    if (mode === 'EXTERNAL_ONLY' || mode === 'ALL_SOURCES') {
      const adaptersToRun = this.adapters.filter(a => plan.executeExternalAdapters.includes(a.getAdapterId()));

      for (const adapter of adaptersToRun) {
        const id = adapter.getAdapterId();
        stats.sources_searched++;
        stats.sources_consulted.push(id);
        sourceTrace.providers_called.push(id);

        if (id === 'WIKIDATA_SPARQL') {
          sourceTrace.sources.wikidata.planned = true;
          sourceTrace.sources.wikidata.called = true;
        } else if (id === 'GITHUB_API') {
          sourceTrace.sources.github.planned = true;
          sourceTrace.sources.github.called = true;
          sourceTrace.sources.github.status = 'LIVE';
        } else if (id === 'ORCID_PUBLIC_API') {
          sourceTrace.sources.orcid.planned = true;
          sourceTrace.sources.orcid.called = true;
          sourceTrace.sources.orcid.status = 'LIVE';
        }

        parallelTasks.push(
          adapter.search(filters)
            .then(obs => {
              stats.sources_successful++;
              if (id === 'WIKIDATA_SPARQL') {
                sourceTrace.sources.wikidata.http_success = true;
                sourceTrace.sources.wikidata.raw_results = obs.length;
              } else if (id === 'GITHUB_API') {
                sourceTrace.sources.github.http_success = true;
                sourceTrace.sources.github.raw_results = obs.length;
              } else if (id === 'ORCID_PUBLIC_API') {
                sourceTrace.sources.orcid.http_success = true;
                sourceTrace.sources.orcid.raw_results = obs.length;
              }
              externalResults.push(...obs);
            })
            .catch(err => {
              console.error(`Error in adapter ${id}:`, err);
              stats.sources_unavailable++;
              stats.sources_failed.push(id);
              if (id === 'WIKIDATA_SPARQL') sourceTrace.sources.wikidata.status = 'ERROR';
              else if (id === 'GITHUB_API') sourceTrace.sources.github.status = 'ERROR';
            })
        );
      }

      // Gemini Grounded Web Search (Parallel execution whenever planned)
      if (plan.executeGemini) {
        sourceTrace.sources.gemini_web.planned = true;
        sourceTrace.sources.gemini_web.called = true;
        sourceTrace.providers_called.push('GEMINI_WEB');
        stats.sources_consulted.push('GEMINI_WEB');
        stats.sources_searched++;

        // Construct discovery query
        const queryParts: string[] = [];
        if (filters.profession) queryParts.push(filters.profession);
        if (filters.name) queryParts.push(filters.name);
        if (filters.location_filter) queryParts.push(`en ${filters.location_filter}`);
        else if (filters.structured_location?.jurisdiction) queryParts.push(`en ${filters.structured_location.jurisdiction}`);
        else if (filters.structured_location?.city) queryParts.push(`en ${filters.structured_location.city}`);
        
        const discoveryQuery = queryParts.join(' ') || filters.query_intent?.free_text || 'profesional';

        parallelTasks.push(
          this.geminiDiscovery.discover(discoveryQuery, {
            requiredProfession: filters.profession,
            requiredLocation: filters.structured_location?.jurisdiction || filters.structured_location?.city || filters.location_filter,
            workConcept: intent?.work_concept
          })
            .then(geminiRes => {
              stats.sources_successful++;
              sourceTrace.sources.gemini_web.http_success = geminiRes.telemetry?.http_success ?? true;
              sourceTrace.sources.gemini_web.raw_results = geminiRes.telemetry?.raw_results ?? geminiRes.observations.length;
              sourceTrace.sources.gemini_web.valid_results = geminiRes.observations.length;
              sourceTrace.sources.gemini_web.rejected_results = geminiRes.telemetry?.rejected_results ?? 0;
              sourceTrace.sources.gemini_web.status = geminiRes.telemetry?.status || 'LIVE';

              stats.gemini_raw_results = sourceTrace.sources.gemini_web.raw_results;
              stats.gemini_valid_results = geminiRes.observations.length;

              if (geminiRes.businesses) {
                discoveredBusinesses.push(...geminiRes.businesses);
              }

              externalResults.push(...geminiRes.observations);
            })
            .catch(err => {
              console.error('Error in Gemini web discovery:', err);
              stats.sources_unavailable++;
              stats.sources_failed.push('GEMINI_WEB');
              sourceTrace.sources.gemini_web.status = 'ERROR';
            })
        );
      }
    }

    // Wait for all parallel tasks
    await Promise.all(parallelTasks);

    stats.external_results = externalResults.length;

    // 2. Deduplication & Unified Mapping
    let unifiedResults = this.unifyResults(atlasResults, externalResults);
    
    // 3. Positive Semantic Work Evidence & Relevance Filtering
    const relevanceFiltered: FederatedPersonSearchResult[] = [];
    for (const res of unifiedResults) {
      if (intent) {
        const passesRelevance = RelevanceEngine.evaluate(res, intent);
        if (!passesRelevance) {
          stats.rejected_by_relevance++;
          sourceTrace.diagnostics.rejected_no_activity_evidence++;
          continue;
        }
      }
      relevanceFiltered.push(res);
    }
    unifiedResults = relevanceFiltered;

    // 4. Strict Geography Pre-filtering
    const geoFiltered: FederatedPersonSearchResult[] = [];
    for (const res of unifiedResults) {
      const geoEligible = await GlobalFilterPredicates.isGeographyEligible(res, filters);
      if (!geoEligible) {
        sourceTrace.diagnostics.rejected_geography++;
        continue;
      }
      geoFiltered.push(res);
    }
    unifiedResults = geoFiltered;

    // Update Valid Counts per Source after Relevance and Geography Filtering
    let wikidataValid = 0;
    let geminiValid = 0;
    let githubValid = 0;
    let orcidValid = 0;

    for (const r of unifiedResults) {
      if (r.external_sources.includes('WIKIDATA') || r.discovered_by === 'WIKIDATA') wikidataValid++;
      if (r.discovered_by === 'GEMINI_WEB_SEARCH') geminiValid++;
      if (r.external_sources.includes('GITHUB')) githubValid++;
      if (r.external_sources.includes('ORCID')) orcidValid++;
    }

    sourceTrace.sources.wikidata.valid_results = wikidataValid;
    sourceTrace.sources.wikidata.rejected_results = Math.max(0, sourceTrace.sources.wikidata.raw_results - wikidataValid);
    
    sourceTrace.sources.gemini_web.valid_results = geminiValid;
    sourceTrace.sources.github.valid_results = githubValid;
    sourceTrace.sources.orcid.valid_results = orcidValid;

    // 5. Evidence Enrichment (Photo & Contact)
    unifiedResults = unifiedResults.map(res => {
      if (res.origin_status === 'EXTERNAL' || res.origin_status === 'EXTERNAL_LIVE') {
        let updatedRes = PhotoDiscoveryEngine.discover(res);
        updatedRes = PublicContactDiscovery.discover(updatedRes);
        return updatedRes;
      }
      return res;
    });

    stats.unified_unique = unifiedResults.length;

    // 6. Confirmed & Potential Partitioning
    const confirmed_matches: FederatedPersonSearchResult[] = [];
    const potential_matches: FederatedPersonSearchResult[] = [];
    const out_of_range: FederatedPersonSearchResult[] = [];

    const hasAgeFilter = filters.age_from !== undefined || filters.age_to !== undefined;
    const isWorkerSearch = filters.personCategory === 'WORKER';

    for (const res of unifiedResults) {
      if (isWorkerSearch) {
        if (!this.isEmploymentEligible(res, filters)) {
          continue;
        }
        res.intent = res.intent || {};
        res.intent.matchReason = ['CURRENT_EMPLOYMENT'];
        if (filters.structured_location) res.intent.matchReason.push('WORK_LOCATION_MATCH');
      }

      const ageEligible = GlobalFilterPredicates.isAgeEligible(res, filters);
      if (!ageEligible) {
        out_of_range.push(res);
        continue;
      }

      if (!hasAgeFilter) {
        confirmed_matches.push(res);
      } else {
        if (res.age === 'UNKNOWN') {
          potential_matches.push(res);
        } else {
          confirmed_matches.push(res);
        }
      }
    }

    return {
      confirmed_matches,
      potential_matches,
      out_of_range,
      businesses: discoveredBusinesses,
      source_trace: sourceTrace,
      stats
    };
  }

  private isEmploymentEligible(res: FederatedPersonSearchResult, filters: ExternalSearchFilters): boolean {
    let hasConfirmedEmployment = false;
    let hasConfirmedWorkLocation = false;

    const isFromAtlas = res.origin_status === 'IN_ATLAS' || res.origin_status === 'BOTH';
    if (isFromAtlas) {
      hasConfirmedEmployment = true;
      hasConfirmedWorkLocation = true;
    }

    const extData = res.external_data || [];
    for (const data of extData) {
      if (data.employmentEvidence?.status === 'CONFIRMED' || data.work_evidence) {
        hasConfirmedEmployment = true;
      }
      if (data.workLocationEvidence?.status === 'CONFIRMED' || data.geography_evidence) {
        hasConfirmedWorkLocation = true;
      }
      if (data.source_system === 'GCBA') {
        hasConfirmedEmployment = true;
        hasConfirmedWorkLocation = true;
      }
    }

    if (!hasConfirmedEmployment) return false;
    if (filters.structured_location && !hasConfirmedWorkLocation) return false;

    return true;
  }

  private async searchAtlas(filters: ExternalSearchFilters, isAdmin: boolean): Promise<any[]> {
    const rpcName = isAdmin ? 'search_admin_all_persons_v1' : 'search_canonical_persons_v1';
    
    const { data, error } = await this.dbClient.rpc(rpcName, {
      p_search_query: filters.name || null,
      p_profession: filters.profession || null,
      p_residence_neighborhood: filters.location_filter || null,
      p_page: 1,
      p_page_size: 500
    });

    if (error) {
      console.error('Atlas search error:', error);
      return [];
    }
    return data?.items || [];
  }

  private unifyResults(atlas: any[], external: ExternalPersonObservation[]): FederatedPersonSearchResult[] {
    const unified: FederatedPersonSearchResult[] = [];

    // Map Atlas results first
    for (const a of atlas) {
      unified.push({
        display_name: a.full_name || 'Desconocido',
        profession: a.attributes?.profession?.value || null,
        location: a.attributes?.residence_neighborhood?.value || null,
        age: a.age || 'UNKNOWN',
        origin_status: 'IN_ATLAS',
        atlas_person_id: a.person_id,
        atlas_data: a,
        external_sources: [],
        entity_type: 'PERSON'
      });
    }

    // Map and Deduplicate External Results
    for (const ext of external) {
      let matchedAtlas: FederatedPersonSearchResult | undefined;
      let possibleMatch = false;

      for (const u of unified) {
        if (u.origin_status === 'IN_ATLAS' || u.origin_status === 'BOTH') {
          const atlasRegistryId = u.atlas_data?.identifiers?.find((i: any) => i.identifier_type === 'professional_registry_id')?.display_value;
          
          if (ext.strong_identifiers?.professional_registry_id && atlasRegistryId === ext.strong_identifiers.professional_registry_id) {
            matchedAtlas = u;
            break;
          }
          
          const sameName = u.display_name.toLowerCase() === ext.display_name.toLowerCase();
          const sameProf = u.profession?.toLowerCase() === ext.profession?.toLowerCase();
          const sameLoc = u.location?.toLowerCase() === ext.location?.toLowerCase();

          if (sameName && sameProf && sameLoc) {
            possibleMatch = true;
          }
        }
      }

      if (matchedAtlas) {
        matchedAtlas.origin_status = 'BOTH';
        matchedAtlas.external_sources.push(ext.source_system);
        matchedAtlas.external_data = matchedAtlas.external_data || [];
        matchedAtlas.external_data.push(ext);
        if (ext.work_evidence && !matchedAtlas.work_evidence) matchedAtlas.work_evidence = ext.work_evidence;
        if (ext.why_matched_work && !matchedAtlas.why_matched_work) matchedAtlas.why_matched_work = ext.why_matched_work;
        if (ext.why_matched_geography && !matchedAtlas.why_matched_geography) matchedAtlas.why_matched_geography = ext.why_matched_geography;
      } else {
        unified.push({
          display_name: ext.display_name,
          profession: ext.profession,
          location: ext.location,
          age: ext.age || 'UNKNOWN',
          origin_status: 'EXTERNAL',
          possible_match_warning: possibleMatch,
          external_sources: [ext.source_system],
          external_data: [ext],
          entity_type: ext.entity_type || 'PERSON',
          work_evidence: ext.work_evidence,
          geography_evidence: ext.geography_evidence,
          why_matched_work: ext.why_matched_work,
          why_matched_geography: ext.why_matched_geography,
          discovered_by: ext.discovered_by
        });
      }
    }

    return unified;
  }
}
