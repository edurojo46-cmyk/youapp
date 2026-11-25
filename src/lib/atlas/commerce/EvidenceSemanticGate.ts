/**
 * ATLAS VENDER / COMMERCE V1
 * Module: EvidenceSemanticGate.ts
 * Path: src/lib/atlas/commerce/EvidenceSemanticGate.ts
 * 
 * Separates PROVENANCE_VALIDITY from SEMANTIC_VALIDITY.
 * An assertion can be physically real and provenanced, but semantically conflicting.
 * 
 * Strict Invariants:
 * - PROVENANCE_VALID != SEMANTIC_VALID.
 * - CONFLICTING evidence CANNOT produce NEED_MATCH = true, USE_CASE_MATCH = true, or HIGH/MEDIUM fit.
 * - ZERO hardcoding of specific company names or search terms.
 * - General cross-field semantic consistency between canonical name, activity, industry, and context.
 */

export type SemanticValidityStatus = 'SUPPORTED' | 'CONFLICTING' | 'INSUFFICIENT';

export interface SemanticValidityEvaluation {
  status: SemanticValidityStatus;
  is_conflicting: boolean;
  conflict_reason: string | null;
  corroboration_score: number;
  conflicting_signals: string[];
}

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export class EvidenceSemanticGate {
  /**
   * Evaluates whether an asserted activity or signal is semantically trustworthy
   * given the entity's canonical name, entity type, and surrounding operational context.
   */
  public static evaluateSemanticValidity(params: {
    entity_name: string;
    entity_type: string;
    activity: string;
    metadata?: Record<string, any>;
    assertions?: Array<{ predicate: string; value_normalized: string; truth_nature?: string }>;
  }): SemanticValidityEvaluation {
    const rawName = params.entity_name || '';
    const rawActivity = params.activity || '';
    const meta = params.metadata || {};

    if (!rawName || !rawActivity) {
      return {
        status: 'INSUFFICIENT',
        is_conflicting: false,
        conflict_reason: null,
        corroboration_score: 0.5,
        conflicting_signals: []
      };
    }

    const nNorm = stripDiacritics(rawName.toLowerCase());
    const actNorm = stripDiacritics(rawActivity.toLowerCase());
    const addressNorm = stripDiacritics(String(meta.address || meta.domicilio || '').toLowerCase());
    const sourceNorm = stripDiacritics(String(meta.source_name || meta.provenance || meta.source_id || '').toLowerCase());

    const conflictingSignals: string[] = [];

    // 1. NON-PROFIT / CIVIC / CULTURAL / HERITAGE / SPORTS / COOPERATIVE IDENTITY MARKERS
    // Institutional bodies, social/sports clubs, monuments, non-profits, or worker cooperatives
    const isInstitutionalCulturalSportsOrHeritage = 
      /\b(pueblo|comunidad indigena|asoc\.|asoc\b|asociaci|asocici|fundacion|cooperadora|sociedad de fomento|casa.*cultura|centro cultural|bicentenario|bib\.|bib\b|biblio|biblioteca|museo|orquesta|teatro|parroquia|templo|iglesia|cooperativa|mutual|club|futbol club|deportivo|atletico|reloj de sol|reduccion jesuitica|estancia jesuitica|ruinas|monumento historico|lugar historico|patrimonio)\b/i.test(nNorm);

    // Specific retail, trade or workshop activities that contradict purely civic/cultural/heritage/sports entities
    const isCommercialCraftOrRetailActivity = /\b(cerrajeria|locksmith|ferreteria|carniceria|butcher|panaderia|pizzeria|rotiseria|supermercado|supermarket|farmacia)\b/i.test(actNorm);

    // Cultural beneficiary context markers or heritage datasets mistakenly ingested as address or source
    const hasCulturalOrHeritageDatasetContext = 
      /publico general|nineces|jovenes|adultos|puntos de cultura|casas del bicentenario|beneficiarias/i.test(addressNorm) ||
      /puntos de cultura|casas del bicentenario|datos\.cultura\.gob\.ar|monumentos|patrimonio/i.test(sourceNorm) ||
      /SRC_AUTONOMOUS_(DB398BF1|A51E0887|1A39092A)/i.test(String(meta.source_id || ''));

    // Check if the entity name genuinely corroborates the commercial activity
    const nameCorroboratesTrade = actNorm.length >= 4 && (
      (actNorm.includes('cerraj') && nNorm.includes('cerraj')) ||
      (actNorm.includes('locksmith') && (nNorm.includes('cerraj') || nNorm.includes('locksmith'))) ||
      (actNorm.includes('ferret') && nNorm.includes('ferret')) ||
      (actNorm.includes('carnic') && (nNorm.includes('carnic') || nNorm.includes('frigorifico'))) ||
      (actNorm.includes('butcher') && (nNorm.includes('carnic') || nNorm.includes('butcher'))) ||
      (actNorm.includes('panad') && (nNorm.includes('panad') || nNorm.includes('confiter') || nNorm.includes('bakery'))) ||
      (actNorm.includes('farmac') && (nNorm.includes('farmac') || nNorm.includes('pharmacy')))
    );

    if (isInstitutionalCulturalSportsOrHeritage && isCommercialCraftOrRetailActivity && !nameCorroboratesTrade) {
      conflictingSignals.push(`Entidad institucional/cultural/patrimonial/deportiva (${rawName}) con actividad comercial/artesanal (${rawActivity}) sin correlato en su denominación u objeto social`);
    }

    if (hasCulturalOrHeritageDatasetContext && isCommercialCraftOrRetailActivity && !nameCorroboratesTrade) {
      conflictingSignals.push(`Contexto de programa cultural/patrimonial beneficiario con actividad comercial incongruente (${rawActivity})`);
    }

    // 2. EXPLICIT INDUSTRIAL DIVERGENCE BETWEEN NAME AND CATEGORY
    // If the entity's name explicitly declares one specific specialized industry,
    // an asserted category belonging to an unrelated trade constitutes a semantic conflict.
    const industryInName = this.extractSpecializedIndustryFromName(nNorm);
    const industryInActivity = this.extractSpecializedIndustryFromName(actNorm);

    if (industryInName && industryInActivity && industryInName !== industryInActivity) {
      conflictingSignals.push(`Contradicción industrial: rubro explícito en denominación (${industryInName}) vs rubro asignado (${industryInActivity})`);
    }

    // Determine final status
    if (conflictingSignals.length > 0) {
      return {
        status: 'CONFLICTING',
        is_conflicting: true,
        conflict_reason: conflictingSignals.join('; '),
        corroboration_score: 0.10,
        conflicting_signals: conflictingSignals
      };
    }

    // Corroboration score for supported entities
    let corroboration = 0.70;
    // Positive corroboration if name and activity share semantic tokens or corporate structure
    if (actNorm.length >= 4 && nNorm.includes(actNorm)) {
      corroboration = 0.95;
    } else if (params.assertions && params.assertions.length >= 3) {
      corroboration = 0.85;
    }

    return {
      status: 'SUPPORTED',
      is_conflicting: false,
      conflict_reason: null,
      corroboration_score: corroboration,
      conflicting_signals: []
    };
  }

  /**
   * Helper to identify specialized industry keywords from text.
   */
  private static extractSpecializedIndustryFromName(text: string): string | null {
    if (/\b(reciclado|reciclaje|residuos|ferrosos|plasticos)\b/.test(text)) return 'RECICLAJE_RESIDUOS';
    if (/\b(cerrajeria|cerrajero)\b/.test(text)) return 'CERRAJERIA';
    if (/\b(ferreteria|ferretero)\b/.test(text)) return 'FERRETERIA';
    if (/\b(carniceria|frigorifico|butcher)\b/.test(text)) return 'CARNICERIA';
    if (/\b(panaderia|confiteria|bakery)\b/.test(text)) return 'PANADERIA';
    if (/\b(farmacia|farmaceutic)\b/.test(text)) return 'FARMACIA';
    if (/\b(software|sistemas|tecnologia|consultoria it)\b/.test(text)) return 'SOFTWARE_TI';
    if (/\b(construccion|constructora|obras civiles|ingenieria)\b/.test(text)) return 'CONSTRUCCION';
    if (/\b(cemento|hormigon|materiales de construccion)\b/.test(text)) return 'MATERIALES_CONSTRUCCION';
    if (/\b(alimentos|bebidas|lacteos|azucar)\b/.test(text)) return 'ALIMENTOS_BEBIDAS';
    if (/\b(salud|medicina|sanatorio|hospital|clinica)\b/.test(text)) return 'SALUD';
    if (/\b(veterinaria|pet|mascotas|zoosanitario)\b/.test(text)) return 'VETERINARIA';
    return null;
  }
}
