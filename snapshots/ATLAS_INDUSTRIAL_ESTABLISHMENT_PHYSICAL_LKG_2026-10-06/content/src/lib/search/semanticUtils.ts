export type SemanticIdType = 'work' | 'entity' | 'venue';

/**
 * Normalizes a string into a semantic ID for a specific namespace.
 * It is idempotent: normalizeSemanticId(normalizeSemanticId(x, 'work'), 'work') === normalizeSemanticId(x, 'work')
 * It is namespace-safe: "work_foo" won't collide with "entity_foo".
 */
export function normalizeSemanticId(id: string, type: SemanticIdType): string {
  if (!id) return '';
  
  // 1. Convert to lowercase and clean up spaces/symbols
  let normalized = id.toLowerCase().replace(/[,;:.()\-]/g, ' ').trim().replace(/\s+/g, '_');
  
  // 2. Remove any existing prefix for any type to ensure clean slate (idempotency and preventing work_entity_foo)
  normalized = normalized.replace(/^(work_|entity_|venue_)+/, '');
  
  // 3. Re-apply the correct namespace prefix
  return `${type}_${normalized}`;
}
