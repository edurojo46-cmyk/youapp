/**
 * ATLAS — INDUSTRIAL EMAIL TESLA WHEEL
 * Multi-Scale Deterministic Mass Extraction Engine with Canary Probing
 * Core principle: AI Strategy + Deterministic Industrial Streaming
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import {
  EmailNormalizerAndClassifier,
  EMAIL_EXTRACTION_REGEX
} from './EmailNormalizerAndClassifier.ts';
import type {
  PublicEmailContact,
  CanaryProbeResult,
  EmailProvenance
} from './types.ts';
import type { PreexistingEmailAuthority } from './PreexistingEmailAuthority.ts';

export interface ScalableEmailSource {
  source_id: string;
  source_family: string;
  source_name: string;
  url: string;
  format: 'CSV' | 'JSON' | 'API' | 'LOCAL_FILE';
  local_path?: string;
  jurisdiction: string;
  estimated_supply: number;
}

export class IndustrialEmailTeslaWheel {
  /**
   * Executes a Canary probe on a candidate source before allocating full worker volume
   */
  public static async probeCanary(
    source: ScalableEmailSource,
    authority: PreexistingEmailAuthority,
    probeLimit: number = 200
  ): Promise<CanaryProbeResult> {
    const t0 = Date.now();
    let samplesScanned = 0;
    let extracted = 0;
    let valid = 0;
    let existing = 0;
    let netNew = 0;
    let arVerified = 0;
    let qualified = 0;

    const probeEmails = new Set<string>();

    try {
      if (source.local_path && fs.existsSync(source.local_path)) {
        const rl = readline.createInterface({
          input: fs.createReadStream(source.local_path, { encoding: 'utf8' }),
          crlfDelay: Infinity
        });

        for await (const line of rl) {
          samplesScanned++;
          if (samplesScanned === 1 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('correo'))) {
            continue; // skip header
          }

          const matches = line.match(EMAIL_EXTRACTION_REGEX);
          if (matches) {
            extracted += matches.length;
            for (const raw of matches) {
              const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
              if (!norm) continue;
              valid++;

              const arCheck = EmailNormalizerAndClassifier.verifyArgentinaRelation(norm, source.jurisdiction, line);
              if (!arCheck.isVerified) continue;
              arVerified++;

              if (authority.isPreexisting(norm)) {
                existing++;
              } else if (!probeEmails.has(norm)) {
                probeEmails.add(norm);
                netNew++;
                qualified++;
              }
            }
          }

          if (samplesScanned >= probeLimit) break;
        }
      } else if (source.url.startsWith('http')) {
        // HTTP Probe (first 64KB)
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'AtlasIndustrialEngine/2.0', 'Range': 'bytes=0-65536' },
          signal: AbortSignal.timeout(5000)
        });

        if (res.ok || res.status === 206) {
          const text = await res.text();
          const matches = text.match(EMAIL_EXTRACTION_REGEX) || [];
          extracted = matches.length;
          samplesScanned = text.split('\n').length;

          for (const raw of matches) {
            const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
            if (!norm) continue;
            valid++;

            const arCheck = EmailNormalizerAndClassifier.verifyArgentinaRelation(norm, source.jurisdiction, text);
            if (!arCheck.isVerified) continue;
            arVerified++;

            if (authority.isPreexisting(norm)) {
              existing++;
            } else if (!probeEmails.has(norm)) {
              probeEmails.add(norm);
              netNew++;
              qualified++;
            }
          }
        }
      }
    } catch (err: any) {
      // Canary probe failed or timed out
    }

    const latency = Date.now() - t0;
    const overlap = valid > 0 ? parseFloat((existing / valid).toFixed(2)) : 0;
    const qualifiedPerSec = latency > 0 ? parseFloat(((qualified / latency) * 1000).toFixed(2)) : 0;

    let decision: 'PROMOTE' | 'KILL_FAST' | 'DEPRIORITIZE' = 'KILL_FAST';
    let notes = '';

    if (qualified >= 5 || (valid > 0 && overlap < 0.9)) {
      decision = 'PROMOTE';
      notes = `High valid yield: ${qualified} net-new qualified in probe (${qualifiedPerSec}/s)`;
    } else if (valid > 0 && netNew > 0) {
      decision = 'PROMOTE';
      notes = `Contains net-new supply: ${netNew} net-new qualified in probe`;
    } else if (valid > 0 && overlap >= 0.95) {
      decision = 'DEPRIORITIZE';
      notes = `High overlap with historical T0 authority (${(overlap * 100).toFixed(1)}%)`;
    } else {
      decision = 'KILL_FAST';
      notes = 'Zero or negligible email yield in sample probe';
    }

    return {
      source_id: source.source_id,
      source_family: source.source_family,
      input_samples: samplesScanned,
      extracted_emails: extracted,
      valid_emails: valid,
      unique_emails: probeEmails.size,
      already_existing: existing,
      true_net_new: netNew,
      argentina_verified: arVerified,
      mission_qualified: qualified,
      overlap,
      latency_ms: latency,
      supply_estimate: source.estimated_supply,
      qualified_per_second: qualifiedPerSec,
      decision,
      notes
    };
  }

  /**
   * Deterministic streaming extraction of physical source
   */
  public static async harvestStream(
    source: ScalableEmailSource,
    authority: PreexistingEmailAuthority,
    sessionEmailsSet: Set<string>,
    onBatch: (records: PublicEmailContact[]) => Promise<void>,
    options: {
      targetRemaining: number;
      batchSize?: number;
      maxRows?: number;
    }
  ): Promise<{
    rowsScanned: number;
    extractedCount: number;
    validCount: number;
    duplicatesRejected: number;
    alreadyExistedRejected: number;
    qualifiedProduced: number;
    latencyMs: number;
  }> {
    const t0 = Date.now();
    const batchSize = options.batchSize || 1000;
    let rowsScanned = 0;
    let extractedCount = 0;
    let validCount = 0;
    let duplicatesRejected = 0;
    let alreadyExistedRejected = 0;
    let qualifiedProduced = 0;

    let batchBuffer: PublicEmailContact[] = [];

    // Helper to flush current batch
    const flushBatch = async () => {
      if (batchBuffer.length > 0) {
        await onBatch(batchBuffer);
        qualifiedProduced += batchBuffer.length;
        batchBuffer = [];
      }
    };

    if (source.local_path && fs.existsSync(source.local_path)) {
      const rl = readline.createInterface({
        input: fs.createReadStream(source.local_path, { encoding: 'utf8' }),
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        rowsScanned++;
        if (rowsScanned === 1 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('correo'))) {
          continue;
        }

        const matches = line.match(EMAIL_EXTRACTION_REGEX);
        if (matches) {
          extractedCount += matches.length;

          for (const raw of matches) {
            const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
            if (!norm) continue;
            validCount++;

            // Argentina verification
            const arCheck = EmailNormalizerAndClassifier.verifyArgentinaRelation(norm, source.jurisdiction, line);
            if (!arCheck.isVerified) continue;

            // T0 Authority check
            if (authority.isPreexisting(norm)) {
              alreadyExistedRejected++;
              continue;
            }

            // In-session deduplication
            if (sessionEmailsSet.has(norm)) {
              duplicatesRejected++;
              continue;
            }

            // Register in session
            sessionEmailsSet.add(norm);

            // Classification & Entity Resolution
            const contactType = EmailNormalizerAndClassifier.classifyContactType(norm, line);
            const emailHash = EmailNormalizerAndClassifier.hashEmail(norm);

            let associatedEntity = 'ORGANIZACIÓN / INSTITUCIÓN';
            let entityType = 'ORGANIZATION';

            const cuitMatch = line.match(/\b(20|23|24|27|30|33|34)\d{8}\d\b/);
            if (cuitMatch) {
              const cuit = cuitMatch[0];
              if (cuit.startsWith('20') || cuit.startsWith('27') || cuit.startsWith('23') || cuit.startsWith('24')) {
                associatedEntity = `Persona Física (CUIT ${cuit})`;
                entityType = 'NATURAL_PERSON';
              } else {
                associatedEntity = `Entidad Comercial / Pública (CUIT ${cuit})`;
                entityType = 'LEGAL_ENTITY';
              }
            } else {
              // Extract org or person name if found in line
              const cleanLine = line.replace(/["',;]/g, ' ').replace(/\s+/g, ' ').trim();
              const tokens = cleanLine.split(' ').filter(t => t.length > 2 && !t.includes('@'));
              if (tokens.length >= 2) {
                associatedEntity = tokens.slice(0, 4).join(' ');
              }
            }

            const rawHash = crypto.createHash('sha256').update(line).digest('hex').toUpperCase();
            const locator = `${source.source_id}#line:${rowsScanned}`;

            const provenance: EmailProvenance = {
              source_id: source.source_id,
              source_family: source.source_family,
              source_url: source.url,
              endpoint_domain: new URL(source.url.startsWith('http') ? source.url : 'http://localhost').hostname,
              protocol: source.format,
              bytes_or_rows_scanned: rowsScanned,
              extracted_at: new Date().toISOString(),
              raw_record_locator: locator,
              raw_record_hash: rawHash,
              real_external_acquisition: true
            };

            const contact: PublicEmailContact = {
              email_normalized: norm,
              email_hash: emailHash,
              contact_type: contactType,
              associated_entity: associatedEntity,
              entity_type: entityType,
              argentina_relation: true,
              argentina_relation_type: arCheck.relationType,
              source_id: source.source_id,
              source_family: source.source_family,
              source_url: source.url,
              public_context: line.slice(0, 200),
              evidence: `Documented in ${source.source_name}: ${arCheck.reason}`,
              provenance,
              discovered_at: new Date().toISOString(),
              verified_at: new Date().toISOString(),
              mission_qualification_status: 'MISSION_QUALIFIED'
            };

            batchBuffer.push(contact);

            if (batchBuffer.length >= batchSize) {
              await flushBatch();
            }

            if (qualifiedProduced + batchBuffer.length >= options.targetRemaining) {
              break;
            }
          }
        }

        if (qualifiedProduced + batchBuffer.length >= options.targetRemaining) {
          break;
        }
        if (options.maxRows && rowsScanned >= options.maxRows) {
          break;
        }
      }
    } else if (source.url.startsWith('http')) {
      // HTTP Streaming
      try {
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'AtlasIndustrialEngine/2.0' },
          signal: AbortSignal.timeout(180000)
        });

        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, newlineIdx).trim();
              buffer = buffer.slice(newlineIdx + 1);
              if (!line) continue;

              rowsScanned++;
              if (rowsScanned === 1 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('correo'))) {
                continue;
              }

              const matches = line.match(EMAIL_EXTRACTION_REGEX);
              if (matches) {
                extractedCount += matches.length;

                for (const raw of matches) {
                  const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
                  if (!norm) continue;
                  validCount++;

                  const arCheck = EmailNormalizerAndClassifier.verifyArgentinaRelation(norm, source.jurisdiction, line);
                  if (!arCheck.isVerified) continue;

                  if (authority.isPreexisting(norm)) {
                    alreadyExistedRejected++;
                    continue;
                  }

                  if (sessionEmailsSet.has(norm)) {
                    duplicatesRejected++;
                    continue;
                  }

                  sessionEmailsSet.add(norm);

                  const contactType = EmailNormalizerAndClassifier.classifyContactType(norm, line);
                  const emailHash = EmailNormalizerAndClassifier.hashEmail(norm);
                  const rawHash = crypto.createHash('sha256').update(line).digest('hex').toUpperCase();

                  const provenance: EmailProvenance = {
                    source_id: source.source_id,
                    source_family: source.source_family,
                    source_url: source.url,
                    endpoint_domain: new URL(source.url).hostname,
                    protocol: source.format,
                    bytes_or_rows_scanned: rowsScanned,
                    extracted_at: new Date().toISOString(),
                    raw_record_locator: `${source.source_id}#http_line:${rowsScanned}`,
                    raw_record_hash: rawHash,
                    real_external_acquisition: true
                  };

                  const contact: PublicEmailContact = {
                    email_normalized: norm,
                    email_hash: emailHash,
                    contact_type: contactType,
                    associated_entity: 'ORGANIZACIÓN / INSTITUCIÓN',
                    entity_type: 'ORGANIZATION',
                    argentina_relation: true,
                    argentina_relation_type: arCheck.relationType,
                    source_id: source.source_id,
                    source_family: source.source_family,
                    source_url: source.url,
                    public_context: line.slice(0, 200),
                    evidence: `Physical stream from ${source.source_name}: ${arCheck.reason}`,
                    provenance,
                    discovered_at: new Date().toISOString(),
                    verified_at: new Date().toISOString(),
                    mission_qualification_status: 'MISSION_QUALIFIED'
                  };

                  batchBuffer.push(contact);

                  if (batchBuffer.length >= batchSize) {
                    await flushBatch();
                  }

                  if (qualifiedProduced + batchBuffer.length >= options.targetRemaining) {
                    break;
                  }
                }
              }

              if (qualifiedProduced + batchBuffer.length >= options.targetRemaining) {
                break;
              }
            }

            if (qualifiedProduced + batchBuffer.length >= options.targetRemaining) {
              break;
            }
          }
        }
      } catch (err) {
        // Stream network error handling
      }
    }

    // Flush any remaining records
    await flushBatch();

    return {
      rowsScanned,
      extractedCount,
      validCount,
      duplicatesRejected,
      alreadyExistedRejected,
      qualifiedProduced,
      latencyMs: Date.now() - t0
    };
  }
}
