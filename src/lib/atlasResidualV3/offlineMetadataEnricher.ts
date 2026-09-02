/**
 * offlineMetadataEnricher.ts — Enriquecedor Offline de Metadatos y Desambiguación para Atlas V3
 */

import type { EnrichedMetadataRecord } from './typesV3';

export class OfflineMetadataEnricher {
  private knownEntityAliases: Map<string, string> = new Map([
    ['fito', 'Fito Paez'],
    ['charly', 'Charly Garcia'],
    ['spinetta', 'Luis Alberto Spinetta'],
    ['mercedes', 'Mercedes Sosa'],
    ['cerati', 'Gustavo Cerati'],
    ['cadillacs', 'Los Fabulosos Cadillacs'],
    ['abuelos', 'Los Abuelos de la Nada'],
    ['enanitos', 'Enanitos Verdes'],
    ['decadentes', 'Los Autenticos Decadentes']
  ]);

  private persistentCache: Map<string, EnrichedMetadataRecord> = new Map();

  enrichRawAsset(contentId: string, rawTitle: string): EnrichedMetadataRecord {
    const existing = this.persistentCache.get(contentId);
    if (existing) return existing;

    const lower = rawTitle.toLowerCase();
    
    // Extracción canónica de entidad
    const entities: string[] = [];
    let canonicalEntity = 'Artista Desconocido';
    for (const [alias, full] of this.knownEntityAliases) {
      if (lower.includes(alias)) {
        canonicalEntity = full;
        entities.push(full);
        break;
      }
    }

    // Extracción de año / era
    const yearMatch = lower.match(/19\d{2}|20\d{2}/);
    const year = yearMatch ? yearMatch[0] : undefined;

    // Extracción de contexto de programa o evento
    let program: string | undefined;
    let contentType: EnrichedMetadataRecord['contentType'] = 'generic';

    if (lower.includes('badia')) {
      program = 'Badia y Cia';
      contentType = 'interview';
    } else if (lower.includes('atc')) {
      program = 'ATC Argentina Televisora Color';
      contentType = 'interview';
    } else if (lower.includes('estudio')) {
      program = 'Sesion de Estudio';
      contentType = 'music_video';
    } else if (lower.includes('estadio') || lower.includes('recital') || lower.includes('vivo')) {
      program = 'Concierto en Vivo';
      contentType = 'concert';
    }

    const canonicalWork = `${canonicalEntity} ${program || 'Audiovisual Archive'} ${year || ''}`.trim();
    const canonicalTitle = `${canonicalEntity} — ${program || 'Registro Audiovisual'} (${year || 'Histórico'})`;
    
    const semanticTags = [
      canonicalEntity.toLowerCase(),
      program?.toLowerCase() || 'archivo',
      year || 'historico',
      contentType
    ].filter(Boolean);

    const record: EnrichedMetadataRecord = {
      contentId,
      rawTitle,
      canonicalTitle,
      entities: entities.length > 0 ? entities : [canonicalEntity],
      works: [canonicalWork],
      year,
      program,
      contentType,
      semanticTags,
      metadataConfidence: 0.94,
      enrichmentVersion: 'v3_shadow_1',
      enrichedAt: new Date().toISOString()
    };

    // Almacenar en caché y preparar para persistencia en base de datos Atlas
    this.persistentCache.set(contentId, record);
    return record;
  }

  getEnrichedRecord(contentId: string): EnrichedMetadataRecord | undefined {
    return this.persistentCache.get(contentId);
  }

  canRecoverMetadataGap(metadataCompleteness: number): boolean {
    return metadataCompleteness < 0.60;
  }
}

export const offlineMetadataEnricher = new OfflineMetadataEnricher();
