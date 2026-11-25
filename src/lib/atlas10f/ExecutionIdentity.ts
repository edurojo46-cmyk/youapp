import { createHash } from 'crypto';
import { AtlasExecutionRequest } from './types';

/**
 * Computes a deterministic canonical string for a destination reference 
 * ignoring Object property order.
 */
function serializeDestinationRef(dest: any): string {
  if (!dest || typeof dest !== 'object') return String(dest);
  
  // Sort keys to ensure stable serialization regardless of JS object property order
  const sortedKeys = Object.keys(dest).sort();
  const serializedParts = sortedKeys.map(key => `${key}:${dest[key]}`);
  return serializedParts.join('|');
}

/**
 * Derives a strict Idempotency Key based on immutable canonical properties.
 * 
 * Required semantics:
 * same logical action + same certification + same destination => same logical execution identity
 * 
 * We explicitly EXCLUDE:
 * - requested_at
 * - evaluation_time
 * - retry count or timestamps
 * 
 * Because retries must resolve to the same execution identity.
 */
export function computeLogicalExecutionIdentity(req: AtlasExecutionRequest): string {
  const payload = [
    req.tenant_id,
    req.action_type,
    req.message_certification_id,
    req.certification_snapshot_hash,
    serializeDestinationRef(req.destination_ref),
    req.subject_id
  ].join('||');

  return createHash('sha256').update(payload).digest('hex');
}
