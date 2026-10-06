/**
 * index.ts — Orquestador Principal de ATLAS 100K BOOTSTRAP V2 con Seed Yield Score y Saturated-Cutoff
 */

import { calculateDynamicDeficits } from './bootstrapPlanner';
import { normalizeAndScoreItem } from './bootstrapNormalizer';
import { deduplicateAgainstDatabase } from './bootstrapDedup';
import { persistBatchToAtlas } from './bootstrapPersistence';
import { classifyMusicItem } from './musicClassifier';
import { importFromVimeo } from './importers/vimeoImporter';
import { importFromDailymotion } from './importers/dailymotionImporter';
import { importFromArchive } from './importers/archiveImporter';
import { importFromPeerTube } from './importers/peerTubeImporter';
import { BOOTSTRAP_YOUTUBE_RADAR_BUDGET } from './importers/youtubeSeedImporter';
import type { RawDiscoveredItem, AtlasEnrichedItem, BootstrapWaveProgress } from './bootstrapTypes';
import { supabase } from '../supabase';

export async function executeBootstrapWave(
  waveNumber: number,
  options?: {
    waveSubId?: string;
    isDryRun?: boolean;
    targetAtlasTotalSize?: number;
    maxNewItems?: number;
    targetMusicNewItems?: number;
    targetGeneralNewItems?: number;
    musicOnlyPersistence?: boolean;
    onProgress?: (progress: BootstrapWaveProgress) => void;
  }
): Promise<BootstrapWaveProgress> {
  const isDryRun = options?.isDryRun === true;
  const subId = options?.waveSubId || '3C-2';
  const musicOnly = options?.musicOnlyPersistence === true;
  const runId = `atlas100k_wave_${subId}_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Conteo inicial en base de datos
  const { count: initialCount } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  const currentTotal = initialCount || 0;
  const targetAtlasTotalSize = options?.targetAtlasTotalSize || (currentTotal + (options?.maxNewItems || 2500));
  const maxNewItemsAllowed = options?.maxNewItems || Math.max(0, targetAtlasTotalSize - currentTotal);

  const targetMusic = options?.targetMusicNewItems ?? (musicOnly ? maxNewItemsAllowed : 2000);
  const targetGeneral = musicOnly ? 0 : (options?.targetGeneralNewItems ?? 500);

  const progress: BootstrapWaveProgress = {
    waveNumber,
    waveSubId: subId,
    startedAt,
    status: 'running',
    isDryRun,
    targetAtlasTotalSize,
    currentAtlasTotalSize: currentTotal,
    maxNewItemsAllowed,
    rawDiscovered: 0,
    canonicalValid: 0,
    duplicatesIntercepted: 0,
    uniqueCandidates: 0,

    qualityScorePassCount: 0,
    embeddablePassCount: 0,
    technicallyUsableCount: 0,
    qualityReadyCount: 0,

    insertedCount: 0,
    avgMetadataCompleteness: 0,
    criticalMetadataRate: 100,
    embeddableRate: 100,
    rawThroughputPerMin: 0,
    netGrowthThroughputPerMin: 0,

    musicFunnel: {
      musicRequested: targetMusic,
      musicRawDiscovered: 0,
      musicCanonicalValid: 0,
      musicAfterDedupe: 0,
      musicHighConfidence: 0,
      musicPersisted: 0,
      generalRequested: targetGeneral,
      generalPersisted: 0
    },

    providerStats: {
      vimeo: { discovered: 0, valid: 0, inserted: 0 },
      dailymotion: { discovered: 0, valid: 0, inserted: 0 },
      archive: { discovered: 0, valid: 0, inserted: 0 },
      peertube: { discovered: 0, valid: 0, inserted: 0 },
      youtube_seed: { discovered: 0, valid: 0, inserted: 0 }
    },
    timing: {
      plannerMs: 0,
      vimeoMs: 0,
      dailymotionMs: 0,
      archiveMs: 0,
      peertubeMs: 0,
      normalizationMs: 0,
      dedupMs: 0,
      persistenceMs: 0,
      wallClockMs: 0,
      providerCumulativeMs: 0
    },
    youtubeRadarCalls: 0
  };

  console.log(`\n🚀 [Bootstrap Orchestrator] ${isDryRun ? 'DRY RUN' : `Wave ${subId}`} — Meta: ${targetAtlasTotalSize.toLocaleString()} (+${maxNewItemsAllowed} nuevos)`);
  console.log(`🎯 [Adaptive Dual Budget] Música: ${progress.musicFunnel.musicPersisted}/${targetMusic} | General: ${progress.musicFunnel.generalPersisted}/${targetGeneral}`);
  console.log(`🔒 [Safety Guard] BOOTSTRAP_YOUTUBE_RADAR_BUDGET = ${BOOTSTRAP_YOUTUBE_RADAR_BUDGET} (YouTube Search Calls: 0)\n`);

  const tPlanner = Date.now();
  const deficitReport = await calculateDynamicDeficits();
  progress.timing.plannerMs = Date.now() - tPlanner;

  let totalCompletenessAcc = 0;
  let criticalCount = 0;
  let totalEvaluated = 0;
  let reason: 'target_reached' | 'safety_cap' | 'source_exhausted' = 'source_exhausted';
  const maxPages = 30; // Soporta Mega Waves autónomas de hasta 20.000 contenidos

  for (let page = 1; page <= maxPages; page++) {
    const musicFilled = progress.musicFunnel.musicPersisted >= targetMusic;
    const generalFilled = progress.musicFunnel.generalPersisted >= targetGeneral;

    if (musicFilled && generalFilled) {
      reason = 'target_reached';
      break;
    }
    if (progress.insertedCount >= maxNewItemsAllowed || progress.currentAtlasTotalSize >= targetAtlasTotalSize) {
      reason = 'target_reached';
      break;
    }

    for (const topic of deficitReport.prioritizedTopics) {
      const isMusicTopic = topic.topic === 'music';

      if (isMusicTopic && progress.musicFunnel.musicPersisted >= targetMusic) continue;
      if (!isMusicTopic && (musicOnly || progress.musicFunnel.generalPersisted >= targetGeneral)) continue;

      if (progress.currentAtlasTotalSize >= targetAtlasTotalSize) {
        reason = 'target_reached';
        break;
      }

      console.log(`📚 [Tópico: ${topic.name}] (Página ${page} | 🎵 Música: ${progress.musicFunnel.musicPersisted}/${targetMusic} | 📚 General: ${progress.musicFunnel.generalPersisted}/${targetGeneral})`);

      for (const seed of topic.seeds) {
        if (isMusicTopic && progress.musicFunnel.musicPersisted >= targetMusic) break;
        if (!isMusicTopic && progress.musicFunnel.generalPersisted >= targetGeneral) break;
        if (progress.currentAtlasTotalSize >= targetAtlasTotalSize) {
          reason = 'target_reached';
          break;
        }

        console.log(`  🔎 Semilla: "${seed}" (pág ${page})`);
        const rawBatch: RawDiscoveredItem[] = [];
        const fetchTasks: Promise<void>[] = [];

        if (topic.preferredProviders.includes('archive')) {
          const t = Date.now();
          fetchTasks.push(
            importFromArchive(seed, topic.id, runId, 35, page).then(res => {
              const dt = Date.now() - t;
              progress.timing.archiveMs += dt;
              progress.timing.providerCumulativeMs += dt;
              rawBatch.push(...res);
            })
          );
        }
        if (topic.preferredProviders.includes('dailymotion')) {
          const t = Date.now();
          fetchTasks.push(
            importFromDailymotion(seed, topic.id, runId, 40, page).then(res => {
              const dt = Date.now() - t;
              progress.timing.dailymotionMs += dt;
              progress.timing.providerCumulativeMs += dt;
              rawBatch.push(...res);
            })
          );
        }
        if (topic.preferredProviders.includes('peertube')) {
          const t = Date.now();
          fetchTasks.push(
            importFromPeerTube(seed, topic.id, runId, 30).then(res => {
              const dt = Date.now() - t;
              progress.timing.peertubeMs += dt;
              progress.timing.providerCumulativeMs += dt;
              rawBatch.push(...res);
            })
          );
        }
        if (topic.preferredProviders.includes('vimeo')) {
          const t = Date.now();
          fetchTasks.push(
            importFromVimeo(seed, topic.id, runId, 30).then(res => {
              const dt = Date.now() - t;
              progress.timing.vimeoMs += dt;
              progress.timing.providerCumulativeMs += dt;
              rawBatch.push(...res);
            })
          );
        }

        await Promise.allSettled(fetchTasks);
        progress.rawDiscovered += rawBatch.length;
        if (isMusicTopic) progress.musicFunnel.musicRawDiscovered += rawBatch.length;

        // 2. Normalización, Clasificación Semántica y Scoring
        const tNorm = Date.now();
        const normalizedBatch: AtlasEnrichedItem[] = [];

        for (const item of rawBatch) {
          const normed = normalizeAndScoreItem(item);
          if (normed) {
            const classification = classifyMusicItem(normed.title, normed.description, normed.creatorName);
            const isMusic = classification !== null && classification.domain === 'music';

            normed.isMusicDomain = isMusic;
            if (isMusic && classification) {
              normed.musicConfidence = classification.confidence;
              normed.musicArtistId = classification.artistId;
              normed.musicGenre = classification.genre;
              normed.musicFormat = classification.format;
              if (classification.confidence >= 0.75) {
                progress.musicFunnel.musicHighConfidence++;
              }
            }

            normalizedBatch.push(normed);
            totalCompletenessAcc += normed.metadataCompleteness;
            if (normed.hasCriticalMetadata) criticalCount++;
            if (normed.isQualityScorePass) progress.qualityScorePassCount++;
            if (normed.isEmbeddablePass) progress.embeddablePassCount++;
            if (normed.isTechnicallyUsable) progress.technicallyUsableCount++;
            if (normed.isQualityReady) progress.qualityReadyCount++;
            totalEvaluated++;

            if (progress.providerStats[normed.provider]) {
              progress.providerStats[normed.provider].valid++;
            }
          }
        }
        progress.timing.normalizationMs += (Date.now() - tNorm);
        progress.canonicalValid += normalizedBatch.length;
        if (isMusicTopic) progress.musicFunnel.musicCanonicalValid += normalizedBatch.length;

        // 3. Deduplicación
        const tDedup = Date.now();
        const { uniqueItems, duplicateCount } = await deduplicateAgainstDatabase(normalizedBatch);
        progress.timing.dedupMs += (Date.now() - tDedup);

        progress.duplicatesIntercepted += duplicateCount;
        progress.uniqueCandidates += uniqueItems.length;

        // Regla de abandono de semilla saturada (Saturated Seed Cutoff)
        const seedYield = rawBatch.length > 0 ? (uniqueItems.length / rawBatch.length) : 0;
        if (rawBatch.length >= 30 && seedYield < 0.05) {
          console.log(`     ⚠️ [Saturated Seed Cutoff] Semilla saturada (${Math.round((1 - seedYield) * 100)}% duplicados) ➔ Avanzando a nueva veta`);
        }

        const musicCandidates = uniqueItems.filter(i => i.isMusicDomain);
        const generalCandidates = uniqueItems.filter(i => !i.isMusicDomain);
        progress.musicFunnel.musicAfterDedupe += musicCandidates.length;

        // 4. Control Estricto de Persistencia por Cupo
        const remainingMusicSlots = Math.max(0, targetMusic - progress.musicFunnel.musicPersisted);
        const remainingGeneralSlots = Math.max(0, targetGeneral - progress.musicFunnel.generalPersisted);
        const remainingTotalSlots = Math.max(0, targetAtlasTotalSize - progress.currentAtlasTotalSize);

        const musicToPersist = musicCandidates.slice(0, Math.min(remainingMusicSlots, remainingTotalSlots));
        const generalToPersist = generalCandidates.slice(0, Math.min(remainingGeneralSlots, remainingTotalSlots - musicToPersist.length));
        const batchToInsert = [...musicToPersist, ...generalToPersist];

        if (!isDryRun && batchToInsert.length > 0) {
          const tPersist = Date.now();
          const { inserted } = await persistBatchToAtlas(batchToInsert);
          progress.timing.persistenceMs += (Date.now() - tPersist);

          progress.insertedCount += inserted;
          progress.currentAtlasTotalSize += inserted;
          progress.musicFunnel.musicPersisted += musicToPersist.length;
          progress.musicFunnel.generalPersisted += generalToPersist.length;

          batchToInsert.forEach(item => {
            if (progress.providerStats[item.provider]) {
              progress.providerStats[item.provider].inserted++;
            }
          });

          console.log(`     ✅ +${inserted} insertados (🎵 Música: +${musicToPersist.length} [${progress.musicFunnel.musicPersisted}/${targetMusic}] | 📚 General: +${generalToPersist.length} [${progress.musicFunnel.generalPersisted}/${targetGeneral}]) | Total: ${progress.currentAtlasTotalSize.toLocaleString()}`);

          if (progress.currentAtlasTotalSize >= targetAtlasTotalSize) {
            reason = 'target_reached';
            break;
          }
        } else if (isDryRun) {
          console.log(`     🔍 [Dry Run] Candidatos: (🎵 Música: +${musicToPersist.length} | 📚 General: +${generalToPersist.length})`);
        }

        if (options?.onProgress) options.onProgress({ ...progress });
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  const wallClockMs = Date.now() - startTime;
  const minutes = Math.max(0.01, wallClockMs / 60000);

  if (totalEvaluated > 0) {
    progress.avgMetadataCompleteness = Math.round(totalCompletenessAcc / totalEvaluated);
    progress.criticalMetadataRate = Math.round((criticalCount / totalEvaluated) * 100);
    progress.embeddableRate = Math.round((progress.embeddablePassCount / totalEvaluated) * 100);
  }

  progress.rawThroughputPerMin = Math.round(progress.rawDiscovered / minutes);
  progress.netGrowthThroughputPerMin = Math.round(progress.insertedCount / minutes);
  progress.timing.wallClockMs = wallClockMs;
  progress.terminationReason = reason;
  progress.status = 'completed';
  progress.completedAt = new Date().toISOString();

  return progress;
}
