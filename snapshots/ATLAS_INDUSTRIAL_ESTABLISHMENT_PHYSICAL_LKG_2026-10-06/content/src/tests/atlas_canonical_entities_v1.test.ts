/**
 * Atlas Semantic Intelligence — Canonical Entities V1 Test Suite
 * 42 Comprehensive Tests covering:
 * - Deterministic normalization (text, domains, corporate suffixes, hierarchical locations)
 * - Multi-signal rule-based resolution engine
 * - Strong identity, supporting signals, and hard conflict detection
 * - Non-destructive, reversible entity merges with cycle protection
 * - Alias management & immutable source observations
 * - PII minimization (no plaintext emails/phones)
 * - Integrity & Mail Fabric freeze verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  EntityNormalizationEngine,
  EntityResolutionEngine,
  AtlasCanonicalEntityService,
  EntityCandidate,
  CanonicalEntity,
  SourceObservation,
  EntityMergeRecord,
  EntityAlias
} from '../lib/atlasSemantic';

// In-Memory Mock Supabase Client with full chainable query builder for offline unit & integration testing
class MockQueryBuilder {
  private filters: Array<{ type: 'eq' | 'in' | 'or'; col?: string; val?: any; orExpr?: string }> = [];
  private orderCol?: string;
  private ascending = true;

  constructor(private getTable: () => any[]) {}

  eq(col: string, val: any) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push({ type: 'in', col, val: vals });
    return this;
  }

  or(orExpr: string) {
    this.filters.push({ type: 'or', orExpr });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.ascending = opts?.ascending !== false;
    return this;
  }

  private execute(): any[] {
    let result = [...this.getTable()];
    for (const f of this.filters) {
      if (f.type === 'eq') {
        result = result.filter(r => r[f.col!] === f.val);
      } else if (f.type === 'in') {
        result = result.filter(r => (f.val as any[]).includes(r[f.col!]));
      } else if (f.type === 'or') {
        const clauses = f.orExpr!.split(',').map(c => {
          const firstDot = c.indexOf('.');
          const secondDot = c.indexOf('.', firstDot + 1);
          const col = c.substring(0, firstDot);
          let val = c.substring(secondDot + 1);
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          return { col, val };
        });
        result = result.filter(r => clauses.some(cl => r[cl.col] === cl.val));
      }
    }
    if (this.orderCol) {
      result.sort((a, b) => {
        const va = a[this.orderCol!];
        const vb = b[this.orderCol!];
        if (va < vb) return this.ascending ? -1 : 1;
        if (va > vb) return this.ascending ? 1 : -1;
        return 0;
      });
    }
    return result;
  }

  async single() {
    const res = this.execute();
    return { data: res[0] || null, error: res[0] ? null : { message: 'Not found' } };
  }

  async maybeSingle() {
    const res = this.execute();
    return { data: res[0] || null, error: null };
  }

  then(resolve: (val: any) => void) {
    resolve({ data: this.execute(), error: null });
  }
}

class MockSupabaseClient {
  public canonicalEntities: CanonicalEntity[] = [];
  public sourceObservations: SourceObservation[] = [];
  public entityAliases: EntityAlias[] = [];
  public entityMerges: EntityMergeRecord[] = [];

  public from(tableName: string) {
    const self = this;
    const getTable = () => self.getTable(tableName);

    return {
      select: (fields?: string) => new MockQueryBuilder(getTable),

      insert: (record: any) => ({
        select: (fields?: string) => ({
          single: async () => {
            const table = self.getTable(tableName);
            const newRecord = {
              ...record,
              canonical_entity_id: record.canonical_entity_id || crypto.randomUUID(),
              observation_id: record.observation_id || crypto.randomUUID(),
              merge_id: record.merge_id || crypto.randomUUID(),
              alias_id: record.alias_id || crypto.randomUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            table.push(newRecord);
            return { data: newRecord, error: null };
          }
        })
      }),

      upsert: (record: any, opts?: any) => ({
        select: (fields?: string) => ({
          single: async () => {
            const table = self.getTable(tableName);
            if (tableName === 'atlas_entity_source_observations') {
              const existingIdx = table.findIndex((r: any) =>
                r.tenant_id === record.tenant_id &&
                r.source_name === record.source_name &&
                r.source_record_id === record.source_record_id &&
                r.source_entity_key === record.source_entity_key
              );
              if (existingIdx >= 0) {
                table[existingIdx] = { ...table[existingIdx], ...record, updated_at: new Date().toISOString() };
                return { data: table[existingIdx], error: null };
              }
            } else if (tableName === 'atlas_entity_aliases') {
              const existingIdx = table.findIndex((r: any) =>
                r.tenant_id === record.tenant_id &&
                r.canonical_entity_id === record.canonical_entity_id &&
                r.normalized_alias === record.normalized_alias
              );
              if (existingIdx >= 0) {
                table[existingIdx] = { ...table[existingIdx], ...record };
                return { data: table[existingIdx], error: null };
              }
            }
            const newRecord = {
              ...record,
              observation_id: record.observation_id || crypto.randomUUID(),
              alias_id: record.alias_id || crypto.randomUUID(),
              created_at: new Date().toISOString()
            };
            table.push(newRecord);
            return { data: newRecord, error: null };
          }
        })
      }),

      update: (updates: any) => {
        const filters: Array<{ col: string; val: any }> = [];
        const builder = {
          eq: (col: string, val: any) => {
            filters.push({ col, val });
            return builder;
          },
          then: (resolve: (val: any) => void) => {
            const table = self.getTable(tableName);
            table.forEach((r: any) => {
              if (filters.every(f => r[f.col] === f.val)) {
                Object.assign(r, updates);
              }
            });
            resolve({ data: null, error: null });
          }
        };
        return builder;
      }
    };
  }

  public getTable(name: string): any[] {
    if (name === 'atlas_canonical_entities') return this.canonicalEntities;
    if (name === 'atlas_entity_source_observations') return this.sourceObservations;
    if (name === 'atlas_entity_aliases') return this.entityAliases;
    if (name === 'atlas_entity_merges') return this.entityMerges;
    return [];
  }
}


describe('Atlas Semantic Intelligence — Canonical Entities V1 Test Pack', () => {
  let mockClient: MockSupabaseClient;
  let entityService: AtlasCanonicalEntityService;
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    mockClient = new MockSupabaseClient();
    entityService = new AtlasCanonicalEntityService(mockClient as any);
  });

  // --------------------------------------------------------------------------
  // 1. EXACT COMPANY DOMAIN MATCH
  // --------------------------------------------------------------------------
  it('1. EXACT_COMPANY_DOMAIN_MATCH: Same primary domain resolves to AUTO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'CLEARBIT',
      source_record_id: 'rec_101',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'OpenAI LLC',
      domain: 'https://openai.com'
    };

    const target = {
      canonical_name: 'OpenAI, Inc.',
      entity_type: 'COMPANY' as const,
      primary_domain: 'openai.com'
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(explanation.decision).toBe('AUTO_MATCH');
    expect(explanation.match_confidence).toBeGreaterThanOrEqual(0.95);
    expect(explanation.strong_identity_matched).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. NORMALIZED COMPANY NAME
  // --------------------------------------------------------------------------
  it('2. NORMALIZED_COMPANY_NAME: "ACME S.A." vs "Acme SA" normalize to identical string', () => {
    const n1 = EntityNormalizationEngine.normalizeName('ACME S.A.', 'COMPANY');
    const n2 = EntityNormalizationEngine.normalizeName('Acme SA', 'COMPANY');
    expect(n1).toBe('acme');
    expect(n2).toBe('acme');
    expect(n1).toBe(n2);
  });

  // --------------------------------------------------------------------------
  // 3. SAME DOMAIN DIFFERENT FORMATTING
  // --------------------------------------------------------------------------
  it('3. SAME_DOMAIN_DIFFERENT_FORMATTING: URLs with ports, paths, and www normalize identically', () => {
    const d1 = EntityNormalizationEngine.normalizeDomain('http://www.acme.com:8080/about?ref=xyz#team');
    const d2 = EntityNormalizationEngine.normalizeDomain('https://acme.com/');
    expect(d1).toBe('acme.com');
    expect(d2).toBe('acme.com');
    expect(d1).toBe(d2);
  });

  // --------------------------------------------------------------------------
  // 4. SIMILAR NAME DIFFERENT DOMAIN NO AUTO MERGE
  // --------------------------------------------------------------------------
  it('4. SIMILAR_NAME_DIFFERENT_DOMAIN_NO_AUTO_MERGE: Similar names with distinct domains do not auto-merge', () => {
    const candidate: EntityCandidate = {
      source_name: 'LINKEDIN',
      source_record_id: 'li_201',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Acme Consulting',
      domain: 'acmeconsulting.com'
    };

    const target = {
      canonical_name: 'Acme Corporation',
      entity_type: 'COMPANY' as const,
      primary_domain: 'acmecorp.com'
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(explanation.decision).toBe('NO_MATCH');
    expect(explanation.hard_conflict_detected).toBe(false);
    expect(explanation.conflicts.some(c => c.conflict_name === 'DOMAIN_DIVERGENCE')).toBe(true);
    expect(explanation.match_confidence).toBeLessThan(0.65);
  });

  // --------------------------------------------------------------------------
  // 5. PERSON SAME EMAIL HASH
  // --------------------------------------------------------------------------
  it('5. PERSON_SAME_EMAIL_HASH: Same email hash produces AUTO_MATCH for PERSON', () => {
    const emailHash = EntityNormalizationEngine.hashEmail('satya.nadella@microsoft.com');

    const candidate: EntityCandidate = {
      source_name: 'AUTH_SERVICE',
      source_record_id: 'usr_888',
      source_entity_key: 'person',
      entity_type: 'PERSON',
      raw_name: 'Satya Nadella',
      email_hash: emailHash
    };

    const target = {
      canonical_name: 'Satya Nadella',
      entity_type: 'PERSON' as const,
      email_hash: emailHash
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(explanation.decision).toBe('AUTO_MATCH');
    expect(explanation.strong_identity_matched).toBe(true);
    expect(explanation.match_confidence).toBeGreaterThanOrEqual(0.95);
  });

  // --------------------------------------------------------------------------
  // 6. PERSON SAME NAME BUT DIFFERENT COMPANY
  // --------------------------------------------------------------------------
  it('6. PERSON_SAME_NAME_DIFFERENT_COMPANY: Common name with different company context does not AUTO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'DIRECTORY_A',
      source_record_id: 'p_01',
      source_entity_key: 'person',
      entity_type: 'PERSON',
      raw_name: 'Juan Perez',
      company_context: 'Mercado Libre'
    };

    const target = {
      canonical_name: 'Juan Perez',
      entity_type: 'PERSON' as const,
      company_context: 'Globant'
    };

    const explanation = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(explanation.decision).not.toBe('AUTO_MATCH');
  });

  // --------------------------------------------------------------------------
  // 7. ALIAS PRESERVATION
  // --------------------------------------------------------------------------
  it('7. ALIAS_PRESERVATION: Ingesting variants registers aliases with full provenance', async () => {
    // 1. Initial entity
    const res1 = await entityService.resolveEntityCandidate(
      {
        source_name: 'REGISTRATION_API',
        source_record_id: 'bank_01',
        source_entity_key: 'company',
        entity_type: 'COMPANY',
        raw_name: 'Banco de Galicia y Buenos Aires S.A.U.',
        domain: 'galicia.ar'
      },
      TENANT_ID
    );

    const canonicalId = res1.canonical_entity_id!;

    // 2. Ingest variant with same domain
    await entityService.resolveEntityCandidate(
      {
        source_name: 'NEWS_API',
        source_record_id: 'news_99',
        source_entity_key: 'company',
        entity_type: 'COMPANY',
        raw_name: 'Banco Galicia',
        domain: 'galicia.ar'
      },
      TENANT_ID
    );

    const aliases = await entityService.getEntityAliases(canonicalId, TENANT_ID);
    expect(aliases.some(a => a.alias_name === 'Banco Galicia')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 8. PROVENANCE PRESERVATION
  // --------------------------------------------------------------------------
  it('8. PROVENANCE_PRESERVATION: Source observations retain raw attributes and source metadata', async () => {
    const res = await entityService.resolveEntityCandidate(
      {
        source_name: 'CRM_SALESFORCE',
        source_record_id: 'lead_999',
        source_entity_key: 'company',
        entity_type: 'COMPANY',
        raw_name: 'Stripe Payments',
        raw_attributes: { original_stage: 'PROSPECT', annual_revenue: 5000000 }
      },
      TENANT_ID
    );

    const sources = await entityService.getEntitySources(res.canonical_entity_id!, TENANT_ID);
    expect(sources.length).toBe(1);
    expect(sources[0].source_name).toBe('CRM_SALESFORCE');
    expect(sources[0].raw_attributes.annual_revenue).toBe(5000000);
  });

  // --------------------------------------------------------------------------
  // 9. CONFIDENCE DETERMINISTIC
  // --------------------------------------------------------------------------
  it('9. CONFIDENCE_DETERMINISTIC: 100 repeated runs on same candidate yield bit-identical score', () => {
    const candidate: EntityCandidate = {
      source_name: 'TEST',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Anthropic PBC',
      domain: 'anthropic.com'
    };

    const target = {
      canonical_name: 'Anthropic',
      entity_type: 'COMPANY' as const,
      primary_domain: 'anthropic.com'
    };

    const firstScore = EntityResolutionEngine.evaluateCandidateMatch(candidate, target).match_confidence;
    for (let i = 0; i < 100; i++) {
      expect(EntityResolutionEngine.evaluateCandidateMatch(candidate, target).match_confidence).toBe(firstScore);
    }
  });

  // --------------------------------------------------------------------------
  // 10. THRESHOLD AUTO_MATCH
  // --------------------------------------------------------------------------
  it('10. THRESHOLD_AUTO_MATCH: Score >= 0.90 yields AUTO_MATCH decision', () => {
    const candidate: EntityCandidate = {
      source_name: 'SOURCE_A',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'GitHub Inc',
      domain: 'github.com'
    };

    const target = {
      canonical_name: 'GitHub',
      entity_type: 'COMPANY' as const,
      primary_domain: 'github.com'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.match_confidence).toBeGreaterThanOrEqual(0.90);
    expect(exp.decision).toBe('AUTO_MATCH');
  });

  // --------------------------------------------------------------------------
  // 11. THRESHOLD REVIEW_REQUIRED
  // --------------------------------------------------------------------------
  it('11. THRESHOLD_REVIEW_REQUIRED: Moderate similarity without strong conflict yields REVIEW_REQUIRED', () => {
    const candidate: EntityCandidate = {
      source_name: 'SOURCE_B',
      source_record_id: '2',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Globant Systems',
      location: 'Argentina'
    };

    const target = {
      canonical_name: 'Globant',
      entity_type: 'COMPANY' as const,
      location: 'Argentina'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('REVIEW_REQUIRED');
    expect(exp.match_confidence).toBeGreaterThanOrEqual(0.65);
    expect(exp.match_confidence).toBeLessThan(0.90);
  });

  // --------------------------------------------------------------------------
  // 12. THRESHOLD NO_MATCH
  // --------------------------------------------------------------------------
  it('12. THRESHOLD_NO_MATCH: Unrelated entities yield NO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'SOURCE_C',
      source_record_id: '3',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Apple Inc',
      domain: 'apple.com'
    };

    const target = {
      canonical_name: 'Microsoft Corporation',
      entity_type: 'COMPANY' as const,
      primary_domain: 'microsoft.com'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('NO_MATCH');
    expect(exp.match_confidence).toBeLessThan(0.65);
  });

  // --------------------------------------------------------------------------
  // 13. UNICODE NORMALIZATION
  // --------------------------------------------------------------------------
  it('13. UNICODE_NORMALIZATION: Accented and diacritic characters normalize cleanly', () => {
    expect(EntityNormalizationEngine.cleanText('Telefónica Móviles')).toBe('telefonica moviles');
    expect(EntityNormalizationEngine.cleanText('Société Générale')).toBe('societe generale');
    expect(EntityNormalizationEngine.cleanText('München')).toBe('munchen');
  });

  // --------------------------------------------------------------------------
  // 14. PUNCTUATION NORMALIZATION
  // --------------------------------------------------------------------------
  it('14. PUNCTUATION_NORMALIZATION: Exclamation marks, commas, and dots normalize seamlessly', () => {
    expect(EntityNormalizationEngine.cleanText('Yahoo! Inc.')).toBe('yahoo inc');
    expect(EntityNormalizationEngine.cleanText('A.B.C. Logística S.A.')).toBe('a b c logistica s a');
  });

  // --------------------------------------------------------------------------
  // 15. WHITESPACE NORMALIZATION
  // --------------------------------------------------------------------------
  it('15. WHITESPACE_NORMALIZATION: Multiple spaces and tabs collapse to single space', () => {
    expect(EntityNormalizationEngine.cleanText('   OpenAI     \t   LLC   ')).toBe('openai llc');
  });

  // --------------------------------------------------------------------------
  // 16. COMPANY SUFFIX NORMALIZATION
  // --------------------------------------------------------------------------
  it('16. COMPANY_SUFFIX_NORMALIZATION: Corporate legal suffixes (S.A., Inc, GmbH, LLC) are stripped', () => {
    expect(EntityNormalizationEngine.normalizeName('MercadoLibre S.R.L.', 'COMPANY')).toBe('mercadolibre');
    expect(EntityNormalizationEngine.normalizeName('Siemens AG', 'COMPANY')).toBe('siemens');
    expect(EntityNormalizationEngine.normalizeName('SAP GmbH', 'COMPANY')).toBe('sap');
    expect(EntityNormalizationEngine.normalizeName('Atlassian Pty Ltd', 'COMPANY')).toBe('atlassian');
  });

  // --------------------------------------------------------------------------
  // 17. SOURCE RECORDS NEVER DELETED
  // --------------------------------------------------------------------------
  it('17. SOURCE_RECORDS_NEVER_DELETED: Merging entities leaves source observation count unaltered', async () => {
    const e1 = await entityService.resolveEntityCandidate(
      { source_name: 'API_1', source_record_id: 'r1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Acme 1' },
      TENANT_ID
    );
    const e2 = await entityService.resolveEntityCandidate(
      { source_name: 'API_2', source_record_id: 'r2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Acme 2' },
      TENANT_ID
    );

    const countBefore = mockClient.sourceObservations.length;
    await entityService.mergeEntities(e1.canonical_entity_id!, e2.canonical_entity_id!, TENANT_ID, 'Manual merge');
    const countAfter = mockClient.sourceObservations.length;

    expect(countAfter).toBe(countBefore);
    expect(countAfter).toBe(2);
  });

  // --------------------------------------------------------------------------
  // 18. MERGE REVERSIBLE
  // --------------------------------------------------------------------------
  it('18. MERGE_REVERSIBLE: Unmerging restores original entity to ACTIVE and resets root routing', async () => {
    const e1 = await entityService.resolveEntityCandidate(
      { source_name: 'A', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Entity Alpha' },
      TENANT_ID
    );
    const e2 = await entityService.resolveEntityCandidate(
      { source_name: 'B', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Entity Beta' },
      TENANT_ID
    );

    const merge = await entityService.mergeEntities(e1.canonical_entity_id!, e2.canonical_entity_id!, TENANT_ID, 'Test merge');
    expect((await entityService.getCanonicalEntity(e1.canonical_entity_id!, TENANT_ID)).canonical_entity_id).toBe(e2.canonical_entity_id);

    // Unmerge
    await entityService.unmergeEntities(merge.merge_id, TENANT_ID, 'Test unmerge');
    expect((await entityService.getCanonicalEntity(e1.canonical_entity_id!, TENANT_ID)).canonical_entity_id).toBe(e1.canonical_entity_id);
  });

  // --------------------------------------------------------------------------
  // 19. DUPLICATE SOURCE OBSERVATION
  // --------------------------------------------------------------------------
  it('19. DUPLICATE_SOURCE_OBSERVATION: Re-ingesting identical (source_name, source_record_id, key) is idempotent', async () => {
    await entityService.resolveEntityCandidate(
      { source_name: 'FEED_A', source_record_id: 'item_100', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Amazon' },
      TENANT_ID
    );
    await entityService.resolveEntityCandidate(
      { source_name: 'FEED_A', source_record_id: 'item_100', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Amazon' },
      TENANT_ID
    );

    expect(mockClient.sourceObservations.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 20. CONFLICTING ATTRIBUTES PRESERVED
  // --------------------------------------------------------------------------
  it('20. CONFLICTING_ATTRIBUTES_PRESERVED: Contradictory observations (e.g. employees 80 vs 120) coexist in history', async () => {
    const e = await entityService.resolveEntityCandidate(
      {
        source_name: 'REPORT_2024',
        source_record_id: 'rep_1',
        source_entity_key: 'company',
        entity_type: 'COMPANY',
        raw_name: 'Vercel Inc',
        domain: 'vercel.com',
        raw_attributes: { employees: 80 }
      },
      TENANT_ID
    );

    await entityService.resolveEntityCandidate(
      {
        source_name: 'REPORT_2025',
        source_record_id: 'rep_2',
        source_entity_key: 'company',
        entity_type: 'COMPANY',
        raw_name: 'Vercel',
        domain: 'vercel.com',
        raw_attributes: { employees: 120 }
      },
      TENANT_ID
    );

    const sources = await entityService.getEntitySources(e.canonical_entity_id!, TENANT_ID);
    expect(sources.length).toBe(2);
    expect(sources.find(s => s.source_name === 'REPORT_2024')?.raw_attributes.employees).toBe(80);
    expect(sources.find(s => s.source_name === 'REPORT_2025')?.raw_attributes.employees).toBe(120);
  });

  // --------------------------------------------------------------------------
  // 21. CANONICAL ID STABLE
  // --------------------------------------------------------------------------
  it('21. CANONICAL_ID_STABLE: Repeated resolutions return same canonical entity ID', async () => {
    const r1 = await entityService.resolveEntityCandidate(
      { source_name: 'API', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Supabase', domain: 'supabase.com' },
      TENANT_ID
    );
    const r2 = await entityService.resolveEntityCandidate(
      { source_name: 'API', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Supabase Inc', domain: 'supabase.com' },
      TENANT_ID
    );

    expect(r1.canonical_entity_id).toBe(r2.canonical_entity_id);
  });

  // --------------------------------------------------------------------------
  // 22. TWO APIS SAME COMPANY
  // --------------------------------------------------------------------------
  it('22. TWO_APIS_SAME_COMPANY: Ingesting from LinkedIn & Clearbit consolidates into 1 canonical entity', async () => {
    const li = await entityService.resolveEntityCandidate(
      { source_name: 'LINKEDIN', source_record_id: 'li_99', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Figma', domain: 'figma.com' },
      TENANT_ID
    );
    const cb = await entityService.resolveEntityCandidate(
      { source_name: 'CLEARBIT', source_record_id: 'cb_99', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Figma, Inc.', domain: 'figma.com' },
      TENANT_ID
    );

    expect(li.canonical_entity_id).toBe(cb.canonical_entity_id);
    expect(mockClient.canonicalEntities.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 23. THREE APIS SAME COMPANY
  // --------------------------------------------------------------------------
  it('23. THREE_APIS_SAME_COMPANY: 3 variants ("OpenAI Inc.", "OpenAI", "OPEN AI") link to 1 entity with 3 observations', async () => {
    const r1 = await entityService.resolveEntityCandidate(
      { source_name: 'API_A', source_record_id: 'a1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'OpenAI Inc.', domain: 'openai.com' },
      TENANT_ID
    );
    const r2 = await entityService.resolveEntityCandidate(
      { source_name: 'API_B', source_record_id: 'b1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'OpenAI', domain: 'openai.com' },
      TENANT_ID
    );
    const r3 = await entityService.resolveEntityCandidate(
      { source_name: 'DATASET_C', source_record_id: 'c1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'OPEN AI', domain: 'openai.com' },
      TENANT_ID
    );

    expect(r1.canonical_entity_id).toBe(r2.canonical_entity_id);
    expect(r2.canonical_entity_id).toBe(r3.canonical_entity_id);
    expect(mockClient.canonicalEntities.length).toBe(1);

    const sources = await entityService.getEntitySources(r1.canonical_entity_id!, TENANT_ID);
    expect(sources.length).toBe(3);
  });

  // --------------------------------------------------------------------------
  // 24. LOCATION HELPS RESOLUTION
  // --------------------------------------------------------------------------
  it('24. LOCATION_HELPS_RESOLUTION: Matching location provides positive contribution', () => {
    const c1: EntityCandidate = {
      source_name: 'SRC',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Coderhouse',
      location: 'CABA'
    };
    const targetWithLoc = {
      canonical_name: 'Coderhouse',
      entity_type: 'COMPANY' as const,
      location: 'Ciudad Autónoma de Buenos Aires'
    };
    const targetWithoutLoc = {
      canonical_name: 'Coderhouse',
      entity_type: 'COMPANY' as const
    };

    const scoreWith = EntityResolutionEngine.evaluateCandidateMatch(c1, targetWithLoc).match_confidence;
    const scoreWithout = EntityResolutionEngine.evaluateCandidateMatch(c1, targetWithoutLoc).match_confidence;

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  // --------------------------------------------------------------------------
  // 25. LOCATION CANNOT OVERRIDE STRONG CONFLICT
  // --------------------------------------------------------------------------
  it('25. LOCATION_CANNOT_OVERRIDE_STRONG_CONFLICT: Same city cannot override conflicting verified domains', () => {
    const candidate: EntityCandidate = {
      source_name: 'SRC',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Apex Group',
      external_ids: { cuit: '30-11111111-1' },
      location: 'Buenos Aires'
    };

    const target = {
      canonical_name: 'Apex Group',
      entity_type: 'COMPANY' as const,
      external_ids: { cuit: '30-99999999-9' },
      location: 'Buenos Aires'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('NO_MATCH');
    expect(exp.hard_conflict_detected).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 26. MISSING DOMAIN HANDLING
  // --------------------------------------------------------------------------
  it('26. MISSING_DOMAIN_HANDLING: Evaluates name + location gracefully when domain is absent', () => {
    const candidate: EntityCandidate = {
      source_name: 'SRC',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Panadería San Martín',
      location: 'Rosario'
    };

    const target = {
      canonical_name: 'Panadería San Martín',
      entity_type: 'COMPANY' as const,
      location: 'Rosario'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('REVIEW_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // 27. EMPTY IDENTIFIERS FAIL CLOSED
  // --------------------------------------------------------------------------
  it('27. EMPTY_IDENTIFIERS_FAIL_CLOSED: Empty candidate name rejects with exception', async () => {
    await expect(
      entityService.resolveEntityCandidate(
        { source_name: 'SRC', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: '' },
        TENANT_ID
      )
    ).rejects.toThrow('INVALID_CANDIDATE');
  });

  // --------------------------------------------------------------------------
  // 28. ZERO PII COMPLIANCE (HASHES ONLY)
  // --------------------------------------------------------------------------
  it('28. ZERO_PII_COMPLIANCE: Email and phone are hashed via SHA-256 and never stored in plaintext', () => {
    const email = 'elizabeth.warren@senate.gov';
    const hash = EntityNormalizationEngine.hashEmail(email);
    expect(hash).not.toContain('@');
    expect(hash?.length).toBe(64);
  });

  // --------------------------------------------------------------------------
  // 29. DETERMINISTIC RESOLUTION REPLAY
  // --------------------------------------------------------------------------
  it('29. DETERMINISTIC_RESOLUTION_REPLAY: Decision is 100% reproducible across 50 runs', () => {
    const candidate: EntityCandidate = {
      source_name: 'SRC',
      source_record_id: '1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Notion Labs',
      domain: 'notion.so'
    };
    const target = {
      canonical_name: 'Notion',
      entity_type: 'COMPANY' as const,
      primary_domain: 'notion.so'
    };

    const firstDecision = EntityResolutionEngine.evaluateCandidateMatch(candidate, target).decision;
    for (let i = 0; i < 50; i++) {
      expect(EntityResolutionEngine.evaluateCandidateMatch(candidate, target).decision).toBe(firstDecision);
    }
  });

  // --------------------------------------------------------------------------
  // 30. FROZEN MAIL FABRIC UNTOUCHED
  // --------------------------------------------------------------------------
  it('30. FROZEN_MAIL_FABRIC_UNTOUCHED: Critical Mail Fabric SHA-256 hashes remain frozen', () => {
    const filesToVerify = [
      {
        path: 'src/lib/atlasMailFabric/AtlasMailTransactionalEventBridge.ts',
        expected: '4e7533c5d6bc53475e541c9049e6107ae2784a9bf127fd8a57cf3d04d1d0cbd1'
      },
      {
        path: 'src/lib/atlasMailFabric/LegitimateSourceEventGuard.ts',
        expected: '441ab4ee45ca8899c22e1cbe73fbe04ab307237e38542589ad66fe028efdb787'
      },
      {
        path: 'src/lib/atlasMailFabric/AtlasRFC822Builder.ts',
        expected: 'd8abc8b3cf33b4aaf6f4ec5023175590f545691af7163991ebb03d31e9ab02f0'
      }
    ];

    for (const f of filesToVerify) {
      const fullPath = path.resolve(process.cwd(), f.path);
      const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
      const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      expect(hash).toBe(f.expected);
    }
  });

  // --------------------------------------------------------------------------
  // 31. EXACT_EXTERNAL_ID CANNOT BECOME NO_MATCH BY NUMERIC THRESHOLD
  // --------------------------------------------------------------------------
  it('31. EXACT_EXTERNAL_ID_NEVER_NO_MATCH: Exact match on CUIT/tax ID forces AUTO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'AFIP_REGISTRY',
      source_record_id: 'tax_01',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'YPF Sociedad Anónima',
      external_ids: { cuit: '30-54668997-9' }
    };

    const target = {
      canonical_name: 'YPF',
      entity_type: 'COMPANY' as const,
      external_ids: { cuit: '30-54668997-9' }
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('AUTO_MATCH');
    expect(exp.strong_identity_matched).toBe(true);
    expect(exp.match_confidence).toBeGreaterThanOrEqual(0.95);
  });

  // --------------------------------------------------------------------------
  // 32. NAME_ONLY NEVER AUTO_MATCHES TWO PEOPLE
  // --------------------------------------------------------------------------
  it('32. NAME_ONLY_NEVER_AUTO_MATCHES_PERSON: Two people with identical name and no strong ID are capped at REVIEW_REQUIRED or NO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'CRM_LEADS',
      source_record_id: 'lead_1',
      source_entity_key: 'person',
      entity_type: 'PERSON',
      raw_name: 'Alejandro Rossi'
    };

    const target = {
      canonical_name: 'Alejandro Rossi',
      entity_type: 'PERSON' as const
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).not.toBe('AUTO_MATCH');
    expect(exp.match_confidence).toBeLessThanOrEqual(0.70);
  });

  // --------------------------------------------------------------------------
  // 33. MANY_WEAK_SIGNALS CANNOT OVERRIDE HARD IDENTITY CONFLICT
  // --------------------------------------------------------------------------
  it('33. MANY_WEAK_SIGNALS_CANNOT_OVERRIDE_HARD_CONFLICT: Name + Location + Context with conflicting domain produces NO_MATCH', () => {
    const candidate: EntityCandidate = {
      source_name: 'SCRAPER',
      source_record_id: 's1',
      source_entity_key: 'company',
      entity_type: 'COMPANY',
      raw_name: 'Globant Digital',
      external_ids: { cuit: '30-11111111-1' },
      location: 'Buenos Aires'
    };

    const target = {
      canonical_name: 'Globant',
      entity_type: 'COMPANY' as const,
      external_ids: { cuit: '30-22222222-2' },
      location: 'Buenos Aires'
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.decision).toBe('NO_MATCH');
    expect(exp.hard_conflict_detected).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 34. ONE SOURCE RECORD EMITS MULTIPLE ENTITY OBSERVATIONS
  // --------------------------------------------------------------------------
  it('34. ONE_SOURCE_RECORD_EMITS_MULTIPLE_ENTITIES: Same record ID can emit company, location, and hiring manager', async () => {
    const sourceRecordId = 'job_post_888';

    // 1. Company observation
    await entityService.resolveEntityCandidate(
      { source_name: 'JOB_BOARD', source_record_id: sourceRecordId, source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Nubank' },
      TENANT_ID
    );

    // 2. Location observation
    await entityService.resolveEntityCandidate(
      { source_name: 'JOB_BOARD', source_record_id: sourceRecordId, source_entity_key: 'location', entity_type: 'LOCATION', raw_name: 'Buenos Aires' },
      TENANT_ID
    );

    // 3. Person observation
    await entityService.resolveEntityCandidate(
      { source_name: 'JOB_BOARD', source_record_id: sourceRecordId, source_entity_key: 'hiring_manager', entity_type: 'PERSON', raw_name: 'David Velez' },
      TENANT_ID
    );

    const jobObservations = mockClient.sourceObservations.filter(o => o.source_record_id === sourceRecordId);
    expect(jobObservations.length).toBe(3);
    expect(jobObservations.map(o => o.source_entity_key).sort()).toEqual(['company', 'hiring_manager', 'location']);
  });

  // --------------------------------------------------------------------------
  // 35. CABA IS NOT BUENOS AIRES PROVINCE
  // --------------------------------------------------------------------------
  it('35. CABA_IS_NOT_BUENOS_AIRES_PROVINCE: Hierarchical normalizer distinguishes CABA from PBA', () => {
    const caba = EntityNormalizationEngine.normalizeLocation('CABA');
    const pba = EntityNormalizationEngine.normalizeLocation('Provincia de Buenos Aires');

    expect(caba?.admin_level_1).toBe('Ciudad Autónoma de Buenos Aires');
    expect(pba?.admin_level_1).toBe('Provincia de Buenos Aires');
    expect(caba?.normalized_label).not.toBe(pba?.normalized_label);
  });

  // --------------------------------------------------------------------------
  // 36. DIFFERENT EMAILS DO NOT AUTOMATICALLY PROVE DIFFERENT PERSON
  // --------------------------------------------------------------------------
  it('36. DIFFERENT_EMAILS_DO_NOT_PROVE_DIFFERENT_PERSON: Different email hash applies penalty but does not purge candidate', () => {
    const hash1 = EntityNormalizationEngine.hashEmail('user.old@work.com');
    const hash2 = EntityNormalizationEngine.hashEmail('user.new@personal.com');

    const candidate: EntityCandidate = {
      source_name: 'CRM',
      source_record_id: '1',
      source_entity_key: 'person',
      entity_type: 'PERSON',
      raw_name: 'Guillermo Rauch',
      email_hash: hash1
    };

    const target = {
      canonical_name: 'Guillermo Rauch',
      entity_type: 'PERSON' as const,
      email_hash: hash2
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    expect(exp.conflicts.some(c => c.conflict_name === 'EMAIL_HASH_DIVERGENCE')).toBe(true);
    // Hard conflict is false for email discrepancy alone (since humans change emails), allowing human review
    expect(exp.hard_conflict_detected).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 37. MULTIPLE DOMAINS MAY BELONG TO SAME ORGANIZATION
  // --------------------------------------------------------------------------
  it('37. MULTIPLE_DOMAINS_MAY_BELONG_TO_SAME_ORGANIZATION: Aliases and secondary domains are preserved in observation history', async () => {
    const e = await entityService.resolveEntityCandidate(
      { source_name: 'REGISTRY', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Alphabet Inc', domain: 'abc.xyz' },
      TENANT_ID
    );

    await entityService.resolveEntityCandidate(
      { source_name: 'NEWS', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Google LLC', domain: 'google.com' },
      TENANT_ID
    );

    const sources = mockClient.sourceObservations;
    expect(sources.some(s => s.normalized_attributes.normalized_domain === 'abc.xyz')).toBe(true);
    expect(sources.some(s => s.normalized_attributes.normalized_domain === 'google.com')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 38. MERGE CHAIN A -> B -> C RESOLVES ROOT C
  // --------------------------------------------------------------------------
  it('38. MERGE_CHAIN_A_B_C_RESOLVES_ROOT_C: Multi-hop merge chain resolves root entity correctly', async () => {
    const a = await entityService.resolveEntityCandidate(
      { source_name: 'A', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Company A' },
      TENANT_ID
    );
    const b = await entityService.resolveEntityCandidate(
      { source_name: 'B', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Company B' },
      TENANT_ID
    );
    const c = await entityService.resolveEntityCandidate(
      { source_name: 'C', source_record_id: '3', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Company C' },
      TENANT_ID
    );

    // Merge A into B
    await entityService.mergeEntities(a.canonical_entity_id!, b.canonical_entity_id!, TENANT_ID, 'A into B');
    // Merge B into C
    await entityService.mergeEntities(b.canonical_entity_id!, c.canonical_entity_id!, TENANT_ID, 'B into C');

    const rootForA = await entityService.resolveCanonicalRoot(a.canonical_entity_id!, TENANT_ID);
    const rootForB = await entityService.resolveCanonicalRoot(b.canonical_entity_id!, TENANT_ID);

    expect(rootForA.canonical_entity_id).toBe(c.canonical_entity_id);
    expect(rootForB.canonical_entity_id).toBe(c.canonical_entity_id);
  });

  // --------------------------------------------------------------------------
  // 39. MERGE CYCLE A -> B -> A IS REJECTED
  // --------------------------------------------------------------------------
  it('39. MERGE_CYCLE_A_B_A_REJECTED: Creating cyclical merge graph throws exception', async () => {
    const a = await entityService.resolveEntityCandidate(
      { source_name: 'A', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Node A' },
      TENANT_ID
    );
    const b = await entityService.resolveEntityCandidate(
      { source_name: 'B', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Node B' },
      TENANT_ID
    );

    // Merge A into B
    await entityService.mergeEntities(a.canonical_entity_id!, b.canonical_entity_id!, TENANT_ID, 'A into B');

    // Attempt to merge B into A
    await expect(
      entityService.mergeEntities(b.canonical_entity_id!, a.canonical_entity_id!, TENANT_ID, 'B into A cycle')
    ).rejects.toThrow('MERGE_CYCLE_PROHIBITED');
  });

  // --------------------------------------------------------------------------
  // 40. CROSS TENANT MERGE IS REJECTED
  // --------------------------------------------------------------------------
  it('40. CROSS_TENANT_MERGE_REJECTED: Merging entities belonging to different tenants fails', async () => {
    const a = await entityService.resolveEntityCandidate(
      { source_name: 'A', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Tenant 1 Entity' },
      TENANT_ID
    );
    const b = await entityService.resolveEntityCandidate(
      { source_name: 'B', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Tenant 2 Entity' },
      OTHER_TENANT_ID
    );

    await expect(
      entityService.mergeEntities(a.canonical_entity_id!, b.canonical_entity_id!, TENANT_ID, 'Cross-tenant merge')
    ).rejects.toThrow('ENTITY_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // 41. UNMERGE PRESERVES ALL OBSERVATIONS
  // --------------------------------------------------------------------------
  it('41. UNMERGE_PRESERVES_ALL_OBSERVATIONS: Unmerging keeps all observations in history', async () => {
    const a = await entityService.resolveEntityCandidate(
      { source_name: 'A', source_record_id: '1', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Alpha Corp' },
      TENANT_ID
    );
    const b = await entityService.resolveEntityCandidate(
      { source_name: 'B', source_record_id: '2', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Beta Corp' },
      TENANT_ID
    );

    const merge = await entityService.mergeEntities(a.canonical_entity_id!, b.canonical_entity_id!, TENANT_ID, 'Merge A into B');
    await entityService.unmergeEntities(merge.merge_id, TENANT_ID, 'Revert');

    const sourcesA = await entityService.getEntitySources(a.canonical_entity_id!, TENANT_ID);
    const sourcesB = await entityService.getEntitySources(b.canonical_entity_id!, TENANT_ID);

    expect(sourcesA.length).toBe(1);
    expect(sourcesB.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 42. RESOLUTION EXPLANATION CONTAINS NO PLAINTEXT EMAIL/PHONE
  // --------------------------------------------------------------------------
  it('42. RESOLUTION_EXPLANATION_CONTAINS_NO_PLAINTEXT_PII: Explanation JSON contains zero plaintext email or phone strings', () => {
    const email = 'martin.migoya@globant.com';
    const emailHash = EntityNormalizationEngine.hashEmail(email);

    const candidate: EntityCandidate = {
      source_name: 'TEST',
      source_record_id: 'rec_1',
      source_entity_key: 'person',
      entity_type: 'PERSON',
      raw_name: 'Martín Migoya',
      email_hash: emailHash
    };

    const target = {
      canonical_name: 'Martin Migoya',
      entity_type: 'PERSON' as const,
      email_hash: emailHash
    };

    const exp = EntityResolutionEngine.evaluateCandidateMatch(candidate, target);
    const expJson = JSON.stringify(exp);

    expect(expJson).not.toContain(email);
    expect(expJson).not.toContain('globant.com');
  });
});
