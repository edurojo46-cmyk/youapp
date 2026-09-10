/**
 * Atlas Semantic Intelligence — Entity Normalization Engine V1
 * Deterministic text, domain, legal corporate suffixes, and hierarchical location normalizer.
 */

import * as crypto from 'crypto';
import type { CanonicalEntityType, HierarchicalLocation } from './types';

export class EntityNormalizationEngine {
  // Corporate suffixes to strip for canonical root comparison
  private static readonly LEGAL_SUFFIX_PATTERNS: RegExp[] = [
    /\b(s\s*\.?\s*a\s*\.?\s*u\s*\.?|sau)\b/gi,
    /\b(s\s*\.?\s*a\s*\.?|sa)\b/gi,
    /\b(s\s*\.?\s*r\s*\.?\s*l\s*\.?|srl)\b/gi,
    /\b(s\s*\.?\s*l\s*\.?|sl)\b/gi,
    /\b(inc\s*\.?|incorporated)\b/gi,
    /\b(l\s*\.?\s*l\s*\.?\s*c\s*\.?|llc)\b/gi,
    /\b(pty\s*\.?\s*ltd\s*\.?|pty|ltd|limited|l\s*\.?\s*t\s*\.?\s*d\s*\.?)\b/gi,
    /\b(corp\s*\.?|corporation)\b/gi,
    /\b(co\s*\.?|company)\b/gi,
    /\b(gmbh)\b/gi,
    /\b(ag)\b/gi,
    /\b(s\s*\.?\s*a\s*\.?\s*s\s*\.?|sas)\b/gi,
    /\b(s\s*\.?\s*p\s*\.?\s*a\s*\.?|spa)\b/gi
  ];

  /**
   * Cleans text deterministically: Unicode NFKD accent stripping, lowercase, trim, collapse spaces.
   */
  public static cleanText(input: string): string {
    if (!input) return '';
    return input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-_.]/g, '') // strip punctuation like !, ?, comma
      .replace(/[\s-_.]+/g, ' ')
      .trim();
  }

  /**
   * Normalizes entity name based on type.
   * For COMPANY / ORGANIZATION: strips corporate legal suffixes so "ACME S.A." and "Acme Corp" normalize to "acme".
   */
  public static normalizeName(rawName: string, entityType: CanonicalEntityType): string {
    if (!rawName) return '';

    let cleaned = rawName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (entityType === 'COMPANY' || entityType === 'ORGANIZATION') {
      for (const pattern of this.LEGAL_SUFFIX_PATTERNS) {
        cleaned = cleaned.replace(pattern, ' ');
      }
    }

    return this.cleanText(cleaned);
  }

  /**
   * Normalizes a web domain deterministically.
   * Strips protocol, www., ports, path, and query params.
   * Example: "https://www.Acme.com:443/about?ref=1" -> "acme.com"
   */
  public static normalizeDomain(rawUrlOrDomain: string | undefined): string | undefined {
    if (!rawUrlOrDomain) return undefined;
    let d = rawUrlOrDomain.trim().toLowerCase();
    
    // Strip protocol
    d = d.replace(/^https?:\/\//i, '');
    d = d.replace(/^ftp:\/\//i, '');
    
    // Strip path and query/hash
    d = d.split('/')[0];
    d = d.split('?')[0];
    d = d.split('#')[0];
    
    // Strip port
    d = d.split(':')[0];
    
    // Strip leading www. or www[0-9].
    d = d.replace(/^www\d?\./i, '');
    d = d.trim();

    return d.length > 0 ? d : undefined;
  }

  /**
   * Normalizes email to lowercase trimmed string, then produces canonical SHA-256 hash.
   * Prohibits plaintext storage.
   */
  public static hashEmail(email: string | undefined): string | undefined {
    if (!email) return undefined;
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return undefined;
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  /**
   * Normalizes phone number to digits-only string, then produces canonical SHA-256 hash.
   * Prohibits plaintext storage.
   */
  public static hashPhone(phone: string | undefined): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return undefined; // Fail closed on insufficient digits
    return crypto.createHash('sha256').update(digits).digest('hex');
  }

  /**
   * Normalizes hierarchical location without conflating jurisdictions.
   * Distinctly separates CABA from Provincia de Buenos Aires.
   */
  public static normalizeLocation(raw: HierarchicalLocation | string | undefined): HierarchicalLocation | undefined {
    if (!raw) return undefined;

    if (typeof raw === 'object' && raw.normalized_label) {
      return {
        country: raw.country?.toUpperCase() || 'AR',
        admin_level_1: raw.admin_level_1?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        normalized_label: this.cleanText(raw.normalized_label)
      };
    }

    const rawStr = typeof raw === 'string' ? raw : '';
    const clean = this.cleanText(rawStr);

    let country = 'AR';
    let admin1: string | undefined = undefined;
    let city: string | undefined = undefined;

    // Strict non-ambiguous disambiguation for Argentina regions
    if (clean.includes('caba') || clean.includes('ciudad autonoma de buenos aires') || clean.includes('capital federal')) {
      country = 'AR';
      admin1 = 'Ciudad Autónoma de Buenos Aires';
      city = 'Buenos Aires';
    } else if (clean.includes('provincia de buenos aires') || clean.includes('pba') || clean.includes('buenos aires province')) {
      country = 'AR';
      admin1 = 'Provincia de Buenos Aires';
      if (clean.includes('la plata')) city = 'La Plata';
      else if (clean.includes('mar del plata')) city = 'Mar del Plata';
      else if (clean.includes('quilmes')) city = 'Quilmes';
      else if (clean.includes('san isidro')) city = 'San Isidro';
    } else if (clean.includes('buenos aires') && !clean.includes('provincia')) {
      // Default Buenos Aires city
      country = 'AR';
      admin1 = 'Ciudad Autónoma de Buenos Aires';
      city = 'Buenos Aires';
    } else if (clean.includes('cordoba')) {
      country = 'AR';
      admin1 = 'Córdoba';
      city = 'Córdoba';
    } else if (clean.includes('rosario') || clean.includes('santa fe')) {
      country = 'AR';
      admin1 = 'Santa Fe';
      city = clean.includes('rosario') ? 'Rosario' : 'Santa Fe';
    } else if (clean.includes('mendoza')) {
      country = 'AR';
      admin1 = 'Mendoza';
      city = 'Mendoza';
    } else if (clean.includes('argentina') || clean === 'ar') {
      country = 'AR';
    } else if (clean.length > 0) {
      country = 'AR';
      city = clean;
    }

    const labelParts = [country, admin1, city].filter(Boolean);
    const normalized_label = labelParts.map(p => this.cleanText(p!)).join(':');

    return {
      country,
      admin_level_1: admin1,
      city,
      normalized_label
    };
  }

  /**
   * Computes Jaro-Winkler string similarity between two normalized strings (0.0 to 1.0).
   */
  public static calculateSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    const len1 = s1.length;
    const len2 = s2.length;
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix bonus (up to 4 chars)
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return Math.min(1.0, jaro + prefix * 0.1 * (1 - jaro));
  }
}
