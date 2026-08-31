import type { ContentItem } from './types';

export function calculateQualityScore(items: ContentItem[]): ContentItem[] {
  return items.map(v => {
    let score = 50; // Base metadata score
    
    // Proveedores premium aportan un piso de calidad implícito
    if (v.provider === 'youtube' || v.provider === 'vimeo') score += 10;
    
    // Verificaciones y fiabilidad del creador
    if (v.isVerified) score += 25;
    if (v.badge) score += 15; // e.g. "RECITAL COMPLETO"
    
    // Metadatos ricos
    if (v.description && v.description.length > 50) score += 5;
    if (v.durationSeconds && v.durationSeconds > 180) score += 5; // > 3 min
    
    // Tope de Quality Score antes de penalizaciones
    if (score > 100) score = 100;
    
    // Separamos Source Confidence
    let sConfidence = 0.5; // Base
    if (v.provider === 'youtube') sConfidence = 0.8;
    if (v.provider === 'youapp') sConfidence = 0.95; // Contenido curado o interno
    if (v.isVerified) sConfidence += 0.1;
    if (sConfidence > 1) sConfidence = 1.0;
    
    // SPAM RISK SCORE
    let spamRiskScore = 0;
    const descLower = (v.description || '').toLowerCase();
    
    if (descLower.includes('canal robado') || descLower.includes('hackeado')) spamRiskScore += 40;
    if (descLower.includes('nuevo canal oficial')) spamRiskScore += 30;
    if (descLower.includes('telegram') || descLower.includes('whatsapp') || descLower.includes('inversión')) spamRiskScore += 20;
    
    // Penalización por Spam
    if (spamRiskScore >= 90) {
      score = 0; // Rechazo
      sConfidence = 0;
    } else if (spamRiskScore >= 60) {
      score = Math.max(0, score - 50); // Penalización fuerte
      sConfidence = Math.max(0, sConfidence - 0.5);
    }
    
    // TODO: A futuro añadir valueRate, savedRate, programmedRate, momentRate, clickbaitPenalty
    
    return {
      ...v,
      qualityScore: score,
      sourceConfidence: sConfidence,
      qualityVersion: 'quality-v2'
    };
  });
}
