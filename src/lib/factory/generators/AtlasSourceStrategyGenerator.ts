/**
 * ATLAS SOURCE STRATEGY GENERATOR V1
 * 
 * Suggests potential public and official source families for the domain.
 * 
 * Strict Invariant (Correction 3):
 * - SOURCE_CANDIDATE != CERTIFIED_SOURCE
 * - All proposed sources start strictly in status 'SOURCE_CANDIDATE'.
 * - None is declared valid until passing physical governance gates.
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { SourceCandidateSpec, GovernancePolicySpec } from '../contracts/AtlasDomainSpecification';

export class AtlasSourceStrategyGenerator {
  public static generateGovernancePolicy(): GovernancePolicySpec {
    return {
      access_gate: { required: true, allowed_schemes: ['https', 'http'] },
      license_gate: { required: true, commercial_reuse_mandated: true, public_domain_acceptable: true },
      privacy_gate: { required: true, allow_private_individuals: false, allow_residential_addresses: false },
      purpose_gate: { required: true, allowed_purposes: ['B2B_SEARCH', 'COMMERCIAL_DIRECTORY', 'INDUSTRIAL_SOURCING'] },
      commercial_reuse_gate: { required: true, require_explicit_commercial_authorization: false }
    };
  }

  public static generateCandidateSources(intent: ParsedDomainIntent): SourceCandidateSpec[] {
    const candidates: SourceCandidateSpec[] = [];

    if (intent.entity_type === 'COMPANY' || intent.entity_type === 'SUPPLIER') {
      candidates.push(
        {
          source_id: 'SIPRO_PROVEEDORES_NACIONALES',
          source_name: 'Sistema de Proveedores de la Nación (SIPRO / COMPR.AR)',
          source_url: 'https://comprar.gob.ar/sipro/proveedores-habilitados',
          source_family: 'OFFICIAL_REGISTRY',
          openness_tier: 'OPEN_API',
          initial_status: 'SOURCE_CANDIDATE',
          scale_estimate: 35000,
          depth_estimate: 140000,
          governance_checks: {}
        },
        {
          source_id: 'DIRECTORIO_INDUSTRIAL_PBA',
          source_name: 'Registro Industrial Único de la Provincia de Buenos Aires',
          source_url: 'https://gba.gob.ar/produccion/directorio_industrial',
          source_family: 'OPEN_GOVERNMENT',
          openness_tier: 'BULK_DATASET',
          initial_status: 'SOURCE_CANDIDATE',
          scale_estimate: 22000,
          depth_estimate: 88000,
          governance_checks: {}
        },
        {
          source_id: 'ARCA_AFIP_PADRON_ACTIVIDADES',
          source_name: 'Agencia de Recaudación y Control Aduanero (ARCA/AFIP) - Padrón Público de Actividades',
          source_url: 'https://serviciosweb.afip.gob.ar/genericos/consultapadron',
          source_family: 'OFFICIAL_REGISTRY',
          openness_tier: 'TABLE_SCRAPE',
          initial_status: 'SOURCE_CANDIDATE',
          scale_estimate: 80000,
          depth_estimate: 160000,
          governance_checks: {}
        },
        {
          source_id: 'INTI_EMPRESAS_CERTIFICADAS',
          source_name: 'Instituto Nacional de Tecnología Industrial - Nómina de Certificaciones de Calidad',
          source_url: 'https://inti.gob.ar/certificaciones/catalogo_empresas',
          source_family: 'PRIMARY_GOVERNMENT_DOC',
          openness_tier: 'OPEN_API',
          initial_status: 'SOURCE_CANDIDATE',
          scale_estimate: 8500,
          depth_estimate: 42500,
          governance_checks: {}
        },
        {
          source_id: 'ADIMRA_CATALOGO_METALMECANICA',
          source_name: 'Asociación de Industriales Metalúrgicos (ADIMRA) - Red de Proveedores de Petróleo y Gas',
          source_url: 'https://adimra.org.ar/proveedores-energia',
          source_family: 'SECTOR_ASSOCIATION',
          openness_tier: 'BULK_DATASET',
          initial_status: 'SOURCE_CANDIDATE',
          scale_estimate: 4200,
          depth_estimate: 21000,
          governance_checks: {}
        }
      );
    }

    return candidates;
  }
}
