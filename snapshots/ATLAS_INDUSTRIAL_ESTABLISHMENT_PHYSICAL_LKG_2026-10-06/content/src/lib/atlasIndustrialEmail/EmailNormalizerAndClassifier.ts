/**
 * ATLAS — INDUSTRIAL EMAIL NORMALIZER & CLASSIFIER
 * Strict validation, RFC-compliance, Argentine relation verification & taxonomy
 */

import crypto from 'crypto';
import type { ValidContactType, ValidArgentinaRelationType } from './types.ts';

// RFC-compliant email regex
export const EMAIL_EXTRACTION_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export class EmailNormalizerAndClassifier {
  /**
   * Normalizes raw email string. Returns null if invalid or malformed.
   */
  public static normalizeEmail(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let clean = raw.trim().toLowerCase();

    // Strip wrapping quotes, brackets, or trailing punctuation
    clean = clean.replace(/^[<"'(]+|[>"'),;.:]+$/g, '').trim();

    // RFC syntax check
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return null;

    const parts = clean.split('@');
    if (parts.length !== 2) return null;
    const [local, domain] = parts;

    // Domain validation
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
    if (domain.includes('..') || local.length === 0 || domain.length < 4) return null;

    // Filter out common false positives / dummy examples
    if (domain === 'example.com' || domain === 'test.com' || domain === 'localhost') return null;
    if (local === 'usuario' || local === 'user' || local === 'email' || local === 'nombre') return null;

    return clean;
  }

  /**
   * Classifies contact type into required taxonomies
   */
  public static classifyContactType(email: string, context: string = ''): ValidContactType {
    const [local, domain] = email.split('@');
    const ctx = context.toLowerCase();

    if (
      domain.endsWith('.gob.ar') ||
      domain.endsWith('.gov.ar') ||
      domain.endsWith('.jus.gov.ar') ||
      domain.endsWith('.mil.ar') ||
      domain.endsWith('.seg.ar')
    ) {
      if (
        /^(ministro|secretario|director|intendente|gobernador|juez|fiscal|defensor|concejal|diputado|senador|subsecretario)/i.test(local) ||
        ctx.includes('autoridad') ||
        ctx.includes('magistrado') ||
        ctx.includes('funcionario')
      ) {
        return 'PUBLIC_ROLE_EMAIL';
      }
      return 'INSTITUTIONAL_EMAIL';
    }

    if (
      domain.endsWith('.edu.ar') ||
      domain.endsWith('.org.ar') ||
      domain.endsWith('.int.ar') ||
      domain.endsWith('.red.ar')
    ) {
      return 'INSTITUTIONAL_EMAIL';
    }

    if (
      /^(info|contacto|contact|ventas|comercial|administracion|admin|compras|rrhh|recepcion|secretaria|soporte|atencion|consultas|mesadeentradas)@/i.test(email)
    ) {
      if (ctx.includes('proveedor') || ctx.includes('empresa') || ctx.includes('s.a.') || ctx.includes('s.r.l.') || ctx.includes('cuit')) {
        return 'BUSINESS_EMAIL';
      }
      return 'ORGANIZATION_EMAIL';
    }

    // Individual person email (name.surname, titles)
    if (
      local.includes('.') ||
      local.includes('_') ||
      /(lic|dra?|ing|prof|arq|abg|contador|cdor)/i.test(local) ||
      ctx.includes('persona física') ||
      ctx.includes('profesional') ||
      ctx.includes('titular')
    ) {
      return 'PROFESSIONAL_PERSON_EMAIL';
    }

    if (ctx.includes('sociedad') || ctx.includes('proveedor') || ctx.includes('empresa')) {
      return 'BUSINESS_EMAIL';
    }

    return 'ORGANIZATION_EMAIL';
  }

  /**
   * Strictly verifies association to Argentina
   */
  public static verifyArgentinaRelation(
    email: string,
    sourceJurisdiction: string = '',
    sourceContext: string = ''
  ): { isVerified: boolean; relationType: ValidArgentinaRelationType; reason: string } {
    const [, domain] = email.split('@');
    const ctx = (sourceContext + ' ' + sourceJurisdiction).toLowerCase();

    // 1. Domain with .ar ccTLD
    if (domain.endsWith('.ar')) {
      if (domain.endsWith('.gob.ar') || domain.endsWith('.gov.ar') || domain.endsWith('.jus.gov.ar')) {
        return {
          isVerified: true,
          relationType: 'PUBLIC_ROLE_IN_ARGENTINA',
          reason: `Official Argentine State ccTLD (.${domain.split('.').slice(-2).join('.')})`
        };
      }
      if (domain.endsWith('.edu.ar')) {
        return {
          isVerified: true,
          relationType: 'INSTITUTION_IN_ARGENTINA',
          reason: 'Official Argentine Academic & University ccTLD (.edu.ar)'
        };
      }
      if (domain.endsWith('.org.ar')) {
        return {
          isVerified: true,
          relationType: 'ORGANIZATION_IN_ARGENTINA',
          reason: 'Official Argentine Civil Society ccTLD (.org.ar)'
        };
      }
      if (domain.endsWith('.com.ar')) {
        return {
          isVerified: true,
          relationType: 'BUSINESS_ACTIVITY_IN_ARGENTINA',
          reason: 'Argentine Commercial Registry ccTLD (.com.ar)'
        };
      }
      return {
        isVerified: true,
        relationType: 'ORGANIZATION_IN_ARGENTINA',
        reason: `Argentine National ccTLD (.ar)`
      };
    }

    // 2. Official Argentine Public Registry / Body Provenance
    if (
      sourceJurisdiction.toUpperCase().includes('ARG') ||
      sourceJurisdiction.toUpperCase().includes('NACIONAL') ||
      sourceJurisdiction.toUpperCase().includes('CABA') ||
      sourceJurisdiction.toUpperCase().includes('PBA') ||
      sourceJurisdiction.toUpperCase().includes('PROVINCIAL') ||
      ctx.includes('republica argentina') ||
      ctx.includes('buenos aires') ||
      ctx.includes('datos.gob.ar')
    ) {
      if (ctx.includes('cuit') || ctx.includes('proveedor') || ctx.includes('comercio')) {
        return {
          isVerified: true,
          relationType: 'BUSINESS_ACTIVITY_IN_ARGENTINA',
          reason: 'Documented in official Argentine commercial registry / procurement system'
        };
      }
      if (ctx.includes('autoridad') || ctx.includes('funcionario') || ctx.includes('dependencia')) {
        return {
          isVerified: true,
          relationType: 'PUBLIC_ROLE_IN_ARGENTINA',
          reason: 'Documented in official Argentine public administration directory'
        };
      }
      if (ctx.includes('matricula') || ctx.includes('profesional') || ctx.includes('colegio')) {
        return {
          isVerified: true,
          relationType: 'PROFESSIONAL_ACTIVITY_IN_ARGENTINA',
          reason: 'Documented in official Argentine professional licensing register'
        };
      }
      return {
        isVerified: true,
        relationType: 'INSTITUTION_IN_ARGENTINA',
        reason: 'Documented in official Argentine institutional repository'
      };
    }

    return {
      isVerified: false,
      relationType: 'OTHER_VERIFIED_ARGENTINA_RELATION',
      reason: 'No documented association to Argentina found'
    };
  }

  /**
   * Generates SHA-256 hash of normalized email
   */
  public static hashEmail(normalizedEmail: string): string {
    return crypto.createHash('sha256').update(normalizedEmail).digest('hex').toUpperCase();
  }
}
