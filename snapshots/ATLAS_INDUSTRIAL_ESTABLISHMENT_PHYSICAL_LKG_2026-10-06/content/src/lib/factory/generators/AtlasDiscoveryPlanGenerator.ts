/**
 * ATLAS DISCOVERY PLAN GENERATOR V1
 * 
 * Generates tailored operational discovery instructions for the 5 Penta Radar strategies:
 * 1. EXPLORER: New industrial registries, sector portals, business directories.
 * 2. DEEP_MINER: Drilling down into /catalogo, /proveedores, /descargas.
 * 3. PROTOCOL_HUNTER: Identifying open APIs, CKAN datasets, CSV endpoints.
 * 4. REPLICATOR: Replicating across industrial hubs (PBA, Santa Fe, Córdoba, Mendoza, Neuquén).
 * 5. UNLOCKER: Legitimate open routes for authoritative locked registries.
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { DiscoveryPlanSpec } from '../contracts/AtlasDomainSpecification';

export class AtlasDiscoveryPlanGenerator {
  public static generateDiscoveryPlan(intent: ParsedDomainIntent): DiscoveryPlanSpec {
    return {
      explorer_targets: [
        'https://comprar.gob.ar/sipro',
        'https://gba.gob.ar/produccion/directorio_industrial',
        'https://adimra.org.ar/proveedores',
        'https://santafe.gob.ar/directorio-empresas',
        'https://cordobaproduce.cba.gov.ar/industrias'
      ],
      deep_miner_targets: [
        '/descargas/padron_proveedores.csv',
        '/datos/catalogo_empresas.json',
        '/api/v1/industrias/habilitadas',
        '/sitemap_empresas.xml'
      ],
      protocol_hunter_endpoints: [
        'https://datos.gob.ar/api/3/action/package_search?q=proveedores',
        'https://data.buenosaires.gob.ar/api/datasets?q=empresas',
        'https://datos.santafe.gob.ar/api/3/action/package_show?id=registro-industrial'
      ],
      replicator_dimensions: [
        'Buenos Aires',
        'Santa Fe',
        'Córdoba',
        'Mendoza',
        'Neuquén',
        'Entre Ríos'
      ],
      unlocker_strategies: [
        'Seek open provincial gazettes and official decrees for public registry extracts',
        'Utilize official open data portals as alternatives to protected search forms'
      ]
    };
  }
}
