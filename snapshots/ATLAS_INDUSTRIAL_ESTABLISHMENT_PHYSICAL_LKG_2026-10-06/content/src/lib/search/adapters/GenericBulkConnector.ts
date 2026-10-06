import type { LightweightPersonRecord, ProviderPaginationCursor } from '../MassDiscoveryTypes';
import type { QueryIntent } from '../UniversalQueryModel';

export type BulkConnectorType = 
  | 'CKAN'
  | 'CSV'
  | 'JSON'
  | 'REST_API'
  | 'PAGINATED_REST_API'
  | 'PUBLIC_HTML_DIRECTORY'
  | 'STRUCTURED_DATA_PAGES'
  | 'PUBLIC_SITEMAP'
  | 'SPARQL'
  | 'PUBLIC_INSTITUTIONAL_ROSTER';

export interface GenericBulkSourceConfig {
  source_id: string;
  source_name: string;
  source_type: BulkConnectorType;
  endpoint_url: string;
  country: string;
  geography_scope: string;
  work_scope: string;
  
  supports_people: boolean;
  supports_search: boolean;
  supports_listing: boolean;
  supports_pagination: boolean;
  supports_total_count: boolean;
  
  auth_required: boolean;
  rate_limit?: number; // req/min
  retrievable_limit?: number;
  reported_total?: number;
  
  verification_status: 'LIVE' | 'DEGRADED' | 'BLOCKED' | 'DISCOVERED_UNVERIFIED' | 'CODE_ONLY';
  
  // Custom parser if needed for specific column mappings
  column_mapping?: {
    name_field: string;
    role_field?: string;
    organization_field?: string;
    email_field?: string;
    location_field?: string;
  };
}

export class GenericBulkConnector {
  private config: GenericBulkSourceConfig;
  private cachedRecords: LightweightPersonRecord[] | null = null;
  private isFetching = false;

  constructor(config: GenericBulkSourceConfig) {
    this.config = config;
  }

  getConfig(): GenericBulkSourceConfig {
    return this.config;
  }

  async getReportedTotal(intent: QueryIntent): Promise<number | null> {
    if (this.config.reported_total) return this.config.reported_total;
    if (this.config.supports_total_count && this.config.source_type === 'CKAN') {
      try {
        const queryTerm = intent.profession || intent.query || '';
        const url = `${this.config.endpoint_url}/action/package_search?q=${encodeURIComponent(queryTerm)}&rows=0`;
        const res = await fetch(url, { headers: { 'User-Agent': 'AtlasPersonSearch/2.0' } });
        if (res.ok) {
          const json = await res.json();
          return json.result?.count || null;
        }
      } catch {}
    }
    return null;
  }

  async searchPaginated(
    intent: QueryIntent,
    cursor: ProviderPaginationCursor
  ): Promise<{ records: LightweightPersonRecord[]; nextCursor: ProviderPaginationCursor }> {
    const nextCursor: ProviderPaginationCursor = {
      ...cursor,
      provider_id: this.config.source_id,
      offset: cursor.offset || 0,
      page_size: cursor.page_size || 100,
      reported_total: this.config.reported_total || 0,
      retrievable_limit: this.config.retrievable_limit || 10000,
      discovered_so_far: cursor.discovered_so_far || 0,
      provider_exhausted: false
    };

    if (this.config.verification_status !== 'LIVE') {
      nextCursor.provider_exhausted = true;
      return { records: [], nextCursor };
    }

    // CSV Roster Connector
    if (this.config.source_type === 'CSV' || this.config.source_type === 'PUBLIC_INSTITUTIONAL_ROSTER') {
      await this.ensureCsvLoaded();
      if (!this.cachedRecords || this.cachedRecords.length === 0) {
        nextCursor.provider_exhausted = true;
        return { records: [], nextCursor };
      }

      const offset = nextCursor.offset || 0;
      const limit = nextCursor.page_size;
      const slice = this.cachedRecords.slice(offset, offset + limit);

      nextCursor.offset = offset + slice.length;
      nextCursor.discovered_so_far = (nextCursor.discovered_so_far || 0) + slice.length;
      nextCursor.provider_exhausted = nextCursor.offset >= this.cachedRecords.length;

      return { records: slice, nextCursor };
    }

    // Default empty if not implemented
    nextCursor.provider_exhausted = true;
    return { records: [], nextCursor };
  }

  private async ensureCsvLoaded(): Promise<void> {
    if (this.cachedRecords && this.cachedRecords.length > 0) return;
    if (this.isFetching) {
      await new Promise(r => setTimeout(r, 800));
      return;
    }

    this.isFetching = true;
    try {
      const res = await fetch(this.config.endpoint_url, {
        headers: { 'User-Agent': 'AtlasPersonSearch/2.0 (BulkConnector)' }
      });
      if (!res.ok) return;

      const text = await res.text();
      const lines = text.split('\n');
      if (lines.length < 2) return;

      const mapping = this.config.column_mapping || {
        name_field: 'name',
        role_field: 'role',
        organization_field: 'organization'
      };

      const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const nameIdx = header.indexOf(mapping.name_field.toLowerCase());
      const roleIdx = mapping.role_field ? header.indexOf(mapping.role_field.toLowerCase()) : -1;
      const orgIdx = mapping.organization_field ? header.indexOf(mapping.organization_field.toLowerCase()) : -1;
      const emailIdx = mapping.email_field ? header.indexOf(mapping.email_field.toLowerCase()) : -1;

      const HMAC_SECRET = typeof process !== 'undefined' && process.env?.ATLAS_IDENTITY_HMAC_SECRET ? process.env.ATLAS_IDENTITY_HMAC_SECRET : 'atlas_canonical_identity_hmac_secret_2026';

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

        const rawName = nameIdx >= 0 ? cols[nameIdx] : '';
        if (!rawName || rawName.length < 2) continue;

        const role = roleIdx >= 0 ? cols[roleIdx] : 'Personal';
        const org = orgIdx >= 0 ? cols[orgIdx] : this.config.source_name;
        const email = emailIdx >= 0 ? cols[emailIdx] : null;

        const hmac = crypto.createHmac('sha256', HMAC_SECRET);
        const dedupHash = hmac.update(`${this.config.source_id}:${rawName}:${org}`).digest('hex').substring(0, 16);

        records.push({
          candidate_id: `${this.config.source_id.toLowerCase()}_${dedupHash}`,
          display_name: rawName,
          entity_type: 'PERSON',
          work_concept: this.config.work_scope,
          profession_claim: role,
          role_claim: role,
          organization: org,
          geography_claim: this.config.geography_scope,
          geography_evidence: `Registro verificado en ${this.config.source_name}`,
          location: this.config.geography_scope,
          source_id: this.config.source_id,
          source_url: this.config.endpoint_url,
          provider: this.config.source_id,
          evidence_score: 95,
          why_matched_work: `${role} (${org})`,
          why_matched_geography: this.config.geography_scope,
          public_identifiers: {
            source_scoped_fingerprint: dedupHash,
            fingerprint_hash: dedupHash,
            fingerprint_version: 1,
            key_version: 'v1'
          },
          public_email: email,
          enriched: false
        });
      }

      this.cachedRecords = records;
    } catch (err: any) {
      console.warn(`[GenericBulkConnector] Error in ${this.config.source_id}:`, err?.message || err);
    } finally {
      this.isFetching = false;
    }
  }
}
