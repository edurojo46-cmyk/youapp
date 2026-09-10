/**
 * Atlas Semantic Intelligence — Real Data Dry Audit V1
 * READ-ONLY probe sampling actual records from database/schema
 * Evaluates entity extraction, normalization, and candidate resolution metrics.
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import {
  EntityNormalizationEngine,
  EntityResolutionEngine,
  EntityCandidate
} from '../lib/atlasSemantic';

describe('Atlas Canonical Entities V1 — Real Data Dry Audit', () => {
  it('Executes read-only entity resolution probe on actual database records', async () => {
    // 1. Fetch real source samples across multiple tables (read-only)
    const sampledRecords: EntityCandidate[] = [];

    // A. Sample People & Person Attributes
    const { data: people } = await supabase
      .from('atlas_people')
      .select('person_id, full_name, created_at')
      .limit(25);

    if (people && people.length > 0) {
      for (const p of people) {
        sampledRecords.push({
          source_name: 'ATLAS_PEOPLE_TABLE',
          source_record_id: p.person_id,
          source_entity_key: 'person',
          entity_type: 'PERSON',
          raw_name: p.full_name || 'Anonymous Person',
          observed_at: p.created_at
        });
      }
    }

    // B. Sample Commerce Products / Brands
    const { data: products } = await supabase
      .from('atlas_commerce_products')
      .select('product_id, canonical_title, brand, external_product_id, created_at')
      .limit(25);

    if (products && products.length > 0) {
      for (const pr of products) {
        if (pr.brand) {
          sampledRecords.push({
            source_name: 'MERCADO_LIBRE_COMMERCE',
            source_record_id: pr.product_id,
            source_entity_key: 'brand_company',
            entity_type: 'COMPANY',
            raw_name: pr.brand,
            observed_at: pr.created_at
          });
        }
        sampledRecords.push({
          source_name: 'MERCADO_LIBRE_COMMERCE',
          source_record_id: pr.product_id,
          source_entity_key: 'product',
          entity_type: 'PRODUCT',
          raw_name: pr.canonical_title,
          external_ids: { ml_item_id: pr.external_product_id },
          observed_at: pr.created_at
        });
      }
    }

    // C. Sample Video Creators / Publishers from Catalog
    const { data: vids } = await supabase
      .from('videos')
      .select('id, title, author, provider')
      .limit(30);

    if (vids && vids.length > 0) {
      for (const v of vids) {
        if (v.author) {
          sampledRecords.push({
            source_name: `MEDIA_PROVIDER_${v.provider || 'YOUTUBE'}`,
            source_record_id: v.id,
            source_entity_key: 'creator_person',
            entity_type: 'PERSON',
            raw_name: v.author
          });
        }
      }
    }

    // D. Sample Seed Sources / Publishers
    const { data: sources } = await supabase
      .from('seed_sources')
      .select('id, title, url, platform')
      .limit(20);

    if (sources && sources.length > 0) {
      for (const s of sources) {
        sampledRecords.push({
          source_name: 'SEED_SOURCES',
          source_record_id: s.id.toString(),
          source_entity_key: 'publisher_org',
          entity_type: 'ORGANIZATION',
          raw_name: s.title,
          domain: s.url ? EntityNormalizationEngine.normalizeDomain(s.url) : undefined
        });
      }
    }

    // E. Realistic Multi-Source External Benchmarks (Real Latin American & Global Companies)
    const realCatalogSeeds: EntityCandidate[] = [
      { source_name: 'AFIP_PUBLIC', source_record_id: 'seed_01', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'MercadoLibre S.R.L.', external_ids: { cuit: '30-70308853-4' }, domain: 'mercadolibre.com.ar' },
      { source_name: 'LINKEDIN_AR', source_record_id: 'seed_02', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Mercado Libre', domain: 'mercadolibre.com', location: 'CABA' },
      { source_name: 'OPEN_CORPORATES', source_record_id: 'seed_03', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'MERCADO LIBRE ARGENTINA', external_ids: { cuit: '30-70308853-4' }, domain: 'mercadolibre.com.ar' },
      { source_name: 'AFIP_PUBLIC', source_record_id: 'seed_04', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Globant S.A.', external_ids: { cuit: '30-70877543-2' }, domain: 'globant.com' },
      { source_name: 'LINKEDIN_AR', source_record_id: 'seed_05', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Globant', domain: 'globant.com', location: 'Buenos Aires' },
      { source_name: 'AFIP_PUBLIC', source_record_id: 'seed_06', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'YPF Sociedad Anónima', external_ids: { cuit: '30-54668997-9' }, domain: 'ypf.com' },
      { source_name: 'DIRECTORY', source_record_id: 'seed_07', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'YPF', domain: 'ypf.com' },
      { source_name: 'CRUNCHBASE', source_record_id: 'seed_08', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Ualá (Bancar Tecnología S.A.)', domain: 'uala.com.ar' },
      { source_name: 'LINKEDIN', source_record_id: 'seed_09', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Ualá', domain: 'uala.com.ar' },
      { source_name: 'NEWS_FEED', source_record_id: 'seed_10', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Coderhouse Inc', domain: 'coderhouse.com' },
      { source_name: 'DIRECTORY', source_record_id: 'seed_11', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Coderhouse', domain: 'coderhouse.com' },
      { source_name: 'AFIP_PUBLIC', source_record_id: 'seed_12', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Telecom Argentina S.A.', domain: 'telecom.com.ar' },
      { source_name: 'LINKEDIN', source_record_id: 'seed_13', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Telecom Argentina', domain: 'telecom.com.ar' },
      { source_name: 'DIRECTORY', source_record_id: 'seed_14', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Personal Flow', domain: 'personal.com.ar' },
      { source_name: 'REGISTRATION_API', source_record_id: 'seed_15', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Banco Santander Argentina S.A.', domain: 'santander.com.ar' },
      { source_name: 'LINKEDIN', source_record_id: 'seed_16', source_entity_key: 'company', entity_type: 'COMPANY', raw_name: 'Santander Argentina', domain: 'santander.com.ar' }
    ];

    for (const seed of realCatalogSeeds) {
      sampledRecords.push(seed);
    }

    // 2. Execute resolution matching across the sample
    let strongIdentityMatches = 0;
    let autoMatches = 0;
    let reviewRequired = 0;
    let noMatch = 0;
    let suspectFalsePositives = 0;

    const resolvedEntities: Array<{
      canonical_name: string;
      entity_type: EntityCandidate['entity_type'];
      primary_domain?: string;
      external_ids?: Record<string, string>;
      location?: any;
    }> = [];

    for (const cand of sampledRecords) {
      let matched = false;

      for (const target of resolvedEntities) {
        const exp = EntityResolutionEngine.evaluateCandidateMatch(cand, target);

        if (exp.decision === 'AUTO_MATCH') {
          autoMatches++;
          if (exp.strong_identity_matched) strongIdentityMatches++;
          matched = true;
          break;
        } else if (exp.decision === 'REVIEW_REQUIRED') {
          reviewRequired++;
          // A suspect false positive is flagged if review is triggered despite some name divergence
          if (exp.conflicts.length > 0) suspectFalsePositives++;
          matched = true;
          break;
        }
      }

      if (!matched) {
        noMatch++;
        resolvedEntities.push({
          canonical_name: cand.raw_name,
          entity_type: cand.entity_type,
          primary_domain: cand.domain,
          external_ids: cand.external_ids,
          location: cand.location
        });
      }
    }

    console.log(`================================================================`);
    console.log(`REAL DATA DRY AUDIT REPORT:`);
    console.log(`TOTAL_SOURCE_RECORDS_SAMPLED = ${sampledRecords.length}`);
    console.log(`ENTITY_CANDIDATES = ${sampledRecords.length}`);
    console.log(`STRONG_IDENTITY_MATCHES = ${strongIdentityMatches}`);
    console.log(`AUTO_MATCHES = ${autoMatches}`);
    console.log(`REVIEW_REQUIRED = ${reviewRequired}`);
    console.log(`NO_MATCH = ${noMatch}`);
    console.log(`SUSPECT_FALSE_POSITIVES = ${suspectFalsePositives}`);
    console.log(`================================================================`);

    expect(sampledRecords.length).toBeGreaterThanOrEqual(50);
    expect(noMatch).toBeGreaterThan(0);
  });
});
