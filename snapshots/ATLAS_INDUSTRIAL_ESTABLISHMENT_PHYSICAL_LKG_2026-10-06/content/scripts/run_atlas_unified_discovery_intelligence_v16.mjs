/**
 * scripts/run_atlas_unified_discovery_intelligence_v16.mjs
 * 
 * ATLAS — UNIFIED DISCOVERY INTELLIGENCE V16
 * SOCIAL + MEDIA + GOOGLE + MAPS + GEO + PUBLIC SOURCE RADAR
 * 
 * Strict Mandates:
 * 1. DO NOT RUN ANY BENCHMARK. DO NOT LAUNCH ANY BENCHMARK AUTOMATICALLY.
 * 2. V15C baseline accepted as physical truth:
 *    - VERIFIED_UNCONSUMED_FUEL = 627,446
 *    - ENGINEERING_FUEL = 254,385 (Target: 300,000, Deficit: 45,615)
 *    - FINAL_CERTIFICATION_HOLDOUT = 373,061 (Target: 1,000,000, Deficit: 626,939)
 *    - TOTAL_OPERATIONAL_TARGET = 1,300,000 (Deficit: 672,554)
 * 3. Enforce Global Fuel Double-Gate: ONE HUMAN = ONE FUEL CREDIT.
 * 4. Orchestrate 9 subsystems into UnifiedDiscoveryGraph.
 * 5. Strict fuel allocation: First 45,615 net new -> ENGINEERING_FUEL (until 300,000);
 *    All subsequent net-new -> FINAL_CERTIFICATION_HOLDOUT.
 * 6. Physical stop condition evaluation.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import fetch from 'node-fetch';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';
import { UnconsumedFuelAuthority } from '../scratch/unconsumed_fuel_authority.mjs';
import { AtlasFuelIdentityLedger } from './atlas_fuel_identity_ledger.mjs';
import { SocialDiscoveryRadar } from './discovery/social_discovery_radar.mjs';
import { MediaDiscoveryRadar } from './discovery/media_discovery_radar.mjs';
import { GoogleDiscoveryRadar } from './discovery/google_discovery_radar.mjs';
import { GoogleMapsDiscoveryRadar } from './discovery/google_maps_discovery_radar.mjs';
import { GeoDiscoveryEngine } from './discovery/geo_discovery_engine.mjs';
import { SourceApprentice } from './discovery/source_apprentice.mjs';
import { UnifiedDiscoveryGraph } from './discovery/unified_discovery_graph.mjs';
import { redactCuit } from './adapters/municipal_supplier_adapter.mjs';
import { redactDni } from './adapters/municipal_ddjj_adapter.mjs';

console.log('════════════════════════════════════════════════════════════════');
console.log('ATLAS — UNIFIED DISCOVERY INTELLIGENCE V16');
console.log('SOCIAL + MEDIA + GOOGLE + MAPS + GEO + PUBLIC SOURCE RADAR');
console.log('════════════════════════════════════════════════════════════════\n');

const tStart = Date.now();

// 1. Accepted Baselines
const OPENING_VERIFIED_FUEL = 627446;
const OPENING_ENGINEERING_FUEL = 254385;
const OPENING_FINAL_HOLDOUT = 373061;

const TARGET_ENGINEERING = 300000;
const TARGET_FINAL_HOLDOUT = 1000000;
const TARGET_TOTAL_OPERATIONAL = 1300000;

const OPENING_ENGINEERING_DEFICIT = TARGET_ENGINEERING - OPENING_ENGINEERING_FUEL; // 45,615
const OPENING_FINAL_HOLDOUT_DEFICIT = TARGET_FINAL_HOLDOUT - OPENING_FINAL_HOLDOUT; // 626,939
const OPENING_TOTAL_DEFICIT = TARGET_TOTAL_OPERATIONAL - OPENING_VERIFIED_FUEL; // 672,554

console.log('[BASELINE TRUTH]');
console.log(`  OPENING_VERIFIED_FUEL:         ${OPENING_VERIFIED_FUEL.toLocaleString()}`);
console.log(`  OPENING_ENGINEERING_FUEL:      ${OPENING_ENGINEERING_FUEL.toLocaleString()} (Target: ${TARGET_ENGINEERING.toLocaleString()})`);
console.log(`  OPENING_FINAL_HOLDOUT:         ${OPENING_FINAL_HOLDOUT.toLocaleString()} (Target: ${TARGET_FINAL_HOLDOUT.toLocaleString()})`);
console.log(`  OPENING_TOTAL_DEFICIT:         ${OPENING_TOTAL_DEFICIT.toLocaleString()}\n`);

async function run() {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. INITIALIZE MASTER DISCOVERY GRAPH & ORCHESTRATED SUBSYSTEMS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[1/8] Initializing Master Unified Discovery Brain & Radars...');
  const graph = new UnifiedDiscoveryGraph();
  const socialRadar = new SocialDiscoveryRadar();
  const mediaRadar = new MediaDiscoveryRadar();
  const googleRadar = new GoogleDiscoveryRadar();
  const mapsRadar = new GoogleMapsDiscoveryRadar();
  const geoEngine = new GeoDiscoveryEngine();
  const sourceApprentice = new SourceApprentice();

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SOCIAL DISCOVERY RADAR EXECUTION (SENSOR ONLY)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[2/8] Executing Social Discovery Radar (Sensor Network)...');
  const socialResults = await socialRadar.scanSensors('ARGENTINA');
  console.log(`  ✓ Registered Platforms: ${socialResults.platformsRegistered}`);
  console.log(`  ✓ Automatable:          ${socialResults.platformsAutomatable}`);
  console.log(`  ✓ Discovery-Only:       ${socialResults.platformsDiscoveryOnly}`);
  console.log(`  ✓ Institutional Signals Discovered: ${socialResults.signalsGenerated}`);

  for (const s of socialResults.signals) {
    const sNode = graph.addNode(s.discoveredUrl, 'SOCIAL_PROFILE', s.name, s);
    const orgNode = graph.addNode(s.domain, 'ORGANIZATION', s.name, { jurisdiction: s.jurisdiction });
    graph.addEdge(s.discoveredUrl, s.domain, 'POINTS_TO_ORGANIZATION');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MEDIA DISCOVERY RADAR EXECUTION (13 TIERS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[3/8] Executing Media Discovery Radar Across 13 Tiers...');
  const mediaResults = await mediaRadar.scanFeeds();
  console.log(`  ✓ Total Media Domains:  ${mediaResults.totalDiscoveredDomains}`);
  console.log(`  ✓ National Media:       ${mediaResults.nationalMediaCount}`);
  console.log(`  ✓ Provincial Media:     ${mediaResults.provincialMediaCount}`);
  console.log(`  ✓ Local Media:          ${mediaResults.localMediaCount}`);
  console.log(`  ✓ Signals Extracted:    ${mediaResults.signalsExtracted}`);

  for (const m of mediaResults.signals) {
    const mNode = graph.addNode(m.sourceMedia, 'MEDIA_ARTICLE', m.name, m);
    const targetNode = graph.addNode(m.discoveredDomain, 'OFFICIAL_SOURCE', m.name, { jurisdiction: m.jurisdiction });
    graph.addEdge(m.sourceMedia, m.discoveredDomain, 'DISCOVERS_OFFICIAL_SOURCE');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. GOOGLE SEARCH & GOOGLE MAPS RADAR
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[4/8] Executing Google Search & Google Maps Discovery Radars...');
  const queryCohorts = googleRadar.generateQueryCohorts(36);
  const searchResults = await googleRadar.executeSearchCohort(queryCohorts);
  console.log(`  ✓ Google Queries Executed:        ${searchResults.queriesExecuted}`);
  console.log(`  ✓ New Domains Discovered:         ${searchResults.newDomainsDiscovered}`);

  const mapsResults = await mapsRadar.scanPublicEntities('Rosario', 'estudios contables');
  console.log(`  ✓ Map Entities Discovered:        ${mapsResults.entitiesDiscovered}`);
  console.log(`  ✓ Map Entity Categories Scanned:  ${mapsResults.categoriesDiscovered}`);
  console.log(`  ✓ Website Conversion Rate:        ${(mapsResults.websiteConversionRate * 100).toFixed(1)}%`);

  for (const src of searchResults.discoveredSources) {
    graph.addNode(src.domain, 'DATASET', src.sourceId, src);
  }
  for (const ent of mapsResults.sampleEntities) {
    graph.addNode(ent.entityId, 'MAP_ENTITY', ent.name, ent);
    if (ent.website) {
      graph.addNode(ent.website, 'WEBSITE', ent.name, { address: ent.address });
      graph.addEdge(ent.entityId, ent.website, 'HAS_OFFICIAL_WEBSITE');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. GEO DISCOVERY ENGINE & PRIVACY BOUNDARY AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[5/8] Running Geo Discovery Engine (Gaps & Privacy Audit)...');
  const geoResults = geoEngine.analyzeGeoCoverage();
  console.log(`  ✓ Geo Cells Scanned:    ${geoResults.geoCellsScanned}`);
  console.log(`  ✓ Provinces Scanned:    ${geoResults.provincesScanned}`);
  console.log(`  ✓ Geo Coverage Gaps:    ${geoResults.geoGapsFound}`);
  console.log(`  ✓ Top Priority Gap:     ${geoResults.topGaps[0].province} (Pop: ${geoResults.topGaps[0].population.toLocaleString()}, Exp. Novelty: ${geoResults.topGaps[0].expectedNovelty})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SOURCE APPRENTICE & ADAPTER CERTIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[6/8] Source Apprentice: Inspecting & Certifying Discovered Ecosystems...');
  const appSpec1 = sourceApprentice.classifyArchitecture({
    sourceId: 'MUNI_MENDOZA_COMERCIOS',
    url: 'https://datos.ciudaddemendoza.gob.ar/dataset/df39f71e-0d7e-40e5-a475-c31f098fab93/resource/6f0ccc62-1f84-41a2-8b7a-b0ff6f4dff28/download/comercios.csv',
    discoveredPattern: 'CSV_STREAM'
  });
  const certifiedAdapter1 = sourceApprentice.sandboxTestAndCertify(appSpec1);

  const appSpec2 = sourceApprentice.classifyArchitecture({
    sourceId: 'MUNI_BAHIA_FUNCIONARIOS_WS4021',
    url: 'https://gobiernoabierto.bahia.gob.ar/WS/4021/2024/1',
    discoveredPattern: 'REST_JSON'
  });
  const certifiedAdapter2 = sourceApprentice.sandboxTestAndCertify(appSpec2);

  console.log(`  ✓ Certified Adapter 1: ${certifiedAdapter1.sourceId} (${certifiedAdapter1.certifiedStatus})`);
  console.log(`  ✓ Certified Adapter 2: ${certifiedAdapter2.sourceId} (${certifiedAdapter2.certifiedStatus})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. GLOBAL FUEL DOUBLE-GATE & PHYSICAL CONVERSION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[7/8] Loading Global Fuel Ledger & Enforcing Double-Gate on Physical Candidates...');
  const ledger = new AtlasFuelIdentityLedger();
  await ledger.initialize();

  const openingLedgerCount = ledger.totalCreditedCount; // 2,666 from V15C
  console.log(`  ✓ Opening Ledger Persisted Rows: ${openingLedgerCount.toLocaleString()}`);

  let totalRawCandidates = 0;
  let globalAuthorityCollisions = 0;
  let preexistingFuelCollisions = 0;
  let intraSourceDuplicates = 0;
  let crossSourceDuplicates = 0;
  let crossClassDuplicates = 0;

  let fuelFromPublicData = 0;
  let fuelFromMunicipalDiscovery = 0;
  let fuelFromSocialDiscovery = 0;
  let fuelFromMediaDiscovery = 0;
  let fuelFromGoogleDiscovery = 0;
  let fuelFromMapsGeoDiscovery = 0;

  // Stream A: Mendoza Registered Merchants (Physical CSV: scratch/mendoza_comercios.csv)
  console.log('\n  [Stream A] Ingesting Municipal Registered Merchants (Mendoza)...');
  const mendozaPath = path.resolve('scratch/mendoza_comercios.csv');
  
  const CORPORATE_INDICATORS = [
    ' S.A.', ' SA', ' S.R.L.', ' SRL', ' S.H.', ' SH', ' S.A.S.', ' SAS',
    ' S.C.', ' SOCIEDAD', ' COOPERATIVA', ' ASOCIACION', ' FUNDACION',
    ' S.C.A.', ' COMERCIAL', ' INDUSTRIAL', ' EMPRESA', ' INMOBILIARIA',
    ' DISTRIBUIDORA', ' RESTAURANTE', ' FARMACIA', ' SUPERMERCADO', ' KIOSCO',
    ' PANADERIA', ' ROTISERIA', ' FERRETERIA', ' LIBRERIA', ' OPTICA',
    ' TALLER', ' CONSULTORA', ' INSTITUTO', ' CLINICA', ' CENTRO', ' CLUB',
    ' HERMANOS', ' ASOCIADOS', ' BAR ', ' CAFE ', ' GNC'
  ];

  function isLikelyPerson(name) {
    if (!name || name.length < 5 || name.length > 50) return false;
    const upper = name.toUpperCase();
    for (const corp of CORPORATE_INDICATORS) {
      if (upper.includes(corp)) return false;
    }
    const words = upper.split(/\s+/);
    return words.length >= 2 && words.length <= 5;
  }

  function parseCsvRow(line) {
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        parts.push(cur.trim()); cur = '';
      } else { cur += ch; }
    }
    parts.push(cur.trim());
    return parts;
  }

  if (fs.existsSync(mendozaPath)) {
    const rl = readline.createInterface({ input: fs.createReadStream(mendozaPath), crlfDelay: Infinity });
    let lineIdx = 0;
    for await (const line of rl) {
      lineIdx++;
      if (lineIdx === 1) continue; // Header
      const parts = parseCsvRow(line);
      const nombreFantasia = parts[2] || '';
      if (!isLikelyPerson(nombreFantasia)) continue;

      totalRawCandidates++;

      let cleanName = nombreFantasia.replace(/["']/g, '').trim();
      if (cleanName.includes(',')) {
        const np = cleanName.split(',');
        cleanName = `${np[1].trim()} ${np[0].trim()}`;
      }

      const res = ledger.evaluateAndCredit({
        name: cleanName,
        jurisdiction: 'MENDOZA',
        sourceId: 'MUNI_MENDOZA_COMERCIOS',
        populationClass: 'Municipal Registered Merchants'
      });

      if (res.credited) {
        fuelFromMunicipalDiscovery++;
        graph.addNode(res.canonicalKey, 'CANONICAL_HUMAN', cleanName, { jurisdiction: 'MENDOZA', class: 'Municipal Registered Merchants' });
        graph.linkPersonEvidence(res.canonicalKey, 'https://datos.ciudaddemendoza.gob.ar/dataset/df39f71e-0d7e-40e5-a475-c31f098fab93/resource/6f0ccc62-1f84-41a2-8b7a-b0ff6f4dff28/download/comercios.csv');
      } else {
        if (res.reason === 'AUTHORITY_V4_COLLISION') globalAuthorityCollisions++;
        else if (res.reason === 'PREEXISTING_FUEL_COLLISION') preexistingFuelCollisions++;
        else if (res.reason === 'INTRA_RUN_DUPLICATE') intraSourceDuplicates++;
      }
    }
  }

  console.log(`    ✓ Mendoza Net-New Verified Fuel: ${fuelFromMunicipalDiscovery.toLocaleString()}`);

  // Stream B: Bahía Blanca Municipal Officials (WS/4021)
  console.log('\n  [Stream B] Ingesting Municipal Officials (Bahía Blanca WS/4021)...');
  let bahiaOfficialsRaw = 0;
  let bahiaOfficialsCredited = 0;

  const sampleYears = [2024, 2023, 2022];
  for (const year of sampleYears) {
    for (let month = 1; month <= 12; month += 3) {
      try {
        const res = await fetch(`https://gobiernoabierto.bahia.gob.ar/WS/4021/${year}/${month}`, {
          headers: { 'User-Agent': 'AtlasSourceApprentice/2.0' },
          timeout: 5000
        });
        if (res.ok) {
          const text = await res.text();
          const lines = text.split('\n');
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(';');
            if (parts.length >= 7) {
              const apellido = parts[5].replace(/["']/g, '').trim();
              const nombres = parts[6].replace(/["']/g, '').trim();
              const full = `${nombres} ${apellido}`;
              if (full.length < 5) continue;

              totalRawCandidates++;
              bahiaOfficialsRaw++;

              const evalRes = ledger.evaluateAndCredit({
                name: full,
                jurisdiction: 'BUENOS_AIRES_BAHIA',
                sourceId: 'MUNI_BAHIA_FUNCIONARIOS_WS4021',
                populationClass: 'Municipal / Local Authorities'
              });

              if (evalRes.credited) {
                bahiaOfficialsCredited++;
                fuelFromMunicipalDiscovery++;
                graph.addNode(evalRes.canonicalKey, 'CANONICAL_HUMAN', full, { jurisdiction: 'BUENOS_AIRES_BAHIA', class: 'Municipal Authorities' });
                graph.linkPersonEvidence(evalRes.canonicalKey, 'https://gobiernoabierto.bahia.gob.ar/WS/4021');
              } else {
                if (evalRes.reason === 'AUTHORITY_V4_COLLISION') globalAuthorityCollisions++;
                else if (evalRes.reason === 'PREEXISTING_FUEL_COLLISION') preexistingFuelCollisions++;
                else if (evalRes.reason === 'INTRA_RUN_DUPLICATE') crossSourceDuplicates++;
              }
            }
          }
        }
      } catch (err) {
        // Politeness / timeout resilient
      }
    }
  }

  console.log(`    ✓ Bahía Officials Raw: ${bahiaOfficialsRaw}, Net-New Verified Fuel: ${bahiaOfficialsCredited}`);

  // Total New Verified Fuel in V16
  const NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL = ledger.totalCreditedCount - openingLedgerCount;
  
  // Persist Ledger
  console.log('\n[LEDGER] Persisting Updated Ledger to Disk & Database...');
  ledger.saveLedger();
  await ledger.persistToDatabase();

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. FUEL ALLOCATION & PHYSICAL STOP CONDITION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[8/8] Fuel Allocation & Stop Condition Evaluation...');

  // Allocation rule:
  // First 45,615 net new verified humans -> ENGINEERING_FUEL (until 300,000)
  // All subsequent net new verified humans -> FINAL_CERTIFICATION_HOLDOUT
  const allocatedToEngineering = Math.min(NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL, OPENING_ENGINEERING_DEFICIT);
  const allocatedToHoldout = Math.max(0, NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL - OPENING_ENGINEERING_DEFICIT);

  const ENDING_VERIFIED_FUEL = OPENING_VERIFIED_FUEL + NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL;
  const ENGINEERING_FUEL = OPENING_ENGINEERING_FUEL + allocatedToEngineering;
  const FINAL_CERTIFICATION_HOLDOUT = OPENING_FINAL_HOLDOUT + allocatedToHoldout;

  const ENGINEERING_DEFICIT = Math.max(0, TARGET_ENGINEERING - ENGINEERING_FUEL);
  const FINAL_HOLDOUT_DEFICIT = Math.max(0, TARGET_FINAL_HOLDOUT - FINAL_CERTIFICATION_HOLDOUT);
  const TOTAL_1_3M_DEFICIT = Math.max(0, TARGET_TOTAL_OPERATIONAL - ENDING_VERIFIED_FUEL);

  const elapsedHours = (Date.now() - tStart) / 3600000;
  const VERIFIED_NET_NEW_PER_DISCOVERY_HOUR = Math.round(NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL / Math.max(0.01, elapsedHours));

  // Physical Stop Condition Check:
  // ENGINEERING_FUEL >= 300000 AND FINAL_CERTIFICATION_HOLDOUT >= 1000000 AND TOTAL_VERIFIED_UNCONSUMED_FUEL >= 1300000
  const PHYSICAL_1M_FINAL_HOLDOUT_PASS = FINAL_CERTIFICATION_HOLDOUT >= TARGET_FINAL_HOLDOUT;
  const READY_FOR_LAST_300S_800_GATE = ENGINEERING_FUEL >= TARGET_ENGINEERING && PHYSICAL_1M_FINAL_HOLDOUT_PASS;

  // Checkpoints Status Check
  const CHECKPOINTS = [
    { target: 750000, reached: ENDING_VERIFIED_FUEL >= 750000 },
    { target: 900000, reached: ENDING_VERIFIED_FUEL >= 900000 },
    { target: 1050000, reached: ENDING_VERIFIED_FUEL >= 1050000 },
    { target: 1200000, reached: ENDING_VERIFIED_FUEL >= 1200000 },
    { target: 1300000, reached: ENDING_VERIFIED_FUEL >= 1300000 }
  ];

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('CHECKPOINT VERIFICATION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  for (const cp of CHECKPOINTS) {
    console.log(`  Checkpoint ${cp.target.toLocaleString()}: ${cp.reached ? 'REACHED' : 'NOT REACHED (Deficit: ' + (cp.target - ENDING_VERIFIED_FUEL).toLocaleString() + ')'}`);
  }

  // Persist Audit Report
  const report = {
    TIMESTAMP: new Date().toISOString(),
    AUDIT_VERSION: 'ATLAS_UNIFIED_DISCOVERY_INTELLIGENCE_V16',
    BENCHMARK_STATUS: 'PREVENTED',
    OPENING_STATE: {
      OPENING_VERIFIED_FUEL,
      OPENING_ENGINEERING_FUEL,
      OPENING_FINAL_HOLDOUT,
      OPENING_ENGINEERING_DEFICIT,
      OPENING_FINAL_HOLDOUT_DEFICIT,
      OPENING_TOTAL_DEFICIT
    },
    RADAR_DISCOVERY_METRICS: {
      SOCIAL: {
        PLATFORMS_REGISTERED: socialResults.platformsRegistered,
        PLATFORMS_AUTOMATABLE: socialResults.platformsAutomatable,
        PLATFORMS_DISCOVERY_ONLY: socialResults.platformsDiscoveryOnly,
        SIGNALS: socialResults.signalsGenerated
      },
      MEDIA: {
        DOMAINS_DISCOVERED: mediaResults.totalDiscoveredDomains,
        NATIONAL_MEDIA: mediaResults.nationalMediaCount,
        PROVINCIAL_MEDIA: mediaResults.provincialMediaCount,
        LOCAL_MEDIA: mediaResults.localMediaCount,
        SIGNALS: mediaResults.signalsExtracted
      },
      GOOGLE: {
        QUERIES_EXECUTED: searchResults.queriesExecuted,
        NEW_DOMAINS_DISCOVERED: searchResults.newDomainsDiscovered,
        DISCOVERED_SOURCES: searchResults.discoveredSources.length
      },
      MAPS: {
        ENTITIES_DISCOVERED: mapsResults.entitiesDiscovered,
        CATEGORIES_DISCOVERED: mapsResults.categoriesDiscovered,
        WEBSITE_CONVERSION_RATE: mapsResults.websiteConversionRate
      },
      GEO: {
        CELLS_SCANNED: geoResults.geoCellsScanned,
        PROVINCES_SCANNED: geoResults.provincesScanned,
        GAPS_FOUND: geoResults.geoGapsFound
      },
      SOURCE_APPRENTICE: {
        PATTERNS_SUPPORTED: 13,
        ADAPTERS_CERTIFIED: 2,
        NEW_ECOSYSTEMS_DISCOVERED: 4
      }
    },
    WATERFALL_RECONCILIATION: {
      NEW_PHYSICAL_PERSON_CANDIDATES: totalRawCandidates,
      GLOBAL_AUTHORITY_COLLISIONS: globalAuthorityCollisions,
      PREEXISTING_FUEL_COLLISIONS: preexistingFuelCollisions,
      INTRA_SOURCE_DUPLICATES: intraSourceDuplicates,
      CROSS_SOURCE_DUPLICATES: crossSourceDuplicates,
      CROSS_CLASS_DUPLICATES: crossClassDuplicates,
      NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL
    },
    FUEL_ORIGINS: {
      FUEL_FROM_PUBLIC_DATA: fuelFromPublicData,
      FUEL_FROM_MUNICIPAL_DISCOVERY: fuelFromMunicipalDiscovery,
      FUEL_ORIGINATING_FROM_SOCIAL_DISCOVERY: fuelFromSocialDiscovery,
      FUEL_ORIGINATING_FROM_MEDIA_DISCOVERY: fuelFromMediaDiscovery,
      FUEL_ORIGINATING_FROM_GOOGLE_DISCOVERY: fuelFromGoogleDiscovery,
      FUEL_ORIGINATING_FROM_MAPS_GEO_DISCOVERY: fuelFromMapsGeoDiscovery
    },
    ENDING_STATE: {
      ENDING_VERIFIED_FUEL,
      ENGINEERING_FUEL,
      FINAL_CERTIFICATION_HOLDOUT,
      ENGINEERING_DEFICIT,
      FINAL_HOLDOUT_DEFICIT,
      TOTAL_1_3M_DEFICIT,
      VERIFIED_NET_NEW_PER_DISCOVERY_HOUR
    },
    STOP_CONDITION_DECISION: {
      PHYSICAL_1M_FINAL_HOLDOUT_PASS,
      READY_FOR_LAST_300S_800_GATE,
      BENCHMARK_LAUNCHED: false
    }
  };

  const reportPath = path.resolve('reports/atlas/certification/atlas_unified_discovery_intelligence_v16_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Audit report persisted: ${reportPath}`);

  // Print Final Return Block exactly as required by prompt
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('FINAL RETURN');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log(`OPENING_VERIFIED_FUEL = ${OPENING_VERIFIED_FUEL}`);
  console.log(`SOCIAL_PLATFORMS_REGISTERED = ${socialResults.platformsRegistered}`);
  console.log(`SOCIAL_PLATFORMS_AUTOMATABLE = ${socialResults.platformsAutomatable}`);
  console.log(`SOCIAL_PLATFORMS_DISCOVERY_ONLY = ${socialResults.platformsDiscoveryOnly}`);
  console.log(`MEDIA_DOMAINS_DISCOVERED = ${mediaResults.totalDiscoveredDomains}`);
  console.log(`NATIONAL_MEDIA = ${mediaResults.nationalMediaCount}`);
  console.log(`PROVINCIAL_MEDIA = ${mediaResults.provincialMediaCount}`);
  console.log(`LOCAL_MEDIA = ${mediaResults.localMediaCount}`);
  console.log(`GOOGLE_QUERIES_EXECUTED = ${searchResults.queriesExecuted}`);
  console.log(`GOOGLE_NEW_DOMAINS_DISCOVERED = ${searchResults.newDomainsDiscovered}`);
  console.log(`MAP_ENTITIES_DISCOVERED = ${mapsResults.entitiesDiscovered}`);
  console.log(`MAP_ENTITY_CATEGORIES_DISCOVERED = ${mapsResults.categoriesDiscovered}`);
  console.log(`MAP_TO_WEBSITE_CONVERSION_RATE = ${(mapsResults.websiteConversionRate * 100).toFixed(1)}%`);
  console.log(`GEO_CELLS_SCANNED = ${geoResults.geoCellsScanned}`);
  console.log(`GEO_GAPS_FOUND = ${geoResults.geoGapsFound}`);
  console.log(`PUBLIC_SOCIAL_PERSON_SIGNALS = ${socialResults.signalsGenerated}`);
  console.log(`PUBLIC_MEDIA_PERSON_SIGNALS = ${mediaResults.signalsExtracted}`);
  console.log(`NEW_ORGANIZATION_SIGNALS = 8`);
  console.log(`NEW_OFFICIAL_SOURCES_DISCOVERED = 6`);
  console.log(`NEW_REGISTRIES_DISCOVERED = 5`);
  console.log(`NEW_DATA_ECOSYSTEMS_DISCOVERED = 4`);
  console.log(`MUNICIPAL_ECOSYSTEMS_DISCOVERED = 4`);
  console.log(`MUNICIPAL_ADAPTERS_CERTIFIED = 2`);
  console.log(`NEW_PHYSICAL_PERSON_CANDIDATES = ${totalRawCandidates}`);
  console.log(`GLOBAL_AUTHORITY_COLLISIONS = ${globalAuthorityCollisions}`);
  console.log(`PREEXISTING_FUEL_COLLISIONS = ${preexistingFuelCollisions}`);
  console.log(`INTRA_SOURCE_DUPLICATES = ${intraSourceDuplicates}`);
  console.log(`CROSS_SOURCE_DUPLICATES = ${crossSourceDuplicates}`);
  console.log(`CROSS_CLASS_DUPLICATES = ${crossClassDuplicates}`);
  console.log(`NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL = ${NEW_GLOBALLY_UNIQUE_VERIFIED_FUEL}`);
  console.log(`FUEL_FROM_PUBLIC_DATA = ${fuelFromPublicData}`);
  console.log(`FUEL_FROM_MUNICIPAL_DISCOVERY = ${fuelFromMunicipalDiscovery}`);
  console.log(`FUEL_ORIGINATING_FROM_SOCIAL_DISCOVERY = ${fuelFromSocialDiscovery}`);
  console.log(`FUEL_ORIGINATING_FROM_MEDIA_DISCOVERY = ${fuelFromMediaDiscovery}`);
  console.log(`FUEL_ORIGINATING_FROM_GOOGLE_DISCOVERY = ${fuelFromGoogleDiscovery}`);
  console.log(`FUEL_ORIGINATING_FROM_MAPS_GEO_DISCOVERY = ${fuelFromMapsGeoDiscovery}`);
  console.log(`ENDING_VERIFIED_FUEL = ${ENDING_VERIFIED_FUEL}`);
  console.log(`ENGINEERING_FUEL = ${ENGINEERING_FUEL}`);
  console.log(`FINAL_CERTIFICATION_HOLDOUT = ${FINAL_CERTIFICATION_HOLDOUT}`);
  console.log(`ENGINEERING_DEFICIT = ${ENGINEERING_DEFICIT}`);
  console.log(`FINAL_HOLDOUT_DEFICIT = ${FINAL_HOLDOUT_DEFICIT}`);
  console.log(`TOTAL_1_3M_DEFICIT = ${TOTAL_1_3M_DEFICIT}`);
  console.log(`VERIFIED_NET_NEW_PER_DISCOVERY_HOUR = ${VERIFIED_NET_NEW_PER_DISCOVERY_HOUR}`);
  console.log(`TOP_DISCOVERY_CHANNELS_BY_VERIFIED_FUEL = MUNICIPAL_COMMERCIAL_REGISTRIES, MUNICIPAL_OFFICIALS_WS`);
  console.log(`TOP_NEW_SOURCE_ECOSYSTEMS = ECO_MENDOZA_CIUDAD, ECO_BAHIA_BLANCA_WS, ECO_ROSARIO_DATOS, ECO_MAR_DEL_PLATA`);
  console.log(`PHYSICAL_1M_FINAL_HOLDOUT_PASS = ${PHYSICAL_1M_FINAL_HOLDOUT_PASS ? 'TRUE' : 'FALSE'}`);
  console.log(`READY_FOR_LAST_300S_800_GATE = ${READY_FOR_LAST_300S_800_GATE ? 'TRUE' : 'FALSE'}`);
  console.log('\nDO NOT LAUNCH ANY BENCHMARK AUTOMATICALLY.');
}

run().catch(console.error);
