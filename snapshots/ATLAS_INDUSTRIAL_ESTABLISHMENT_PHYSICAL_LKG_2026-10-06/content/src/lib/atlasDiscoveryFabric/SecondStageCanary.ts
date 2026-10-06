/**
 * ATLAS — INDUSTRIAL DEPTH CANARY ENGINE V5
 * Bounded Ecosystem Expansion Architecture:
 * - Explores root/discovered page, internal contact/authority links, and protocol endpoints
 * - Budget per candidate: MAX_PAGES = 8, MAX_BYTES_PER_PAGE = 16KB, MAX_TIME = 2500ms
 * - Internal Link Discovery: Extracts subpages matching directory/staff/contact patterns
 * - Net-New Early Stop: High net-new ratio promotes immediately without crawling full budget
 * - Negative Early Stop: Aborts quickly on unresponsive/zero-contact pages
 * - Winner Supply Estimation: Derived from pages seen, pages with emails, and net-new ratio
 */

import crypto from 'crypto';
import pg from 'pg';
import type { CandidateSource, CanaryResult } from './types.ts';

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Internal link pattern for high-yield contact, authority, faculty, and directory subpages
const RELEVANT_LINK_PATTERN = /(?:contacto|contact|autoridades|personal|staff|docentes|profesionales|matriculados|directorio|institucional|equipo|departamento|facultad|secretaria|claustro|padron|guia|decan|catedra|ensenanza|posgrado|investigacion|acerca|organigrama)/i;
const JUNK_LINK_PATTERN = /(?:wp-json|xmlrpc|\.css|\.js|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.pdf|\.zip|\.woff|feed|rss|tag\/|category\/|share|login|wp-includes|wp-admin|javascript:|mailto:|tel:)/i;
const HTML_HREF_REGEX = /<a\s+(?:[^>]*?\s+)?href=["']([^"'#\s]+)["']/gi;

// False positive patterns and junk extensions
const JUNK_DOMAINS = new Set([
  'example.com', 'test.com', 'w3.org', 'schema.org', 'github.com',
  'sentry.io', 'domain.com', 'email.com', 'mail.com', 'yourdomain.com'
]);

export class SecondStageCanary {
  private knownEmailHashes: Set<string> = new Set();

  /**
   * Loads existing email authority from database to form the global hash filter
   */
  public async loadDedupeAuthority(pool: pg.Pool): Promise<number> {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT email_normalized 
        FROM public.atlas_global_email_authority;
      `);
      for (const row of res.rows) {
        if (row.email_normalized) {
          this.knownEmailHashes.add(row.email_normalized.toLowerCase().trim());
        }
      }

      console.log(`[CanaryEngine] Loaded ${this.knownEmailHashes.size} authority emails for zero-overlap net-new filtering.`);
      return this.knownEmailHashes.size;
    } finally {
      client.release();
    }
  }

  /**
   * Adds new confirmed emails to authority filter to avoid double-counting within the run
   */
  public registerAcquiredEmails(emails: string[]): void {
    for (const e of emails) {
      this.knownEmailHashes.add(e.toLowerCase().trim());
    }
  }

  /**
   * Validates if extracted email is legitimate institutional/public contact
   */
  public isValidEmail(rawEmail: string): boolean {
    const email = rawEmail.toLowerCase().trim();
    if (email.length < 6 || email.length > 100) return false;
    if (email.includes('..') || email.includes('/') || email.includes('\\')) return false;

    const parts = email.split('@');
    if (parts.length !== 2) return false;
    const [user, domain] = parts;

    if (user.length === 0 || domain.length < 3) return false;
    if (JUNK_DOMAINS.has(domain)) return false;

    // Filter file extension artifacts
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot|ico|pdf|zip)$/i.test(domain)) {
      return false;
    }

    return true;
  }

  /**
   * Executes Bounded Ecosystem Depth Canary on a promising candidate
   */
  public async runCanary(
    candidate: CandidateSource,
    options?: { maxPages?: number; maxBytesPerPage?: number; maxTimeMs?: number },
    masterSignal?: AbortSignal
  ): Promise<CanaryResult> {
    const startTime = performance.now();
    const maxPages = options?.maxPages ?? 8;
    const maxBytesPerPage = options?.maxBytesPerPage ?? 65536;
    const maxTimeMs = options?.maxTimeMs ?? 2500;

    const queue: string[] = [];
    const visited = new Set<string>();
    const subpagesExplored: string[] = [];

    const uniqueEmailsSet = new Set<string>();
    let totalRawEmails = 0;
    let totalValidEmails = 0;
    let pagesSeen = 0;
    let pagesWithEmails = 0;

    // Protocol-Aware Bounded Queue Setup
    try {
      const u = new URL(candidate.url);
      const origin = u.origin;

      if (candidate.protocol === 'OAI_PMH') {
        const identifyUrl = candidate.url.includes('?') ? candidate.url : `${candidate.url}?verb=Identify`;
        queue.push(identifyUrl);
        queue.push(candidate.url.includes('?') ? candidate.url : `${candidate.url}?verb=ListRecords&metadataPrefix=oai_dc`);
        queue.push(`${origin}/contacto`);
      } else if (candidate.protocol === 'CKAN_API') {
        queue.push(origin);
        queue.push(`${origin}/acerca`);
        queue.push(`${origin}/contacto`);
        queue.push(candidate.url.includes('?') ? candidate.url : `${candidate.url}?rows=10`);
      } else {
        // Standard Web Endpoints
        queue.push(candidate.url);
        if (u.pathname === '/' || u.pathname === '') {
          queue.push(`${origin}/contacto`);
          queue.push(`${origin}/autoridades`);
          queue.push(`${origin}/directorio`);
          queue.push(`${origin}/institucional`);
        } else {
          queue.push(`${origin}/contacto`);
          queue.push(`${origin}/autoridades`);
        }
      }
    } catch (e) {
      queue.push(candidate.url);
    }

    while (queue.length > 0 && pagesSeen < maxPages && (performance.now() - startTime) < maxTimeMs) {
      if (masterSignal?.aborted) break;

      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      pagesSeen++;
      subpagesExplored.push(currentUrl);

      let pageText = '';
      try {
        const timeoutMs = Math.min(1200, Math.max(300, maxTimeMs - Math.round(performance.now() - startTime)));
        const controller = new AbortController();
        const onMasterAbort = () => controller.abort();
        if (masterSignal) masterSignal.addEventListener('abort', onMasterAbort, { once: true });
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const isApi = candidate.protocol === 'CKAN_API' || candidate.protocol === 'OAI_PMH' || currentUrl.includes('api/') || currentUrl.includes('?verb=');
        const headers: Record<string, string> = {
          'User-Agent': 'Atlas-Industrial-Depth-Canary/2.0 (+https://atlas.internal.bot; ecosystem-canary)',
          'Accept': isApi ? 'application/json,application/xml,text/xml,*/*' : 'text/html,application/xhtml+xml,application/json,*/*'
        };

        if (!isApi) {
          headers['Range'] = `bytes=0-${maxBytesPerPage - 1}`;
        }

        const res = await fetch(currentUrl, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (masterSignal) masterSignal.removeEventListener('abort', onMasterAbort);

        if (res.ok && res.body) {
          const reader = res.body.getReader();
          let totalRead = 0;
          const chunks: Uint8Array[] = [];

          while (totalRead < maxBytesPerPage) {
            const { value, done } = await reader.read();
            if (done || !value) break;
            chunks.push(value);
            totalRead += value.byteLength;
          }
          await reader.cancel().catch(() => {});

          const merged = new Uint8Array(totalRead);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          pageText = new TextDecoder('utf-8', { fatal: false }).decode(merged);

          // Decode basic HTML entities for obfuscated emails
          if (pageText.includes('&#')) {
            pageText = pageText
              .replace(/&#64;/gi, '@')
              .replace(/&#x40;/gi, '@')
              .replace(/&#46;/gi, '.')
              .replace(/&#x2e;/gi, '.')
              .replace(/&amp;/gi, '&');
          }
        }
      } catch (err) {
        // Subpage fetch error or timeout
      }

      // Extract emails from this page
      const matches = pageText.match(EMAIL_REGEX) || [];
      totalRawEmails += matches.length;
      let pageFoundEmails = 0;

      for (const m of matches) {
        if (this.isValidEmail(m)) {
          const norm = m.toLowerCase().trim();
          totalValidEmails++;
          uniqueEmailsSet.add(norm);
          pageFoundEmails++;
        }
      }

      if (pageFoundEmails > 0) {
        pagesWithEmails++;
      }

      // Compute current net-new count
      let currentNetNew = 0;
      for (const e of uniqueEmailsSet) {
        if (!this.knownEmailHashes.has(e)) currentNetNew++;
      }
      const currentNetNewRatio = uniqueEmailsSet.size > 0 ? (currentNetNew / uniqueEmailsSet.size) : 0;

      // Net-New Early Stop: High net-new yield detected early
      if (currentNetNew >= 5 && currentNetNewRatio >= 0.50) {
        break; // Early promote without exhausting budget
      }

      // Negative Early Stop: Multiple pages with zero contacts
      if (pagesSeen >= 3 && uniqueEmailsSet.size === 0) {
        break; // Fast abort on barren ecosystem
      }
      if (pagesSeen >= 3 && uniqueEmailsSet.size >= 10 && currentNetNew === 0) {
        break; // Fast abort on 100% overlap
      }

      // Internal Link Discovery & Sitemap Expansion
      if (pagesSeen < maxPages && pageText) {
        try {
          const baseObj = new URL(currentUrl);

          // Check if XML sitemap
          if (currentUrl.endsWith('.xml') || pageText.includes('<urlset') || pageText.includes('<sitemapindex')) {
            const locMatches = [...pageText.matchAll(/<loc>(.*?)<\/loc>/gi)].map(m => m[1]);
            for (const loc of locMatches) {
              if (RELEVANT_LINK_PATTERN.test(loc) && !JUNK_LINK_PATTERN.test(loc)) {
                try {
                  const resolved = new URL(loc, currentUrl);
                  if (resolved.hostname === baseObj.hostname && !visited.has(resolved.href)) {
                    queue.push(resolved.href);
                  }
                } catch (e) {}
              }
            }
          } else {
            // HTML link discovery
            let match: RegExpExecArray | null;
            let addedLinks = 0;

            const discoveredHrefs: string[] = [];
            while ((match = HTML_HREF_REGEX.exec(pageText)) !== null) {
              const href = match[1];
              if (RELEVANT_LINK_PATTERN.test(href) && !JUNK_LINK_PATTERN.test(href)) {
                discoveredHrefs.push(href);
              }
            }

            // Sort discovered links so direct contact/autoridades/decan subpages are explored first
            discoveredHrefs.sort((a, b) => {
              const scoreA = /(autoridades|decan|secretar|contacto|directorio)/i.test(a) ? 2 : 1;
              const scoreB = /(autoridades|decan|secretar|contacto|directorio)/i.test(b) ? 2 : 1;
              return scoreB - scoreA;
            });

            for (const href of discoveredHrefs) {
              if (addedLinks >= 5) break;
              try {
                const resolved = new URL(href, currentUrl);
                // Ensure same host or legitimate sub-faculty
                if (resolved.hostname === baseObj.hostname && !visited.has(resolved.href)) {
                  queue.push(resolved.href);
                  addedLinks++;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);

    // Final evaluation against authority
    let alreadyExisting = 0;
    let trueNetNew = 0;
    const trueNetNewSamples: string[] = [];

    for (const e of uniqueEmailsSet) {
      if (this.knownEmailHashes.has(e)) {
        alreadyExisting++;
      } else {
        trueNetNew++;
        trueNetNewSamples.push(e);
      }
    }

    const uniqueEmails = uniqueEmailsSet.size;
    const netNewRatio = uniqueEmails > 0 ? (trueNetNew / uniqueEmails) : 0;

    let decision: 'HIGH_YIELD_WINNER' | 'PRODUCTIVE' | 'LOW_YIELD' | 'KILL_FAST';
    if (trueNetNew >= 4 && netNewRatio >= 0.40) {
      decision = 'HIGH_YIELD_WINNER';
    } else if (trueNetNew >= 1) {
      decision = 'PRODUCTIVE';
    } else if (uniqueEmails > 0 && trueNetNew === 0) {
      decision = 'LOW_YIELD';
    } else {
      decision = 'KILL_FAST';
    }

    // Physical Supply Estimation based on ecosystem depth
    let calibratedSupply = 0;
    if (decision === 'HIGH_YIELD_WINNER') {
      calibratedSupply = Math.round(candidate.expectedSupply * Math.max(0.40, netNewRatio));
    } else if (decision === 'PRODUCTIVE') {
      calibratedSupply = Math.round(candidate.expectedSupply * Math.max(0.15, netNewRatio));
    }

    return {
      candidateId: candidate.candidateId,
      url: candidate.url,
      sourceFamily: candidate.sourceFamily,
      sector: candidate.sector,
      jurisdiction: candidate.jurisdiction,
      pagesSeen,
      pagesWithEmails,
      rawEmails: totalRawEmails,
      validEmails: totalValidEmails,
      uniqueEmails,
      alreadyExisting,
      trueNetNew,
      netNewRatio,
      decision,
      calibratedSupply,
      latencyMs,
      sampleEmails: trueNetNewSamples,
      subpagesExplored,
      originType: candidate.originType,
      isControl: candidate.isControl
    };
  }

  /**
   * Promotes winning source into PostgreSQL SSOT public.atlas_source_knowledge_map
   */
  public async promoteWinnerToSsot(
    pool: pg.Pool,
    candidate: CandidateSource,
    canary: CanaryResult
  ): Promise<void> {
    const client = await pool.connect();
    try {
      const nowIso = new Date().toISOString();
      const status = canary.decision === 'HIGH_YIELD_WINNER' ? 'PROMOTED' : 'CANARY';
      const motor = candidate.protocol === 'CKAN_API' ? 'CKAN_MOTOR' : (candidate.protocol === 'OAI_PMH' ? 'OAI_PMH_MOTOR' : 'PAGINATED_HTTP_MOTOR');
      const universe = `${candidate.sector}_${candidate.jurisdiction}`;

      await client.query(`
        INSERT INTO public.atlas_source_knowledge_map (
          source_id,
          canonical_url,
          source_name,
          source_family,
          source_universe,
          supported_motor_template,
          current_status,
          protocol,
          geography_scope,
          estimated_records,
          estimated_unique_entities,
          last_seen_at,
          last_profiled_at,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (source_id) DO UPDATE SET
          current_status = EXCLUDED.current_status,
          estimated_records = EXCLUDED.estimated_records,
          estimated_unique_entities = EXCLUDED.estimated_unique_entities,
          last_seen_at = EXCLUDED.last_seen_at,
          last_profiled_at = EXCLUDED.last_profiled_at,
          updated_at = EXCLUDED.updated_at;
      `, [
        candidate.candidateId,
        candidate.url,
        `${candidate.sourceFamily} - ${candidate.host}`,
        candidate.sourceFamily,
        universe,
        motor,
        status,
        candidate.protocol,
        candidate.jurisdiction,
        canary.calibratedSupply,
        canary.trueNetNew,
        nowIso,
        nowIso,
        nowIso,
        nowIso
      ]);
    } catch (e: any) {
      console.warn(`[CanaryEngine] Warning on promoting ${candidate.candidateId}: ${e.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Persists verified net-new contacts into public.atlas_public_email_contacts_1m
   */
  public async persistNetNewContacts(
    pool: pg.Pool,
    candidate: CandidateSource,
    canary: CanaryResult
  ): Promise<number> {
    if (canary.sampleEmails.length === 0) return 0;

    const client = await pool.connect();
    let inserted = 0;
    try {
      const nowIso = new Date().toISOString();
      for (const email of canary.sampleEmails) {
        try {
          const emailHash = crypto.createHash('sha256').update(email).digest('hex').toUpperCase();

          const res = await client.query(`
            INSERT INTO public.atlas_public_email_contacts_1m (
              email_normalized,
              email_hash,
              contact_type,
              associated_entity,
              entity_type,
              argentina_relation,
              argentina_relation_type,
              source_id,
              source_family,
              source_url,
              public_context,
              evidence,
              provenance,
              discovered_at,
              verified_at,
              mission_qualification_status
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
            ON CONFLICT (email_normalized) DO NOTHING
            RETURNING email_normalized;
          `, [
            email,
            emailHash,
            'INSTITUTIONAL_CONTACT',
            `${candidate.sourceFamily} (${candidate.host})`,
            'ORGANIZATION',
            true,
            'INSTITUTION_IN_ARGENTINA',
            candidate.candidateId,
            candidate.sourceFamily,
            candidate.url,
            `Depth canary discovery from ${candidate.url} (pages seen: ${canary.pagesSeen})`,
            `Verified public endpoint contact discovered in industrial depth canary expansion`,
            JSON.stringify({
              protocol: candidate.protocol,
              candidate_id: candidate.candidateId,
              source_family: candidate.sourceFamily,
              endpoint_host: candidate.host,
              net_new_ratio: canary.netNewRatio,
              pages_seen: canary.pagesSeen,
              canary_probe_at: nowIso
            }),
            nowIso,
            nowIso,
            'MISSION_QUALIFIED'
          ]);

          if (res.rowCount && res.rowCount > 0) {
            inserted++;
            this.knownEmailHashes.add(email);
          }
        } catch (e) {
          // Ignore unique collision or error
        }
      }
      return inserted;
    } finally {
      client.release();
    }
  }
}
