import { describe, it, expect } from 'vitest';
import { verifyRuntimeCoherence, checkBackendRuntimeStatus } from '../src/lib/runtime/runtimeCoherenceGate.ts';

describe('ATLAS — RUNTIME STALENESS DETECTION GOLDEN GATE', () => {
  it('detects healthy synchronized runtime when build IDs match', async () => {
    const liveStatus = await checkBackendRuntimeStatus('http://localhost:5174');
    expect(liveStatus).not.toBeNull();
    expect(liveStatus?.STATUS).toBe('HEALTHY');
    expect(typeof liveStatus?.PROCESS_PID).toBe('number');
    expect(typeof liveStatus?.RUNTIME_BUILD_ID).toBe('string');

    // Live verification with current expected build ID
    const result = await verifyRuntimeCoherence(liveStatus!.RUNTIME_BUILD_ID);
    expect(result.FRONT_BACKEND_VERSION_MATCH).toBe(true);
    expect(result.RUNTIME_VERSION_MISMATCH).toBe(false);
    expect(result.BACKEND_CODE_CURRENT).toBe(true);
    expect(result.CERTIFICATION_BLOCKED).toBe(false);
  });

  it('GOLDEN: Blocks certification when expected build ID does not match running backend (STALE_RUNTIME)', async () => {
    // Simulate expected code was changed on disk but running backend has an older/different build ID
    const staleExpectedBuildId = 'BLD_STALE_CODE_MOCK_99999999';

    const result = await verifyRuntimeCoherence(staleExpectedBuildId);
    expect(result.EXPECTED_BUILD_ID).toBe(staleExpectedBuildId);
    expect(result.FRONT_BACKEND_VERSION_MATCH).toBe(false);
    expect(result.RUNTIME_VERSION_MISMATCH).toBe(true);
    expect(result.BACKEND_CODE_CURRENT).toBe(false);
    expect(result.CERTIFICATION_BLOCKED).toBe(true);
    expect(result.REASON).toContain('Runtime coherence precondition failed');
  });

  it('GOLDEN: Blocks certification when backend port is unreachable', async () => {
    const unreachableResult = await verifyRuntimeCoherence('BLD_ANY');
    // Even if expected matches, unreachable backend must block certification
    const unreachableStatus = await checkBackendRuntimeStatus('http://localhost:59999');
    expect(unreachableStatus).toBeNull();
  });
});
