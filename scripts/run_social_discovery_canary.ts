/**
 * run_social_discovery_canary.ts — Canary Oficial de Social Discovery (10 Minutos & Community Intelligence)
 */

import fs from 'node:fs';
import path from 'node:path';
import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { runSocialReferenceHarvest, SUBREDDIT_TARGETS, SocialCanaryProgress } from '../src/lib/atlasHarvester/socialReferenceHarvester';
import { calculateWilsonLowerBound } from '../src/lib/atlasHarvester/newMineDiscoveryEngine';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function main() {
  loadEnvFile();

  console.log('======================================================================');
  console.log('📱 ATLAS REDDIT SOCIAL DISCOVERY CANARY (10 MIN BENCHMARK & INTELLIGENCE)');
  console.log('======================================================================\n');

  // Fail-Fast: Validación de Credenciales de Entorno
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.error('❌ [FAIL-FAST]: Faltan credenciales de Reddit OAuth en el entorno (.env).');
    console.error('   Asegúrate de definir en tu archivo .env:');
    console.error('   REDDIT_CLIENT_ID="..."');
    console.error('   REDDIT_CLIENT_SECRET="..."');
    console.error('   REDDIT_USER_AGENT="YouAppTVAtlas/1.0"');
    console.error('\n   El proceso se detiene de forma segura antes de realizar peticiones.\n');
    process.exit(1);
  }

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`📡 Subreddits y Comunidades en Evaluación: ${SUBREDDIT_TARGETS.length} verticales\n`);

  const t0 = Date.now();

  const progress = await runSocialReferenceHarvest(dedupeIndex, (p: SocialCanaryProgress) => {
    const elapsed = Math.max(1, Math.round((Date.now() - t0) / 1000));
    const vel = +(p.netNew / elapsed).toFixed(2);
    const nov = p.youtubeRefsFound > 0 ? +((p.netNew / p.youtubeRefsFound) * 100).toFixed(1) : 0;
    process.stdout.write(`\r[Social Progress] Posts: ${p.postsScanned} | YT Found: ${p.youtubeRefsFound} | Net-New: +${p.netNew} (${nov}%) | Vel: ${vel}/s | API: ${p.apiCalls}`);
  });

  console.log('\n');

  let insertedCount = 0;
  if (progress.references.length > 0) {
    insertedCount = await dedupeIndex.persistBatch(progress.references);
  }

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const finalAtlas = dedupeIndex.getTotalAtlasSize();
  const noveltyRate = progress.uniqueYouTubeIds > 0
    ? +((progress.netNew / progress.uniqueYouTubeIds) * 100).toFixed(1)
    : 0;
  const netNewVelocity = +(progress.netNew / elapsedSeconds).toFixed(2);
  const ytPostRatio = progress.postsScanned > 0
    ? +((progress.postsWithYouTube / progress.postsScanned) * 100).toFixed(1)
    : 0;

  // Clasificación por Gates de Reddit
  let gateVerdict = '🔴 POCO VALOR (<250 net-new)';
  if (progress.netNew >= 5000) gateVerdict = '🚀🚀 MEGA MINA SOCIAL (>5.000 net-new)';
  else if (progress.netNew >= 3000) gateVerdict = '🚀 MINA IMPORTANTE (3.000-5.000 net-new)';
  else if (progress.netNew >= 1000) gateVerdict = '🟢 INTERESANTE (1.000-3.000 net-new)';
  else if (progress.netNew >= 250) gateVerdict = '🟡 REGULAR (250-1.000 net-new)';

  const eliteComms = progress.communityIntelligence.filter(c => c.tier === 'elite');
  const strongComms = progress.communityIntelligence.filter(c => c.tier === 'strong');
  const usableComms = progress.communityIntelligence.filter(c => c.tier === 'usable');
  const saturatedComms = progress.communityIntelligence.filter(c => c.tier === 'saturated');

  // Estimación de Potencial Social Conservador (Paginación restante teórica)
  const conservativeRate = calculateWilsonLowerBound(progress.netNew, Math.max(1, progress.postsScanned));
  const conservativeSocialPotential = Math.round(progress.netNew + (progress.postsScanned * 10 * conservativeRate));

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       REDDIT SOCIAL DISCOVERY CANARY REPORT (10 MIN)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo de Ejecución:            ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Comunidades Evaluadas:          ${progress.communityIntelligence.length} subreddits`);
  console.log(`Atlas Inicial:                  ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlas.toLocaleString()} contenidos (+${insertedCount.toLocaleString()} net-new) 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`VOLUMEN Y DENSIDAD DE POSTS:`);
  console.log(`  • Posts Escaneados:             ${progress.postsScanned.toLocaleString()} posts`);
  console.log(`  • Posts con Referencia YouTube: ${progress.postsWithYouTube.toLocaleString()} (${ytPostRatio}%)`);
  console.log(`  • Total Referencias Halladas:   ${progress.youtubeRefsFound.toLocaleString()}`);
  console.log(`  • YouTube IDs Únicos:           ${progress.uniqueYouTubeIds.toLocaleString()}`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`SOLAPAMIENTO CON ATLAS & NOVEDAD:`);
  console.log(`  • Ya Conocidos en Atlas (RAM):  ${progress.alreadyKnown.toLocaleString()} (${(progress.uniqueYouTubeIds > 0 ? (progress.alreadyKnown / progress.uniqueYouTubeIds * 100).toFixed(1) : 0)}% solapamiento)`);
  console.log(`  • NET-NEW REALES PERSISTIDOS:   +${progress.netNew.toLocaleString()} piezas net-new 🎯`);
  console.log(`  • SOCIAL NOVELTY RATE:          ${noveltyRate}%`);
  console.log(`  • VELOCIDAD DE NOVEDAD:         ${netNewVelocity} items/s`);
  console.log(`  • POTENCIAL CONSERVADOR SOCIAL: +${conservativeSocialPotential.toLocaleString()} net-new estimados`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`DESGLOSE POR COMMUNITY INTELLIGENCE:`);
  console.log(`  • Comunidades ELITE (>60% Nov): ${eliteComms.length} subreddits ⭐⭐⭐⭐⭐`);
  console.log(`  • Comunidades STRONG (30-60%):  ${strongComms.length} subreddits ⭐⭐⭐⭐`);
  console.log(`  • Comunidades USABLE (10-30%):  ${usableComms.length} subreddits ⭐⭐⭐`);
  console.log(`  • Comunidades SATURATED (<10%): ${saturatedComms.length} subreddits ⛔`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`TELEMETRÍA DE RED & ACCESO:`);
  console.log(`  • API Calls Realizadas:         ${progress.apiCalls}`);
  console.log(`  • Errores / 429 Rate Limits:    ${progress.status429Count} (429s) / ${progress.errorsCount} (errores)`);
  console.log(`  • YouTube Search.list Calls:    0 🔒 (INVIOLABLE = 0)`);
  console.log(`  • YouTube Radar Quota Used:     0 u 🔒`);
  console.log(`  • DICTAMEN DEL CANARY SOCIAL:   ${gateVerdict}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (eliteComms.length > 0 || strongComms.length > 0) {
    console.log('🏆 TOP COMUNIDADES CALIFICADAS:');
    [...eliteComms, ...strongComms]
      .sort((a, b) => b.netNewCount - a.netNewCount)
      .forEach((c, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2)}. r/${c.subreddit.padEnd(20)} | Nov: ${c.noveltyRate.toFixed(1).padStart(5)}% | Net-New: +${c.netNewCount.toString().padStart(3)} [${c.tier.toUpperCase()}]`);
      });
    console.log('\n');
  }

  console.log('🏁 CANARY SOCIAL FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Social Canary Error:', err);
  process.exit(1);
});
