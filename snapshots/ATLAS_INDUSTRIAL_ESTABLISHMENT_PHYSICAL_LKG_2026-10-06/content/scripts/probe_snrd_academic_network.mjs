/**
 * scripts/probe_snrd_academic_network.mjs
 * 
 * Probes the Argentine National Network of Digital Repositories (SNRD)
 * to discover live, reachable, TLS-valid OAI-PMH endpoints and measure novelty.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

const universityEndpoints = [
  { id: 'SRC_OAI_UNLP_SEDICI', name: 'UNLP SEDICI', url: 'https://sedici.unlp.edu.ar/oai/request', estPersons: 120000 },
  { id: 'SRC_OAI_CONICET', name: 'CONICET Digital', url: 'https://ri.conicet.gov.ar/oai/request', estPersons: 145000 },
  { id: 'SRC_OAI_UNC_RDU', name: 'UNC Córdoba RDU', url: 'https://rdu.unc.edu.ar/server/oai/request', estPersons: 70000 },
  { id: 'SRC_OAI_INTA', name: 'INTA Digital', url: 'https://repositorio.inta.gob.ar/oai/request', estPersons: 40000 },
  { id: 'SRC_OAI_UNL_LITORAL', name: 'UNL Litoral', url: 'https://bibliotecavirtual.unl.edu.ar/oai/request', estPersons: 55000 },
  { id: 'SRC_OAI_UNMDP_NULAN', name: 'UNMDP Nulan', url: 'https://nulan.mdp.edu.ar/cgi/oai2', estPersons: 28000 },
  { id: 'SRC_OAI_UNGS', name: 'UNGS Sarmiento', url: 'https://repositorio.ungs.edu.ar/oai/request', estPersons: 18000 },
  { id: 'SRC_OAI_UNS', name: 'UNS Bahía Blanca', url: 'https://repositoriodigital.uns.edu.ar/oai/request', estPersons: 35000 },
  { id: 'SRC_OAI_UBA_EXACTAS', name: 'UBA Exactas', url: 'https://bibliotecadigital.exactas.uba.ar/oai/request', estPersons: 25000 },
  { id: 'SRC_OAI_UBA_AGRO', name: 'UBA Agronomía', url: 'https://riag.agro.uba.ar/oai/request', estPersons: 15000 },
  { id: 'SRC_OAI_UNQ', name: 'UNQ Quilmes RIDAA', url: 'https://ridaa.unq.edu.ar/oai/request', estPersons: 20000 },
  { id: 'SRC_OAI_UNLA', name: 'UNLa Lanús', url: 'https://repositorio.unla.edu.ar/oai/request', estPersons: 12000 },
  { id: 'SRC_OAI_UNLAM', name: 'UNLaM La Matanza', url: 'https://repositoriocyt.unlam.edu.ar/oai/request', estPersons: 14000 },
  { id: 'SRC_OAI_UNICEN', name: 'UNICEN Tandil RIDCA', url: 'https://ridca.unicen.edu.ar/oai/request', estPersons: 18000 },
  { id: 'SRC_OAI_UNNOBA', name: 'UNNOBA Repositorio', url: 'https://repositorio.unnoba.edu.ar/oai/request', estPersons: 10000 },
  { id: 'SRC_OAI_UNRN', name: 'UNRN Río Negro RID', url: 'https://rid.unrn.edu.ar/oai/request', estPersons: 12000 },
  { id: 'SRC_OAI_UNPSJB', name: 'UNPSJB Patagonia', url: 'https://repositorio.unpsjb.edu.ar/oai/request', estPersons: 10000 },
  { id: 'SRC_OAI_UNLPAM', name: 'UNLPam La Pampa', url: 'https://repo.unlpam.edu.ar/oai/request', estPersons: 12000 },
  { id: 'SRC_OAI_UNSL', name: 'UNSL San Luis', url: 'https://nuevaeditorial.unsl.edu.ar/oai/request', estPersons: 10000 },
  { id: 'SRC_OAI_UNRC', name: 'UNRC Río Cuarto', url: 'https://unrc.edu.ar/oai/request', estPersons: 15000 },
  { id: 'SRC_OAI_UNER', name: 'UNER Entre Ríos', url: 'https://cienciaabierta.uner.edu.ar/oai/request', estPersons: 16000 },
  { id: 'SRC_OAI_UNAM', name: 'UNAM Misiones', url: 'https://unam.edu.ar/oai/request', estPersons: 14000 },
  { id: 'SRC_OAI_UNSA', name: 'UNSa Salta', url: 'https://rdu.unsa.edu.ar/oai/request', estPersons: 16000 },
  { id: 'SRC_OAI_UNLAR', name: 'UNLaR La Rioja', url: 'https://repositorio.unlar.edu.ar/oai/request', estPersons: 8000 },
  { id: 'SRC_OAI_UNSJ', name: 'UNSJ San Juan', url: 'https://repositorio.unsj.edu.ar/oai/request', estPersons: 14000 },
  { id: 'SRC_OAI_CNEA', name: 'CNEA Comisión Energía Atómica', url: 'https://repositorio.cnea.gob.ar/oai/request', estPersons: 15000 },
  { id: 'SRC_OAI_INA', name: 'INA Instituto Nacional del Agua', url: 'https://ina.gob.ar/oai/request', estPersons: 6000 },
  { id: 'SRC_OAI_SEGEMAR', name: 'SEGEMAR Geología y Minería', url: 'https://repositorio.segemar.gov.ar/oai/request', estPersons: 8000 }
];

async function probeOaiEndpoint(ep) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const identifyUrl = `${ep.url}?verb=Identify`;
    const resId = await fetch(identifyUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AtlasRadarProbe/3.0' }
    });
    clearTimeout(t);
    if (!resId.ok) return { ...ep, livePass: false, status: resId.status };

    // ListRecords
    const listUrl = `${ep.url}?verb=ListRecords&metadataPrefix=oai_dc`;
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 6000);
    const resList = await fetch(listUrl, {
      signal: ctrl2.signal,
      headers: { 'User-Agent': 'AtlasRadarProbe/3.0' }
    });
    clearTimeout(t2);
    if (!resList.ok) return { ...ep, livePass: false, status: resList.status };

    const xml = await resList.text();
    const creators = [...xml.matchAll(/<dc:creator>([^<]+)<\/dc:creator>/gi)].map(m => m[1].trim());
    let netNew = 0;
    for (const c of creators) {
      const norm = normalizeName(c);
      if (norm && !authority.has(norm)) netNew++;
    }
    const noveltyRatio = creators.length > 0 ? parseFloat((netNew / creators.length).toFixed(4)) : 0;
    const lowerBound = Math.round(ep.estPersons * noveltyRatio * 0.85);

    return {
      ...ep,
      livePass: true,
      status: 200,
      tlsValid: true,
      creatorsSampled: creators.length,
      netNewSampled: netNew,
      noveltyRatio,
      lowerBound
    };
  } catch (err) {
    clearTimeout(t);
    return { ...ep, livePass: false, error: err.message };
  }
}

async function main() {
  console.log(`Probing ${universityEndpoints.length} academic and research repositories...`);
  const results = await Promise.all(universityEndpoints.map(probeOaiEndpoint));

  const valid = results.filter(r => r.livePass && r.lowerBound > 0);
  console.log(`\nValid Live Academic Repositories: ${valid.length} / ${universityEndpoints.length}`);

  let totalAcademicLowerBound = 0;
  for (const v of valid) {
    totalAcademicLowerBound += v.lowerBound;
    console.log(`✓ [${v.name}] Sample: ${v.creatorsSampled} | Novelty: ${(v.noveltyRatio * 100).toFixed(1)}% | Lower Bound: ${v.lowerBound.toLocaleString()}`);
  }

  console.log(`\nTOTAL VALIDATED ACADEMIC LOWER BOUND: ${totalAcademicLowerBound.toLocaleString()}`);

  fs.writeFileSync('scratch/snrd_academic_probe_results.json', JSON.stringify({
    TIMESTAMP: new Date().toISOString(),
    TOTAL_VALIDATED: valid.length,
    TOTAL_LOWER_BOUND: totalAcademicLowerBound,
    RESULTS: valid
  }, null, 2), 'utf8');
}

main().catch(console.error);
