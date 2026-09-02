/**
 * bootstrapNormalizer.ts — Normalización, Validación Crítica y Scoring de Calidad
 */

import type { RawDiscoveredItem, AtlasEnrichedItem } from './bootstrapTypes';

export function normalizeAndScoreItem(raw: RawDiscoveredItem): AtlasEnrichedItem | null {
  // 1. Validación estricta de ID canónico (0 malformed IDs)
  const id = raw.providerContentId?.trim();
  if (!id || id.length < 2 || id.includes('[object') || id.includes('undefined') || id.includes('null')) {
    return null;
  }

  // 2. Validación de título
  const title = (raw.title || '').trim();
  if (title.length < 2) {
    return null;
  }

  // 3. Validación de URL canónica
  const canonicalUrl = (raw.canonicalUrl || '').trim();
  if (!canonicalUrl.startsWith('http')) {
    return null;
  }

  // 4. Verificación de Metadata Crítica Obligatoria
  const hasCriticalMetadata = Boolean(
    raw.provider &&
    id &&
    title &&
    canonicalUrl &&
    raw.provenance &&
    raw.provenance.discoveryOrigin
  );

  // 5. Cálculo de completitud de metadata (0 a 100)
  let completeness = 40; // Base por tener campos críticos
  if (raw.description && raw.description.length > 20) completeness += 20;
  if (raw.creatorName && raw.creatorName.length > 2) completeness += 10;
  if (raw.durationSeconds > 0) completeness += 10;
  if (raw.publishedAt) completeness += 10;
  if (raw.thumbnailUrl && raw.thumbnailUrl.startsWith('http')) completeness += 10;

  // 6. Cálculo de Quality Score técnico
  let quality = 50;
  if (raw.embeddable) quality += 15;
  if (raw.durationSeconds >= 60 && raw.durationSeconds <= 7200) quality += 15; // Formato audiovisual estándar
  if (completeness >= 80) quality += 10;
  if (raw.creatorName) quality += 5;
  if (raw.language === 'es' || raw.language === 'pt') quality += 5;

  const isQualityScorePass = quality >= 60;
  const isEmbeddablePass = raw.embeddable === true;
  const isTechnicallyUsable = raw.durationSeconds > 0 && title.length >= 3 && canonicalUrl.startsWith('http');
  const isQualityReady = isQualityScorePass && isEmbeddablePass && isTechnicallyUsable;

  const contentState = isQualityReady ? 'quality_ready' : 'discovered';

  return {
    ...raw,
    title,
    canonicalUrl,
    hasCriticalMetadata,
    isQualityScorePass,
    isEmbeddablePass,
    isTechnicallyUsable,
    isQualityReady,
    contentState,
    metadataCompleteness: Math.min(100, completeness),
    qualityScore: Math.min(100, quality),
    enrichedAt: new Date().toISOString()
  };
}
