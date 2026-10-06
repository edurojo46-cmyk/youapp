/**
 * ATLAS — INDUSTRIAL CHEAP PROBE ENGINE V4
 * Candidate Precision & Two-Stage Content Sampling Funnel:
 * Stage 0: Host / DNS check (managed by AdaptiveHostManager)
 * Stage 1: Fast existence / status probe (HEAD / status preflight)
 * Stage 2: Small Range GET (2KB - 4KB) on accessible endpoints to detect real signals
 * Detects: @, mailto:, email, correo, contacto, structured directory and schema fields
 * Distinguishes Evidence-Derived vs Combinatorial-Guessed and tracks positive control recall
 */

import { Agent, setGlobalDispatcher } from 'undici';
import { AdaptiveHostManager } from './AdaptiveHostManager.ts';
import type { CandidateSource, CheapProbeResult } from './types.ts';

const undiciAgent = new Agent({
  connections: 50,
  pipelining: 1,
  connect: { timeout: 3500 },
  headersTimeout: 4000,
  bodyTimeout: 4000
});
setGlobalDispatcher(undiciAgent);

// Rich email and contact signals
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CONTACT_KEYWORDS_REGEX = /mailto:|e-?mail|correo(?:_electronico)?|contact(?:o|_email)?|institution_email/i;
const DIRECTORY_KEYWORDS_REGEX = /autoridades|personal|staff|docentes|profesionales|proveedores|instituciones|contactos|directorio|organigrama|claustro|matriculados|padron|guia/i;
const ARGENTINA_SIGNAL_REGEX = /\.ar\b|argentina|buenos aires|cordoba|santa fe|mendoza|nacional|ministerio|secretaria|universidad|facultad|cuit/i;

export class CheapProbeEngine {
  private hostManager: AdaptiveHostManager;

  constructor(hostManager?: AdaptiveHostManager) {
    this.hostManager = hostManager ?? new AdaptiveHostManager({ maxConcurrentPerHost: 2, defaultTimeoutMs: 1500 });
  }

  public getHostManager(): AdaptiveHostManager {
    return this.hostManager;
  }

  /**
   * Two-Stage Probe Funnel:
   * Stage 1: Status preflight
   * Stage 2: Small Range content sampling (2–4 KB) to detect email & directory signals
   */
  public async probeCandidate(candidate: CandidateSource, masterSignal?: AbortSignal): Promise<CheapProbeResult> {
    if (masterSignal?.aborted) {
      return {
        candidateId: candidate.candidateId,
        url: candidate.url,
        host: candidate.host,
        accessible: false,
        httpStatus: 0,
        contentType: 'none',
        latencyMs: 0,
        bytesReceived: 0,
        hasEmailSignal: false,
        hasArgentinaSignal: false,
        hasDirectorySignal: false,
        contentSampled: false,
        promising: false,
        originType: candidate.originType,
        isControl: candidate.isControl,
        failureReason: 'ABORTED_AT_DEADLINE'
      };
    }

    if (this.hostManager.isDead(candidate.host)) {
      return {
        candidateId: candidate.candidateId,
        url: candidate.url,
        host: candidate.host,
        accessible: false,
        httpStatus: 0,
        contentType: 'none',
        latencyMs: 0,
        bytesReceived: 0,
        hasEmailSignal: false,
        hasArgentinaSignal: false,
        hasDirectorySignal: false,
        contentSampled: false,
        promising: false,
        originType: candidate.originType,
        isControl: candidate.isControl,
        failureReason: 'DNS_FAILED'
      };
    }

    const acquired = await this.hostManager.acquireHostSlot(candidate.host, masterSignal);
    if (!acquired) {
      return {
        candidateId: candidate.candidateId,
        url: candidate.url,
        host: candidate.host,
        accessible: false,
        httpStatus: 0,
        contentType: 'none',
        latencyMs: 0,
        bytesReceived: 0,
        hasEmailSignal: false,
        hasArgentinaSignal: false,
        hasDirectorySignal: false,
        contentSampled: false,
        promising: false,
        originType: candidate.originType,
        isControl: candidate.isControl,
        failureReason: masterSignal?.aborted ? 'ABORTED_AT_DEADLINE' : 'HOST_SATURATED_SKIP'
      };
    }

    const startTime = performance.now();
    const timeoutMs = this.hostManager.getAdaptiveTimeout(candidate.host);

    const controller = new AbortController();
    const onMasterAbort = () => controller.abort();
    if (masterSignal) {
      masterSignal.addEventListener('abort', onMasterAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isApiOrCatalog = candidate.protocol === 'CKAN_API' || candidate.protocol === 'OAI_PMH';
      const headers: Record<string, string> = {
        'User-Agent': 'Atlas-Industrial-Discovery-Fabric/3.0 (+https://atlas.internal.bot; research-probe)',
        'Accept': isApiOrCatalog ? 'application/json,application/xml,text/xml,*/*' : 'text/html,application/xhtml+xml,application/json,*/*',
        ...(isApiOrCatalog ? {} : { 'Range': 'bytes=0-3071' })
      };

      let response: Response;
      try {
        response = await fetch(candidate.url, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
      } catch (err: any) {
        const latencyMs = Math.round(performance.now() - startTime);
        if (masterSignal?.aborted) {
          return {
            candidateId: candidate.candidateId,
            url: candidate.url,
            host: candidate.host,
            accessible: false,
            httpStatus: 0,
            contentType: 'none',
            latencyMs,
            bytesReceived: 0,
            hasEmailSignal: false,
            hasArgentinaSignal: false,
            hasDirectorySignal: false,
            contentSampled: false,
            promising: false,
            originType: candidate.originType,
            isControl: candidate.isControl,
            failureReason: 'ABORTED_AT_DEADLINE'
          };
        }

        this.hostManager.recordFailure(candidate.host, err);
        const code = err?.cause?.code || err?.code || '';
        const reason = err.name === 'TimeoutError' ? 'TIMEOUT' : (code === 'ENOTFOUND' ? 'DNS_FAILED' : (code || 'TLS_FAILED'));
        return {
          candidateId: candidate.candidateId,
          url: candidate.url,
          host: candidate.host,
          accessible: false,
          httpStatus: 0,
          contentType: 'none',
          latencyMs,
          bytesReceived: 0,
          hasEmailSignal: false,
          hasArgentinaSignal: false,
          hasDirectorySignal: false,
          contentSampled: false,
          promising: false,
          originType: candidate.originType,
          isControl: candidate.isControl,
          failureReason: reason
        };
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const httpStatus = response.status;
      const contentType = response.headers.get('content-type') || 'unknown';
      let bytesReceived = 0;
      let bodySnippet = '';
      let contentSampled = false;

      // Stage 2: Read first 2KB-3KB chunk and immediately cancel reader
      if (response.body && httpStatus >= 200 && httpStatus < 400) {
        try {
          const reader = response.body.getReader();
          const { value } = await reader.read();
          if (value) {
            bytesReceived = value.byteLength;
            bodySnippet = new TextDecoder('utf-8', { fatal: false }).decode(value);
            contentSampled = true;
          }
          await reader.cancel().catch(() => {});
        } catch (e) {}
      }

      const isAccessible = httpStatus >= 200 && httpStatus < 400;
      this.hostManager.recordSuccess(candidate.host, latencyMs);

      // Signal Detection
      const pathHasEmailSignal = CONTACT_KEYWORDS_REGEX.test(candidate.url);
      const pathHasDirectorySignal = DIRECTORY_KEYWORDS_REGEX.test(candidate.url);
      const bodyHasEmailRegex = bodySnippet ? EMAIL_REGEX.test(bodySnippet) : false;
      const bodyHasContactKeywords = bodySnippet ? CONTACT_KEYWORDS_REGEX.test(bodySnippet) : false;
      const bodyHasDirectorySignal = bodySnippet ? DIRECTORY_KEYWORDS_REGEX.test(bodySnippet) : false;

      const hasEmailSignal = bodyHasEmailRegex || bodyHasContactKeywords || pathHasEmailSignal;
      const hasDirectorySignal = bodyHasDirectorySignal || pathHasDirectorySignal;
      const hasArgentinaSignal = candidate.host.endsWith('.ar') || (bodySnippet ? ARGENTINA_SIGNAL_REGEX.test(bodySnippet) : false);

      // Promising decision: accessible AND has email or directory signal or is API/OAI or control source
      const promising = candidate.isControl || (isAccessible && (
        hasEmailSignal ||
        (hasDirectorySignal && hasArgentinaSignal) ||
        isApiOrCatalog
      ));

      return {
        candidateId: candidate.candidateId,
        url: candidate.url,
        host: candidate.host,
        accessible: isAccessible,
        httpStatus,
        contentType,
        latencyMs,
        bytesReceived,
        hasEmailSignal,
        hasArgentinaSignal,
        hasDirectorySignal,
        contentSampled,
        promising,
        originType: candidate.originType,
        isControl: candidate.isControl,
        failureReason: isAccessible ? undefined : `HTTP_${httpStatus}`
      };
    } finally {
      clearTimeout(timeoutId);
      if (masterSignal) {
        masterSignal.removeEventListener('abort', onMasterAbort);
      }
      this.hostManager.releaseHostSlot(candidate.host);
    }
  }
}
