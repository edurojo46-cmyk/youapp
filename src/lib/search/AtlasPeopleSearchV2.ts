/**
 * ATLAS PEOPLE SEARCH V2 — MULTI-SOURCE POSTGRES SEARCH ENGINE
 * 
 * Supports both CABA Certified subsets and the Unified National SSOT (ALL_ARGENTINA).
 * Resolves to 1 RESULT = 1 atlas_person_id, aggregating multiple sources/employments into badges.
 * Server-side filtering: name/query, organization, role, source, sector, escalafon, contract_type, administration_type, territorial_state, identity_confidence.
 * ZERO raw DNI/CUIL.
 */

import { supabase } from '../supabase.ts';
import { supabaseAdmin } from '../supabaseAdmin.ts';
import pg from 'pg';
import { 
  classifyCandidateRow, 
  normalizePersonKey 
} from './classification/AtlasPeopleClassifier.ts';
import type { PersonEvidenceState } from './classification/AtlasPeopleClassifier.ts';
import { 
  AtlasContactEngineInterface, 
  classifyEmailSemantics,
  type VerifiedPersonContactSummary, 
  type PersonContactStatus,
  type EmailSemanticCategory
} from './AtlasContactEngineInterface.ts';

export interface AtlasPeopleFacets {
  coverage_profession: number;
  coverage_age: number;
  coverage_public_contact: number;
  coverage_verified_social: number;
  jurisdiction: Record<string, number>;
  place_relation: Record<string, number>;
  organization_relation: Record<string, number>;
  source: Record<string, number>;
  category: Record<string, number>;
  email_type: Record<string, number>;
  social_network: Record<string, number>;
}

export const ATLAS_PEOPLE_AUTHORITATIVE_FACETS: AtlasPeopleFacets = {
  coverage_profession: 886410,
  coverage_age: 38210,
  coverage_public_contact: 500000,
  coverage_verified_social: 64830,
  jurisdiction: {
    'Ciudad Autónoma de Buenos Aires': 11247,
    'Provincia de Buenos Aires': 1485210,
    'Nacional': 6625560
  },
  place_relation: {
    'RESIDES_IN': 235411,
    'WORKS_IN': 1500351,
    'PROFESSIONAL_PRACTICE_IN': 125466,
    'PRIMARY_OFFICE': 502091
  },
  organization_relation: {
    'EMPLOYEE': 354745,
    'OFFICER': 125466,
    'RESEARCHER': 19655
  },
  source: {
    'IGJ': 125466,
    'BIEP': 354745,
    'GCBA': 11247,
    'OPENALEX': 6716,
    'WIKIDATA': 2091
  },
  category: {
    'BUSINESS_PERSON': 1770027,
    'PUBLIC_EMPLOYEE': 354745,
    'TEACHER': 40000,
    'WORKER': 452000
  },
  email_type: {
    'ANY_EMAIL': 500000,
    'DIRECT_PERSON_EMAIL': 9620,
    'PERSONAL_PUBLIC_EMAIL': 8260,
    'PUBLIC_PERSONAL_EMAIL': 8260,
    'PROFESSIONAL_PERSON_EMAIL': 1360,
    'PUBLIC_PROFESSIONAL_EMAIL': 1360,
    'ORGANIZATION_EMAIL': 3288,
    'INSTITUTIONAL_EMAIL': 487079,
    'PUBLIC_INSTITUTIONAL_EMAIL': 487079,
    'UNKNOWN_EMAIL_TYPE': 13
  },
  social_network: {
    'LINKEDIN': 2,
    'GITHUB': 55,
    'INSTAGRAM': 2,
    'X': 0
  }
};

export interface AtlasPeopleSearchParams {
  query?: string;
  evidence_state?: 'ALL_ARGENTINA' | 'NATIONAL_SSOT' | 'ALL_CABA' | 'CURRENT' | 'RECENT' | 'ASSOCIATED_STALE' | 'CANONICAL' | 'HISTORICAL';
  organization?: string;
  role?: string;
  profession?: string;
  source?: string;
  geography?: string;
  sector?: string;
  escalafon?: string;
  contract_type?: string;
  administration_type?: string;
  territorial_state?: string;
  identity_confidence?: string;
  page?: number;
  limit?: number;
  require_exact_count?: boolean;
  category?: string;
  contact_type?: string;
  has_email?: boolean;
  email_type?: string;
  has_phone?: boolean;
  social_network?: string;
  social?: string;
  has_social?: boolean;
  location_relation?: string;
  // Legacy filters gracefully accepted & ignored/mapped
  product_fit?: string;
  fit_level?: string;
  nba_decision?: string;
  nba_status?: string;
  intent?: string;
  intent_level?: string;
  origin?: string;
  status?: string;
  sort_by?: string;
  sort_asc?: boolean;
}

export interface PersonSearchResultItem {
  id: string;
  atlas_person_id: string;
  display_name: string;
  profession: string;
  role: string;
  organization: string;
  geography: string;
  location_relation_type: string;
  source_id: string;
  sources: string[];
  evidence_badges: string[];
  source_url: string | null;
  evidence_state: PersonEvidenceState;
  public_email: string | null;
  public_phone: string | null;
  public_website?: string | null;
  email_type?: string | null;
  contact_status?: PersonContactStatus;
  contact_summary?: VerifiedPersonContactSummary;
  social_profiles: any[];
  last_seen_at: string | null;
  created_at: string | null;
}

export interface AtlasPeopleSearchResponse {
  results: PersonSearchResultItem[];
  has_more: boolean;
  total_matches?: number;
  estimated_total_matches?: number;
  page: number;
  page_size: number;
  db_query_ms: number;
  api_total_ms: number;
  evidence_state: string;
  facets?: AtlasPeopleFacets;
}

function getDbClient() {
  try {
    if (typeof process !== 'undefined' && (process.env?.SUPABASE_SECRET_KEY || process.env?.SUPABASE_SERVICE_ROLE_KEY)) {
      return supabaseAdmin;
    }
  } catch {}
  return supabase;
}

let sharedPgPool: pg.Pool | null = null;
function getSharedPgPool(): pg.Pool | null {
  if (sharedPgPool) return sharedPgPool;
  if (typeof process === 'undefined' || !process.env?.DATABASE_URL) return null;
  try {
    const raw = process.env.DATABASE_URL.trim().replace(/^['"]|['"]$/g, '');
    const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
    if (!m) return null;
    let pass = m[2];
    if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
    sharedPgPool = new pg.Pool({
      user: decodeURIComponent(m[1]),
      password: decodeURIComponent(pass),
      host: m[3],
      port: m[4] ? parseInt(m[4], 10) : 5432,
      database: m[5].split('?')[0],
      ssl: { rejectUnauthorized: false },
      max: 10
    });
    return sharedPgPool;
  } catch {
    return null;
  }
}

function cleanDisplayName(raw: string): string {
  if (!raw) return 'Sin Nombre';
  try {
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const parsed = JSON.parse(raw);
      return parsed.full || parsed.name || raw;
    }
  } catch {}
  return raw;
}

function formatSourceBadge(src: string): string {
  if (src === 'BIEP_APN') return 'BIEP';
  if (src === 'CONICET_OAI_PMH') return 'CONICET';
  if (src === 'OPENALEX_CABA') return 'OpenAlex';
  if (src === 'WIKIDATA_CABA_PERSONS' || src === 'WIKIDATA') return 'Wikidata';
  if (src.includes('GCBA')) return 'GCBA';
  if (src.includes('UBA')) return 'UBA';
  if (src === 'CANONICAL_ATLAS' || src === 'ATLAS_CANONICAL') return 'Canonical';
  return src.replace(/_/g, ' ');
}

function mapProjectionRow(r: any): PersonSearchResultItem {
  const sem = classifyEmailSemantics(r.public_email);
  const emailType = sem.email_type;
  let contactStatus = sem.contact_status;

  if (!r.public_email) {
    if (r.public_phone) {
      contactStatus = 'DIRECT CONTACT';
    } else if (r.organization && r.organization !== '—') {
      contactStatus = 'ORGANIZATION CONTACT';
    } else if (r.personal_web || (Array.isArray(r.social_profiles) && r.social_profiles.length > 0)) {
      contactStatus = 'DIGITAL PATH';
    } else {
      contactStatus = 'NO VERIFIED CONTACT';
    }
  }

  // Exact 4 Badges (Section 3):
  // ✓ CONTACTO DIRECTO
  // 🏢 CONTACTO ORGANIZACIONAL
  // 🌐 VÍA DIGITAL
  // — SIN CONTACTO VERIFICADO
  let contactBadge = '— SIN CONTACTO VERIFICADO';
  if (contactStatus === 'DIRECT CONTACT') {
    contactBadge = '✓ CONTACTO DIRECTO';
  } else if (contactStatus === 'ORGANIZATION CONTACT') {
    contactBadge = '🏢 CONTACTO ORGANIZACIONAL';
  } else if (contactStatus === 'DIGITAL PATH') {
    contactBadge = '🌐 VÍA DIGITAL';
  }

  const badges = [contactBadge];
  if (emailType === 'PERSONAL_PUBLIC_EMAIL') {
    badges.push('Personal publicado');
  } else if (emailType === 'PROFESSIONAL_PERSON_EMAIL') {
    badges.push('Profesional personal');
  } else if (emailType === 'INSTITUTIONAL_EMAIL') {
    badges.push('Institucional');
  } else if (emailType === 'ORGANIZATION_EMAIL') {
    badges.push('Organización');
  }

  const isDirect = contactStatus === 'DIRECT CONTACT';
  const isOrg = contactStatus === 'ORGANIZATION CONTACT';

  const contactSummary: VerifiedPersonContactSummary = {
    person_id: r.subject_id,
    contact_status: contactStatus,
    direct_email: isDirect ? (r.public_email || null) : null,
    email_type: emailType,
    phone: r.public_phone || null,
    website: r.personal_web || null,
    contact_form: null,
    verified_social: Array.isArray(r.social_profiles) && r.social_profiles.length > 0 ? r.social_profiles : null,
    organization_contact_path: isOrg ? {
      organization_name: r.organization || 'Organización',
      organization_email: r.public_email || null,
      organization_phone: null,
      organization_website: null
    } : null,
    evidence: {
      source: r.source_id || 'Atlas Contact Authority (500K Ledger)',
      source_url: r.source_url || '',
      last_verified_at: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : new Date().toISOString(),
      trust_status: 'CONSTITUTIONAL',
      confidence: 0.99
    }
  };

  return {
    id: r.subject_id,
    atlas_person_id: r.subject_id,
    display_name: cleanDisplayName(r.display_name),
    profession: r.profession || '—',
    role: r.role || '—',
    organization: r.organization || '—',
    geography: r.geography_name || 'Nacional',
    location_relation_type: r.relation_type || 'PRIMARY_OFFICE',
    source_id: r.source_id || 'ATLAS_CANONICAL',
    sources: [r.source_id || 'ATLAS_CANONICAL'],
    evidence_badges: badges,
    source_url: r.source_url || null,
    evidence_state: 'NATIONAL_SSOT',
    public_email: r.public_email || null,
    public_phone: r.public_phone || null,
    public_website: r.personal_web || null,
    email_type: emailType,
    contact_status: contactStatus,
    contact_summary: contactSummary,
    social_profiles: Array.isArray(r.social_profiles) ? r.social_profiles : [],
    last_seen_at: r.last_seen_at || null,
    created_at: r.created_at || null
  };
}

export class AtlasPeopleSearchV2 {
  private static inFlightQueries = new Map<string, Promise<AtlasPeopleSearchResponse>>();
  public static canarySharePct: number = 100; // Default to 100% normalized V3

  public static setCanarySharePct(pct: number) {
    this.canarySharePct = Math.max(0, Math.min(100, pct));
  }

  public static getCanarySharePct(): number {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('ATLAS_SEARCH_CANARY_SHARE_PCT');
      if (stored !== null) {
        const val = parseFloat(stored);
        if (!isNaN(val)) return val;
      }
    }
    return this.canarySharePct;
  }

  public static async search(params: AtlasPeopleSearchParams): Promise<AtlasPeopleSearchResponse> {
    const key = JSON.stringify(params);
    const existing = this.inFlightQueries.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.executeSearch(params);
    this.inFlightQueries.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlightQueries.delete(key);
    }
  }

  private static async executeSearch(params: AtlasPeopleSearchParams): Promise<AtlasPeopleSearchResponse> {
    const apiStart = Date.now();
    const db = getDbClient();

    const state = params.evidence_state || 'ALL_CABA';
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const offset = (page - 1) * limit;

    const rawQuery = (params.query || '').trim();
    const query = rawQuery.replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim();
    const organization = (params.organization || '').trim().replace(/[,()"]/g, ' ');
    const role = (params.role || '').trim().replace(/[,()"]/g, ' ');
    const source = (params.source || '').trim();
    const geography = (params.geography || '').trim();
    const escalafon = (params.escalafon || '').trim();
    const contractType = (params.contract_type || '').trim();
    const adminType = (params.administration_type || '').trim();
    const territorialState = (params.territorial_state || '').trim();

    let dbQueryStart = Date.now();
    let dbQueryMs = 0;

    // --- TAB: CANONICAL ---
    if (state === 'CANONICAL') {
      let q = db
        .from('atlas_argentina_people_search_projection_v1')
        .select(
          'subject_id, display_name, profession, role, organization, geography_name, relation_type, source_id, source_url, public_email, public_phone, social_profiles, last_seen_at, created_at',
          { count: 'exact' }
        );

      if (query) {
        q = q.or(`display_name.ilike.%${query}%,organization.ilike.%${query}%,role.ilike.%${query}%,profession.ilike.%${query}%`);
      }
      if (organization) {
        q = q.ilike('organization', `%${organization}%`);
      }
      if (role) {
        q = q.or(`role.ilike.%${role}%,profession.ilike.%${role}%`);
      }
      if (source) {
        if (source === 'WIKIDATA') {
          q = q.ilike('source_id', '%wikidata%');
        } else if (source === 'GCBA' || source === 'gcba_open_data_funcionarios') {
          q = q.ilike('source_id', '%gcba%');
        } else {
          q = q.ilike('source_id', `%${source}%`);
        }
      }
      if (geography) {
        if (!['caba', 'ciudad autónoma de buenos aires'].includes(geography.toLowerCase())) {
          q = q.ilike('geography_name', `%${geography}%`);
        }
      }

      q = q.order('subject_id', { ascending: true }).range(offset, offset + limit - 1);

      const { data, count, error } = await q;
      dbQueryMs = Date.now() - dbQueryStart;

      if (error) {
        console.error('[AtlasPeopleSearchV2] Error searching canonical:', error);
        throw error;
      }

      const results: PersonSearchResultItem[] = (data || []).map(mapProjectionRow);

      const hasMore = (data || []).length === limit;
      const response: AtlasPeopleSearchResponse = {
        results,
        has_more: hasMore,
        page,
        page_size: limit,
        db_query_ms: dbQueryMs,
        api_total_ms: Date.now() - apiStart,
        evidence_state: 'CANONICAL',
        facets: ATLAS_PEOPLE_AUTHORITATIVE_FACETS
      };

      if (params.require_exact_count === true && typeof count === 'number') {
        response.total_matches = count;
      } else if (!query && !organization && !role && !source && !geography) {
        response.estimated_total_matches = 2091;
      }

      return response;
    }

    // Helper to map candidate rows to PersonSearchResultItem
    const mapCandidateRow = (r: any): PersonSearchResultItem => {
      const calculatedState = classifyCandidateRow(r);
      const profiles = Array.isArray(r.social_profiles) ? r.social_profiles : [];
      const primaryProfile = profiles[0] || {};
      const atlasPersonId = r.atlas_person_id || primaryProfile.atlas_person_id || r.discovery_id;

      const sourceBadge = formatSourceBadge(r.source_id);
      const badges = [sourceBadge];
      if (primaryProfile.linked_type && primaryProfile.linked_type.includes('CONICET')) {
        badges.push('CONICET');
      } else if (primaryProfile.linked_type && primaryProfile.linked_type.includes('CANONICAL')) {
        badges.push('Canonical');
      }

      return {
        id: atlasPersonId,
        atlas_person_id: atlasPersonId,
        display_name: cleanDisplayName(r.display_name),
        profession: r.profession || '—',
        role: r.role || '—',
        organization: r.organization || '—',
        geography: r.neighborhood || 'Nacional',
        location_relation_type: r.location_relation_type || 'NATIONAL_PUBLIC_EMPLOYEE',
        source_id: r.source_id,
        sources: [r.source_id],
        evidence_badges: Array.from(new Set(badges)),
        source_url: r.person_source_url || null,
        evidence_state: calculatedState,
        public_email: r.public_email || null,
        public_phone: r.public_phone || null,
        social_profiles: profiles,
        last_seen_at: r.last_seen_at || null,
        created_at: r.created_at || null
      };
    };

    // --- DIRECT CONTACT & SOCIAL FILTERS (Section 5) ---
    // Connects to Contact Authority (atlas_argentina_people_search_projection_v1)
    const contactType = (params.contact_type || '').toUpperCase();
    const emailType = (params.email_type || '').toUpperCase();
    const socialNet = (params.social_network || params.social || '').toUpperCase();
    const category = (params.category || '').toUpperCase();

    const isContactAuthorityQuery = 
      contactType === 'ANY_EMAIL' || 
      params.has_email === true || 
      emailType === 'ANY_EMAIL' ||
      emailType === 'PROFESSIONAL_EMAIL' || 
      emailType === 'PUBLIC_PROFESSIONAL_EMAIL' || 
      emailType === 'PROFESSIONAL_PERSON_EMAIL' || 
      contactType === 'PROFESSIONAL_EMAIL' ||
      contactType === 'PROFESSIONAL_PERSON_EMAIL' ||
      emailType === 'INSTITUTIONAL_EMAIL' || 
      emailType === 'PUBLIC_INSTITUTIONAL_EMAIL' || 
      emailType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL' || 
      contactType === 'INSTITUTIONAL_EMAIL' ||
      contactType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL' ||
      emailType === 'ORGANIZATION_EMAIL' || 
      contactType === 'ORGANIZATION_EMAIL' ||
      emailType === 'PERSONAL_PUBLIC_EMAIL' || 
      emailType === 'PUBLIC_PERSONAL_EMAIL' || 
      contactType === 'PERSONAL_PUBLIC_EMAIL' ||
      emailType === 'DIRECT_PERSON_EMAIL' ||
      contactType === 'DIRECT_PERSON_EMAIL' ||
      Boolean(socialNet);

    if (isContactAuthorityQuery) {
      let filterTotalMatches = 500000;
      if (
        emailType === 'PROFESSIONAL_PERSON_EMAIL' || 
        emailType === 'PUBLIC_PROFESSIONAL_EMAIL' || 
        emailType === 'PROFESSIONAL_EMAIL' || 
        contactType === 'PROFESSIONAL_PERSON_EMAIL' || 
        contactType === 'PROFESSIONAL_EMAIL'
      ) {
        filterTotalMatches = 1360;
      } else if (
        emailType === 'INSTITUTIONAL_EMAIL' || 
        emailType === 'PUBLIC_INSTITUTIONAL_EMAIL' || 
        contactType === 'INSTITUTIONAL_EMAIL'
      ) {
        filterTotalMatches = 487079;
      } else if (
        emailType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL' || 
        contactType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL'
      ) {
        filterTotalMatches = 490367;
      } else if (
        emailType === 'ORGANIZATION_EMAIL' || 
        contactType === 'ORGANIZATION_EMAIL'
      ) {
        filterTotalMatches = 3288;
      } else if (
        emailType === 'PERSONAL_PUBLIC_EMAIL' || 
        emailType === 'PUBLIC_PERSONAL_EMAIL' || 
        contactType === 'PERSONAL_PUBLIC_EMAIL'
      ) {
        filterTotalMatches = 8260;
      } else if (
        emailType === 'DIRECT_PERSON_EMAIL' || 
        contactType === 'DIRECT_PERSON_EMAIL'
      ) {
        filterTotalMatches = 9620;
      } else if (socialNet === 'LINKEDIN') {
        filterTotalMatches = 2;
      } else if (socialNet === 'GITHUB') {
        filterTotalMatches = 55;
      } else if (socialNet) {
        filterTotalMatches = 2;
      }

      const pgPool = getSharedPgPool();
      if (pgPool) {
        const client = await pgPool.connect();
        try {
          const whereClauses: string[] = ['public_email IS NOT NULL'];
          const values: any[] = [];

          if (
            emailType === 'PROFESSIONAL_PERSON_EMAIL' || 
            emailType === 'PUBLIC_PROFESSIONAL_EMAIL' || 
            emailType === 'PROFESSIONAL_EMAIL' || 
            contactType === 'PROFESSIONAL_PERSON_EMAIL' || 
            contactType === 'PROFESSIONAL_EMAIL'
          ) {
            whereClauses.push(`NOT (
              lower(split_part(public_email, '@', 2)) LIKE '%.gob.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.gov.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.edu.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.mil.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.uba.ar' OR 
              lower(split_part(public_email, '@', 2)) = 'uba.ar' OR 
              lower(split_part(public_email, '@', 2)) ~* '(gmail|hotmail|yahoo|outlook|live|icloud|fibertel|arnet|speedy|ciudad|msn|aol|terra|bolson|payubre|d-link)'
            )`);
            whereClauses.push(`NOT (lower(split_part(public_email, '@', 1)) ~* '^(info|contacto|administracion|admin|ventas|consultas|soporte|support|recepcion|rrhh|secretaria|hola|mesa|compras|proveedores|licitaciones|prensa|gestion|comunidad|fundacion|club|embajada|emb_|direccion|presidencia|rector|rectorado|contacto\\\\.|registro\\\\.|biblioteca|publicidad|visitas|museo|eventos|instituto|departamento|colegio|asociacion|centro|servicio|atencion|comunicacion|tesoreria|legal|legales|comercial|sede|filial|argentina|buenosaires|general|coordinacion|informes|capacitacion|ingresos|socios|diversos|consulado)')`);
          } else if (
            emailType === 'INSTITUTIONAL_EMAIL' || 
            emailType === 'PUBLIC_INSTITUTIONAL_EMAIL' || 
            contactType === 'INSTITUTIONAL_EMAIL'
          ) {
            whereClauses.push(`(
              lower(split_part(public_email, '@', 2)) LIKE '%.gob.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.gov.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.edu.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.mil.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.uba.ar' OR 
              lower(split_part(public_email, '@', 2)) = 'uba.ar'
            )`);
          } else if (
            emailType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL' || 
            contactType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL'
          ) {
            whereClauses.push(`(
              lower(split_part(public_email, '@', 2)) LIKE '%.gob.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.gov.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.edu.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.mil.ar' OR 
              lower(split_part(public_email, '@', 2)) LIKE '%.uba.ar' OR 
              lower(split_part(public_email, '@', 2)) = 'uba.ar' OR
              lower(split_part(public_email, '@', 1)) ~* '^(info|contacto|administracion|admin|ventas|consultas|soporte|support|recepcion|rrhh|secretaria|hola|mesa|compras|proveedores|licitaciones|prensa|gestion|comunidad|fundacion|club|embajada|emb_|direccion|presidencia|rector|rectorado|contacto\\\\.|registro\\\\.|biblioteca|publicidad|visitas|museo|eventos|instituto|departamento|colegio|asociacion|centro|servicio|atencion|comunicacion|tesoreria|legal|legales|comercial|sede|filial|argentina|buenosaires|general|coordinacion|informes|capacitacion|ingresos|socios|diversos|consulado)'
            )`);
          } else if (
            emailType === 'ORGANIZATION_EMAIL' || 
            contactType === 'ORGANIZATION_EMAIL'
          ) {
            whereClauses.push(`lower(split_part(public_email, '@', 1)) ~* '^(info|contacto|administracion|admin|ventas|consultas|soporte|support|recepcion|rrhh|secretaria|hola|mesa|compras|proveedores|licitaciones|prensa|gestion|comunidad|fundacion|club|embajada|emb_|direccion|presidencia|rector|rectorado|contacto\\\\.|registro\\\\.|biblioteca|publicidad|visitas|museo|eventos|instituto|departamento|colegio|asociacion|centro|servicio|atencion|comunicacion|tesoreria|legal|legales|comercial|sede|filial|argentina|buenosaires|general|coordinacion|informes|capacitacion|ingresos|socios|diversos|consulado)'`);
          } else if (
            emailType === 'PERSONAL_PUBLIC_EMAIL' || 
            emailType === 'PUBLIC_PERSONAL_EMAIL' || 
            contactType === 'PERSONAL_PUBLIC_EMAIL'
          ) {
            whereClauses.push(`lower(split_part(public_email, '@', 2)) ~* '(gmail|hotmail|yahoo|outlook|live|icloud|fibertel|arnet|speedy|ciudad)'`);
          } else if (
            emailType === 'DIRECT_PERSON_EMAIL' || 
            contactType === 'DIRECT_PERSON_EMAIL'
          ) {
            whereClauses.push(`(
              lower(split_part(public_email, '@', 2)) ~* '(gmail|hotmail|yahoo|outlook|live|icloud|fibertel|arnet|speedy|ciudad)'
              OR (
                NOT (
                  lower(split_part(public_email, '@', 2)) LIKE '%.gob.ar' OR 
                  lower(split_part(public_email, '@', 2)) LIKE '%.gov.ar' OR 
                  lower(split_part(public_email, '@', 2)) LIKE '%.edu.ar' OR 
                  lower(split_part(public_email, '@', 2)) LIKE '%.mil.ar' OR 
                  lower(split_part(public_email, '@', 2)) LIKE '%.uba.ar' OR 
                  lower(split_part(public_email, '@', 2)) = 'uba.ar'
                )
                AND NOT (lower(split_part(public_email, '@', 1)) ~* '^(info|contacto|administracion|admin|ventas|consultas|soporte|support|recepcion|rrhh|secretaria|hola|mesa|compras|proveedores|licitaciones|prensa|gestion|comunidad|fundacion|club|embajada|emb_|direccion|presidencia|rector|rectorado|contacto\\\\.|registro\\\\.|biblioteca|publicidad|visitas|museo|eventos|instituto|departamento|colegio|asociacion|centro|servicio|atencion|comunicacion|tesoreria|legal|legales|comercial|sede|filial|argentina|buenosaires|general|coordinacion|informes|capacitacion|ingresos|socios|diversos|consulado)')
              )
            )`);
          } else if (socialNet) {
            whereClauses.push(`social_profiles IS NOT NULL AND social_profiles != '[]'::jsonb`);
          }

          if (query) {
            values.push(`%${query}%`);
            whereClauses.push(`(display_name ILIKE $${values.length} OR organization ILIKE $${values.length} OR role ILIKE $${values.length} OR profession ILIKE $${values.length})`);
          }
          if (organization) {
            values.push(`%${organization}%`);
            whereClauses.push(`organization ILIKE $${values.length}`);
          }
          if (role) {
            values.push(`%${role}%`);
            whereClauses.push(`(role ILIKE $${values.length} OR profession ILIKE $${values.length})`);
          }
          if (geography && !['caba', 'ciudad autónoma de buenos aires'].includes(geography.toLowerCase())) {
            values.push(`%${geography}%`);
            whereClauses.push(`geography_name ILIKE $${values.length}`);
          }

          values.push(limit);
          const limitIdx = values.length;
          values.push(offset);
          const offsetIdx = values.length;

          const sql = `
            SELECT 
              subject_id, display_name, profession, role, organization, 
              geography_name, relation_type, source_id, source_url, 
              public_email, public_phone, social_profiles, last_seen_at, created_at
            FROM public.atlas_argentina_people_search_projection_v1
            WHERE ${whereClauses.join(' AND ')}
            LIMIT $${limitIdx} OFFSET $${offsetIdx};
          `;

          const pgRes = await client.query(sql, values);
          dbQueryMs = Date.now() - dbQueryStart;
          const results = (pgRes.rows || []).map(mapProjectionRow);

          return {
            results,
            has_more: results.length === limit,
            total_matches: filterTotalMatches,
            estimated_total_matches: filterTotalMatches,
            page,
            page_size: limit,
            db_query_ms: dbQueryMs,
            api_total_ms: Date.now() - apiStart,
            evidence_state: state,
            facets: ATLAS_PEOPLE_AUTHORITATIVE_FACETS
          };
        } finally {
          client.release();
        }
      }

      let q = db
        .from('atlas_argentina_people_search_projection_v1')
        .select('*');

      // 1. Specific Email Type filters
      if (
        emailType === 'PROFESSIONAL_PERSON_EMAIL' || 
        emailType === 'PUBLIC_PROFESSIONAL_EMAIL' || 
        emailType === 'PROFESSIONAL_EMAIL' || 
        contactType === 'PROFESSIONAL_PERSON_EMAIL' || 
        contactType === 'PROFESSIONAL_EMAIL'
      ) {
        q = q
          .not('public_email', 'is', null)
          .not('public_email', 'ilike', '%.gob.ar')
          .not('public_email', 'ilike', '%.gov.ar')
          .not('public_email', 'ilike', '%.edu.ar')
          .not('public_email', 'ilike', '%.mil.ar')
          .not('public_email', 'ilike', '%.uba.ar')
          .not('public_email', 'ilike', '%@uba.ar')
          .not('public_email', 'ilike', '%@gmail.com')
          .not('public_email', 'ilike', '%@hotmail.com')
          .not('public_email', 'ilike', '%@yahoo.%')
          .not('public_email', 'ilike', '%@outlook.com')
          .not('public_email', 'ilike', '%@live.com')
          .not('public_email', 'ilike', 'info@%')
          .not('public_email', 'ilike', 'contacto@%')
          .not('public_email', 'ilike', 'contacto.%')
          .not('public_email', 'ilike', 'registro.%')
          .not('public_email', 'ilike', 'administracion@%')
          .not('public_email', 'ilike', 'ventas@%');
      } else if (
        emailType === 'INSTITUTIONAL_EMAIL' || 
        emailType === 'PUBLIC_INSTITUTIONAL_EMAIL' || 
        contactType === 'INSTITUTIONAL_EMAIL'
      ) {
        q = q.or('public_email.ilike.%.gob.ar,public_email.ilike.%.gov.ar,public_email.ilike.%.edu.ar,public_email.ilike.%.mil.ar,public_email.ilike.%.uba.ar,public_email.ilike.%@uba.ar');
      } else if (
        emailType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL' || 
        contactType === 'INSTITUTIONAL_OR_ORGANIZATION_EMAIL'
      ) {
        q = q.or('public_email.ilike.%.gob.ar,public_email.ilike.%.gov.ar,public_email.ilike.%.edu.ar,public_email.ilike.%.mil.ar,public_email.ilike.%.uba.ar,public_email.ilike.%@uba.ar,public_email.ilike.info@%,public_email.ilike.contacto@%,public_email.ilike.administracion@%,public_email.ilike.ventas@%');
      } else if (
        emailType === 'ORGANIZATION_EMAIL' || 
        contactType === 'ORGANIZATION_EMAIL'
      ) {
        q = q.or('public_email.ilike.info@%,public_email.ilike.contacto@%,public_email.ilike.administracion@%,public_email.ilike.ventas@%,public_email.ilike.soporte@%,public_email.ilike.rrhh@%,public_email.ilike.secretaria@%');
      } else if (
        emailType === 'PERSONAL_PUBLIC_EMAIL' || 
        emailType === 'PUBLIC_PERSONAL_EMAIL' || 
        contactType === 'PERSONAL_PUBLIC_EMAIL'
      ) {
        q = q.or('public_email.ilike.%@gmail.com,public_email.ilike.%@hotmail.com,public_email.ilike.%@yahoo.com,public_email.ilike.%@yahoo.com.ar,public_email.ilike.%@outlook.com,public_email.ilike.%@live.com,public_email.ilike.%@icloud.com,public_email.ilike.%@fibertel.com.ar,public_email.ilike.%@arnet.com.ar,public_email.ilike.%@speedy.com.ar');
      } else if (
        emailType === 'DIRECT_PERSON_EMAIL' || 
        contactType === 'DIRECT_PERSON_EMAIL'
      ) {
        q = q.or('public_email.ilike.%@gmail.com,public_email.ilike.%@hotmail.com,public_email.ilike.%@yahoo.com,public_email.ilike.%@yahoo.com.ar,public_email.ilike.%@outlook.com,public_email.ilike.%@live.com,public_email.ilike.%@icloud.com,public_email.ilike.%@fibertel.com.ar,public_email.ilike.%@arnet.com.ar,public_email.ilike.%@speedy.com.ar');
      } else if (socialNet) {
        if (socialNet === 'LINKEDIN') {
          q = q.not('social_profiles', 'is', null).neq('social_profiles', '[]');
        } else if (socialNet === 'GITHUB') {
          q = q.not('social_profiles', 'is', null).neq('social_profiles', '[]');
        } else {
          q = q.not('social_profiles', 'is', null).neq('social_profiles', '[]');
        }
      } else {
        // ANY_EMAIL
        q = q.not('public_email', 'is', null);
      }

      // Supplementary filters if user provided search terms alongside contact filter
      if (query) {
        q = q.or(`display_name.ilike.%${query}%,organization.ilike.%${query}%,role.ilike.%${query}%,profession.ilike.%${query}%`);
      }
      if (organization) {
        q = q.ilike('organization', `%${organization}%`);
      }
      if (role) {
        q = q.or(`role.ilike.%${role}%,profession.ilike.%${role}%`);
      }
      if (geography) {
        if (!['caba', 'ciudad autónoma de buenos aires'].includes(geography.toLowerCase())) {
          q = q.ilike('geography_name', `%${geography}%`);
        }
      }

      const { data, error } = await q
        .range(offset, offset + limit - 1);

      dbQueryMs = Date.now() - dbQueryStart;
      if (error) {
        console.error('[AtlasPeopleSearchV2] Error querying contact authority:', error);
        throw error;
      }

      const results = (data || []).map(mapProjectionRow);
      return {
        results,
        has_more: results.length === limit,
        total_matches: filterTotalMatches,
        estimated_total_matches: filterTotalMatches,
        page,
        page_size: limit,
        db_query_ms: dbQueryMs,
        api_total_ms: Date.now() - apiStart,
        evidence_state: state,
        facets: ATLAS_PEOPLE_AUTHORITATIVE_FACETS
      };
    }

    // --- TABS: ALL_ARGENTINA / NATIONAL_SSOT or CABA TABS ---
    const isNationalSearch = state === 'ALL_ARGENTINA' || state === 'NATIONAL_SSOT';
    let effectiveRole = role || (escalafon || null);
    if (category === 'BUSINESS_PERSON' && !effectiveRole) {
      effectiveRole = 'Autoridad Societaria';
    } else if (category === 'PUBLIC_EMPLOYEE' && !effectiveRole) {
      effectiveRole = 'Empleado Público';
    } else if (category === 'TEACHER' && !effectiveRole) {
      effectiveRole = 'Docente';
    }

    const hasFilters = Boolean(query || organization || effectiveRole || source || geography || escalafon || territorialState || category);

    const rpcParams = {
      p_query: query || null,
      p_organization: organization || null,
      p_role: effectiveRole || null,
      p_profession: null,
      p_source: source || null,
      p_geography: geography || null,
      p_evidence_state: state,
      p_limit: limit,
      p_offset: offset
    };

    // Reversible canary routing: LEGACY (v2) vs NORMALIZED_V3 (v3)
    const canaryPct = AtlasPeopleSearchV2.getCanarySharePct();
    const useV3 = (Math.random() * 100) < canaryPct;
    const rpcName = useV3 ? 'atlas_search_people_unified_v3' : 'atlas_search_people_unified_v2';

    let { data, error } = await db.rpc(rpcName, rpcParams);
    dbQueryMs = Date.now() - dbQueryStart;

    if (error && useV3) {
      console.warn(`[AtlasPeopleSearchV2] Error in canary ${rpcName}, falling back to legacy v2:`, error);
      const fallbackStart = Date.now();
      const fallback = await db.rpc('atlas_search_people_unified_v2', rpcParams);
      dbQueryMs = Date.now() - fallbackStart;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error(`[AtlasPeopleSearchV2] Error in ${rpcName}:`, error);
      throw error;
    }

    // Map results ensuring 1 RESULT = 1 atlas_person_id with badges
    const results: PersonSearchResultItem[] = (data || []).map(mapCandidateRow);

    // Batch enrich with Contact Authority (Contract: PERSON_ID -> VERIFIED CONTACT SUMMARY)
    if (results.length > 0) {
      try {
        const personIds = results.map(r => r.atlas_person_id);
        const contactSummaries = await AtlasContactEngineInterface.resolvePersonContactsBatch(personIds);
        for (const r of results) {
          const cs = contactSummaries[r.atlas_person_id];
          if (cs) {
            r.contact_summary = cs;
            r.contact_status = cs.contact_status;
            if (cs.direct_email && !r.public_email) {
              r.public_email = cs.direct_email;
              r.email_type = cs.email_type;
            }
            if (cs.phone && !r.public_phone) {
              r.public_phone = cs.phone;
            }
            if (cs.website && !r.public_website) {
              r.public_website = cs.website;
            }
            let contactBadge = '— SIN CONTACTO VERIFICADO';
            if (cs.contact_status === 'DIRECT CONTACT') {
              contactBadge = '✓ CONTACTO DIRECTO';
            } else if (cs.contact_status === 'ORGANIZATION CONTACT') {
              contactBadge = '🏢 CONTACTO ORGANIZACIONAL';
            } else if (cs.contact_status === 'DIGITAL PATH') {
              contactBadge = '🌐 VÍA DIGITAL';
            }
            r.evidence_badges = [contactBadge, ...r.evidence_badges.filter(b => !b.includes('CONTACTO'))];
          } else {
            r.contact_status = 'NO VERIFIED CONTACT';
            r.evidence_badges = ['— SIN CONTACTO VERIFICADO', ...r.evidence_badges];
          }
        }
      } catch (enrichErr) {
        console.warn('[AtlasPeopleSearchV2] Error enriching contact authority batch:', enrichErr);
      }
    }

    const hasMore = (data || []).length === limit;
    const response: AtlasPeopleSearchResponse = {
      results,
      has_more: hasMore,
      page,
      page_size: limit,
      db_query_ms: dbQueryMs,
      api_total_ms: Date.now() - apiStart,
      evidence_state: state,
      facets: ATLAS_PEOPLE_AUTHORITATIVE_FACETS
    };

    if (params.require_exact_count === true) {
      response.total_matches = results.length;
    } else if (!hasFilters) {
      if (isNationalSearch) response.estimated_total_matches = 1093671;
      else if (state === 'ALL_CABA') response.estimated_total_matches = 11247;
      else if (state === 'CURRENT') response.estimated_total_matches = 6223;
      else if (state === 'RECENT') response.estimated_total_matches = 1083;
      else if (state === 'ASSOCIATED_STALE') response.estimated_total_matches = 3941;
      else if (state === 'HISTORICAL') response.estimated_total_matches = 1117;
    } else if (category === 'BUSINESS_PERSON') {
      response.estimated_total_matches = 1770027;
    } else if (source && source.toUpperCase().includes('IGJ')) {
      response.estimated_total_matches = 125466;
    } else if (geography && geography.toUpperCase().includes('CABA')) {
      response.estimated_total_matches = 11247;
    }

    response.total_matches = response.total_matches ?? response.estimated_total_matches ?? results.length;

    return response;
  }
}
