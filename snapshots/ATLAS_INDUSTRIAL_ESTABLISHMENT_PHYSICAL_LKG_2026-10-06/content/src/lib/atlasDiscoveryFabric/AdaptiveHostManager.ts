/**
 * ATLAS — ADAPTIVE HOST MANAGER & CIRCUIT BREAKER V3
 * Strict per-domain concurrency limiter (<= 2) with adaptive timeouts,
 * domain-level circuit breaking on permanent DNS failure (ENOTFOUND),
 * and master wall-clock abort signal integration.
 */

export interface HostHealth {
  host: string;
  activeRequests: number;
  fails: number;
  isDead: boolean;
  avgLatencyMs: number;
  totalProbes: number;
  accessibleCount: number;
  lastProbeTime: number;
}

export class AdaptiveHostManager {
  private hosts: Map<string, HostHealth> = new Map();
  private maxConcurrentPerHost: number;
  private defaultTimeoutMs: number;

  constructor(options?: { maxConcurrentPerHost?: number; defaultTimeoutMs?: number }) {
    this.maxConcurrentPerHost = options?.maxConcurrentPerHost ?? 2;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 2000;
  }

  public getDistinctHostsCount(): number {
    return this.hosts.size;
  }

  public isDead(host: string): boolean {
    const h = this.hosts.get(host);
    return h ? h.isDead : false;
  }

  public getAdaptiveTimeout(host: string): number {
    const h = this.hosts.get(host);
    if (!h) return this.defaultTimeoutMs;
    if (h.avgLatencyMs > 0 && h.avgLatencyMs < 400) return 1000;
    return this.defaultTimeoutMs;
  }

  /**
   * Acquire execution slot enforcing MAX_CONCURRENT_PER_HOST <= 2
   * Returns false if domain is dead, aborted, or saturated for > 500ms.
   */
  public async acquireHostSlot(host: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;

    let h = this.hosts.get(host);
    if (!h) {
      h = {
        host,
        activeRequests: 0,
        fails: 0,
        isDead: false,
        avgLatencyMs: 0,
        totalProbes: 0,
        accessibleCount: 0,
        lastProbeTime: Date.now()
      };
      this.hosts.set(host, h);
    }

    if (h.isDead) return false;

    const startWait = performance.now();
    while (h.activeRequests >= this.maxConcurrentPerHost) {
      if (signal?.aborted) return false;
      if (performance.now() - startWait > 500) {
        return false;
      }
      await new Promise(r => setTimeout(r, 20));
    }

    if (signal?.aborted || h.isDead) return false;
    h.activeRequests++;
    return true;
  }

  /**
   * Release host slot
   */
  public releaseHostSlot(host: string): void {
    const h = this.hosts.get(host);
    if (h && h.activeRequests > 0) {
      h.activeRequests--;
    }
  }

  /**
   * Records successful response to adjust host health and latency
   */
  public recordSuccess(host: string, latencyMs: number): void {
    let h = this.hosts.get(host);
    if (!h) {
      h = {
        host,
        activeRequests: 0,
        fails: 0,
        isDead: false,
        avgLatencyMs: latencyMs,
        totalProbes: 1,
        accessibleCount: 1,
        lastProbeTime: Date.now()
      };
      this.hosts.set(host, h);
    } else {
      h.fails = 0;
      h.totalProbes++;
      h.accessibleCount++;
      h.avgLatencyMs = h.avgLatencyMs > 0 ? Math.round((h.avgLatencyMs * 0.7) + (latencyMs * 0.3)) : latencyMs;
      h.lastProbeTime = Date.now();
    }
  }

  /**
   * Records failure and trips circuit breaker ONLY on permanent DNS failure (ENOTFOUND)
   */
  public recordFailure(host: string, err: any): void {
    let h = this.hosts.get(host);
    if (!h) {
      h = {
        host,
        activeRequests: 0,
        fails: 1,
        isDead: false,
        avgLatencyMs: 1000,
        totalProbes: 1,
        accessibleCount: 0,
        lastProbeTime: Date.now()
      };
      this.hosts.set(host, h);
    } else {
      h.fails++;
      h.totalProbes++;
    }

    const code = err?.cause?.code || err?.code || '';
    if (code === 'ENOTFOUND') {
      h.isDead = true;
    }
  }
}
