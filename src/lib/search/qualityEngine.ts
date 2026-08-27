import type { ContentItem } from './types';

export function calculateQualityScore(items: ContentItem[]): ContentItem[] {
  return items.map(v => {
    let score = 50; // Base score
    
    // Verificaciones y fiabilidad del creador
    if (v.isVerified) score += 25;
    if (v.badge) score += 15; // e.g. "RECITAL COMPLETO"
    
    // Confiabilidad de la fuente
    if (v.provider === 'youtube') score += 5;
    if (v.provider === 'youapp') score += 15; // Contenido interno
    
    // Metadatos ricos
    if (v.description && v.description.length > 50) score += 5;
    if (v.durationSeconds && v.durationSeconds > 180) score += 5; // Favorecer contenido no tan corto (ej. > 3 min)
    
    // Tope
    if (score > 100) score = 100;
    
    return {
      ...v,
      qualityScore: score
    };
  });
}
