/**
 * ATLAS COMMERCE — BUYER HYPOTHESIS COMPILER
 * Module: AtlasBuyerHypothesisCompiler.ts
 * Path: src/lib/atlas/commerce/AtlasBuyerHypothesisCompiler.ts
 * 
 * Compiles a formal ProductCompatibilitySpec into a generic BuyerHypothesis
 * representing the plausible buyer profile without hardcoding specific verticals.
 * 
 * Flow:
 * ProductCompatibilitySpec → BuyerHypothesis → AtlasDynamicCandidateGenerator
 */

import type { ProductCompatibilitySpec, BuyerType } from './ProductCompatibilitySpec.ts';

export interface BuyerHypothesis {
  buyer_types: ('PERSON' | 'COMPANY' | 'ORGANIZATION')[];
  relevant_domains: string[];
  relevant_industries: string[];
  relevant_professions: string[];
  use_cases: string[];
  horizontal_classification?: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL';
  primary_buyer_needs?: string[];
  buyer_operating_contexts?: string[];
  buyer_industries_positive?: string[];
  buyer_industries_neutral?: string[];
  buyer_industries_excluded?: string[];
  preferred_attributes: Record<string, any>;
  excluded_attributes: Record<string, any>;
  geo_constraints: string[];
  required_evidence_families: string[];
  search_keywords: string[];
}

export interface BuyerHypothesisOptions {
  buyer_type_override?: 'PERSON' | 'COMPANY' | 'BOTH';
  geo?: string;
}

export class AtlasBuyerHypothesisCompiler {
  /**
   * Compiles a ProductCompatibilitySpec into an actionable BuyerHypothesis.
   */
  public static compile(
    spec: ProductCompatibilitySpec,
    options?: BuyerHypothesisOptions
  ): BuyerHypothesis {
    // 1. Determine effective buyer types
    let buyerTypes: ('PERSON' | 'COMPANY' | 'ORGANIZATION')[] = spec.buyer_types || ['COMPANY', 'ORGANIZATION'];
    if (options?.buyer_type_override === 'PERSON') {
      buyerTypes = ['PERSON'];
    } else if (options?.buyer_type_override === 'COMPANY') {
      buyerTypes = ['COMPANY', 'ORGANIZATION'];
    } else if (options?.buyer_type_override === 'BOTH') {
      buyerTypes = ['PERSON', 'COMPANY', 'ORGANIZATION'];
    }

    // 2. Extract dynamic keywords from use cases, industries, professions and domain
    const keywordsSet = new Set<string>();
    const stopWords = new Set([
      'para', 'del', 'los', 'las', 'con', 'por', 'una', 'uno', 'unos', 'unas', 'sin', 'sobre', 'este', 'esta', 'estos', 'estas', 'and', 'the', 'for',
      'shop', 'store', 'afines', 'general', 'servicios', 'servicio', 'productos', 'producto', 'centro', 'articulos', 'articulo', 'actividades'
    ]);

    const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const addTokens = (str?: string) => {
      if (!str) return;
      const clean = str.toLowerCase();
      const unaccented = stripDiacritics(clean);
      const tokens = clean.split(/[\s,+/_\-–—.]+/);
      const tokensUnaccented = unaccented.split(/[\s,+/_\-–—.]+/);

      for (const t of [...tokens, ...tokensUnaccented]) {
        if (t.length > 2 && !stopWords.has(t)) {
          keywordsSet.add(t);
          // Common Spanish stem and inflection variants for robust recall
          if (t.endsWith('eria') || t.endsWith('ería')) {
            const base = t.replace(/er[ií]a$/, '');
            if (base.length >= 3) {
              keywordsSet.add(base);
              keywordsSet.add(base + 'es');
            }
          } else if (t.endsWith('cion') || t.endsWith('ción') || t.endsWith('ciones')) {
            const base = t.replace(/(ci[oó]n|ciones)$/, '');
            if (base.length >= 3) {
              keywordsSet.add(base);
              keywordsSet.add(base + 'c');
            }
          } else if (t.endsWith('arios') || t.endsWith('arias') || t.endsWith('ario') || t.endsWith('aria')) {
            const base = t.replace(/ari(o|a|os|as)$/, '');
            if (base.length >= 3) {
              keywordsSet.add(base);
              keywordsSet.add(base + 'ari');
            }
          } else if (t.endsWith('es') && t.length > 5) {
            keywordsSet.add(t.slice(0, -2));
          } else if (t.endsWith('s') && t.length > 4) {
            keywordsSet.add(t.slice(0, -1));
          }
        }
      }
    };

    const relevantIndustries = [...(spec.buyer_industries_positive || spec.target_industries || [])];

    // Taxonomy enrichment for robust candidate recall across SSOT schema variants
    if (spec.product_domain === 'PROFESSIONAL_INSURANCE') {
      const insuranceSynonyms = [
        'Salud y Asistencia Médica', 'Salud y Seguros', 'Salud y Alta Complejidad',
        'Salud y Docencia Médica', 'Salud e Investigación Médica', 'Salud y Cobertura Médica',
        'Salud y Medicina Prepaga', 'clinic', 'hospital', 'Clínica', 'Hospital',
        'Ingeniería de Software y Transformación Digital', 'Ingeniería y Construcción Industrial',
        'Consultoría Estratégica y Tecnología', 'Consultoría de Procesos y Testing'
      ];
      insuranceSynonyms.forEach(syn => {
        if (!relevantIndustries.includes(syn)) relevantIndustries.push(syn);
        addTokens(syn);
      });
    } else if (spec.product_domain === 'SOFTWARE_SAAS' && spec.horizontal_classification === 'VERTICAL') {
      // Only enrich niche vertical software with specific domain synonyms
      (spec.target_industries || []).forEach(addTokens);
    } else if (spec.product_domain === 'HARDWARE_EQUIPMENT') {
      const hardwareSynonyms = [
        'Ferretería y Afines', 'Construcción y Reformas', 'Mantenimiento y Reparación',
        'Metalmecánica', 'CERRAJERÍA', 'Instalaciones Eléctricas', 'Carpintería y Muebles'
      ];
      hardwareSynonyms.forEach(syn => {
        if (!relevantIndustries.includes(syn)) relevantIndustries.push(syn);
        addTokens(syn);
      });
    }

    (spec.use_cases || []).forEach(addTokens);
    (spec.primary_buyer_needs || []).forEach(addTokens);
    (spec.buyer_operating_contexts || []).forEach(addTokens);
    (spec.target_industries || []).forEach(addTokens);
    (spec.target_professions || []).forEach(addTokens);

    // 3. Assemble generic hypothesis
    return {
      buyer_types: buyerTypes,
      relevant_domains: [spec.product_domain],
      relevant_industries: relevantIndustries,
      relevant_professions: [...(spec.target_professions || [])],
      use_cases: [...(spec.use_cases || [])],
      horizontal_classification: spec.horizontal_classification,
      primary_buyer_needs: spec.primary_buyer_needs || [],
      buyer_operating_contexts: spec.buyer_operating_contexts || [],
      buyer_industries_positive: spec.buyer_industries_positive || spec.target_industries || [],
      buyer_industries_neutral: spec.buyer_industries_neutral || [],
      buyer_industries_excluded: spec.buyer_industries_excluded || spec.excluded_industries || [],
      preferred_attributes: {
        attributes: spec.preferred_buyer_attributes || [],
        usage_context: spec.usage_context || []
      },
      excluded_attributes: {
        attributes: spec.incompatible_buyer_attributes || [],
        excluded_industries: spec.excluded_industries || [],
        excluded_professions: spec.excluded_professions || []
      },
      geo_constraints: options?.geo ? [options.geo] : [],
      required_evidence_families: spec.evidence_requirements || [],
      search_keywords: Array.from(keywordsSet)
    };
  }
}
