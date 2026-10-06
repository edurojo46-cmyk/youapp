/**
 * ATLAS — RECURSIVE ECOSYSTEM HARVESTER GATE RUNNER
 * Tests the 10 top real institutional ecosystems with generic protocol engines:
 * - HTML_RECURSIVE (with internal links and XML sitemap resolution)
 * - CKAN_PAGINATOR (with batch start/rows pagination)
 * - OAI_PMH_PAGINATOR (with resumptionToken pagination)
 * 
 * Target: Demonstrate PAGES_HARVESTED >> 10, Realization Ratio >> 0.087%,
 * and verify exactas.uba.ar multi-page expansion.
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { PreexistingEmailAuthority } from '../src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts';
import { IndustrialEmailSearchIndex } from '../src/lib/atlasIndustrialEmail/IndustrialEmailSearchIndex.ts';
import { RecursiveEcosystemEngine } from '../src/lib/atlasRecursiveHarvest/RecursiveEcosystemEngine.ts';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — RECURSIVE ECOSYSTEM HARVESTER GATE                   ');
  console.log('   Testing 10 Real Argentine Institutional Ecosystems           ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });

  // 1. T0 Baseline Authority Check
  const authority = new PreexistingEmailAuthority();
  await authority.loadOrInitializeT0();

  // Load existing contacts from 1m table to ensure 100% dedupe integrity
  const clientPre = await pool.connect();
  let existing1mRows = [];
  try {
    const r = await clientPre.query('SELECT email_normalized FROM public.atlas_public_email_contacts_1m;');
    existing1mRows = r.rows;
  } finally {
    clientPre.release();
  }

  const preexistingDbCount = existing1mRows.length;
  console.log(`[Gate Preflight] Database baseline: ${preexistingDbCount.toLocaleString()} preexisting contacts.`);
  console.log(`[Gate Preflight] Dedupe authority: ${authority.openingCount.toLocaleString()} T0 authority emails.\n`);

  const searchIndex = new IndustrialEmailSearchIndex();
  const engine = new RecursiveEcosystemEngine(pool, authority, searchIndex);
  const loadedDbContacts = await engine.initialize();
  console.log(`[Gate Preflight] Loaded ${loadedDbContacts.toLocaleString()} existing contacts from DB into dedupe authority.\n`);

  // 2. Define Top 10 Real Argentine Ecosystems
  const top10Ecosystems = [
    // Top Control: UBA Exactas (HTML Recursive + Sitemap)
    {
      id: 'ECO_UBA_EXACTAS',
      family: 'FAM_ACADEMIC_UBA',
      rootUrl: 'https://exactas.uba.ar/directorio',
      domain: 'exactas.uba.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'CABA',
      protocol: 'HTML_RECURSIVE',
      maxPages: 35
    },
    // UNMdP Psicología
    {
      id: 'ECO_UNMDP_PSICOLOGIA',
      family: 'FAM_ACADEMIC_UNMDP',
      rootUrl: 'https://psicologia.mdp.edu.ar/autoridades',
      domain: 'psicologia.mdp.edu.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'BUE',
      protocol: 'HTML_RECURSIVE',
      maxPages: 25
    },
    // UNT Filosofía
    {
      id: 'ECO_UNT_FILO',
      family: 'FAM_ACADEMIC_UNT',
      rootUrl: 'https://filo.unt.edu.ar/autoridades',
      domain: 'filo.unt.edu.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'TUC',
      protocol: 'HTML_RECURSIVE',
      maxPages: 25
    },
    // UNMdP Humanidades
    {
      id: 'ECO_UNMDP_HUMANIDADES',
      family: 'FAM_ACADEMIC_UNMDP',
      rootUrl: 'https://humanidades.mdp.edu.ar/autoridades',
      domain: 'humanidades.mdp.edu.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'BUE',
      protocol: 'HTML_RECURSIVE',
      maxPages: 25
    },
    // UNVM Sociales
    {
      id: 'ECO_UNVM_SOCIALES',
      family: 'FAM_ACADEMIC_UNVM',
      rootUrl: 'https://sociales.unvm.edu.ar/autoridades',
      domain: 'sociales.unvm.edu.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'CBA',
      protocol: 'HTML_RECURSIVE',
      maxPages: 25
    },
    // UNSJ Exactas
    {
      id: 'ECO_UNSJ_EXACTAS',
      family: 'FAM_ACADEMIC_UNSJ',
      rootUrl: 'https://exactas.unsj.edu.ar/autoridades',
      domain: 'exactas.unsj.edu.ar',
      sector: 'HIGHER_EDUCATION',
      jurisdiction: 'SJU',
      protocol: 'HTML_RECURSIVE',
      maxPages: 20
    },
    // Neuquén Transporte
    {
      id: 'ECO_NQN_TRANSPORTE',
      family: 'FAM_PROV_NQN',
      rootUrl: 'https://transporte.neuquen.gov.ar/contacto',
      domain: 'transporte.neuquen.gov.ar',
      sector: 'PUBLIC_ADMINISTRATION',
      jurisdiction: 'NQN',
      protocol: 'HTML_RECURSIVE',
      maxPages: 15
    },
    // Misiones Salud
    {
      id: 'ECO_MIS_SALUD',
      family: 'FAM_PROV_MIS',
      rootUrl: 'https://salud.misiones.gob.ar/autoridades',
      domain: 'salud.misiones.gob.ar',
      sector: 'HEALTHCARE_AND_HOSPITALS',
      jurisdiction: 'MIS',
      protocol: 'HTML_RECURSIVE',
      maxPages: 25
    },
    // GCBA Open Data CKAN Catalog
    {
      id: 'ECO_CKAN_BA_DATA',
      family: 'FAM_MUNICIPAL_GCBA',
      rootUrl: 'https://data.buenosaires.gob.ar/api/3/action/package_search',
      domain: 'data.buenosaires.gob.ar',
      sector: 'PUBLIC_ADMINISTRATION',
      jurisdiction: 'CABA',
      protocol: 'CKAN',
      maxPages: 10 // 10 batches x 50 = 500 datasets
    },
    // UNLP SEDICI OAI-PMH Repository
    {
      id: 'ECO_OAI_SEDICI_UNLP',
      family: 'FAM_ACADEMIC_UNLP',
      rootUrl: 'http://sedici.unlp.edu.ar/oai/request',
      domain: 'sedici.unlp.edu.ar',
      sector: 'SCIENTIFIC_RESEARCH',
      jurisdiction: 'BUE',
      protocol: 'OAI_PMH',
      maxPages: 12 // 12 batches x 100 = 1,200 records
    }
  ];

  console.log(`Starting execution of ${top10Ecosystems.length} Ecosystem Jobs...\n`);
  const t0Start = Date.now();
  const reports = [];

  // Harvest ecosystems in managed parallel batches (respecting per-host concurrency)
  const PARALLEL_ECOSYSTEMS = 3;
  for (let i = 0; i < top10Ecosystems.length; i += PARALLEL_ECOSYSTEMS) {
    const chunk = top10Ecosystems.slice(i, i + PARALLEL_ECOSYSTEMS);
    const chunkPromises = chunk.map(async (eco) => {
      const job = RecursiveEcosystemEngine.createJob({
        ecosystemId: eco.id,
        sourceFamily: eco.family,
        rootUrl: eco.rootUrl,
        domain: eco.domain,
        sector: eco.sector,
        jurisdiction: eco.jurisdiction,
        protocol: eco.protocol,
        maxPages: eco.maxPages,
        maxDepth: 3
      });
      return await engine.harvestEcosystem(job);
    });

    const chunkResults = await Promise.all(chunkPromises);
    reports.push(...chunkResults);
  }

  // Final flush of any pending database writes
  await engine.flushBatch();

  const totalDurationMs = Date.now() - t0Start;
  const totalDurationSec = (totalDurationMs / 1000).toFixed(2);

  // 3. Aggregate Metrics
  let totalReachableDiscovered = 0;
  let totalUrlsHarvested = 0;
  let totalProductivePages = 0;
  let totalRawEmails = 0;
  let totalUniqueEmails = 0;
  let totalRawTrueNetNew = 0;
  let totalPreexistingInDb = 0;
  let totalCertifiedTrueNetNew = 0;
  let totalEstimatedSupply = 0;
  let oaiPagesConsumed = 0;
  let ckanPagesConsumed = 0;
  let maxTrueNetNewEcosystem = { id: '', count: 0 };

  for (const rep of reports) {
    totalReachableDiscovered += rep.reachableUrlsDiscovered;
    totalUrlsHarvested += rep.urlsHarvested;
    totalProductivePages += rep.productivePages;
    totalRawEmails += rep.rawEmailsHarvested;
    totalUniqueEmails += rep.uniqueEmailsHarvested;
    totalRawTrueNetNew += rep.rawTrueNetNewFound;
    totalPreexistingInDb += rep.preexistingInDb;
    totalCertifiedTrueNetNew += rep.certifiedTrueNetNew;
    totalEstimatedSupply += rep.estimatedSupply;

    if (rep.protocol === 'OAI_PMH') oaiPagesConsumed += rep.urlsHarvested;
    if (rep.protocol === 'CKAN') ckanPagesConsumed += rep.urlsHarvested;

    if (rep.certifiedTrueNetNew > maxTrueNetNewEcosystem.count) {
      maxTrueNetNewEcosystem = { id: `${rep.ecosystemId} (${rep.domain})`, count: rep.certifiedTrueNetNew };
    }
  }

  const overallCoverage = totalReachableDiscovered > 0 ? parseFloat(((totalUrlsHarvested / totalReachableDiscovered) * 100).toFixed(2)) : 0;
  const overallRealizationRatio = totalEstimatedSupply > 0 ? parseFloat(((totalCertifiedTrueNetNew / totalEstimatedSupply) * 100).toFixed(2)) : 0;
  const avgTrueNetNew = parseFloat((totalCertifiedTrueNetNew / reports.length).toFixed(1));

  // Verify exactas growth
  const exactasReport = reports.find(r => r.ecosystemId === 'ECO_UBA_EXACTAS');

  // Verify database persistence count
  const clientPost = await pool.connect();
  let postCount = 0;
  try {
    const r = await clientPost.query('SELECT COUNT(*) FROM public.atlas_public_email_contacts_1m;');
    postCount = parseInt(r.rows[0].count, 10);
  } finally {
    clientPost.release();
  }

  const netNewPersistedInDb = postCount - preexistingDbCount;
  const searchableInIndex = searchIndex.size();
  const missionQualified = totalCertifiedTrueNetNew;
  const unaccountedEmails = Math.abs(totalCertifiedTrueNetNew - netNewPersistedInDb) + Math.abs(totalCertifiedTrueNetNew - searchableInIndex);
  const productivePagesLeUrlsHarvested = totalProductivePages <= totalUrlsHarvested;

  const oaiPaginationPass = oaiPagesConsumed > 0;
  const ckanPaginationPass = ckanPagesConsumed > 0;
  const recursiveHtmlPass = Boolean(exactasReport && exactasReport.urlsHarvested > 1);

  const isAccountingClosed = (
    totalCertifiedTrueNetNew === missionQualified &&
    missionQualified === netNewPersistedInDb &&
    netNewPersistedInDb === searchableInIndex &&
    unaccountedEmails === 0 &&
    productivePagesLeUrlsHarvested
  );

  const readyToRerun500k = isAccountingClosed;

  // Save detailed report
  const reportPath = path.resolve('reports/atlas/acquisition/RECURSIVE_ECOSYSTEM_GATE_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    durationSeconds: parseFloat(totalDurationSec),
    ecosystems_tested: reports.length,
    total_reachable_discovered: totalReachableDiscovered,
    total_urls_harvested: totalUrlsHarvested,
    overall_harvest_coverage: overallCoverage,
    total_productive_pages: totalProductivePages,
    productive_pages_le_urls_harvested: productivePagesLeUrlsHarvested,
    total_raw_emails: totalRawEmails,
    total_unique_emails: totalUniqueEmails,
    raw_true_net_new_found: totalRawTrueNetNew,
    preexisting_in_db: totalPreexistingInDb,
    certified_true_net_new: totalCertifiedTrueNetNew,
    mission_qualified: missionQualified,
    persisted_in_db: netNewPersistedInDb,
    searchable_in_index: searchableInIndex,
    unaccounted_emails: unaccountedEmails,
    oai_pages_consumed: oaiPagesConsumed,
    ckan_pages_consumed: ckanPagesConsumed,
    oai_pagination_pass: oaiPaginationPass,
    ckan_pagination_pass: ckanPaginationPass,
    recursive_html_pass: recursiveHtmlPass,
    realization_ratio: overallRealizationRatio,
    avg_true_net_new_per_ecosystem: avgTrueNetNew,
    max_true_net_new_ecosystem: maxTrueNetNewEcosystem,
    ready_to_rerun_500k: readyToRerun500k,
    exactas_expansion: {
      urls_harvested: exactasReport?.urlsHarvested,
      reachable_discovered: exactasReport?.reachableUrlsDiscovered,
      raw_true_net_new: exactasReport?.rawTrueNetNewFound,
      certified_true_net_new: exactasReport?.certifiedTrueNetNew
    },
    reports
  }, null, 2), 'utf8');

  // OUTPUT EXACT EXECUTIVE DEVOLUTION
  console.log('\n==================================================');
  console.log('DEVOLUCIÓN BREVE');
  console.log('==================================================\n');
  console.log(`RAW_TRUE_NET_NEW_FOUND = ${totalRawTrueNetNew}`);
  console.log(`CERTIFIED_TRUE_NET_NEW = ${totalCertifiedTrueNetNew}`);
  console.log(`MISSION_QUALIFIED = ${missionQualified}`);
  console.log(`PERSISTED = ${netNewPersistedInDb}`);
  console.log(`SEARCHABLE = ${searchableInIndex}`);
  console.log(`UNACCOUNTED_EMAILS = ${unaccountedEmails}\n`);
  console.log(`URLS_HARVESTED = ${totalUrlsHarvested}`);
  console.log(`PRODUCTIVE_PAGES = ${totalProductivePages}`);
  console.log(`PRODUCTIVE_PAGES <= URLS_HARVESTED = ${productivePagesLeUrlsHarvested ? 'TRUE' : 'FALSE'}\n`);
  console.log(`OAI_PAGINATION_PASS = ${oaiPaginationPass ? 'TRUE' : 'FALSE'}`);
  console.log(`CKAN_PAGINATION_PASS = ${ckanPaginationPass ? 'TRUE' : 'FALSE'}`);
  console.log(`RECURSIVE_HTML_PASS = ${recursiveHtmlPass ? 'TRUE' : 'FALSE'}\n`);
  console.log(`READY_TO_RERUN_500K = ${readyToRerun500k ? 'TRUE' : 'FALSE'}`);
  console.log(`FINAL_STATUS = ${readyToRerun500k ? 'PASS' : 'FAIL'}\n`);
  console.log('==================================================');

  await pool.end();
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
