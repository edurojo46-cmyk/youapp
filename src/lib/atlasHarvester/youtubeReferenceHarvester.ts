/**
 * youtubeReferenceHarvester.ts — Orquestador de Atlas Harvester V4.1 (Fresh Partition Preloader & 30-Min Speedrun)
 */

import { HarvestDedupeIndex } from './harvestDedupeIndex';
import { PUBLISHER_SOURCES } from './publisherSourceRegistry';
import { PartitionIntelligenceManager } from './partitionIntelligence';
import { PriorityHarvestFrontier, PriorityFrontierItem } from './priorityHarvestFrontier';
import { FreshPartitionPreloader } from './freshPartitionPreloader';
import { extractFromArticlePage } from './parallelExtractor';
import { printV41SpeedrunTelemetry, V41TelemetryData } from './harvestTelemetry';
import type { YouTubeHarvestReference } from './types';

export interface HarvesterRunConfig {
  targetAtlasTotal: number;
  maxNewItems: number;
  timeBudgetMinutes: number;
  batchSize: number;
  adaptive: boolean;
}

export async function runYouTubeReferenceHarvester(config: HarvesterRunConfig): Promise<V41TelemetryData> {
  console.log('======================================================================');
  console.log('🚀 ATLAS HARVESTER V4.1 — FRESH PARTITION SPEEDRUN (30-MIN TARGET)');
  console.log('======================================================================\n');

  // 1. Inicialización de Deduplicación en RAM y Módulos V4.1
  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();

  const partitionManager = new PartitionIntelligenceManager();
  const priorityFrontier = new PriorityHarvestFrontier();
  const preloader = new FreshPartitionPreloader();

  const speedrunStartTime = Date.now();
  const maxExecutionMs = config.timeBudgetMinutes * 60 * 1000;
  const initialAtlasSize = initResult.initialTotal;

  let window30sTimestamp = Date.now();
  let window30sNetNewCount = 0;
  let currentWindowVelocity = 0;
  let directNetNewTotal = 0;
  let gate5MinStatus = 'En curso (Evaluación a los 5 minutos)';

  const telemetryData: V41TelemetryData = {
    startTime: speedrunStartTime,
    elapsedSeconds: 0,
    initialAtlasSize,
    currentAtlasSize: initialAtlasSize,
    netNewInserted: 0,
    netNewPerSecond: 0,
    referencesScanned: 0,
    youtubeRefsFound: 0,
    alreadyInAtlasCount: 0,
    youtubeSearchCalls: 0,
    youtubeRadarCalls: 0,
    globalYieldRate: 0,
    externalDiscoveryRate: 1.0,
    sourceStats: {},
    directRefsCount: 0,
    directNetNewCount: 0,
    htmlRefsCount: 0,
    pagesAvoided: 0,
    pagesFetched: 0,
    pagesPerSecond: 0,
    frontierRemaining: 0,
    window30sNetNewVelocity: 0,
    gate5MinStatus,
    partitions: partitionManager.getAllPartitions()
  };

  const pendingBatch: YouTubeHarvestReference[] = [];
  const activeSources = PUBLISHER_SOURCES.filter(s => s.enabled);
  let nextSourceIdx = 0;

  const flushBatch = async (isDirect = false) => {
    if (pendingBatch.length === 0) return;
    const batchToPersist = pendingBatch.splice(0, pendingBatch.length);
    const persisted = await dedupeIndex.persistBatch(batchToPersist);
    telemetryData.netNewInserted += persisted;
    if (isDirect) directNetNewTotal += persisted;
    telemetryData.currentAtlasSize = dedupeIndex.getTotalAtlasSize();

    // Actualizar Ventana Móvil de 30s
    window30sNetNewCount += persisted;
    const now = Date.now();
    const windowElapsedSec = Math.max(1, (now - window30sTimestamp) / 1000);
    currentWindowVelocity = +(window30sNetNewCount / windowElapsedSec).toFixed(2);
    if (windowElapsedSec >= 30) {
      window30sTimestamp = now;
      window30sNetNewCount = 0;
    }
  };

  // 2. Función de Pre-Scan y Carga de Particiones Frescas (High-Priority Frontier >= 20.000)
  const preloadFreshPartitionsBatch = async (sourcesCount = 12) => {
    console.log('📡 [Fresh Partition Preloader] Pre-cargando cohortes recientes y expandiendo particiones vecinas...');
    const slice = activeSources.slice(nextSourceIdx, nextSourceIdx + sourcesCount);
    nextSourceIdx = (nextSourceIdx + sourcesCount) % activeSources.length;

    for (const source of slice) {
      for (const feed of source.feeds) {
        const { directRefs } = await preloader.sampleAndPromotePartition(
          feed.url,
          source,
          priorityFrontier,
          partitionManager
        );

        for (const d of directRefs) {
          telemetryData.directRefsCount++;
          telemetryData.youtubeRefsFound++;
          if (dedupeIndex.isDuplicate(d.videoId)) {
            telemetryData.alreadyInAtlasCount++;
          } else {
            dedupeIndex.markSeen(d.videoId);
            pendingBatch.push(d);
          }
        }
      }
    }

    await flushBatch(true);
    priorityFrontier.sortPriorityQueue();
    telemetryData.pagesAvoided = priorityFrontier.pagesAvoidedCount;
  };

  // Inicializar High-Priority Frontier con mínimo 20.000 URLs
  await preloadFreshPartitionsBatch(20);
  console.log(`✅ FASE 1 COMPLETADA: ${priorityFrontier.getDirectQueueSize()} IDs Directos | ${priorityFrontier.getHtmlQueueSize()} URLs en High-Priority Frontier.\n`);

  // 3. FASE 2: Speedrun de Extracción V4.1
  console.log('⚡ FASE 2: Iniciando Speedrun 30 Minutos (Direct First + High-Novelty Priority + Gate 5m)...');
  let checked5MinGate = false;
  let continueSpeedrun = true;

  while (continueSpeedrun) {
    const elapsedMs = Date.now() - speedrunStartTime;
    if (elapsedMs >= maxExecutionMs) {
      console.log(`⏱ Time budget alcanzado (${config.timeBudgetMinutes} minutos).`);
      break;
    }

    if (telemetryData.netNewInserted >= config.maxNewItems || telemetryData.currentAtlasSize >= config.targetAtlasTotal) {
      console.log(`🎯 Meta de 100.000 contenidos alcanzada (${telemetryData.currentAtlasSize.toLocaleString()}).`);
      break;
    }

    // Auto-Refill si la High-Priority Frontier cae de 10.000 URLs
    if (priorityFrontier.getHtmlQueueSize() < 10000) {
      await preloadFreshPartitionsBatch(8);
    }

    // PASO A: Consumir Referencias Directas de Máxima Prioridad (0 HTML Fetch)
    const directBatch = priorityFrontier.getPendingDirectRefs(100);
    if (directBatch.length > 0) {
      for (const ref of directBatch) {
        telemetryData.directRefsCount++;
        telemetryData.youtubeRefsFound++;

        if (dedupeIndex.isDuplicate(ref.videoId)) {
          telemetryData.alreadyInAtlasCount++;
        } else {
          dedupeIndex.markSeen(ref.videoId);
          pendingBatch.push(ref);
        }
      }
      await flushBatch(true);
    }

    // PASO B: Consumir URLs HTML según ExpectedNetNewScore (80% Exploit / 20% Explore)
    const htmlTargets = priorityFrontier.getPendingHtmlBatch(35);
    if (htmlTargets.length === 0 && priorityFrontier.getDirectQueueSize() === 0) {
      console.log('🔄 Cola agotada. Descubriendo cohortes adyacentes...');
      await preloadFreshPartitionsBatch(12);
      if (priorityFrontier.getTotalRemainingSize() === 0) {
        console.log('⚠️ Frontier completamente agotado.');
        break;
      }
      continue;
    }

    const extractPromises = htmlTargets.map(async (target: PriorityFrontierItem) => {
      if (partitionManager.isPartitionPaused(target.partitionKey)) return;

      const result = await extractFromArticlePage({
        url: target.url,
        domain: target.domain,
        publisherId: target.publisherId,
        publisherName: target.publisherName,
        country: target.country,
        language: target.language,
        category: target.category,
        priority: 1
      });

      telemetryData.pagesFetched++;
      telemetryData.referencesScanned++;

      let targetFound = 0;
      let targetNew = 0;

      for (const ref of result.references) {
        targetFound++;
        telemetryData.htmlRefsCount++;
        telemetryData.youtubeRefsFound++;

        if (dedupeIndex.isDuplicate(ref.videoId)) {
          telemetryData.alreadyInAtlasCount++;
        } else {
          dedupeIndex.markSeen(ref.videoId);
          targetNew++;
          pendingBatch.push(ref);
        }
      }

      partitionManager.recordObservation(
        target.partitionKey,
        target.publisherId,
        target.sitemapName,
        target.url,
        false,
        targetFound,
        targetNew,
        1
      );
    });

    await Promise.all(extractPromises);
    await flushBatch(false);

    telemetryData.elapsedSeconds = Math.max(1, Math.round((Date.now() - speedrunStartTime) / 1000));
    telemetryData.netNewPerSecond = +(telemetryData.netNewInserted / telemetryData.elapsedSeconds).toFixed(2);
    telemetryData.pagesPerSecond = +(telemetryData.pagesFetched / telemetryData.elapsedSeconds).toFixed(1);
    telemetryData.directNetNewCount = directNetNewTotal;
    telemetryData.pagesAvoided = priorityFrontier.pagesAvoidedCount;
    telemetryData.frontierRemaining = priorityFrontier.getTotalRemainingSize();
    telemetryData.window30sNetNewVelocity = currentWindowVelocity;
    telemetryData.partitions = partitionManager.getAllPartitions();

    // 4. EVALUACIÓN DEL GATE DE 5 MINUTOS (CHECKPOINT DECISIVO)
    if (!checked5MinGate && telemetryData.elapsedSeconds >= 300) {
      checked5MinGate = true;
      const netNew5Min = telemetryData.netNewInserted;

      if (netNew5Min >= 6000) {
        gate5MinStatus = `🟢 APROBADO (+${netNew5Min.toLocaleString()} en 5m >= 6.000) ➔ Continúa hacia 100K`;
      } else if (netNew5Min >= 2000) {
        gate5MinStatus = `🟡 RE-OPTIMIZACIÓN (+${netNew5Min.toLocaleString()} en 5m) ➔ Acelerando cohortes adyacentes`;
      } else {
        gate5MinStatus = `🔴 DETENIDO (+${netNew5Min.toLocaleString()} en 5m < 2.000) ➔ Abortado para proteger calidad`;
        console.log(`\n🛑 [5-Min Gate Alert] ${gate5MinStatus}`);
        break;
      }
      telemetryData.gate5MinStatus = gate5MinStatus;
    }

    printV41SpeedrunTelemetry(telemetryData);
  }

  await flushBatch(false);
  telemetryData.elapsedSeconds = Math.max(1, Math.round((Date.now() - speedrunStartTime) / 1000));
  telemetryData.netNewPerSecond = +(telemetryData.netNewInserted / telemetryData.elapsedSeconds).toFixed(2);
  telemetryData.pagesPerSecond = +(telemetryData.pagesFetched / telemetryData.elapsedSeconds).toFixed(1);
  telemetryData.directNetNewCount = directNetNewTotal;
  telemetryData.pagesAvoided = priorityFrontier.pagesAvoidedCount;
  telemetryData.frontierRemaining = priorityFrontier.getTotalRemainingSize();
  telemetryData.window30sNetNewVelocity = currentWindowVelocity;
  telemetryData.partitions = partitionManager.getAllPartitions();

  printV41SpeedrunTelemetry(telemetryData);
  return telemetryData;
}
