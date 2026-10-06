/**
 * ATLAS INDUCTION ENGINE V1 — FEATURE FLAGS & CONFIGURATION
 * 
 * All feature flags default to false to guarantee that the frozen
 * legacy execution path remains 100% selectable.
 */

export const DEFAULT_INDUCTION_FLAGS = {
  ATLAS_INDUCTION_ENGINE: false,
  ATLAS_ADAPTIVE_BATCH: false,
  ATLAS_BATCH_PREFETCH: false,
  ATLAS_SATURATION_CONTROL: false,
  ATLAS_SERVER_BATCH_RPC: false,
  ATLAS_SINGLE_RESOLVE_RPC: false
};

export function getInductionConfig(overrides = {}) {
  return {
    ATLAS_INDUCTION_ENGINE: overrides.ATLAS_INDUCTION_ENGINE ?? (process.env.ATLAS_INDUCTION_ENGINE === 'true'),
    ATLAS_ADAPTIVE_BATCH: overrides.ATLAS_ADAPTIVE_BATCH ?? (process.env.ATLAS_ADAPTIVE_BATCH === 'true'),
    ATLAS_BATCH_PREFETCH: overrides.ATLAS_BATCH_PREFETCH ?? (process.env.ATLAS_BATCH_PREFETCH === 'true'),
    ATLAS_SATURATION_CONTROL: overrides.ATLAS_SATURATION_CONTROL ?? (process.env.ATLAS_SATURATION_CONTROL === 'true'),
    ATLAS_SERVER_BATCH_RPC: overrides.ATLAS_SERVER_BATCH_RPC ?? (process.env.ATLAS_SERVER_BATCH_RPC === 'true'),
    ATLAS_SINGLE_RESOLVE_RPC: overrides.ATLAS_SINGLE_RESOLVE_RPC ?? (process.env.ATLAS_SINGLE_RESOLVE_RPC === 'true'),
    
    // Core engine parameters
    WORKERS: 2,
    INITIAL_BATCH_SIZE: 2000,
    CANDIDATE_BATCH_SIZES: [1500, 1750, 2000, 2250, 2500, 2750, 3000],
    PREFETCH_DEPTH: parseInt(process.env.ATLAS_PREFETCH_DEPTH || '2', 10),
    HIGH_WATERMARK_OUTBOX: parseInt(process.env.ATLAS_HIGH_WATERMARK_OUTBOX || '50000', 10)
  };
}
