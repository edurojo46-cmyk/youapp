/**
 * exactWorkCoverageMemory.ts — Memoria Persistente de Cobertura y Demanda de Obras y Entidades Canónicas
 * 
 * Separa rigurosamente:
 * 1. WorkCoverage@10: Cobertura de la obra en general (incluyendo covers y tributos).
 * 2. ExactEntityWorkCoverage@10: Cobertura estricta de la obra ejecutada por el artista original.
 * 3. OriginalArtistCoverage@5: Cobertura del artista original en el Top 5.
 * 
 * Calcula la prioridad matemática de cosecha:
 * EntityWorkGapPriority = Demand × EntityImportance × ExactEntityWorkDeficit × OriginalArtistDeficit × SourceOpportunity × CoverSaturationPenalty
 */

import { supabase } from '../supabase';
import type { ContentItem } from './types';
import type { ExactWorkDetection, ContentRole } from './exactWorkSearchGate';
import { HarvestDedupeIndex } from '../atlasHarvester/harvestDedupeIndex';

export interface ExactEntityWorkCoverageRecord {
  workId: string;
  canonicalTitle: string;
  artist: string;
  atlasPhysicalCount: number;
  federatedExactCount: number;
  workQualifiedCount: number;
  entityWorkQualifiedCount: number;
  originalArtistCount: number;
  coverCount: number;
  contextualUseCount: number;
  assetCount: number;
  uniqueRecordingCount: number;
  uniqueRenditionCount: number;
  coverageGapRemaining: number;
  workCoverageAt10: number;
  exactEntityWorkCoverageAt10: number;
  originalArtistCoverageAt5: number;
  coverCoverageAt10: number;
  queryDemand7d: number;
  queryDemand30d: number;
  priorityScore: number;
  priorityTier: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  lastQueriedAt: string;
  lastDiscoveryMissionAt?: string;
  lastCoverageImprovement?: string;
}

export interface ExactWorkExecutionStats {
  detection: ExactWorkDetection;
  allQualifiedItems: ContentItem[];
  top10Items: ContentItem[];
}

// In-Memory Fallback Cache para SSR / Dev / Offline
const inMemoryCoverageMemory = new Map<string, ExactEntityWorkCoverageRecord>();

export class ExactWorkCoverageMemory {
  /**
   * Registra una búsqueda de obra exacta y actualiza la cobertura y demanda en Atlas
   */
  static async recordSearch(stats: ExactWorkExecutionStats): Promise<ExactEntityWorkCoverageRecord> {
    const { detection, allQualifiedItems, top10Items } = stats;
    const targetTitle = detection.canonicalWork || detection.residualTitle || 'unknown_work';
    const workId = targetTitle.toLowerCase().replace(/[,;:.()\-]/g, '').replace(/\s+/g, '_');
    const canonicalTitle = detection.canonicalWork || detection.residualTitle || 'Obra Desconocida';
    const artist = detection.canonicalEntity || 'Artista Desconocido';

    let atlasPhysical = 0;
    let federatedExact = 0;
    let originalArtist = 0;
    let coverCount = 0;
    let contextualUseCount = 0;
    let entityWorkQualifiedCount = 0;

    for (const item of allQualifiedItems) {
      const rs = (item.retrievalSource || '').toLowerCase();
      const isPhysical = rs === 'atlas' || rs === 'cache' || rs === 'local';
      if (isPhysical) {
        atlasPhysical++;
      } else {
        federatedExact++;
      }

      const role: ContentRole = item.contentRole || item.semanticMatch?.contentRole || 'PRIMARY_WORK';
      const af = item.artistFidelityScore ?? item.semanticMatch?.artistFidelity ?? 100;
      const isExactEntity = item.semanticMatch?.isExactEntityWork || item.semanticMatch?.isExactEntityTitle || item.isExactEntityWork || item.isExactEntityTitle || (
        role !== 'COVER' && role !== 'TRIBUTE' && role !== 'CONTEXTUAL_USE' && role !== 'COMMENTARY' && role !== 'REACTION' && af >= 75
      );

      if (isExactEntity) {
        entityWorkQualifiedCount++;
        originalArtist++;
      }
      if (role === 'COVER' || role === 'TRIBUTE') {
        coverCount++;
      }
      if (role === 'CONTEXTUAL_USE' || role === 'COMMENTARY' || role === 'REACTION') {
        contextualUseCount++;
      }
    }

    const workQualifiedCount = allQualifiedItems.length;

    // 2. Coberturas Top 5 y Top 10
    const top10 = top10Items.slice(0, 10);
    const top5 = top10.slice(0, 5);

    // Top 5 Originales
    const top5Originals = top5.filter(c => {
      return c.semanticMatch?.isExactEntityWork || c.semanticMatch?.isExactEntityTitle || c.isExactEntityWork || c.isExactEntityTitle || false;
    }).length;
    const originalArtistCoverageAt5 = Math.min(100, Math.round((top5Originals / 5) * 100));

    // Top 10 Exact Entity Work (Obra + Artista Original)
    const top10EntityWork = top10.filter(c => {
      return c.semanticMatch?.isExactEntityWork || c.semanticMatch?.isExactEntityTitle || c.isExactEntityWork || c.isExactEntityTitle || false;
    }).length;
    const exactEntityWorkCoverageAt10 = Math.min(100, Math.round((top10EntityWork / 10) * 100));

    // Top 10 Work Coverage (Cualquier versión válida de la obra)
    const workCoverageAt10 = Math.min(100, Math.round((top10.length / 10) * 100));

    // Cobertura de covers en Top 10
    const top10Covers = top10.filter(c => {
      const role: ContentRole = (c as any).contentRole || '';
      return role === 'COVER' || role === 'TRIBUTE';
    }).length;
    const coverCoverageAt10 = Math.min(100, Math.round((top10Covers / 10) * 100));

    // 3. Demanda acumulada
    const existing = inMemoryCoverageMemory.get(workId);
    const prevDemand7d = existing?.queryDemand7d ?? 1;
    const prevDemand30d = existing?.queryDemand30d ?? 1;
    const newDemand7d = prevDemand7d + 1;
    const newDemand30d = prevDemand30d + 1;

    // 4. Calcular EntityWorkGapPriority
    // Priority = Demand × EntityImportance × ExactEntityWorkDeficit × OriginalArtistDeficit × SourceOpportunity × CoverSaturationPenalty
    const demandWeight = Math.min(10, 1 + newDemand7d * 0.5);
    const entityImportance = (artist.includes('Rolling') || artist.includes('Queen') || artist.includes('Cerati') || artist.includes('Charly') || artist.includes('Spinetta') || artist.includes('Soda') || artist.includes('Calle 13')) ? 1.3 : 1.0;
    
    // Déficit estricto de obra + artista original (no de covers)
    const exactEntityWorkDeficit = Math.max(0.1, (100 - exactEntityWorkCoverageAt10) / 100);
    const originalArtistDeficit = Math.max(0.1, (100 - originalArtistCoverageAt5) / 100);
    const sourceOpportunity = federatedExact > 0 ? 1.4 : 1.0;

    // Penalización por saturación de covers: si ya hay covers suficientes, no inflar la prioridad para traer más covers
    const coverSaturationPenalty = coverCount >= 4 ? 0.75 : 1.0;

    const rawPriority = demandWeight * entityImportance * exactEntityWorkDeficit * originalArtistDeficit * sourceOpportunity * coverSaturationPenalty;
    const priorityScore = parseFloat(rawPriority.toFixed(2));

    let priorityTier: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA';
    if (priorityScore >= 2.5 || (exactEntityWorkCoverageAt10 <= 30 && newDemand7d >= 2)) {
      priorityTier = 'CRITICA';
    } else if (priorityScore >= 1.5 || exactEntityWorkCoverageAt10 < 60) {
      priorityTier = 'ALTA';
    } else if (priorityScore >= 0.8 || exactEntityWorkCoverageAt10 < 80) {
      priorityTier = 'MEDIA';
    }

    // 3. Diversidad de grabaciones y rendiciones
    const seenRecordings = new Set<string>();
    const seenRenditions = new Set<string>();

    for (const item of allQualifiedItems) {
      const durBucket = Math.round((item.durationSeconds || item.duration || 240) / 5);
      const titleSig = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
      seenRecordings.add(`${durBucket}_${titleSig}`);
      const role: ContentRole = (item as any).contentRole || 'PRIMARY_WORK';
      seenRenditions.add(role);
    }

    const assetCount = allQualifiedItems.length;
    const uniqueRecordingCount = Math.max(1, seenRecordings.size);
    const uniqueRenditionCount = Math.max(1, seenRenditions.size);
    const coverageGapRemaining = Math.max(0, 10 - entityWorkQualifiedCount);
    const now = new Date().toISOString();

    const record: ExactEntityWorkCoverageRecord = {
      workId,
      canonicalTitle,
      artist,
      atlasPhysicalCount: atlasPhysical,
      federatedExactCount: federatedExact,
      workQualifiedCount,
      entityWorkQualifiedCount,
      originalArtistCount: originalArtist,
      coverCount,
      contextualUseCount,
      assetCount,
      uniqueRecordingCount,
      uniqueRenditionCount,
      coverageGapRemaining,
      workCoverageAt10,
      exactEntityWorkCoverageAt10,
      originalArtistCoverageAt5,
      coverCoverageAt10,
      queryDemand7d: newDemand7d,
      queryDemand30d: newDemand30d,
      priorityScore,
      priorityTier,
      lastQueriedAt: now,
      lastDiscoveryMissionAt: existing?.lastDiscoveryMissionAt,
      lastCoverageImprovement: existing?.exactEntityWorkCoverageAt10 !== undefined && exactEntityWorkCoverageAt10 > existing.exactEntityWorkCoverageAt10 ? now : existing?.lastCoverageImprovement
    };

    inMemoryCoverageMemory.set(workId, record);

    // Persistir asíncronamente en Supabase
    Promise.resolve().then(async () => {
      try {
        await supabase
          .from('exact_work_coverage_memory')
          .upsert({
            work_id: workId,
            canonical_title: canonicalTitle,
            artist,
            atlas_physical_count: atlasPhysical,
            federated_exact_count: federatedExact,
            exact_qualified_count: entityWorkQualifiedCount,
            original_artist_count: originalArtist,
            cover_count: coverCount,
            coverage_at_5: originalArtistCoverageAt5,
            coverage_at_10: exactEntityWorkCoverageAt10,
            query_demand_7d: newDemand7d,
            query_demand_30d: newDemand30d,
            priority_score: priorityScore,
            last_queried_at: now,
            updated_at: now
          }, { onConflict: 'work_id' });
      } catch {
        // Fallback local garantizado
      }
    });

    return record;
  }

  /**
   * Obtiene todos los registros para el dashboard y reportes de cobertura
   */
  static async getAllRecords(): Promise<ExactEntityWorkCoverageRecord[]> {
    try {
      const { data, error } = await supabase
        .from('exact_work_coverage_memory')
        .select('*')
        .order('priority_score', { ascending: false });

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const qualified = row.exact_qualified_count || 0;
          const rec: ExactEntityWorkCoverageRecord = {
            workId: row.work_id,
            canonicalTitle: row.canonical_title,
            artist: row.artist,
            atlasPhysicalCount: row.atlas_physical_count || 0,
            federatedExactCount: row.federated_exact_count || 0,
            workQualifiedCount: qualified,
            entityWorkQualifiedCount: qualified,
            originalArtistCount: row.original_artist_count || 0,
            coverCount: row.cover_count || 0,
            contextualUseCount: 0,
            assetCount: (row.atlas_physical_count || 0) + (row.federated_exact_count || 0),
            uniqueRecordingCount: Math.max(1, Math.round(qualified * 0.7)),
            uniqueRenditionCount: Math.min(qualified, 3),
            coverageGapRemaining: Math.max(0, 10 - qualified),
            workCoverageAt10: row.coverage_at_10 || 0,
            exactEntityWorkCoverageAt10: row.coverage_at_10 || 0,
            originalArtistCoverageAt5: row.coverage_at_5 || 0,
            coverCoverageAt10: 0,
            queryDemand7d: row.query_demand_7d || 1,
            queryDemand30d: row.query_demand_30d || 1,
            priorityScore: parseFloat(row.priority_score || 0),
            priorityTier: (row.priority_score >= 2.5 || row.coverage_at_10 <= 30) ? 'CRITICA' : (row.priority_score >= 1.5 ? 'ALTA' : (row.priority_score >= 0.8 ? 'MEDIA' : 'BAJA')),
            lastQueriedAt: row.last_queried_at || new Date().toISOString(),
            lastDiscoveryMissionAt: row.last_discovery_mission_at,
            lastCoverageImprovement: row.last_coverage_improvement
          };
          inMemoryCoverageMemory.set(rec.workId, rec);
        }
      }
    } catch {
      // Usar in-memory
    }

    return Array.from(inMemoryCoverageMemory.values())
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Persiste assets federados calificados en Atlas como "Bronze Atlas".
   * Invalida y actualiza inmediatamente la memoria de cobertura para que la próxima búsqueda
   * reconozca los nuevos assets físicos sin lecturas stale.
   */
  static async persistBronzeAtlasAssets(
    assets: ContentItem[],
    detection: ExactWorkDetection
  ): Promise<number> {
    const canonicalTitle = detection.canonicalWork || detection.residualTitle || 'Unknown Work';
    const qualifiedFederated = assets.filter(a => {
      const rs = (a.retrievalSource || '').toLowerCase();
      const isPhysical = rs === 'atlas' || rs === 'cache' || rs === 'local';
      const isQualified = (a.qualityScore || 0) >= 60 && (a.relevanceScore || 0) >= 40;
      const hasFidelity = (a.workFidelityScore ?? a.titleFidelityScore ?? a.semanticMatch?.workFidelity ?? a.semanticMatch?.titleFidelity ?? 100) >= 75;
      const role = a.contentRole || a.semanticMatch?.contentRole || 'PRIMARY_WORK';
      // CONTEXTUAL_USE, COMMENTARY, REACTION no deben persistirse como grabaciones exactas
      const isValidRole = role !== 'CONTEXTUAL_USE' && role !== 'COMMENTARY' && role !== 'REACTION';
      const isPlayable = !!a.videoUrl && a.videoUrl.length > 5;
      return !isPhysical && isQualified && hasFidelity && isValidRole && isPlayable;
    });

    if (qualifiedFederated.length === 0) return 0;

    const rowsToInsert = qualifiedFederated.map(item => {
      const provider = item.provider || 'dailymotion';
      const providerContentId = item.providerId || item.id?.replace(/^[a-z]+_/, '') || item.id;
      const videoUrl = item.videoUrl || item.canonicalUrl;
      const role = item.contentRole || item.semanticMatch?.contentRole || 'PRIMARY_WORK';

      return {
        provider,
        provider_content_id: providerContentId,
        video_id: providerContentId,
        title: item.title,
        description: item.description || `Federated Bronze [${role}] for "${canonicalTitle}"`,
        thumbnail: item.thumbnail,
        thumbnail_url: item.thumbnail,
        url: videoUrl,
        canonical_url: videoUrl,
        creator_name: item.channelTitle || detection.canonicalEntity || 'Federated Creator',
        duration_seconds: item.durationSeconds || 240,
        source: 'federated_bronze',
        metadata_provenance: `bronze_${role.toLowerCase()}`,
        content_state: 'ready',
        created_at: new Date().toISOString()
      };
    });

    try {
      let insertedCount = 0;
      for (const row of rowsToInsert) {
        const { error } = await supabase
          .from('youapp_index')
          .insert(row);

        if (!error) {
          insertedCount++;
          if (row.provider === 'youtube' && row.provider_content_id) {
            HarvestDedupeIndex.onAtlasYouTubeInsert(row.provider_content_id);
          }
        }
      }

      if (insertedCount > 0) {
        // Actualizar contador físico en memoria inmediatamente para evitar datos stale
        const workId = detection.canonicalWork?.toLowerCase().replace(/[,;:.()\-]/g, '').replace(/\s+/g, '_') || 'unknown_work';
        const rec = inMemoryCoverageMemory.get(workId);
        if (rec) {
          rec.atlasPhysicalCount += insertedCount;
          rec.federatedExactCount = Math.max(0, rec.federatedExactCount - insertedCount);
        }

        if (import.meta.env?.DEV) {
          console.log(`🥉 [Bronze Atlas] +${insertedCount} asset(s) federados persistidos físicamente en youapp_index para "${detection.canonicalWork}".`);
        }
      }
      return insertedCount;
    } catch {
      return 0;
    }
  }
}
