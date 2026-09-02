/**
 * graphGapDiscovery.ts — Descubrimiento Proactivo de Lagunas en el Grafo de Conocimiento (Discovery AI V2)
 */

import type { GraphGap } from './typesV2';
import type { DiscoveryRequest } from '../types';

export class GraphGapDiscoveryEngine {
  private knownEntities = [
    { name: 'Luis Alberto Spinetta', category: 'music' as const, weakEra: '1980-1987', missingTypes: ['entrevista_tv_archivo', 'concierto_completo'] },
    { name: 'Charly Garcia', category: 'music' as const, weakEra: '1975-1982', missingTypes: ['ensayo_estudio', 'recital_teatro'] },
    { name: 'Mercedes Sosa', category: 'music' as const, weakEra: '1970-1979', missingTypes: ['concierto_exterior', 'sesion_radio'] },
    { name: 'Fito Paez', category: 'music' as const, weakEra: '1984-1990', missingTypes: ['acustico_en_vivo', 'entrevista_badia'] },
    { name: 'Astor Piazzolla', category: 'music' as const, weakEra: '1973-1978', missingTypes: ['concierto_paris', 'master_consola'] },
    { name: 'Jorge Luis Borges', category: 'culture' as const, weakEra: '1975-1985', missingTypes: ['conferencia_completa', 'debate_televisivo'] },
    { name: 'Diego Maradona', category: 'documentary' as const, weakEra: '1978-1984', missingTypes: ['entrevista_argentinos_juniors', 'primeros_goles_archivo'] },
    { name: 'Elis Regina', category: 'music' as const, weakEra: '1965-1974', missingTypes: ['especial_tv_record', 'ensayo_ao_vivo'] }
  ];

  findProactiveGraphGaps(): GraphGap[] {
    return this.knownEntities.map(e => ({
      entityId: `entity_${e.name.toLowerCase().replace(/\s+/g, '_')}`,
      entityName: e.name,
      category: e.category,
      weakEra: e.weakEra,
      missingWorkTypes: e.missingTypes,
      urgencyScore: 0.85,
      proactiveSuggestedKeywords: [
        `${e.name} ${e.weakEra}`,
        `${e.name} ${e.missingTypes[0].replace(/_/g, ' ')}`,
        `${e.name} archivo inedito`
      ]
    }));
  }

  convertToDiscoveryRequest(gap: GraphGap): DiscoveryRequest {
    const primaryKw = gap.proactiveSuggestedKeywords[0] || gap.entityName;
    return {
      query: primaryKw,
      entities: [gap.entityName],
      works: gap.missingWorkTypes,
      coverageScore: 0.20, // Brecha detectada proactivamente en el grafo
      qualityScore: 0.90,
      relevanceQualifiedCount: 2,
      gaps: [
        {
          type: 'LOW_COVERAGE',
          severity: 0.80,
          details: `Proactive Graph Gap: Entity ${gap.entityName} has missing assets for era ${gap.weakEra || 'historical'}`
        }
      ]
    };
  }
}

export const graphGapDiscovery = new GraphGapDiscoveryEngine();
