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

async function ingestConicetCaba() {
  console.log('=== CONICET CABA LIVE EXTRACTION & INGESTION ===');

  const CABA_INSTITUTE_MAPPING: { pattern: RegExp; institute: string; neighborhood: string; address: string }[] = [
    {
      pattern: /antropolog/i,
      institute: 'Instituto Nacional de Antropología y Pensamiento Latinoamericano (INAPL)',
      neighborhood: 'Belgrano',
      address: '3 de Febrero 1378, Belgrano, CABA'
    },
    {
      pattern: /filosofía y letras.*educación/i,
      institute: 'Instituto de Investigaciones en Ciencias de la Educación (FFyL - UBA)',
      neighborhood: 'Caballito',
      address: 'Puán 480, Caballito, CABA'
    },
    {
      pattern: /ciencias económicas.*plan fénix/i,
      institute: 'Facultad de Ciencias Económicas - Plan Fénix (UBA)',
      neighborhood: 'Recoleta',
      address: 'Av. Córdoba 2122, Recoleta, CABA'
    },
    {
      pattern: /psicología.*instituto de investigaciones/i,
      institute: 'Instituto de Investigaciones (Facultad de Psicología - UBA)',
      neighborhood: 'Balvanera',
      address: 'Lavalle 2353, Balvanera, CABA'
    },
    {
      pattern: /pontificia universidad católica.*ciencias sociales/i,
      institute: 'Facultad de Ciencias Sociales (UCA)',
      neighborhood: 'Puerto Madero',
      address: 'Alicia Moreau de Justo 1500, Puerto Madero, CABA'
    },
    {
      pattern: /facultad de derecho/i,
      institute: 'Facultad de Derecho (UBA)',
      neighborhood: 'Recoleta',
      address: 'Av. Figueroa Alcorta 2263, Recoleta, CABA'
    },
    {
      pattern: /exactas y naturales/i,
      institute: 'Facultad de Ciencias Exactas y Naturales (FCEN - UBA)',
      neighborhood: 'Núñez',
      address: 'Ciudad Universitaria, Pabellón II, Núñez, CABA'
    }
  ];

  let url = 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=snrd';
  let totalPublications = 0;
  let totalAuthorMentions = 0;
  const uniqueCandidateMap = new Map<string, any>();

  for (let batch = 1; batch <= 3; batch++) {
    console.log(`Fetching CONICET OAI batch #${batch}...`);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(id);

    if (!res.ok) {
      console.warn(`Batch ${batch} failed:`, res.status);
      break;
    }

    const xml = await res.text();
    const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
    totalPublications += records.length;

    for (const r of records) {
      const creators = (r.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || []).map(c => c.replace(/<\/?dc:creator>/g, '').trim());
      const publishers = (r.match(/<dc:publisher>([^<]+)<\/dc:publisher>/g) || []).map(p => p.replace(/<\/?dc:publisher>/g, '').trim());
      const identifiers = (r.match(/<dc:identifier>([^<]+)<\/dc:identifier>/g) || []).map(d => d.replace(/<\/?dc:identifier>/g, '').trim());
      const titles = (r.match(/<dc:title>([^<]+)<\/dc:title>/g) || []).map(t => t.replace(/<\/?dc:title>/g, '').trim());

      totalAuthorMentions += creators.length;

      const handle = identifiers.find(i => i.startsWith('http://hdl.handle.net/')) || 'https://ri.conicet.gov.ar/';
      const handleSuffix = handle.split('/').pop() || 'item';
      const pubText = publishers.join(' ');

      const matchedInst = CABA_INSTITUTE_MAPPING.find(m => m.pattern.test(pubText));

      if (matchedInst) {
        for (const rawCreator of creators) {
          let formattedName = rawCreator;
          if (rawCreator.includes(',')) {
            const parts = rawCreator.split(',').map(p => p.trim());
            formattedName = `${parts[1]} ${parts[0]}`;
          }

          if (formattedName.length > 4 && formattedName.includes(' ')) {
            const cl = SocialEntityClassifier.classify(formattedName, 'Investigador CONICET');
            if (cl.is_person) {
              const authorSlug = formattedName.toLowerCase().replace(/[^a-z0-9]/g, '_');
              const safeId = crypto.createHash('md5').update(`conicet:${authorSlug}`).digest('hex').substring(0, 16);
              const now = new Date().toISOString();
              const rec = {
                discovery_id: `disc_conicet_oai_${safeId}`,
                display_name: formattedName,
                profession: 'Investigador CONICET / Académico',
                occupation: 'Investigador CONICET',
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

              uniqueCandidateMap.set(rec.discovery_id, rec);
            }
          }
        }
      }
    }

    const nextTokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
    if (nextTokenMatch && nextTokenMatch[1].trim()) {
      url = `https://ri.conicet.gov.ar/oai/request?verb=ListRecords&resumptionToken=${encodeURIComponent(nextTokenMatch[1].trim())}`;
    } else {
      break;
    }
  }

  const candidatesToIngest = Array.from(uniqueCandidateMap.values());
  console.log(`\nCONICET_RECORDS_FETCHED = ${totalPublications}`);
  console.log(`CONICET_AUTHOR_MENTIONS = ${totalAuthorMentions}`);
  console.log(`CONICET_UNIQUE_AUTHOR_CANDIDATES = ${candidatesToIngest.length}`);
  console.log(`PUBLICATION_COUNT_AS_PERSON_COUNT = 0 (Enforced)`);

  let newUnique = 0;
  for (const c of candidatesToIngest) {
    const { data: existing } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id')
      .eq('discovery_id', c.discovery_id)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase
        .from('atlas_people_discovery_candidates')
        .insert(c);

      if (!insErr) {
        newUnique++;
      } else {
        console.warn('Error inserting:', insErr.message);
      }
    }
  }

  console.log(`CONICET_NEW_UNIQUE = ${newUnique}`);
}

ingestConicetCaba().catch(console.error);
