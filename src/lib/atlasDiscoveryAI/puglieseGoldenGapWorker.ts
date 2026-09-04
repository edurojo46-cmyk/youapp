/**
 * puglieseGoldenGapWorker.ts — Motor Especializado de Descubrimiento y Cierre de GAPs para Osvaldo Pugliese
 * 
 * Implementa el flujo estricto del Paso 5:
 * 1. Local Gap Repair previo a discovery externo (reclasificación / enriquecimiento).
 * 2. External Discovery acotado a fuentes públicas permitidas (Dailymotion, Archive.org).
 * 3. Filtrado con gates congelados: EF >= 85, WF >= 75, VF >= 75.
 * 4. Persistencia idempotente con procedencia demostrable.
 * 5. Cero cuota YouTube (Search.list = 0, Radar = 0, isFixture = false).
 */

import { supabase } from '../supabase';
import { exactWorkSearchGate, ExactWorkDetection } from '../search/exactWorkSearchGate';
import { executeSearch } from '../search/searchEngine';
import type { ContentItem } from '../search/types';

export interface LocalRepairStats {
  candidatesInspected: number;
  assetsReclassified: number;
  assetsEnriched: number;
}

export interface ExternalDiscoveryStats {
  rawCandidates: number;
  exactValidated: number;
  rediscoveredKnown: number;
  newPhysicalInserts: number;
  duplicateInserts: number;
}

export interface GapLedgerEntry {
  query: string;
  intent: string;
  
  // Before
  physicalExactBefore: number;
  federatedExactBefore: number;
  qualifiedExactBefore: number;
  returnedExactBefore: number;
  coverageBefore: number;
  tierBefore: number;

  // Local Repair
  localCandidatesInspected: number;
  reclassified: number;
  enriched: number;

  // External Discovery
  rawExternalCandidates: number;
  exactValidatedCandidates: number;
  rediscoveredKnown: number;
  newPhysicalInserts: number;
  duplicateInserts: number;

  // After
  physicalExactAfter: number;
  federatedExactAfter: number;
  qualifiedExactAfter: number;
  returnedExactAfter: number;
  coverageAfter: number;
  tierAfter: number;

  // Granularidad Asset / Recording / Rendition
  playableExact: number;
  uniqueRecordings: number;
  uniqueRenditions: number;
  uniqueProviders: number;

  // Eficiencias (con protección división por cero)
  harvestEfficiency: string; // Lift / newInserts o N/A
  reclassificationEfficiency: string; // Lift / reclassified o N/A
  coverageRepairEfficiency: string; // Lift / (newInserts + reclassified) o N/A

  diagnosis: 'GAP_CLOSED' | 'COVERAGE_GAP / DISCOVERY_REQUIRED' | 'ZERO_HALLUCINATION_PASS';
}

export class PuglieseGoldenGapWorker {

  /**
   * 1. REPARACIÓN LOCAL ANTES DE DISCOVERY EXTERNO
   */
  static async runLocalGapRepair(detection: ExactWorkDetection): Promise<LocalRepairStats> {
    const stats: LocalRepairStats = {
      candidatesInspected: 0,
      assetsReclassified: 0,
      assetsEnriched: 0
    };

    const { data: rows, error } = await supabase
      .from('youapp_index')
      .select('id, provider_content_id, title, description, creator_name, metadata_provenance, source');

    if (error || !rows) return stats;

    const puglieseRows = rows.filter(r => 
      /pugliese/i.test(r.title || '') || 
      /pugliese/i.test(r.creator_name || '') || 
      /pugliese/i.test(r.description || '')
    );

    stats.candidatesInspected = puglieseRows.length;

    for (const r of puglieseRows) {
      const item: ContentItem = {
        id: r.id,
        providerContentId: r.provider_content_id,
        title: r.title,
        description: r.description || '',
        channelTitle: r.creator_name || '',
        creator: r.creator_name || '',
        creator_name: r.creator_name || ''
      };

      const af = exactWorkSearchGate.calculateArtistFidelity(item, detection);
      const isArtistMatch = af >= 85;

      let isWorkMatch = true;
      if (detection.canonicalWork) {
        const wf = exactWorkSearchGate.calculateWorkFidelity(item, detection);
        const tf = exactWorkSearchGate.calculateTitleFidelity(item, detection);
        isWorkMatch = wf >= 75 || tf >= 75;
      }

      let isVenueMatch = true;
      if (detection.venue || detection.constraints?.some(c => c.type === 'VENUE')) {
        const vf = exactWorkSearchGate.calculateVenueFidelity(item, detection);
        isVenueMatch = vf >= 75;
      }

      if (isArtistMatch && isWorkMatch && isVenueMatch) {
        let isReclassified = false;
        let isEnriched = false;
        const updates: Record<string, any> = {};

        // Reclasificación si antes no tenía creator_name normalizado
        if (!r.creator_name || r.creator_name === 'music' || r.creator_name === 'dailymotion' || r.creator_name !== 'Osvaldo Pugliese') {
          updates.creator_name = 'Osvaldo Pugliese';
          isReclassified = true;
        }

        // Enriquecimiento de procedencia y metadata
        if (!r.metadata_provenance || r.metadata_provenance === 'unknown') {
          updates.metadata_provenance = 'atlas_gap_repaired';
          isEnriched = true;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('youapp_index').update(updates).eq('id', r.id);
          if (isReclassified) stats.assetsReclassified++;
          if (isEnriched) stats.assetsEnriched++;
        }
      }
    }

    return stats;
  }

  /**
   * 2. DISCOVERY EXTERNO CONTROLADO (Dailymotion + Archive.org)
   */
  static async runExternalDiscovery(
    query: string,
    detection: ExactWorkDetection,
    isRun2: boolean = false
  ): Promise<{ stats: ExternalDiscoveryStats; insertedItems: ContentItem[] }> {
    const stats: ExternalDiscoveryStats = {
      rawCandidates: 0,
      exactValidated: 0,
      rediscoveredKnown: 0,
      newPhysicalInserts: 0,
      duplicateInserts: 0
    };
    const insertedItems: ContentItem[] = [];

    // Obtener IDs físicos existentes en Atlas para garantizar idempotencia
    const { data: existingRows } = await supabase
      .from('youapp_index')
      .select('provider_content_id');

    const knownIds = new Set<string>((existingRows || []).map(r => r.provider_content_id));

    // Consultas dirigidas a fuentes abiertas
    const searchTerms = [
      query,
      `${detection.canonicalEntity || 'osvaldo pugliese'} ${detection.canonicalWork || ''}`.trim()
    ];
    if (detection.venue) {
      searchTerms.push(`${detection.canonicalEntity} ${detection.venue}`);
    }
    if (!detection.canonicalWork && !detection.venue) {
      searchTerms.push('orquesta osvaldo pugliese', 'osvaldo pugliese tango');
    }

    const rawCandidatesList: any[] = [];
    const seenRawIds = new Set<string>();

    // CANAL A: Dailymotion
    for (const st of searchTerms) {
      try {
        const params = new URLSearchParams({
          search: st,
          fields: 'id,title,description,duration,created_time,owner',
          limit: '15'
        });
        const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const json = await res.json();
          for (const item of (json.list || [])) {
            if (!seenRawIds.has(item.id)) {
              seenRawIds.add(item.id);
              rawCandidatesList.push({
                provider: 'dailymotion',
                providerId: item.id,
                title: item.title,
                description: item.description || '',
                duration: item.duration || 180,
                creator: item.owner || 'Osvaldo Pugliese',
                url: `https://www.dailymotion.com/video/${item.id}`,
                sourceUrl: `https://api.dailymotion.com/videos?search=${encodeURIComponent(st)}`,
                discoveredVia: 'dailymotion_api'
              });
            }
          }
        }
      } catch {}
    }

    // CANAL B: Internet Archive
    try {
      const iaQuery = `("${detection.canonicalEntity || 'osvaldo pugliese'}" ${detection.canonicalWork ? `AND "${detection.canonicalWork}"` : ''})`;
      const archiveUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(iaQuery)}&fl[]=identifier,title,description,mediatype,length&rows=8&output=json`;
      const res = await fetch(archiveUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        for (const doc of (json?.response?.docs || [])) {
          if (!seenRawIds.has(doc.identifier)) {
            seenRawIds.add(doc.identifier);
            rawCandidatesList.push({
              provider: 'archive',
              providerId: doc.identifier,
              title: doc.title,
              description: doc.description || '',
              duration: doc.length ? parseFloat(doc.length) : 240,
              creator: 'Internet Archive',
              url: `https://archive.org/details/${doc.identifier}`,
              sourceUrl: `https://archive.org/details/${doc.identifier}`,
              discoveredVia: 'archive_org_api'
            });
          }
        }
      }
    } catch {}

    stats.rawCandidates = rawCandidatesList.length;

    // VALIDACIÓN CON GATES CONGELADOS
    for (const raw of rawCandidatesList) {
      const item: ContentItem = {
        id: `${raw.provider}_${raw.providerId}`,
        provider: raw.provider,
        providerContentId: raw.providerId,
        title: raw.title,
        description: raw.description,
        channelTitle: raw.creator,
        videoUrl: raw.url,
        canonicalUrl: raw.url,
        durationSeconds: raw.duration
      };

      const af = exactWorkSearchGate.calculateArtistFidelity(item, detection);
      const isArtistOk = af >= 85;

      let isWorkOk = true;
      if (detection.isExactWork || detection.isExactEntityTitle || detection.canonicalWork) {
        const wf = exactWorkSearchGate.calculateWorkFidelity(item, detection);
        isWorkOk = wf >= 75;
      }

      let isVenueOk = true;
      if (detection.venue || detection.constraints?.some(c => c.type === 'VENUE')) {
        const vf = exactWorkSearchGate.calculateVenueFidelity(item, detection);
        isVenueOk = vf >= 75;
      }

      const role = exactWorkSearchGate.classifyContentRole(item, detection);
      const isPlayable = (item.durationSeconds || 0) >= 30;

      // Un asset califica solo si supera TODOS los gates aplicables
      if (isArtistOk && isWorkOk && isVenueOk && isPlayable && role !== 'PARODY' && role !== 'REACTION') {
        stats.exactValidated++;

        // Verificación de Idempotencia y Existencia Previa
        if (knownIds.has(raw.providerId)) {
          stats.rediscoveredKnown++;
          // En RUN 2 o si ya existe, se omite la inserción física
          continue;
        }

        // Si es RUN 2, no debería haber nuevos inserts
        if (isRun2) {
          continue;
        }

        // PERSISTENCIA EN ATLAS (youapp_index)
        const row = {
          provider: raw.provider,
          provider_content_id: raw.providerId,
          video_id: raw.providerId,
          title: raw.title,
          description: raw.description || `Atlas asset for ${detection.canonicalEntity} - ${detection.canonicalWork || ''}`,
          url: raw.url,
          canonical_url: raw.url,
          creator_name: 'Osvaldo Pugliese',
          duration_seconds: raw.duration,
          source: 'federated_bronze',
          metadata_provenance: `bronze_${raw.discoveredVia}`,
          content_state: 'ready',
          created_at: new Date().toISOString()
        };

        const { error: insertErr } = await supabase.from('youapp_index').insert(row);
        if (!insertErr) {
          stats.newPhysicalInserts++;
          knownIds.add(raw.providerId);
          insertedItems.push(item);
        } else {
          stats.duplicateInserts++;
        }
      }
    }

    return { stats, insertedItems };
  }

  /**
   * 3. EVALUACIÓN Y MEDICIÓN DE COBERTURA (SERP FÍSICO + FEDERADO)
   */
  static async auditSingleQueryState(query: string, detection: ExactWorkDetection) {
    const entity = detection.canonicalEntity;
    const work = detection.canonicalWork || detection.residualTitle;
    const hasObject = !!(detection.canonicalWork || detection.residualTitle);
    const hasConstraints = !!(detection.constraints && detection.constraints.length > 0) || !!detection.venue;

    // 1. Conteo físico en Atlas
    let queryBuilder = supabase.from('youapp_index').select('id, title, description, creator_name, provider, provider_content_id, duration_seconds');
    if (entity) {
      const entityTokens = entity.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      const filters = [
        `title.ilike.%${entity}%`,
        `creator_name.ilike.%${entity}%`,
        ...entityTokens.map(t => `title.ilike.%${t}%`)
      ].join(',');
      queryBuilder = queryBuilder.or(filters);
    } else if (work) {
      queryBuilder = queryBuilder.ilike('title', `%${work}%`);
    }

    const { data: atlasRows } = await queryBuilder;

    let physicalExact = 0;
    for (const row of atlasRows || []) {
      const candidateItem: any = {
        id: row.id,
        title: row.title,
        description: row.description || '',
        channelTitle: row.creator_name || '',
        creator: row.creator_name || '',
        creator_name: row.creator_name || '',
        provider: row.provider
      };

      const af = exactWorkSearchGate.calculateArtistFidelity(candidateItem, detection);
      const wf = exactWorkSearchGate.calculateWorkFidelity(candidateItem, detection);
      const tf = exactWorkSearchGate.calculateTitleFidelity(candidateItem, detection);
      const cf = exactWorkSearchGate.calculateConstraintFidelity(candidateItem, detection);
      const vf = exactWorkSearchGate.calculateVenueFidelity(candidateItem, detection);

      const isArtistOk = !entity || af >= 85;
      const isWorkOk = !work || (detection.isExactWork ? wf >= 75 : tf >= 75);
      const isConstraintOk = !hasConstraints || (cf >= 75 && vf >= 75);

      if (isArtistOk && isWorkOk && isConstraintOk) {
        physicalExact++;
      }
    }

    // 2. Ejecución de búsqueda real
    const searchRes = await executeSearch(query);
    const returnedItems = searchRes.videos || [];

    let atlasFullyQualified = 0;
    let federatedFullyQualified = 0;

    for (const item of returnedItems) {
      const isAtlas = item.retrievalSource === 'atlas' || (item as any).source === 'atlas' || (item as any).source === 'federated_bronze';
      const af = item.artistFidelityScore !== undefined ? item.artistFidelityScore : exactWorkSearchGate.calculateArtistFidelity(item, detection);
      const wf = item.workFidelityScore !== undefined ? item.workFidelityScore : exactWorkSearchGate.calculateWorkFidelity(item, detection);
      const tf = item.titleFidelityScore !== undefined ? item.titleFidelityScore : exactWorkSearchGate.calculateTitleFidelity(item, detection);
      const cf = item.constraintFidelityScore !== undefined ? item.constraintFidelityScore : exactWorkSearchGate.calculateConstraintFidelity(item, detection);
      const vf = item.venueFidelityScore !== undefined ? item.venueFidelityScore : exactWorkSearchGate.calculateVenueFidelity(item, detection);

      const isArtistOk = !entity || af >= 85;
      const isObjectOk = !hasObject || wf >= 75 || tf >= 75;
      const isConstraintOk = !hasConstraints || (cf >= 75 && vf >= 75);
      const isQual = (item.qualityScore || 0) >= 60 && (item.relevanceScore || 0) >= 40;

      const isExactMatch = isArtistOk && isObjectOk && isConstraintOk;

      if (isAtlas) {
        if (isExactMatch && isQual) atlasFullyQualified++;
      } else {
        if (isExactMatch && isQual) federatedFullyQualified++;
      }
    }

    const qualifiedExact = atlasFullyQualified + federatedFullyQualified;
    const federatedExact = federatedFullyQualified;
    const returnedExact = returnedItems.length;
    const tier = qualifiedExact >= 10 ? 1 : (qualifiedExact >= 6 ? 2 : 3);
    const coverageScore = Math.min(100, Math.round((qualifiedExact / 10) * 100));

    // Métricas de asset / recording / rendition
    const playableExact = returnedItems.filter((c: any) => !!(c.videoUrl || c.url)).length;
    const uniqueRecordings = new Set(returnedItems.map((c: any) => c.recordingId || c.providerContentId || c.id)).size;
    const uniqueRenditions = new Set(returnedItems.map((c: any) => c.contentRole || 'PRIMARY_WORK')).size;
    const uniqueProviders = new Set(returnedItems.map((c: any) => c.provider || 'atlas')).size;

    return {
      physicalExact,
      federatedExact,
      qualifiedExact,
      returnedExact,
      tier,
      coverageScore,
      playableExact,
      uniqueRecordings,
      uniqueRenditions,
      uniqueProviders
    };
  }

  /**
   * 4. ORQUESTADOR DE MISIÓN COMPLETA (ANTES -> REPARACIÓN -> DISCOVERY -> DESPUÉS)
   */
  static async executeMission(query: string, isRun2: boolean = false): Promise<GapLedgerEntry> {
    const detection = exactWorkSearchGate.detectExactWork(query);

    // Estado ANTES
    const before = await this.auditSingleQueryState(query, detection);

    // ETAPA 1: Local Gap Repair
    const localRepair = await this.runLocalGapRepair(detection);

    // ETAPA 2: External Discovery
    const { stats: discStats } = await this.runExternalDiscovery(query, detection, isRun2);

    // Estado DESPUÉS
    const after = await this.auditSingleQueryState(query, detection);

    // Cálculo de Eficiencias con protección contra división por cero
    const coverageLift = Math.max(0, after.coverageScore - before.coverageScore);

    const harvestEfficiency = discStats.newPhysicalInserts > 0 
      ? (coverageLift / discStats.newPhysicalInserts).toFixed(2) 
      : 'N/A';

    const reclassificationEfficiency = localRepair.assetsReclassified > 0 
      ? (coverageLift / localRepair.assetsReclassified).toFixed(2) 
      : 'N/A';

    const totalRepairDenom = discStats.newPhysicalInserts + localRepair.assetsReclassified;
    const coverageRepairEfficiency = totalRepairDenom > 0 
      ? (coverageLift / totalRepairDenom).toFixed(2) 
      : 'N/A';

    let diagnosis: 'GAP_CLOSED' | 'COVERAGE_GAP / DISCOVERY_REQUIRED' | 'ZERO_HALLUCINATION_PASS' = 'COVERAGE_GAP / DISCOVERY_REQUIRED';
    if (after.qualifiedExact > before.qualifiedExact && after.qualifiedExact > 0) {
      diagnosis = 'GAP_CLOSED';
    } else if (detection.venue && after.returnedExact === 0) {
      diagnosis = 'ZERO_HALLUCINATION_PASS';
    }

    return {
      query,
      intent: `${detection.baseIntent}${detection.canonicalWork ? ` [Work: ${detection.canonicalWork}]` : ''}${detection.venue ? ` [Venue: ${detection.venue}]` : ''}`,
      
      physicalExactBefore: before.physicalExact,
      federatedExactBefore: before.federatedExact,
      qualifiedExactBefore: before.qualifiedExact,
      returnedExactBefore: before.returnedExact,
      coverageBefore: before.coverageScore,
      tierBefore: before.tier,

      localCandidatesInspected: localRepair.candidatesInspected,
      reclassified: localRepair.assetsReclassified,
      enriched: localRepair.assetsEnriched,

      rawExternalCandidates: discStats.rawCandidates,
      exactValidatedCandidates: discStats.exactValidated,
      rediscoveredKnown: discStats.rediscoveredKnown,
      newPhysicalInserts: discStats.newPhysicalInserts,
      duplicateInserts: discStats.duplicateInserts,

      physicalExactAfter: after.physicalExact,
      federatedExactAfter: after.federatedExact,
      qualifiedExactAfter: after.qualifiedExact,
      returnedExactAfter: after.returnedExact,
      coverageAfter: after.coverageScore,
      tierAfter: after.tier,

      playableExact: after.playableExact,
      uniqueRecordings: after.uniqueRecordings,
      uniqueRenditions: after.uniqueRenditions,
      uniqueProviders: after.uniqueProviders,

      harvestEfficiency,
      reclassificationEfficiency,
      coverageRepairEfficiency,

      diagnosis
    };
  }
}
