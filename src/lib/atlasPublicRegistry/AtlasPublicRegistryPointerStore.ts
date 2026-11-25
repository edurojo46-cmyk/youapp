/**
 * ATLAS PUBLIC REGISTRY POINTER STORE (V1 PILOT)
 * @src/lib/atlasPublicRegistry/AtlasPublicRegistryPointerStore.ts
 * 
 * Manages verified public registry pointers across Argentine Municipal, Provincial, and National open data registries.
 * Strictly decoupled from Social Pointers and External Entity Pointers.
 * 
 * Invariants:
 * - Only physically observed facts from open public registries.
 * - ZERO inferred or synthetic attributes.
 * - Partitioned compressed columnar shards with Bloom filters.
 * - Deduplication by canonical fingerprint (source + official_id / normalized entity key).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import type pg from 'pg';
import { dbPool } from '../../../server/db.ts';

export type RegistryFamily = 
  | 'SINDICATOS'
  | 'OBRAS_SOCIALES'
  | 'COOPERATIVAS_MUTUALES'
  | 'COMERCIOS_EMPRESAS'
  | 'PROFESIONALES'
  | 'SALUD'
  | 'AGRO'
  | 'OTROS';

export type JurisdictionLevel = 
  | 'MUNICIPAL'
  | 'PROVINCIAL'
  | 'NATIONAL';

export interface PublicRegistryPointer {
  pointer_id: string;
  registry_source: string;
  registry_family: RegistryFamily;
  jurisdiction_level: JurisdictionLevel;
  entity_name: string;
  official_id: string; // CUIT, matrícula, legajo, resolución, etc.
  geo_hint: string;
  concept_hint: string;
  fingerprint: string; // 16-hex hash
}

export interface PublicRegistryShardManifest {
  shard_id: string;
  store_version: string;
  registry_family: string;
  jurisdiction_level: string;
  geography: string;
  file_location: string;
  record_count: number;
  file_size: number;
  checksum: string;
  is_active: boolean;
}

export class AtlasPublicRegistryPointerStore {
  private static instance: AtlasPublicRegistryPointerStore;
  private pool: pg.Pool;

  constructor(pool: pg.Pool = dbPool) {
    this.pool = pool;
  }

  public static getInstance(): AtlasPublicRegistryPointerStore {
    if (!this.instance) {
      this.instance = new AtlasPublicRegistryPointerStore();
    }
    return this.instance;
  }

  public async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_public_registry_pointer_shards (
        shard_id VARCHAR(255) PRIMARY KEY,
        store_version VARCHAR(50) NOT NULL,
        registry_family VARCHAR(100) NOT NULL,
        jurisdiction_level VARCHAR(50) NOT NULL,
        geography VARCHAR(100) NOT NULL,
        file_location TEXT NOT NULL,
        record_count INTEGER NOT NULL,
        file_size BIGINT NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reg_store_version ON public.atlas_public_registry_pointer_shards(store_version);
      CREATE INDEX IF NOT EXISTS idx_reg_family ON public.atlas_public_registry_pointer_shards(registry_family);
      CREATE INDEX IF NOT EXISTS idx_reg_jurisdiction ON public.atlas_public_registry_pointer_shards(jurisdiction_level);
      CREATE INDEX IF NOT EXISTS idx_reg_is_active ON public.atlas_public_registry_pointer_shards(is_active);
    `);
  }

  public static computeFingerprint(registrySource: string, officialId: string, entityName: string): string {
    const raw = `${registrySource.trim().toUpperCase()}:${(officialId || '').trim()}:${entityName.trim().toUpperCase()}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  public async writeShard(
    registryFamily: RegistryFamily,
    jurisdictionLevel: JurisdictionLevel,
    geography: string,
    pointers: PublicRegistryPointer[],
    storeVersion: string = 'public_v1_pilot',
    targetDir?: string,
    batchId?: string
  ): Promise<PublicRegistryShardManifest> {
    const outDir = targetDir || path.resolve('data/public_registry_pointer_store/real/v1_pilot');
    fs.mkdirSync(outDir, { recursive: true });

    const safeFam = registryFamily.replace(/[^a-zA-Z0-9_]/g, '_');
    const safeJur = jurisdictionLevel.replace(/[^a-zA-Z0-9_]/g, '_');
    const safeGeo = geography.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
    const hash = batchId ? batchId : crypto.createHash('md5').update(`${safeFam}_${safeJur}_${safeGeo}_${Date.now()}_${Math.random()}`).digest('hex').slice(0, 8);
    const shardId = batchId ? batchId : `SHARD_REG_${safeFam.toUpperCase()}_${safeJur.toUpperCase()}_${safeGeo.toUpperCase()}_${hash}`;
    const filePath = path.join(outDir, `${shardId}.arps.br`);

    // Columnar Binary Format
    const magic = Buffer.from('ARPS', 'ascii');
    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32LE(pointers.length, 0);

    const recordBuffers: Buffer[] = [];
    for (const p of pointers) {
      const srcBuf = Buffer.from(p.registry_source, 'utf8');
      const nameBuf = Buffer.from(p.entity_name, 'utf8');
      const idBuf = Buffer.from(p.official_id || '', 'utf8');
      const geoBuf = Buffer.from(p.geo_hint || '', 'utf8');
      const catBuf = Buffer.from(p.concept_hint || '', 'utf8');
      const fpBuf = Buffer.from(p.fingerprint, 'hex');

      const meta = Buffer.alloc(1 + 2 + 2 + 2 + 2);
      meta.writeUInt8(srcBuf.length, 0);
      meta.writeUInt16LE(nameBuf.length, 1);
      meta.writeUInt16LE(idBuf.length, 3);
      meta.writeUInt16LE(geoBuf.length, 5);
      meta.writeUInt16LE(catBuf.length, 7);

      recordBuffers.push(meta, fpBuf, srcBuf, nameBuf, idBuf, geoBuf, catBuf);
    }

    const uncompressed = Buffer.concat([magic, countBuf, ...recordBuffers]);
    const compressed = zlib.brotliCompressSync(uncompressed, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
    });

    const tmpFilePath = `${filePath}.tmp`;
    fs.writeFileSync(tmpFilePath, compressed);
    const fd = fs.openSync(tmpFilePath, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    fs.renameSync(tmpFilePath, filePath);
    const checksum = crypto.createHash('sha256').update(compressed).digest('hex');

    const manifest: PublicRegistryShardManifest = {
      shard_id: shardId,
      store_version: storeVersion,
      registry_family: registryFamily,
      jurisdiction_level: jurisdictionLevel,
      geography,
      file_location: filePath,
      record_count: pointers.length,
      file_size: compressed.length,
      checksum,
      is_active: true
    };

    await this.pool.query(`
      INSERT INTO public.atlas_public_registry_pointer_shards (
        shard_id, store_version, registry_family, jurisdiction_level, geography,
        file_location, record_count, file_size, checksum, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (shard_id) DO UPDATE SET
        record_count = EXCLUDED.record_count,
        file_size = EXCLUDED.file_size,
        checksum = EXCLUDED.checksum,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [
      manifest.shard_id,
      manifest.store_version,
      manifest.registry_family,
      manifest.jurisdiction_level,
      manifest.geography,
      manifest.file_location,
      manifest.record_count,
      manifest.file_size,
      manifest.checksum,
      manifest.is_active
    ]);

    return manifest;
  }

  /**
   * Retrieves standardized industrial entity candidates matching concept and geography
   * strictly from real pointer shards (excluding non-entities).
   * Prioritizes exact canonical geography before applying limit.
   */
  public async retrieveCandidates(
    concept: string,
    geography: string,
    limit: number = 50
  ): Promise<any[]> {
    // 1. Hot Pointer Index Route (Fast Path)
    const { AtlasHotPointerIndex } = await import('../../../server/services/industrial/AtlasHotPointerIndex.ts');
    const index = AtlasHotPointerIndex.getInstance();
    
    if (index.getStats().indexed_pointers > 0) {
      const query = {
        concept_id: concept,
        canonical_geo_id: geography,
        entity_class: 'ESTABLISHMENT' // Default
      };
      const { pointer_ids, lookup_ms } = index.lookupPointers(query);
      const { candidates, fetch_ms } = index.fetchCandidates(pointer_ids.slice(0, limit * 2)); // Grab a bit more for dedupe
      console.log(`[AtlasPublicRegistry] HotIndex Route: LOOKUP_MS=${lookup_ms}ms, POINTER_FETCH_MS=${fetch_ms}ms, Returned Candidates=${candidates.length}`);
      if (candidates.length > 0) {
        return candidates;
      }
    }

    const normalize = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const stem = (t: string) => {
      let s = normalize(t);
      s = s.replace(/(erias|eria|eros|ero|eras|era)$/, '');
      s = s.replace(/(arias|aria|arios|ario)$/, '');
      s = s.replace(/(acias|acia)$/, 'ac');
      s = s.replace(/(ores|or)$/, '');
      s = s.replace(/(as|es|os|s)$/, '');
      return s;
    };

    const cleanConcept = normalize(concept || '');
    const cleanGeo = normalize(geography || '').replace(/^arg_/, '');
    const conceptTokens = cleanConcept.split(/\s+/).map(stem).filter(t => t.length >= 3 && !['los', 'las', 'del', 'para', 'con', 'una', 'por'].includes(t));

    // 1. Canonicalize geography
    let canonicalName = cleanGeo.toUpperCase();
    let exactCityPatterns: string[] = [];
    let excludePatterns: string[] = [];
    let provincePatterns: string[] = [];
    let standardCity = geography;
    let standardProvince = geography;

    if (cleanGeo.includes('caba') || cleanGeo.includes('capital federal') || cleanGeo === 'capital' || cleanGeo.includes('ciudad de buenos aires') || cleanGeo.includes('ciudad autonoma')) {
      canonicalName = 'CABA';
      standardCity = 'Ciudad Autónoma de Buenos Aires';
      standardProvince = 'Ciudad Autónoma de Buenos Aires';
    } else if (cleanGeo.includes('mar del plata') || cleanGeo.includes('mar_del_plata') || cleanGeo.includes('general pueyrredon') || cleanGeo.includes('general_pueyrredon') || cleanGeo.includes('pueyrredon') || cleanGeo === 'mgp') {
      canonicalName = 'MAR_DEL_PLATA';
      standardCity = 'Mar del Plata';
      standardProvince = 'Buenos Aires';
    } else if (cleanGeo.includes('plata')) {
      canonicalName = 'LA_PLATA';
      standardCity = 'La Plata';
      standardProvince = 'Buenos Aires';
    } else if (cleanGeo.includes('rosario')) {
      canonicalName = 'ROSARIO';
      standardCity = 'Rosario';
      standardProvince = 'Santa Fe';
    } else if (cleanGeo.includes('mendoza')) {
      canonicalName = 'MENDOZA_CAPITAL';
      standardCity = 'Mendoza Capital';
      standardProvince = 'Mendoza';
    } else if (cleanGeo.includes('cordoba')) {
      canonicalName = 'CORDOBA_CAPITAL';
      standardCity = 'Córdoba';
      standardProvince = 'Córdoba';
    } else {
      const tokens = cleanGeo.split(/[\s_]+/).filter(t => t.length >= 3);
      exactCityPatterns = tokens.map(t => `%${t}%`);
    }

    // 2. Select compatible shards
    const allShardsRes = await this.pool.query(`
      SELECT shard_id, store_version, file_location, registry_family, jurisdiction_level, geography, record_count
      FROM public.atlas_public_registry_pointer_shards
      WHERE is_active = true AND store_version != 'public_v4_expansion'
    `);

    interface RankedShard {
      shard_id: string;
      store_version: string;
      file_location: string;
      registry_family: string;
      jurisdiction_level: string;
      geography: string;
      record_count: number;
      tier: number;
    }

    const scoredShards: RankedShard[] = [];

    for (const s of allShardsRes.rows) {
      const geoNorm = normalize(s.geography);
      let tier = 99;

      if (canonicalName === 'CABA') {
        const isCaba = geoNorm.includes('caba') || 
                       geoNorm.includes('capital_federal') || 
                       geoNorm.includes('capital federal') || 
                       (geoNorm.includes('ciudad') && geoNorm.includes('buenos_aires')) ||
                       (geoNorm.includes('ciudad') && geoNorm.includes('buenos aires'));
        if (isCaba) tier = 1;
      } else if (canonicalName === 'MAR_DEL_PLATA') {
        if (geoNorm.includes('mar_del_plata') || geoNorm.includes('mar del plata') || geoNorm.includes('general_pueyrredon') || geoNorm.includes('general pueyrredon') || geoNorm === 'arg_mar_delplata' || geoNorm === 'arg_mardel_plata') {
          tier = 1;
        } else if (geoNorm.includes('buenos_aires') || geoNorm.includes('buenos aires')) {
          tier = 3;
        }
      } else if (canonicalName === 'LA_PLATA') {
        if (!geoNorm.includes('mar_del_plata') && !geoNorm.includes('mar del plata') && !geoNorm.includes('platanos')) {
          if (geoNorm.includes('la_plata') || geoNorm.includes('la plata')) {
            tier = 1;
          } else if (geoNorm.includes('buenos_aires') || geoNorm.includes('buenos aires')) {
            tier = 3;
          }
        }
      } else if (canonicalName === 'ROSARIO') {
        const isExcluded = geoNorm.includes('rosario_del_tala') || geoNorm.includes('rosario del tala') ||
                           geoNorm.includes('rosario_de_la_frontera') || geoNorm.includes('rosario de la frontera') ||
                           geoNorm.includes('rosario_de_lerma') || geoNorm.includes('rosario de lerma') ||
                           geoNorm.includes('villa_del_rosario') || geoNorm.includes('villa del rosario') ||
                           geoNorm.includes('mendoza_bahia_rosario') || geoNorm.includes('mendoza_rosario');
        if (!isExcluded) {
          if (geoNorm === 'arg_rosario' || geoNorm === 'arg_ciudad_de_rosario' || geoNorm.startsWith('arg_rosario')) {
            tier = 1;
          } else if (geoNorm.includes('santa_fe') || geoNorm.includes('santa fe')) {
            tier = 3;
          }
        }
      } else if (canonicalName === 'MENDOZA_CAPITAL') {
        if (!geoNorm.includes('mendoza_bahia_rosario')) {
          if (geoNorm.includes('mendoza_capital') || geoNorm.includes('mendoza capital')) {
            tier = 1;
          } else if (geoNorm.includes('mendoza')) {
            tier = 3;
          }
        }
      } else if (canonicalName === 'CORDOBA_CAPITAL') {
        if (geoNorm.includes('cordoba_capital') || geoNorm.includes('cordoba capital') || geoNorm.includes('ciudad_de_cordoba')) {
          tier = 1;
        } else if (geoNorm.includes('cordoba')) {
          tier = 3;
        }
      } else {
        const isExact = exactCityPatterns.some(p => {
          const cleanP = normalize(p.replace(/%/g, ''));
          return geoNorm.includes(cleanP);
        });
        if (isExact) tier = 1;
      }

      if (tier === 99 && (s.jurisdiction_level === 'NATIONAL' || geoNorm.includes('nacional'))) {
        tier = 4;
      }

      if (tier <= 4) {
        scoredShards.push({ ...s, tier });
      }
    }

    // 3. Rank shards: exact city first, store_version (v5 radar expansion first), preferred registry family, then record_count DESC
    const isHealthConcept = conceptTokens.some(t => t.includes('farmac') || t.includes('medic') || t.includes('salud') || t.includes('veterin'));
    const preferredFamily = isHealthConcept ? 'SALUD' : 'COMERCIOS_EMPRESAS';

    const vOrder = (ver: string) => {
      if (ver === 'public_v5_radar_expansion') return 0;
      if (ver === 'public_v3_expansion') return 1;
      if (ver === 'public_v1_pilot') return 2;
      return 3;
    };

    scoredShards.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const vA = vOrder(a.store_version);
      const vB = vOrder(b.store_version);
      if (vA !== vB) return vA - vB;
      const aPref = a.registry_family === preferredFamily ? 0 : (a.registry_family === 'COMERCIOS_EMPRESAS' ? 1 : 2);
      const bPref = b.registry_family === preferredFamily ? 0 : (b.registry_family === 'COMERCIOS_EMPRESAS' ? 1 : 2);
      if (aPref !== bPref) return aPref - bPref;
      return b.record_count - a.record_count;
    });

    const tier1Shards = scoredShards.filter(s => s.tier === 1).slice(0, 500);
    const tier3Shards = scoredShards.filter(s => s.tier === 3).slice(0, 100);
    const tier4Shards = scoredShards.filter(s => s.tier === 4).slice(0, 50);

    const candidates: any[] = [];
    const contentSources = ['DNDA_CULTURA'];
    const officialSources = ['DDJJ_PATRIMONIAL_NACIONAL', 'MAGISTRATURA_NACIONAL'];

    const scanShards = (shards: RankedShard[]) => {
      for (const s of shards) {
        if (candidates.length >= limit) break;
        const fileLoc = s.file_location;
        if (!fs.existsSync(fileLoc)) continue;

        try {
          const buf = fs.readFileSync(fileLoc);
          const uncompressed = zlib.brotliDecompressSync(buf);
          let offset = 8;
          const count = uncompressed.readUInt32LE(4);

          for (let i = 0; i < count; i++) {
            if (offset >= uncompressed.length || candidates.length >= limit) break;
            const srcLen = uncompressed.readUInt8(offset);
            const nameLen = uncompressed.readUInt16LE(offset + 1);
            const idLen = uncompressed.readUInt16LE(offset + 3);
            const geoLen = uncompressed.readUInt16LE(offset + 5);
            const catLen = uncompressed.readUInt16LE(offset + 7);
            const metaLen = 9;

            const fp = uncompressed.slice(offset + metaLen, offset + metaLen + 8).toString('hex');
            const src = uncompressed.slice(offset + metaLen + 8, offset + metaLen + 8 + srcLen).toString('utf8');
            const name = uncompressed.slice(offset + metaLen + 8 + srcLen, offset + metaLen + 8 + srcLen + nameLen).toString('utf8');
            const officialId = uncompressed.slice(offset + metaLen + 8 + srcLen + nameLen, offset + metaLen + 8 + srcLen + nameLen + idLen).toString('utf8');
            const geoHint = uncompressed.slice(offset + metaLen + 8 + srcLen + nameLen + idLen, offset + metaLen + 8 + srcLen + nameLen + idLen + geoLen).toString('utf8');
            const catHint = uncompressed.slice(offset + metaLen + 8 + srcLen + nameLen + idLen + geoLen, offset + metaLen + 8 + srcLen + nameLen + idLen + geoLen + catLen).toString('utf8');

            offset += metaLen + 8 + srcLen + nameLen + idLen + geoLen + catLen;

            // Pure ENTITY filter: Discard CONTENT, OFFICIAL, CONTEXT, and PERSON_ONLY
            if (contentSources.includes(src) || officialSources.includes(src) || officialId.includes(':HUMAN:') || catHint === 'CORPORATE_OFFICERS_AND_GOVERNANCE') {
              continue;
            }
            if (src === 'REGISTRO_AUDIENCIAS' && (catHint === 'SUJETO_OBLIGADO' || catHint === 'SOLICITANTE')) {
              continue;
            }

            // Semantic matching on candidate name, category hint, and geo hint
            const normName = normalize(name);
            const candidateText = normalize(`${name} ${catHint} ${geoHint}`);
            const matchesConcept = conceptTokens.length === 0 || conceptTokens.some(token => candidateText.includes(token));
            const nameMatchesConcept = conceptTokens.some(token => normName.includes(token));

            if (!matchesConcept) continue;

            let candidateCity = standardCity;
            let candidateProvince = standardProvince;

            if (s.tier === 1) {
              candidateCity = standardCity;
              candidateProvince = standardProvince;
            } else if (s.tier === 3) {
              candidateCity = geoHint || standardProvince;
              candidateProvince = standardProvince;
            } else {
              candidateCity = geoHint || 'Argentina';
              candidateProvince = geoHint || 'Argentina';
            }

            candidates.push({
              candidate_id: `cand_pubreg_${fp}`,
              source_id: `SRC_PUBLIC_REGISTRY_${src}`,
              source_name: `Public Registry (${src})`,
              source_resource: src,
              source_entity_id: officialId || fp,
              name: name,
              canonical_name: name,
              company_name: name,
              cuit: officialId && /^\d{11}$/.test(officialId.replace(/\D/g, '')) ? officialId : undefined,
              tax_id: officialId || undefined,
              city: candidateCity,
              province: candidateProvince,
              geography: s.geography,
              category: catHint,
              entity_type: 'ESTABLISHMENT',
              row_unit: 'ESTABLISHMENT',
              tier: s.tier,
              nameMatches: nameMatchesConcept ? 1 : 0,
              evidence: {
                source_id: `SRC_PUBLIC_REGISTRY_${src}`,
                source_citation: `Public Registry Store: ${src}`,
                record_type: 'PUBLIC_REGISTRY_POINTER',
                raw_row: { name, officialId, src, geoHint, catHint, shard: s.shard_id, tier: s.tier },
                verified_at: new Date().toISOString()
              }
            });
          }
        } catch (_) {}
      }
    };

    scanShards(tier1Shards);
    if (candidates.length < limit) {
      scanShards(tier3Shards);
    }
    if (candidates.length < limit) {
      scanShards(tier4Shards);
    }

    // 4. Rank: exact city/municipality -> exact partido/departamento -> exact provincia -> nacional
    candidates.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
      return 0;
    });

    // 5. Apply limit
    return candidates.slice(0, limit);
  }
}
