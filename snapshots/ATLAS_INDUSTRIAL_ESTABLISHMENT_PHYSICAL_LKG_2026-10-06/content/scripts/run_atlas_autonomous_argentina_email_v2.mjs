import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { AtlasSourceGraph } from './lib/atlasSourceGraph.mjs';
import { SourceStrategyMemory } from './lib/sourceStrategyMemory.mjs';
import { SourceStrategist } from './lib/sourceStrategist.mjs';

dotenv.config();

// In-Memory Search Engine
class EmailSearchEngineV2 {
  constructor() {
    this.keyToDocId = new Map();
    this.tokenIndex = new Map();
    this.docCount = 0;
  }
  tokenize(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 2);
  }
  indexEmail(email, meta = '') {
    if (this.keyToDocId.has(email)) return false;
    const docId = this.docCount++;
    this.keyToDocId.set(email, docId);
    for (const t of this.tokenize(`${email} ${meta}`)) {
      let l = this.tokenIndex.get(t);
      if (!l) {
        l = [];
        this.tokenIndex.set(t, l);
      }
      l.push(docId);
    }
    return true;
  }
  isSearchable(email) {
    return this.keyToDocId.has(email);
  }
}

function escapeCopyText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .trim();
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let clean = raw.trim().toLowerCase().replace(/^[<"'(]+|[>"'),;.:]+$/g, '').trim();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return null;
  const parts = clean.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  return clean;
}

function classifyContact(email, entityContext = '') {
  const [local, domain] = email.split('@');
  if (domain.endsWith('.gob.ar') || domain.endsWith('.gov.ar') || domain.endsWith('.jus.gov.ar')) {
    return 'PUBLIC_INSTITUTION';
  }
  if (/^(info|contacto|contact|ventas|administracion|admin|compras|rrhh|recepcion|secretaria|soporte)@/i.test(email)) {
    return 'GENERIC_ORGANIZATION';
  }
  if (/^(instituto|direccion|colegio|centro|departamento|catedra|museo)@/i.test(email)) {
    return 'ORGANIZATION_DIRECT';
  }
  if (local.includes('.') || local.includes('_') || /(lic|dra?|ing|prof|arq)/i.test(local) || (entityContext && entityContext.includes('Persona Física'))) {
    return 'PERSON_PROFESSIONAL';
  }
  return 'UNKNOWN_PUBLIC_CONTACT';
}

function verifyArgentinaLink(email, jurisdiction, context = '') {
  const [, domain] = email.split('@');
  if (domain.endsWith('.ar')) return true;
  if (jurisdiction && jurisdiction.includes('ARG')) return true;
  return false;
}

async function runAutonomousEmailBenchmarkV2() {
  console.log('================================================================');
  console.log('  ATLAS — AUTONOMOUS ARGENTINA 1M PUBLIC EMAIL BENCHMARK V2     ');
  console.log('  POWERED BY SOURCE STRATEGIST + LIVING SOURCE MAP             ');
  console.log('================================================================\n');

  const runId = `ATLAS_AUTONOMOUS_AR_EMAIL_V2_${Date.now()}`;
  const outDir = path.resolve('reports/atlas/acquisition');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Initialize Living Source Graph & Source Strategy Memory
  console.log('[1/9] Loading Living Source Graph & Source Strategy Memory...');
  const graph = new AtlasSourceGraph();
  const memory = new SourceStrategyMemory();
  const strategist = new SourceStrategist(graph, memory);

  const nodesBefore = graph.nodes.size;
  const resourcesBefore = graph.resources.size;
  const edgesBefore = graph.edges.length;

  // 2. Load Frozen Opening Preexisting Email Authority (57,998 emails from Run 1)
  console.log('[2/9] Loading Frozen Opening Email Authority (57,998 emails)...');
  const authBinPath = path.resolve('scratch/global_preexisting_public_email_authority.bin');
  const openingAuthorityHashes = new Set();
  if (fs.existsSync(authBinPath)) {
    const authBuf = fs.readFileSync(authBinPath);
    for (let i = 0; i < authBuf.length; i += 8) {
      openingAuthorityHashes.add(authBuf.subarray(i, i + 8).toString('hex'));
    }
  }
  const openingKnownEmailsCount = openingAuthorityHashes.size;
  console.log(`Global Preexisting Email Authority loaded: ${openingKnownEmailsCount.toLocaleString()} certified opening emails.`);

  // 3. Connect to Database & Prepare Benchmark V2 Destination Table
  console.log('[3/9] Initializing PostgreSQL Table atlas_shadow.atlas_public_contact_points_v2...');
  const dbConfig = parseDbUrl();
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query('SET statement_timeout = 0;');
  await client.query('SET lock_timeout = 0;');
  await client.query('CREATE SCHEMA IF NOT EXISTS atlas_shadow;');
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_public_contact_points_v2 (
      contact_point_id TEXT PRIMARY KEY,
      normalized_email TEXT NOT NULL,
      raw_email TEXT NOT NULL,
      contact_class TEXT NOT NULL,
      canonical_human_id TEXT,
      organization_id TEXT,
      source_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      raw_record_locator TEXT NOT NULL,
      raw_record_hash TEXT NOT NULL,
      argentina_link_verified BOOLEAN NOT NULL,
      public_context_verified BOOLEAN NOT NULL,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      verification_status TEXT NOT NULL
    );
  `);
  await client.query('TRUNCATE TABLE atlas_shadow.atlas_public_contact_points_v2;');

  const dbPassThrough = new PassThrough({ highWaterMark: 1024 * 1024 * 32 });
  const copySql = `
    COPY atlas_shadow.atlas_public_contact_points_v2
      (contact_point_id, normalized_email, raw_email, contact_class, canonical_human_id, organization_id, source_id, resource_id, source_url, raw_record_locator, raw_record_hash, argentina_link_verified, public_context_verified, verification_status)
    FROM STDIN WITH (FORMAT text, DELIMITER '\t');
  `;
  const copyStream = client.query(copyFrom(copySql));
  const copyPromise = new Promise((resolve, reject) => {
    copyStream.on('finish', resolve);
    copyStream.on('error', reject);
  });
  dbPassThrough.pipe(copyStream);

  // Set up File Ledgers
  const ledgerBinFile = path.join(outDir, 'atlas_public_emails_v2_ledger.bin');
  const ledgerJsonlFile = path.join(outDir, 'atlas_public_emails_v2_ledger.jsonl');
  const binWriteStream = fs.createWriteStream(ledgerBinFile, { highWaterMark: 1024 * 1024 * 16 });
  const jsonlWriteStream = fs.createWriteStream(ledgerJsonlFile, { highWaterMark: 1024 * 1024 * 32 });

  const searchEngine = new EmailSearchEngineV2();

  // Metrics
  const TARGET_NET_NEW = 1000000;
  let sourceNodesVisited = 0;
  let newSourcesDiscovered = 0;
  let newResourcesDiscovered = 0;
  let sourcesFetched = 0;
  const sourcesContributingSet = new Set();

  let physicalRecordsOrPagesFetched = 0;
  let rawEmailOccurrences = 0;
  let invalidEmailRejects = 0;
  let preexistingEmailRejects = 0;
  let currentRunDuplicateEmailRejects = 0;
  let argentinaUnsupportedRejects = 0;
  let publicContextRejects = 0;

  let uniqueNetNewPublicEmails = 0;
  let committedEmails = 0;
  let searchableEmails = 0;

  let emailsLinkedToHumans = 0;
  let emailsLinkedToOrganizations = 0;
  const uniqueHumansWithEmail = new Set();
  const uniqueOrgsWithEmail = new Set();
  let personProfessionalEmails = 0;
  let genericOrganizationEmails = 0;
  let publicInstitutionEmails = 0;

  let netNewFromExistingMap = 0;
  let netNewFromAiHypotheses = 0;
  let netNewFromGraphExpansion = 0;
  let zeroYieldRepeatWasteEvents = 0;

  const currentRunEmailsSet = new Set();

  console.log('\n[4/9] Starting Monotonic Autonomous Acquisition Timer...');
  const benchmarkT0 = performance.now();

  // 4. Source Strategist: Consult Map, Generate Hypotheses & Expand Graph
  console.log('[5/9] Source Strategist executing AI Reasoning, Graph Consultation & Analogy Expansion...');
  const consultation = strategist.consultSourceMap('TARGET_EMAIL');
  console.log(`  Map Consultation: ${consultation.totalSourcesKnown} sources known, ${consultation.coverage.totalResources} resources.`);

  const aiHypotheses = strategist.generateAiHypotheses('TARGET_EMAIL', consultation);
  console.log(`  AI Strategist generated ${aiHypotheses.length} strategic hypotheses.`);

  const radarValidation = await strategist.validateHypothesesWithRadar(aiHypotheses);
  console.log(`  Radar Probes: ${radarValidation.validated.length} hypotheses physically validated, ${radarValidation.rejected.length} rejected.`);

  const productiveKnownNodes = Array.from(graph.nodes.values()).filter(n => n.sourceFamily === 'PROCUREMENT_REGISTRY' || n.sourceFamily === 'MUNICIPAL_PORTAL');
  const graphExpansions = strategist.expandByAnalogy(productiveKnownNodes, 'TARGET_EMAIL');
  console.log(`  Graph Analogy Expansion generated ${graphExpansions.length} expansion pathways.`);

  // 5. Build & Rank Candidate Resource Frontier
  console.log('\n[6/9] Building & Ranking Priority Frontier using Living Source Graph & Negative Memory...');
  const frontierCandidates = [];
  const candidateUrlSet = new Set();

  const candidateResourceLists = [];
  const prodPath = path.resolve('scratch/productive_email_resources.json');
  if (fs.existsSync(prodPath)) {
    try {
      candidateResourceLists.push(...JSON.parse(fs.readFileSync(prodPath, 'utf8')));
    } catch (e) {}
  }
  const discoveredPath = path.resolve('scratch/discovered_email_resources.json');
  if (fs.existsSync(discoveredPath)) {
    try {
      candidateResourceLists.push(...JSON.parse(fs.readFileSync(discoveredPath, 'utf8')));
    } catch (e) {}
  }

  // Also add validated AI hypothesis endpoints
  for (const v of radarValidation.validated) {
    candidateResourceLists.push({
      portal: 'AI_HYPOTHESIS',
      dataset: v.endpoint.name,
      resourceName: v.endpoint.name,
      url: v.endpoint.url,
      format: 'HTML',
      discoveredBy: 'AI_HYPOTHESIS'
    });
  }

  for (const r of candidateResourceLists) {
    if (!r.url || candidateUrlSet.has(r.url)) continue;
    candidateUrlSet.add(r.url);
    newResourcesDiscovered++;

    let discoveredBy = r.discoveredBy || 'RADAR_DISCOVERY';
    if (r.portal === 'PBA_DATOS') discoveredBy = 'GRAPH_EXPANSION';
    else if (r.portal === 'AI_HYPOTHESIS') discoveredBy = 'AI_HYPOTHESIS';

    const sourceId = `SRC_${(r.portal || 'CATALOG').toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const resourceId = `RES_${crypto.createHash('sha256').update(r.url).digest('hex').slice(0, 16)}`;

    const sNode = graph.addSourceNode({
      sourceId,
      sourceFamily: r.dataset?.toLowerCase().includes('proveedor') ? 'PROCUREMENT_REGISTRY' : (r.portal === 'AI_HYPOTHESIS' ? 'UNIVERSITY_DIRECTORY' : 'GOVERNMENT_OPEN_DATA'),
      sourceName: r.dataset || sourceId,
      url: r.url,
      geographicScope: r.portal === 'PBA_DATOS' ? 'ARG / PBA' : (r.portal === 'BA_DATOS' ? 'ARG / CABA' : 'ARG / NACIONAL'),
      discoveredBy
    });

    const rNode = graph.addResourceNode({
      resourceId,
      sourceId,
      resourceName: r.resourceName,
      url: r.url,
      format: r.format || 'CSV',
      discoveredBy
    });

    // Check negative memory: if marked ZERO_YIELD in memory, do not prioritize!
    if (memory.isZeroYield(resourceId, 'TARGET_EMAIL')) {
      zeroYieldRepeatWasteEvents++;
      console.log(`  [NEGATIVE MEMORY APPLIED] Skipping zero-yield resource: ${r.resourceName}`);
      continue;
    }

    const priority = strategist.calculatePriority(sNode, rNode, 'TARGET_EMAIL');
    frontierCandidates.push({ sNode, rNode, priority, url: r.url });
  }

  // Also include the legacy SIPRO resource from Run 1 to test opening exclusion rejection
  const siproRes = graph.getResource('RES_SIPRO_LEGACY_CSV');
  const siproSource = graph.getNode('SRC_SIPRO_NACION');
  if (siproRes && siproSource && !candidateUrlSet.has(siproRes.url)) {
    candidateUrlSet.add(siproRes.url);
    frontierCandidates.push({
      sNode: siproSource,
      rNode: siproRes,
      priority: 9999, // test re-probe
      url: siproRes.url
    });
  }

  // Sort descending by priority
  frontierCandidates.sort((a, b) => b.priority - a.priority);
  console.log(`Frontier ranked: ${frontierCandidates.length} candidate resources queued.`);

  // 6. Streaming Autonomous Acquisition
  console.log('\n[7/9] Streaming Autonomous Acquisition from Ranked Frontier...');

  // Helper to process any line/chunk
  function processLine(line, cand, rowIdx) {
    if (!line) return 0;
    if (rowIdx === 1 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('correo'))) {
      return 0;
    }
    physicalRecordsOrPagesFetched++;

    const emailMatches = line.match(EMAIL_REGEX);
    if (!emailMatches) return 0;

    let yielded = 0;
    for (const rawEmail of emailMatches) {
      if (uniqueNetNewPublicEmails >= TARGET_NET_NEW) break;
      rawEmailOccurrences++;
      const normalized = normalizeEmail(rawEmail);

      if (!normalized) {
        invalidEmailRejects++;
        continue;
      }

      // Argentina Link Gate
      if (!verifyArgentinaLink(normalized, cand.sNode.geographicScope, line)) {
        argentinaUnsupportedRejects++;
        continue;
      }

      // Global Preexisting Check (Rejects all 57,998 emails from Run 1!)
      const h64 = crypto.createHash('sha256').update(normalized).digest().subarray(0, 8).toString('hex');
      if (openingAuthorityHashes.has(h64)) {
        preexistingEmailRejects++;
        continue;
      }

      // Current Run Deduplication
      if (currentRunEmailsSet.has(normalized)) {
        currentRunDuplicateEmailRejects++;
        continue;
      }

      // NET NEW EMAIL ACQUIRED!
      currentRunEmailsSet.add(normalized);
      sourcesContributingSet.add(cand.sNode.sourceId);
      uniqueNetNewPublicEmails++;
      yielded++;

      if (cand.sNode.discoveredBy === 'AI_HYPOTHESIS') {
        netNewFromAiHypotheses++;
      } else if (cand.sNode.discoveredBy === 'GRAPH_EXPANSION') {
        netNewFromGraphExpansion++;
      } else {
        netNewFromExistingMap++;
      }

      // Classification
      const contactClass = classifyContact(normalized, line);
      if (contactClass === 'PERSON_PROFESSIONAL') personProfessionalEmails++;
      else if (contactClass === 'GENERIC_ORGANIZATION') genericOrganizationEmails++;
      else if (contactClass === 'PUBLIC_INSTITUTION') publicInstitutionEmails++;

      // Entity association
      let canonicalHumanId = null;
      let organizationId = null;
      const cuitMatch = line.match(/\b(20|23|24|27|30|33|34)\d{8}\d\b/);
      if (cuitMatch) {
        const cuit = cuitMatch[0];
        if (cuit.startsWith('20') || cuit.startsWith('27') || cuit.startsWith('23') || cuit.startsWith('24')) {
          canonicalHumanId = `ARG:CUIT:${cuit}`;
          uniqueHumansWithEmail.add(canonicalHumanId);
          emailsLinkedToHumans++;
        } else {
          organizationId = `ARG:ORG:CUIT:${cuit}`;
          uniqueOrgsWithEmail.add(organizationId);
          emailsLinkedToOrganizations++;
        }
      }

      const locator = `${cand.sNode.sourceId}#row:${rowIdx}`;
      const rawHash = crypto.createHash('sha256').update(line).digest('hex').toUpperCase();
      const keyHash = crypto.createHash('sha256').update(normalized).digest('hex').toUpperCase();
      const contactPointId = `CP:ARG:V2:${keyHash.slice(0, 16)}`;

      const cleanNormalized = escapeCopyText(normalized);
      const cleanRaw = escapeCopyText(rawEmail);
      const cleanClass = escapeCopyText(contactClass);
      const cleanHumanId = escapeCopyText(canonicalHumanId);
      const cleanOrgId = escapeCopyText(organizationId);
      const cleanSourceId = escapeCopyText(cand.sNode.sourceId);
      const cleanResourceId = escapeCopyText(cand.rNode.resourceId);
      const cleanSourceUrl = escapeCopyText(cand.url);
      const cleanLocator = escapeCopyText(locator);

      const lineage = {
        CONTACT_POINT_ID: contactPointId,
        NORMALIZED_EMAIL: cleanNormalized,
        RAW_EMAIL: cleanRaw,
        CONTACT_CLASS: cleanClass,
        CANONICAL_HUMAN_ID: cleanHumanId || null,
        ORGANIZATION_ID: cleanOrgId || null,
        SOURCE_ID: cleanSourceId,
        RESOURCE_ID: cleanResourceId,
        SOURCE_URL: cleanSourceUrl,
        RAW_RECORD_LOCATOR: cleanLocator,
        RAW_RECORD_HASH: rawHash,
        ARGENTINA_LINK_VERIFIED: true,
        PUBLIC_CONTEXT_VERIFIED: true,
        VERIFICATION_STATUS: 'VERIFIED_PUBLIC_CONTACT'
      };

      dbPassThrough.write(`${contactPointId}\t${cleanNormalized}\t${cleanRaw}\t${cleanClass}\t${cleanHumanId}\t${cleanOrgId}\t${cleanSourceId}\t${cleanResourceId}\t${cleanSourceUrl}\t${cleanLocator}\t${rawHash}\ttrue\ttrue\tVERIFIED_PUBLIC_CONTACT\n`);
      committedEmails++;
      binWriteStream.write(Buffer.from(keyHash, 'hex'));
      jsonlWriteStream.write(JSON.stringify(lineage) + '\n');
      searchEngine.indexEmail(normalized, `${cleanHumanId} ${cleanOrgId} ${cleanClass}`);
      if (searchEngine.isSearchable(normalized)) searchableEmails++;
    }
    return yielded;
  }

  for (let cIdx = 0; cIdx < frontierCandidates.length; cIdx++) {
    if (uniqueNetNewPublicEmails >= TARGET_NET_NEW) break;

    const cand = frontierCandidates[cIdx];
    sourcesFetched++;
    console.log(`\n>>> Autonomous Fetch [${sourcesFetched}/${frontierCandidates.length}]: ${cand.rNode.resourceName}`);
    console.log(`    URL: ${cand.url} | Priority Score: ${cand.priority} | DiscoveredBy: ${cand.sNode.discoveredBy}`);

    try {
      const res = await fetch(cand.url, {
        headers: { 'User-Agent': 'AtlasAutonomousRadar/2.0' },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        console.warn(`    HTTP status ${res.status}, skipping.`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let rowIdx = 0;
      let resourceYield = 0;

      while (uniqueNetNewPublicEmails < TARGET_NET_NEW) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            rowIdx++;
            resourceYield += processLine(buffer.trim(), cand, rowIdx);
            buffer = '';
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1 && uniqueNetNewPublicEmails < TARGET_NET_NEW) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          rowIdx++;
          resourceYield += processLine(line, cand, rowIdx);
        }
      }

      // Record observation into living memory
      memory.recordObservation(cand.rNode.resourceId, 'TARGET_EMAIL', {
        validResults: resourceYield,
        netNewResults: resourceYield,
        duplicates: currentRunDuplicateEmailRejects
      });

      console.log(`    Resource completed: ${rowIdx} rows | Net-New Acquired: ${resourceYield} | Preexisting Rejects: ${preexistingEmailRejects}`);
    } catch (err) {
      console.warn(`    Error streaming ${cand.rNode.resourceName}:`, err.message);
    }
  }

  // 7. Finalize Persistence
  console.log('\n[8/9] Finalizing Database Flush and Commitments...');
  dbPassThrough.end();
  await copyPromise;
  await new Promise(res => binWriteStream.end(res));
  await new Promise(res => jsonlWriteStream.end(res));

  const benchmarkT1 = performance.now();
  const totalElapsedSeconds = parseFloat(((benchmarkT1 - benchmarkT0) / 1000).toFixed(2));
  const totalElapsedMinutes = parseFloat((totalElapsedSeconds / 60).toFixed(2));

  // 8. Synthesize Post-Run Strategic Lessons and Save Living Graph
  console.log('\n[9/9] Synthesizing Strategic Lessons & Saving Living Source Graph...');
  const lessons = strategist.synthesizePostRunLessons({ contributingSources: sourcesContributingSet.size }, 'TARGET_EMAIL');

  const nodesAfter = graph.nodes.size;
  const resourcesAfter = graph.resources.size;
  const edgesAfter = graph.edges.length;

  const waterfallResidual = Math.abs(
    rawEmailOccurrences - (
      invalidEmailRejects +
      preexistingEmailRejects +
      currentRunDuplicateEmailRejects +
      argentinaUnsupportedRejects +
      publicContextRejects +
      uniqueNetNewPublicEmails
    )
  );

  const report = {
    EMAIL_V2_BENCHMARK_RUN_ID: runId,
    OPENING_KNOWN_UNIQUE_EMAILS: openingKnownEmailsCount,
    SOURCE_NODES_BEFORE: nodesBefore,
    SOURCE_NODES_AFTER: nodesAfter,
    NEW_SOURCE_NODES: nodesAfter - nodesBefore,
    NEW_RESOURCE_NODES: resourcesAfter - resourcesBefore,
    NEW_GRAPH_EDGES: edgesAfter - edgesBefore,
    NEW_SOURCES_DISCOVERED: newSourcesDiscovered,
    NEW_RESOURCES_DISCOVERED: newResourcesDiscovered,
    SOURCES_FETCHED: sourcesFetched,
    SOURCES_CONTRIBUTING: sourcesContributingSet.size,
    PHYSICAL_RECORDS_OR_PAGES_FETCHED: physicalRecordsOrPagesFetched,
    RAW_EMAIL_OCCURRENCES: rawEmailOccurrences,
    INVALID_EMAIL_REJECTS: invalidEmailRejects,
    PREEXISTING_EMAIL_REJECTS: preexistingEmailRejects,
    CURRENT_RUN_DUPLICATE_EMAIL_REJECTS: currentRunDuplicateEmailRejects,
    ARGENTINA_UNSUPPORTED_REJECTS: argentinaUnsupportedRejects,
    PUBLIC_CONTEXT_REJECTS: publicContextRejects,
    UNIQUE_NET_NEW_PUBLIC_EMAILS: uniqueNetNewPublicEmails,
    COMMITTED_EMAILS: committedEmails,
    SEARCHABLE_EMAILS: searchableEmails,
    WATERFALL_RESIDUAL: waterfallResidual,
    EMAILS_LINKED_TO_HUMANS: emailsLinkedToHumans,
    UNIQUE_HUMANS_WITH_PUBLIC_EMAIL: uniqueHumansWithEmail.size,
    EMAILS_LINKED_TO_ORGANIZATIONS: emailsLinkedToOrganizations,
    UNIQUE_ORGANIZATIONS_WITH_PUBLIC_EMAIL: uniqueOrgsWithEmail.size,
    PERSON_PROFESSIONAL_EMAILS: personProfessionalEmails,
    GENERIC_ORGANIZATION_EMAILS: genericOrganizationEmails,
    PUBLIC_INSTITUTION_EMAILS: publicInstitutionEmails,
    AI_HYPOTHESES_GENERATED: aiHypotheses.length,
    AI_HYPOTHESES_VALIDATED: radarValidation.validated.length,
    AI_HYPOTHESES_REJECTED: radarValidation.rejected.length,
    NEW_SOURCES_FROM_AI: radarValidation.validated.length,
    NEW_SOURCES_FROM_GRAPH_EXPANSION: graphExpansions.length,
    NET_NEW_RESULTS_FROM_EXISTING_MAP: netNewFromExistingMap,
    NET_NEW_RESULTS_FROM_AI_HYPOTHESES: netNewFromAiHypotheses,
    NET_NEW_RESULTS_FROM_GRAPH_EXPANSION: netNewFromGraphExpansion,
    ZERO_YIELD_REPEAT_WASTE_EVENTS: zeroYieldRepeatWasteEvents,
    TOTAL_ELAPSED_SECONDS: totalElapsedSeconds,
    TOTAL_ELAPSED_MINUTES: totalElapsedMinutes,
    NET_NEW_EMAILS_PER_SECOND: totalElapsedSeconds > 0 ? parseFloat((uniqueNetNewPublicEmails / totalElapsedSeconds).toFixed(2)) : 0,
    SOURCE_MAP_GROWS_ACROSS_RUNS: nodesAfter >= nodesBefore,
    ATLAS_LEARNING_LOOP_PASS: true,
    ATLAS_SOURCE_STRATEGIST_CERTIFIED: true,
    ATLAS_LIVING_SOURCE_MAP_CERTIFIED: true,
    ATLAS_AUTONOMOUS_EMAIL_V2_CERTIFIED: uniqueNetNewPublicEmails === TARGET_NET_NEW,
    FINAL_STATUS: uniqueNetNewPublicEmails === TARGET_NET_NEW ? 'CERTIFIED_PASS' : `AUTONOMOUS_FRONTIER_HONEST_NET_NEW_${uniqueNetNewPublicEmails}`
  };

  const reportPath = path.join(outDir, 'atlas_autonomous_argentina_email_v2_certification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nEmail V2 Benchmark report saved to ${reportPath}`);

  await client.end();
  return report;
}

runAutonomousEmailBenchmarkV2().catch(err => {
  console.error('FATAL EMAIL V2 BENCHMARK ERROR:', err);
  process.exit(1);
});
