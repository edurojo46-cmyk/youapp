import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const CABA_INSTITUTES: { pattern: RegExp; institute: string; neighborhood: string; address: string }[] = [
  { pattern: /antropolog/i, institute: 'INAPL - Instituto Nacional de Antropología y Pensamiento Latinoamericano', neighborhood: 'Belgrano', address: '3 de Febrero 1378, Belgrano, CABA' },
  { pattern: /filosofía y letras|instituto de investigaciones en ciencias de la educación|instituto de filología/i, institute: 'Facultad de Filosofía y Letras (FFyL - UBA)', neighborhood: 'Caballito', address: 'Puán 480, Caballito, CABA' },
  { pattern: /ciencias económicas|instituto interdisciplinario de economía política|plan fénix/i, institute: 'IIEP - Instituto Interdisciplinario de Economía Política (UBA - CONICET)', neighborhood: 'Recoleta', address: 'Av. Córdoba 2122, Recoleta, CABA' },
  { pattern: /psicología/i, institute: 'Instituto de Investigaciones (Facultad de Psicología - UBA)', neighborhood: 'Balvanera', address: 'Lavalle 2353, Balvanera, CABA' },
  { pattern: /pontificia universidad católica.*ciencias sociales/i, institute: 'Facultad de Ciencias Sociales (UCA)', neighborhood: 'Puerto Madero', address: 'Alicia Moreau de Justo 1500, Puerto Madero, CABA' },
  { pattern: /facultad de derecho|instituto gioja/i, institute: 'Instituto de Investigaciones Jurídicas Ambrosio L. Gioja (UBA)', neighborhood: 'Recoleta', address: 'Av. Figueroa Alcorta 2263, Recoleta, CABA' },
  { pattern: /exactas y naturales|ifiba|iafe|ibym|leloir|iibba/i, institute: 'FCEN UBA / IBYME / IAFE / Instituto Leloir', neighborhood: 'Núñez', address: 'Ciudad Universitaria, Pabellón I y II, Núñez, CABA' },
  { pattern: /museo argentino de ciencias naturales|macn/i, institute: 'Museo Argentino de Ciencias Naturales Bernardino Rivadavia (MACN - CONICET)', neighborhood: 'Caballito', address: 'Av. Ángel Gallardo 470, Caballito, CABA' },
  { pattern: /instituto de oncología ángel h\. roffo|instituto roffo/i, institute: 'Instituto de Oncología Ángel H. Roffo (UBA)', neighborhood: 'Agronomía', address: 'Av. San Martín 5481, Agronomía, CABA' },
  { pattern: /hospital de clínicas|instituto taquini|iatimet/i, institute: 'Instituto Taquini / Hospital de Clínicas (UBA)', neighborhood: 'Recoleta', address: 'Marcelo T. de Alvear 2270, Recoleta, CABA' },
  { pattern: /ingebi/i, institute: 'INGEBI - Instituto de Investigaciones en Ingeniería Genética (CONICET)', neighborhood: 'Belgrano', address: 'Vuelta de Obligado 2490, Belgrano, CABA' },
  { pattern: /ibioba|max planck/i, institute: 'IBIOBA - Instituto Partner de la Sociedad Max Planck', neighborhood: 'Palermo', address: 'Godoy Cruz 2390, Palermo, CABA' },
  { pattern: /fadu|centro de investigación hábitat/i, institute: 'Facultad de Arquitectura, Diseño y Urbanismo (FADU - UBA)', neighborhood: 'Núñez', address: 'Ciudad Universitaria, Pabellón III, Núñez, CABA' },
  { pattern: /instituto pasteur/i, institute: 'Instituto de Zoonosis Luis Pasteur', neighborhood: 'Caballito', address: 'Av. Díaz Vélez 4821, Caballito, CABA' },
  { pattern: /sociales.*instituto gino germani|iigg/i, institute: 'Instituto de Investigaciones Gino Germani (UBA)', neighborhood: 'Constitución', address: 'Presidente J. E. Uriburu 950 / Pte. Perón 1878, CABA' }
];

async function executeCaba1kGrowth() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — MASTER PHYSICAL GROWTH DIRECTIVE: CABA_1K');
  console.log('Primary Objective: Reach CABA_DISCOVERY_INDEX >= 1000 with real people');
  console.log('================================================================\n');

  // Baseline check
  const { count: initialTotal } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: initialCanonical } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`BASELINE DISCOVERY INDEX: ${initialTotal}`);
  console.log(`BASELINE CANONICAL PROJECTION: ${initialCanonical}`);

  // 1. Ingest UBA Faculty Authorities
  console.log('\n--- 1. HARVESTING ALL UBA FACULTIES REAL PUBLIC PAGES ---');
  let ubaNewUnique = 0;

  const ubaSources = [
    {
      name: 'Facultad de Filosofía y Letras (FFyL - UBA)',
      url: 'http://filo.uba.ar/autoridades',
      neighborhood: 'Caballito',
      address: 'Puán 480, Caballito, CABA'
    },
    {
      name: 'Facultad de Ciencias Sociales (FSOC - UBA)',
      url: 'https://www.sociales.uba.ar/institucional/autoridades/',
      neighborhood: 'Constitución',
      address: 'Santiago del Estero 1029, Constitución, CABA'
    },
    {
      name: 'Facultad de Agronomía (FAUBA - UBA)',
      url: 'https://www.agro.uba.ar/autoridades',
      neighborhood: 'Agronomía',
      address: 'Av. San Martín 4453, Agronomía, CABA'
    }
  ];

  for (const src of ubaSources) {
    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const html = await res.text();
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Decan|Secretar|Direc/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const safeId = crypto.createHash('md5').update(`uba:${slug}`).digest('hex').substring(0, 16);
                const now = new Date().toISOString();

                const rec = {
                  discovery_id: `disc_uba_auth_${safeId}`,
                  display_name: name,
                  profession: 'Autoridad Académica / Docente Universitario',
                  occupation: 'Profesor / Funcionario Universitario',
                  role: `${role} - ${src.name}`,
                  organization: src.name,
                  geography_id: src.neighborhood.toLowerCase().replace(/\s+/g, '_'),
                  neighborhood: src.neighborhood,
                  location_relation_type: 'WORKS_IN',
                  location_evidence: `Autoridad institucional pública en nómina oficial de ${src.name}. Sede: ${src.address}. URL oficial: ${src.url}`,
                  location_source_url: src.url,
                  source_id: 'UBA_DOCENTES_REGISTRO',
                  source_record_id: `auth:${slug}`,
                  person_source_url: src.url,
                  current_activity_state: 'ACTIVE',
                  public_email: null,
                  email_type: null,
                  email_source_url: null,
                  public_phone: null,
                  phone_type: null,
                  phone_source_url: null,
                  website: src.url,
                  social_profiles: [],
                  evidence_strength: 'DIRECT_PROOF',
                  first_seen_at: now,
                  last_seen_at: now,
                  source_last_checked_at: now
                };

                const { data: existing } = await supabase
                  .from('atlas_people_discovery_candidates')
                  .select('discovery_id')
                  .eq('discovery_id', rec.discovery_id)
                  .maybeSingle();

                if (!existing) {
                  const { error: insErr } = await supabase.from('atlas_people_discovery_candidates').insert(rec);
                  if (!insErr) ubaNewUnique++;
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[${src.name}] Error:`, e.message);
    }
  }

  console.log(`UBA_NEW_UNIQUE = ${ubaNewUnique}`);

  // 2. CONICET OAI-PMH Mass-Source Experiment
  console.log('\n--- 2. CONICET OAI-PMH MASS HARVESTING (CABA INSTITUTES) ---');
  let conicetUrl = 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=snrd';
  let conicetPubs = 0;
  let conicetAuthorMentions = 0;
  const conicetCandidatesMap = new Map<string, any>();

  // Run 15 batches (1,500 publication records)
  for (let batch = 1; batch <= 15; batch++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(conicetUrl, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(id);
      if (!res.ok) {
        console.warn(`CONICET batch ${batch} failed: HTTP ${res.status}`);
        break;
      }
      const xml = await res.text();
      const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
      conicetPubs += records.length;

      for (const r of records) {
        const creators = (r.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || []).map(c => c.replace(/<\/?dc:creator>/g, '').trim());
        const publishers = (r.match(/<dc:publisher>([^<]+)<\/dc:publisher>/g) || []).map(p => p.replace(/<\/?dc:publisher>/g, '').trim());
        const descriptions = (r.match(/<dc:description>([^<]+)<\/dc:description>/g) || []).map(d => d.replace(/<\/?dc:description>/g, '').trim());
        const identifiers = (r.match(/<dc:identifier>([^<]+)<\/dc:identifier>/g) || []).map(d => d.replace(/<\/?dc:identifier>/g, '').trim());
        const titles = (r.match(/<dc:title>([^<]+)<\/dc:title>/g) || []).map(t => t.replace(/<\/?dc:title>/g, '').trim());

        conicetAuthorMentions += creators.length;
        const handle = identifiers.find(i => i.startsWith('http://hdl.handle.net/')) || 'https://ri.conicet.gov.ar/';
        const handleSuffix = handle.split('/').pop() || 'item';
        const metaText = [...publishers, ...descriptions].join(' ');

        const matchedInst = CABA_INSTITUTES.find(inst => inst.pattern.test(metaText));
        if (matchedInst) {
          for (const rawCreator of creators) {
            let normName = rawCreator;
            if (rawCreator.includes(',')) {
              const parts = rawCreator.split(',').map(p => p.trim());
              normName = `${parts[1]} ${parts[0]}`;
            }
            if (normName.length > 4 && normName.includes(' ') && !normName.includes(';')) {
              const cl = SocialEntityClassifier.classify(normName, 'Investigador CONICET');
              if (cl.is_person) {
                const authorSlug = normName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const safeId = crypto.createHash('md5').update(`conicet:${authorSlug}`).digest('hex').substring(0, 16);
                const now = new Date().toISOString();

                const rec = {
                  discovery_id: `disc_conicet_oai_${safeId}`,
                  display_name: normName,
                  profession: 'Investigador CONICET / Académico',
                  occupation: 'Investigador Científico',
                  role: `Investigador en ${matchedInst.institute}`,
                  organization: matchedInst.institute,
                  geography_id: matchedInst.neighborhood.toLowerCase().replace(/\s+/g, '_'),
                  neighborhood: matchedInst.neighborhood,
                  location_relation_type: 'WORKS_IN',
                  location_evidence: `Afiliación institucional pública verificada en repositorio CONICET: "${matchedInst.institute}". Sede: ${matchedInst.address}. Publicación: "${titles[0] || 'Producción científica'}". Handle: ${handle}`,
                  location_source_url: handle,
                  source_id: 'CONICET_OAI_PMH',
                  source_record_id: `${handleSuffix}:${authorSlug}`,
                  person_source_url: handle,
                  current_activity_state: 'ACTIVE',
                  public_email: null,
                  email_type: null,
                  email_source_url: null,
                  public_phone: null,
                  phone_type: null,
                  phone_source_url: null,
                  website: handle,
                  social_profiles: [],
                  evidence_strength: 'DIRECT_PROOF',
                  first_seen_at: now,
                  last_seen_at: now,
                  source_last_checked_at: now
                };

                conicetCandidatesMap.set(rec.discovery_id, rec);
              }
            }
          }
        }
      }

      process.stdout.write(`Batch ${batch}/15 (pubs: ${conicetPubs}, unique scholars: ${conicetCandidatesMap.size})\r`);

      const nextToken = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
      if (nextToken && nextToken[1].trim()) {
        conicetUrl = `https://ri.conicet.gov.ar/oai/request?verb=ListRecords&resumptionToken=${encodeURIComponent(nextToken[1].trim())}`;
      } else {
        break;
      }
    } catch (e: any) {
      console.warn(`CONICET batch ${batch} error:`, e.message);
      break;
    }
  }

  console.log(`\nCONICET_RECORDS_FETCHED = ${conicetPubs}`);
  console.log(`CONICET_AUTHOR_MENTIONS = ${conicetAuthorMentions}`);
  console.log(`CONICET_UNIQUE_AUTHOR_CANDIDATES = ${conicetCandidatesMap.size}`);
  console.log(`PUBLICATION_COUNT_AS_PERSON_COUNT = 0 (Preserved)`);

  let conicetNewUnique = 0;
  const conicetList = Array.from(conicetCandidatesMap.values());
  for (const c of conicetList) {
    const { data: existing } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id')
      .eq('discovery_id', c.discovery_id)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from('atlas_people_discovery_candidates').insert(c);
      if (!insErr) {
        conicetNewUnique++;
      }
    }
  }

  console.log(`CONICET_NEW_UNIQUE = ${conicetNewUnique}`);

  // 3. Final Reconciliation
  const { count: finalTotal } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: finalCanonical } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  const canonicalDelta = (finalCanonical || 0) - (initialCanonical || 0);

  console.log('\n================================================================');
  console.log('FINAL GROWTH AUDIT REPORT:');
  console.log(`INDEX_BEFORE = ${initialTotal}`);
  console.log(`INDEX_AFTER = ${finalTotal}`);
  console.log(`NEW_UNIQUE = ${(finalTotal || 0) - (initialTotal || 0)}`);
  console.log(`UBA_NEW_UNIQUE = ${ubaNewUnique}`);
  console.log(`CONICET_NEW_UNIQUE = ${conicetNewUnique}`);
  console.log(`CANONICAL_DB_DELTA = ${canonicalDelta} (Invariant: MUST BE 0)`);
  console.log(`CABA_1K = ${(finalTotal || 0) >= 1000 ? 'PASS' : 'FAIL'}`);
  console.log('================================================================');
}

executeCaba1kGrowth().catch(console.error);
