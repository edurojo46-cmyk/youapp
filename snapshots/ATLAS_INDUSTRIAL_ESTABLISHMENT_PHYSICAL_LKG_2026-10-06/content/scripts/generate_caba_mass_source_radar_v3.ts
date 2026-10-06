import dotenv from 'dotenv';
dotenv.config();
import { SourceCapabilityRegistry, RegisteredSource } from '../src/lib/search/SourceCapabilityRegistry';

interface RadarV3Item {
  priority: number;
  source_id: string;
  source_name: string;
  domain: string;
  raw_observed: number;
  unique_persons: number;
  strong_ids: string;
  caba_evidence: string;
  overlap_rate: number;
  projected_net_new: number;
  requests_required: number;
  external_cost: string;
  temporal_quality: string;
  authority_level: string;
  observed_score: number;
  ready_to_harvest: 'YES' | 'NO' | 'RESOLVER_PIPELINE' | 'BLOCKED' | 'LIVE_QUERY_ONLY';
  notes: string;
}

function generateRadarV3() {
  console.log('=== GENERATING ATLAS PEOPLE — CABA MASS SOURCE RADAR V3 ===\n');

  const items: RadarV3Item[] = [
    {
      priority: 1,
      source_id: 'OPENALEX_CABA',
      source_name: 'OpenAlex Academic & Medical Graph (CABA Anchor Institutions)',
      domain: 'api.openalex.org',
      raw_observed: 44052,
      unique_persons: 44052,
      strong_ids: 'ORCID (76.0%), OpenAlex Author ID, ROR Institution ID',
      caba_evidence: 'last_known_institutions.id en UBA, Hosp. Italiano, UTN, Hosp. Clínicas, UCA, Di Tella, Favaloro, Leloir',
      overlap_rate: 0.08,
      projected_net_new: 38200, // Across the 44k CABA pool
      requests_required: 880, // ~880 paginated requests (per_page=50) in polite pool
      external_cost: '$0.00',
      temporal_quality: 'HIGH (Works fechados hasta 2025-2026, counts_by_year en cada autor)',
      authority_level: 'ACADEMIC_PRIMARY',
      observed_score: 5472.0, // (38200 * 0.9 * 1.0) / 6 (fetch:2 + parse:2 + verify:1 + maint:1)
      ready_to_harvest: 'YES',
      notes: 'FUENTE #1 MASIVA INDISCUTIBLE: API REST abierta gratuita, polite pool de 10 req/s, 76% ORCID, permite salto de miles a decenas de miles sin scraping.'
    },
    {
      priority: 2,
      source_id: 'CONICET_RESOLUTION_ENGINE',
      source_name: 'Resolución de Autores CONICET Existentes (9.491 autores en Atlas)',
      domain: 'ri.conicet.gov.ar + openalex.org',
      raw_observed: 9491,
      unique_persons: 9491,
      strong_ids: 'ORCID (80.0% en muestra), Handle CONICET, Scopus ID',
      caba_evidence: 'Filiación territorial a institutos CONICET CABA / CCT Buenos Aires y UBA',
      overlap_rate: 1.0, // Ya están en Atlas como autores no resueltos
      projected_net_new: 3796, // Net-new con afiliación CABA verificada y promovibles a personas resueltas
      requests_required: 190, // Queries por lotes / búsqueda
      external_cost: '$0.00',
      temporal_quality: 'VERY HIGH (90% con publicaciones activas 2023-2026)',
      authority_level: 'GOVERNMENT_PRIMARY',
      observed_score: 759.2, // (3796 * 1.0 * 1.0) / 5
      ready_to_harvest: 'RESOLVER_PIPELINE',
      notes: 'Transforma evidencia preexistente en Atlas en ~3.800 personas físicas resueltas con ORCID y afiliación CABA certificada.'
    },
    {
      priority: 3,
      source_id: 'WIKIDATA_NON_ARGENTINE_CABA',
      source_name: 'Wikidata CABA — Residentes y Trabajadores Extranjeros en CABA',
      domain: 'wikidata.org',
      raw_observed: 301,
      unique_persons: 301,
      strong_ids: 'WIKIDATA_QID, VIAF, ISNI, ORCID',
      caba_evidence: 'wdt:P937 (trabajo en CABA) o wdt:P551 (residencia CABA) con nacionalidad extranjera',
      overlap_rate: 0.02,
      projected_net_new: 295,
      requests_required: 1, // 1 sola petición SPARQL (LIMIT 500)
      external_cost: '$0.00',
      temporal_quality: 'MEDIUM (requiere clasificación temporal HISTORICAL vs STALE_UNKNOWN)',
      authority_level: 'COMMUNITY_SECONDARY',
      observed_score: 36.9, // (295 * 0.75 * 1.0) / 6
      ready_to_harvest: 'YES',
      notes: 'Expansión de alta calidad para no limitar Atlas a ciudadanía argentina; extranjeros con actividad o residencia verificada en CABA.'
    },
    {
      priority: 4,
      source_id: 'CROSSREF_METADATA_API',
      source_name: 'Crossref Metadata API (Motor de Resolución y Evidencia Temporal)',
      domain: 'api.crossref.org',
      raw_observed: 150000000,
      unique_persons: 0, // No enumerable por CABA en bulk
      strong_ids: 'DOI, ORCID, ROR',
      caba_evidence: 'Afiliación textual en metadata de artículos científicos',
      overlap_rate: 0.0,
      projected_net_new: 0, // Fuente complementaria de resolución, no de descubrimiento masivo primario
      requests_required: 0,
      external_cost: '$0.00',
      temporal_quality: 'VERY HIGH (fechas exactas de publicación con DOI)',
      authority_level: 'AGGREGATOR',
      observed_score: 0.0,
      ready_to_harvest: 'LIVE_QUERY_ONLY',
      notes: 'Excelente como motor de Entity Resolution y fechado temporal de candidatos; no apta para enumeración masiva directa de CABA.'
    },
    {
      priority: 5,
      source_id: 'UBA_RDI_REPOSITORIO',
      source_name: 'UBA Repositorio Digital Institucional (SISBI / Facultades)',
      domain: 'sisbi.uba.ar',
      raw_observed: 59000,
      unique_persons: 0,
      strong_ids: 'ORCID, Handle UBA',
      caba_evidence: 'Tesis de posgrado, directores y jurados de facultades UBA',
      overlap_rate: 0.20,
      projected_net_new: 0,
      requests_required: 0,
      external_cost: '$0.00',
      temporal_quality: 'HIGH',
      authority_level: 'ACADEMIC_PRIMARY',
      observed_score: 0.0,
      ready_to_harvest: 'BLOCKED',
      notes: 'Portal principal SISBI protegido por desafío Cloudflare ("Un momento..."). Zero bypass: clasificado como BLOCKED. Exactas y Filo requieren adaptadores OAI/DSpace individuales.'
    },
    {
      priority: 6,
      source_id: 'SISA_REFEPS_SALUD_CABA',
      source_name: 'SISA REFEPS — Registro Federal de Profesionales de Salud',
      domain: 'sisa.msal.gov.ar',
      raw_observed: 120000,
      unique_persons: 0,
      strong_ids: 'Matrícula Nacional/Provincial, DNI',
      caba_evidence: 'Ejercicio profesional en establecimientos de salud CABA',
      overlap_rate: 0.15,
      projected_net_new: 0,
      requests_required: 0,
      external_cost: '$0.00',
      temporal_quality: 'VERY HIGH',
      authority_level: 'GOVERNMENT_PRIMARY',
      observed_score: 0.0,
      ready_to_harvest: 'LIVE_QUERY_ONLY',
      notes: 'Buscador ciudadano es público unitario; Web Services nominales masivos requieren usuario y clave ministerial. BULK_INDEX_FULL = DENIED. Zero bypass.'
    }
  ];

  console.table(items.map(i => ({
    Pri: i.priority,
    Fuente: i.source_name.slice(0, 32),
    Obs: i.raw_observed,
    Net_New: i.projected_net_new,
    Strong_IDs: i.strong_ids.slice(0, 20),
    Overlap: `${(i.overlap_rate * 100).toFixed(0)}%`,
    Score: i.observed_score,
    Costo: i.external_cost,
    Ready: i.ready_to_harvest
  })));

  return items;
}

generateRadarV3();
