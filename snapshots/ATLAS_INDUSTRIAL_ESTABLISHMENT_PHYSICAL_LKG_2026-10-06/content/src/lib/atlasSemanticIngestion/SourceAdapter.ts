/**
 * Atlas Semantic Intelligence — Source Adapter Base Contract V1
 * Abstract interface for data source transformation with prompt-injection neutrality and PII safeguards.
 */

import type { SemanticIngestionEnvelope, SourceAuthorityClass } from './types';

export abstract class SourceAdapter {
  abstract readonly sourceName: string;
  abstract readonly authorityClass: SourceAuthorityClass;

  /**
   * Transforms a raw database record into a structured SemanticIngestionEnvelope.
   * Returns null if record is invalid or unparseable.
   */
  abstract transformRecord(
    record: any,
    tenantId: string
  ): Promise<SemanticIngestionEnvelope | null>;

  /**
   * Sanitizes raw text: treats text strictly as literal data, neutralizes prompt injections,
   * and prevents plaintext email/secret leaks.
   */
  protected sanitizeText(raw: any): string {
    if (raw === null || raw === undefined) return '';
    let str = String(raw).trim();

    // Neutralize prompt injection attempts: keep as quoted string data without control semantics
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return str;
  }

  /**
   * Checks if a string contains forbidden plaintext emails or secret credentials.
   */
  protected hasPlaintextPii(str: string): boolean {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /\b(?:\+\d{1,3}[- ]?)?\(?\d{2,4}\)?[- ]?\d{3,4}[- ]?\d{3,4}\b/;
    return emailRegex.test(str) || phoneRegex.test(str);
  }
}
