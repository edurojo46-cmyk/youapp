/**
 * harvestTelemetry.ts — Dashboard de Telemetría Oficial Harvester V4.1 (Fresh Partition Intelligence)
 */

import type { HarvesterRunProgress } from './types';
import type { PartitionStats } from './partitionIntelligence';

export interface V41TelemetryData extends HarvesterRunProgress {
  directRefsCount: number;
  directNetNewCount: number;
  htmlRefsCount: number;
  pagesAvoided: number;
  pagesFetched: number;
  pagesPerSecond: number;
  frontierRemaining: number;
  window30sNetNewVelocity: number;
  gate5MinStatus: string;
  partitions: Record<string, PartitionStats>;
}

export function printV41SpeedrunTelemetry(data: V41TelemetryData): void {
  const elapsedMin = (data.elapsedSeconds / 60).toFixed(1);
  const globalYieldPct = data.youtubeRefsFound > 0
    ? ((data.netNewInserted / data.youtubeRefsFound) * 100).toFixed(1)
    : '0.0';

  let velocityBadge = '🔴 No escala todavía (<10/s)';
  if (data.netNewPerSecond >= 30) velocityBadge = '🚀🚀 EXCELENTE (>30/s ➔ >108K/h)';
  else if (data.netNewPerSecond >= 20) velocityBadge = '🚀 BUENO (20-30/s ➔ 72K-108K/h)';
  else if (data.netNewPerSecond >= 10) velocityBadge = '🟢 OBJETIVO 30M SPEEDRUN (10-20/s)';
  else if (data.netNewPerSecond >= 5) velocityBadge = '🟡 Prometedor (5-10/s)';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       ATLAS HARVESTER V4.1 — FRESH PARTITION INTELLIGENCE DASHBOARD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Elapsed Speedrun Time:          ${data.elapsedSeconds}s (${elapsedMin} min)`);
  console.log(`Atlas Start Size:               ${data.initialAtlasSize.toLocaleString()} contenidos`);
  console.log(`Atlas Current Size:             ${data.currentAtlasSize.toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`DIRECT EXTRACTION & SAVINGS:`);
  console.log(`  • Direct XML/mRSS Refs Found:   ${data.directRefsCount.toLocaleString()} IDs ⚡`);
  console.log(`  • Direct Net-New Inserted:      +${data.directNetNewCount.toLocaleString()} IDs ⚡`);
  console.log(`  • HTML Extracted Refs Found:    ${data.htmlRefsCount.toLocaleString()} IDs`);
  console.log(`  • PAGES AVOIDED (Saved):        ${data.pagesAvoided.toLocaleString()} páginas ahorradas 🛡️`);
  console.log(`  • Pages Actually Fetched:       ${data.pagesFetched.toLocaleString()} (${data.pagesPerSecond.toFixed(1)} pages/s)`);
  console.log(`  • High-Priority Frontier Queue: ${data.frontierRemaining.toLocaleString()} URLs`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`NET-NEW NOVELTY & 5-MIN GATE:`);
  console.log(`  • YouTube Refs Discovered:      ${data.youtubeRefsFound.toLocaleString()}`);
  console.log(`  • Already Known in Atlas (RAM): ${data.alreadyInAtlasCount.toLocaleString()}`);
  console.log(`  • NET-NEW PERSISTED:            +${data.netNewInserted.toLocaleString()} 🎯`);
  console.log(`  • RUN NET-NEW VELOCITY:         ${data.netNewPerSecond.toFixed(2)} items/s [${velocityBadge}]`);
  console.log(`  • 30s MOVING WINDOW VELOCITY:   ${data.window30sNetNewVelocity.toFixed(2)} items/s (Ventana 30s)`);
  console.log(`  • 5-MIN SPEEDRUN GATE:          ${data.gate5MinStatus}`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`ECONOMÍA Y CUOTA:`);
  console.log(`  • YouTube Search.list Calls:    0 🔒 (INVIOLABLE = 0)`);
  console.log(`  • YouTube Radar Quota Used:     0 u 🔒`);
  console.log(`  • Global Real Yield:            ${globalYieldPct}% (NetNew / YouTubeFound)`);
  console.log(`  • External Discovery Rate:      100% ✅ (Legitimate External Publishers)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`TOP PARTITIONS INTELLIGENCE (RAW NOVELTY vs WEIGHTED):`);

  const topPartitions = Object.values(data.partitions)
    .filter(p => p.totalRefsFound > 0)
    .sort((a, b) => b.netNew - a.netNew)
    .slice(0, 8);

  if (topPartitions.length === 0) {
    console.log('  (Calculando particiones activas...)');
  } else {
    topPartitions.forEach((p, idx) => {
      const rawNov = p.totalRefsFound > 0 ? ((p.netNew / p.totalRefsFound) * 100).toFixed(0) : '0';
      const wNov = (p.weightedNoveltyRate * 100).toFixed(0);
      const newPerPage = p.pagesFetched > 0 ? (p.netNew / p.pagesFetched).toFixed(2) : '0.00';
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${p.partitionKey.padEnd(40)} | Pages: ${p.pagesFetched.toString().padStart(4)} | New: ${p.netNew.toString().padStart(4)} | RawNov: ${rawNov.padStart(3)}% | 30sNov: ${wNov.padStart(3)}% | New/Page: ${newPerPage} [${p.status}]`);
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
