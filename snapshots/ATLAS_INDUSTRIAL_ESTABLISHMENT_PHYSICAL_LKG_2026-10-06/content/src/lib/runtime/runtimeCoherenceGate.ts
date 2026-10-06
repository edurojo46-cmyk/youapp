export interface RuntimeStatus {
  PROCESS_PID: number;
  PROCESS_STARTED_AT: string;
  RUNTIME_BUILD_ID: string;
  RUNTIME_CODE_VERSION: string;
  RUNTIME_LOADED_AT: string;
  ENVIRONMENT: string;
  PORT: number;
  STATUS: 'HEALTHY' | 'STALE' | 'DEGRADED';
}

export interface RuntimeCoherenceResult {
  FRONT_5175_ALIVE: boolean;
  BACKEND_5174_ALIVE: boolean;
  FRONT_BACKEND_VERSION_MATCH: boolean;
  BACKEND_CODE_CURRENT: boolean;
  RUNTIME_VERSION_MISMATCH: boolean;
  CERTIFICATION_BLOCKED: boolean;
  EXPECTED_BUILD_ID: string;
  ACTUAL_BUILD_ID: string | null;
  BACKEND_PID: number | null;
  BACKEND_STARTED_AT: string | null;
  REASON?: string;
}

export async function checkBackendRuntimeStatus(baseUrl = ''): Promise<RuntimeStatus | null> {
  try {
    const res = await fetch(`${baseUrl}/api/runtime-status`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return null;
    return await res.json() as RuntimeStatus;
  } catch {
    return null;
  }
}

export async function verifyRuntimeCoherence(expectedBuildId?: string): Promise<RuntimeCoherenceResult> {
  let frontAlive = false;
  try {
    const fRes = await fetch('http://localhost:5175', { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    frontAlive = fRes.ok || fRes.status === 200 || fRes.status === 304;
  } catch {
    frontAlive = false;
  }

  const backendStatus = await checkBackendRuntimeStatus('http://localhost:5174');
  const backendAlive = Boolean(backendStatus && backendStatus.PROCESS_PID);

  // If expectedBuildId is provided, verify match. If not provided, expected matches current backend
  const targetExpected = expectedBuildId || backendStatus?.RUNTIME_BUILD_ID || 'UNKNOWN';
  const actualBuildId = backendStatus?.RUNTIME_BUILD_ID || null;

  const versionMatch = Boolean(actualBuildId && actualBuildId === targetExpected);
  const codeCurrent = Boolean(backendStatus?.STATUS === 'HEALTHY' && versionMatch);
  const mismatch = !versionMatch;
  const certificationBlocked = !frontAlive || !backendAlive || mismatch || !codeCurrent;

  return {
    FRONT_5175_ALIVE: frontAlive,
    BACKEND_5174_ALIVE: backendAlive,
    FRONT_BACKEND_VERSION_MATCH: versionMatch,
    BACKEND_CODE_CURRENT: codeCurrent,
    RUNTIME_VERSION_MISMATCH: mismatch,
    CERTIFICATION_BLOCKED: certificationBlocked,
    EXPECTED_BUILD_ID: targetExpected,
    ACTUAL_BUILD_ID: actualBuildId,
    BACKEND_PID: backendStatus?.PROCESS_PID || null,
    BACKEND_STARTED_AT: backendStatus?.PROCESS_STARTED_AT || null,
    REASON: certificationBlocked ? 'Runtime coherence precondition failed' : undefined
  };
}
