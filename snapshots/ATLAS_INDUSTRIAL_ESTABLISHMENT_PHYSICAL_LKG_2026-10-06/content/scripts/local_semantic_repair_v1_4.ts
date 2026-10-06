import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import fs from 'fs';
import path from 'path';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2.js';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate.js';
import { analyzeQuery } from '../src/lib/search/intentDetector.js';

const envPaths = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '.env.local')];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.replace(/\\n/gm, '\n');
        }
        value = value.replace(/(^['"]|['"]$)/g, '').trim();
        process.env[key] = value;
      }
    }
  }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const queries = [
  "fito paez",
  "los redondos",
  "carlos gardel por una cabeza",
  "los fabulosos cadillacs matador",
  "charly garcia no se va a llamar mi amor",
  "queen the march of the black queen",
  "spinetta crisantemo",
  "cerati avenida alcorta",
  "los redondos perro cristiano",
  "david bowie the laughing gnome",
  "andres calamaro el novio del olvido",
  "radiohead the butcher",
  "soda stereo texturas",
  "nirvana beeswax",
  "fito paez polaroid de locura ordinaria",
  "charly garcia asesiname",
  "fito paez brillante sobre el mic",
  "charly garcia rezo por vos mtv unplugged",
  "queen radio ga ga live aid",
  "the beatles don't let me down rooftop",
  "gustavo cerati corazon delator sinfonico",
  "los redondos recital",
  "charly garcia ferro",
  "nirvana paramount",
  "rolling stones copacabana",
  "spinetta teatro colon",
  "los redondos racing",
  "fito paez velez",
  "charly garcia nos siguen pegando abajo ferro",
  "queen documental",
  "spinetta entrevista",
  "the beatles making of",
  "lionel messi documental",
  "charly garcia asina",
  "rolin estons copacabana"
];

interface InspectionResult {
  assetId: string;
  provider: string;
  providerContentId: string;
  title: string;
  creatorName: string;
  confidence: number;
  evidence: {
    entity: { source: string; signal: string; confidence: number }[];
    work: { source: string; signal: string; confidence: number }[];
    constraints: { source: string; type: string; signal: string; confidence: number }[];
  };
}

async function run() {
  console.log('--- LOCAL SEMANTIC REPAIR V1.4 — PHASE 1 ---');
  let verified = 0, possible = 0, notFound = 0;
  let totalInspected = 0, totalPlausible = 0;

  for (const q of queries) {
    console.log(`\nQUERY\n${q}`);
    const intentData = analyzeQuery(q);
    const detection = exactWorkSearchGate.detectExactWork(q, intentData);
    const resolvedIntent = exactWorkSearchGate.toResolvedIntent(detection, 'QUERY_RESOLVER');
    const gates = exactWorkSearchGate.buildMandatoryGates(detection, resolvedIntent);

    console.log(`\nTARGET`);
    console.log(`entity: ${gates.entity?.canonicalName || 'none'}`);
    console.log(`work: ${gates.object?.canonicalValue || 'none'}`);

    const searchTerms: string[] = [];
    if (gates.entity) {
      searchTerms.push(gates.entity.canonicalName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    } else if (gates.explicitName) {
      searchTerms.push(gates.explicitName.normalizedPhrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    } else {
      searchTerms.push(q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    }

    let candidates: any[] = [];
    for (const term of searchTerms) {
      const { data, error } = await supabase
        .from('youapp_index')
        .select('id, provider, provider_content_id, title, description, creator_name, tags, created_at')
        .ilike('title', `%${term}%`)
        .limit(1000);
      
      if (error) console.error(`Error querying title for ${term}:`, error);
      if (!error && data) candidates.push(...data);
      
      const { data: dataDesc, error: errDesc } = await supabase
        .from('youapp_index')
        .select('id, provider, provider_content_id, title, description, creator_name, tags, created_at')
        .ilike('description', `%${term}%`)
        .limit(1000);

      if (errDesc) console.error(`Error querying description for ${term}:`, errDesc);
      if (!errDesc && dataDesc) candidates.push(...dataDesc);
      
      const { data: dataCreator, error: errCreator } = await supabase
        .from('youapp_index')
        .select('id, provider, provider_content_id, title, description, creator_name, tags, created_at')
        .ilike('creator_name', `%${term}%`)
        .limit(100);

      if (errCreator) console.error(`Error querying creator_name for ${term}:`, errCreator);
      if (!errCreator && dataCreator) candidates.push(...dataCreator);
    }

    const uniqueMap = new Map();
    for (const c of candidates) {
      if (!uniqueMap.has(c.id)) {
        uniqueMap.set(c.id, c);
      }
    }
    const uniqueCandidates = Array.from(uniqueMap.values());
    totalInspected += uniqueCandidates.length;

    console.log(`\nLOCAL SEARCH`);
    console.log(`assetsInspected: ${uniqueCandidates.length}`);

    let bestCandidate: InspectionResult | null = null;
    let plausibleCount = 0;
    
    for (const c of uniqueCandidates) {
      // Evidence Extraction
      const textsToInspect = [
        { source: 'title', text: c.title || '' },
        { source: 'creator_name', text: c.creator_name || '' },
        { source: 'description', text: c.description || '' },
        { source: 'tags', text: (c.tags || []).join(' ') }
      ];

      let entityFound = false;
      let workFound = false;
      let bestEntityConf = 0;
      let bestWorkConf = 0;
      let entityEvidence: any[] = [];
      let workEvidence: any[] = [];

      const targetEntity = gates.entity?.canonicalName?.toLowerCase();
      const targetWork = gates.object?.canonicalValue?.toLowerCase();

      for (const { source, text } of textsToInspect) {
        if (!text) continue;
        
        const textLower = text.toLowerCase();
        const textNorm = textLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Check Entity
        if (targetEntity) {
          const targetNorm = targetEntity.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (textNorm.includes(targetNorm)) {
            entityFound = true;
            bestEntityConf = 100;
            entityEvidence.push({ source, signal: targetEntity, confidence: 100 });
          }
        } else if (gates.explicitName) {
           const en = gates.explicitName.normalizedPhrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
           if (textNorm.includes(en)) {
              entityFound = true;
              bestEntityConf = 100;
              entityEvidence.push({ source, signal: gates.explicitName.normalizedPhrase, confidence: 100 });
           }
        } else {
           entityFound = true; // No entity required
        }

        // Check Work
        if (targetWork) {
          const targetNorm = targetWork.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (textNorm.includes(targetNorm)) {
            workFound = true;
            bestWorkConf = 100;
            workEvidence.push({ source, signal: targetWork, confidence: 100 });
          }
        } else {
           workFound = true; // No work required
        }
      }

      // Check Constraints (e.g. Venue, Live, etc)
      let constraintsPassed = true;
      let constraintEvidence: any[] = [];
      for (const ct of gates.constraints || []) {
        const ctNorm = ct.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const titleNorm = (c.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const descNorm = (c.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (titleNorm.includes(ctNorm)) {
          constraintEvidence.push({ source: 'title', type: ct.type, signal: ct.value, confidence: 100 });
        } else if (descNorm.includes(ctNorm)) {
          constraintEvidence.push({ source: 'description', type: ct.type, signal: ct.value, confidence: 90 });
        } else {
          constraintsPassed = false;
        }
      }

      const passed = entityFound && workFound && constraintsPassed;

      if (passed || entityFound) {
        plausibleCount++;
      }

      if (passed) {
        const conf = (bestEntityConf + bestWorkConf) / (targetWork ? 2 : 1);
        if (!bestCandidate || conf > bestCandidate.confidence) {
          bestCandidate = {
            assetId: c.id,
            provider: c.provider,
            providerContentId: c.provider_content_id,
            title: c.title,
            creatorName: c.creator_name,
            confidence: conf || 100,
            evidence: {
              entity: entityEvidence,
              work: workEvidence,
              constraints: constraintEvidence
            }
          };
        }
      }
    }

    totalPlausible += plausibleCount;
    console.log(`plausibleAssets: ${plausibleCount}`);

    if (bestCandidate) {
      verified++;
      console.log(`\nBEST CANDIDATE`);
      console.log(`assetId: ${bestCandidate.assetId}`);
      console.log(`provider: ${bestCandidate.provider}`);
      console.log(`providerId: ${bestCandidate.providerContentId}`);
      console.log(`title: ${bestCandidate.title}`);
      console.log(`creator_name: ${bestCandidate.creatorName}`);
      
      console.log(`\nEVIDENCE`);
      console.log(`Entity:`);
      for (const e of bestCandidate.evidence.entity) {
        console.log(`  ${e.source} "${e.signal}" ${(e.confidence / 100).toFixed(2)}`);
      }
      
      if (bestCandidate.evidence.work.length > 0) {
        console.log(`\nWork:`);
        for (const w of bestCandidate.evidence.work) {
           console.log(`  ${w.source} "${w.signal}" ${(w.confidence / 100).toFixed(2)}`);
        }
      }

      if (bestCandidate.evidence.constraints.length > 0) {
        console.log(`\nConstraints:`);
        for (const ct of bestCandidate.evidence.constraints) {
           console.log(`  ${ct.source} [${ct.type}] "${ct.signal}" ${(ct.confidence / 100).toFixed(2)}`);
        }
      }

      console.log(`\nCURRENT STATE`);
      console.log(`entity structured: missing`);
      console.log(`work structured: missing`);

      console.log(`\nPROPOSED STATE`);
      console.log(`semanticEntity: ${gates.entity?.canonicalName || 'none'}`);
      console.log(`semanticWork: ${gates.object?.canonicalValue || 'none'}`);
      console.log(`confidence: ${(bestCandidate.confidence / 100).toFixed(2)}`);

      console.log(`\nCLASSIFICATION`);
      console.log(`VERIFIED_LOCAL_REPAIRABLE`);
    } else {
      if (plausibleCount > 0) {
        possible++;
        console.log(`\nCLASSIFICATION\nPOSSIBLE_LOCAL_REPAIRABLE`);
      } else {
        notFound++;
        console.log(`\nCLASSIFICATION\nNOT_LOCALLY_REPAIRABLE`);
      }
    }
    console.log(`DB_WRITES: 0`);
    console.log(`--------------------------------------------------`);
  }

  console.log(`\nLOCAL SEMANTIC REPAIR V1.4 — PHASE 1`);
  console.log(`Input queries                         ${queries.length}`);
  console.log(`Verified Local Repairable             ${verified}`);
  console.log(`Possible Local Repairable             ${possible}`);
  console.log(`Not Locally Repairable                ${notFound}`);
  console.log(`---------------------------------------`);
  console.log(`TOTAL                                 ${queries.length}`);
  console.log(`Assets inspected                      ${totalInspected}`);
  console.log(`High confidence proposals             ${verified}`);
  console.log(`Database writes                       0`);
  console.log(`New assets inserted                   0`);
  console.log(`External discovery calls              0`);
  console.log(`Search.list                           0`);
  console.log(`RadarExternal                         0`);
}

run().catch(console.error);
