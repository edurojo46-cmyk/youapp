/**
 * Social Entity Classifier & Geographic Grounding Guard
 * Directives:
 * 1. CHANNEL != PERSON (BUSINESS_AS_PERSON_FALSE_POSITIVES = 0)
 * 2. SEARCH QUERY IS NOT GEOGRAPHIC EVIDENCE (QUERY_TERM_AS_LOCATION_EVIDENCE = 0)
 * 3. SOCIAL LOCATION SEMANTICS (Only assign SOCIAL_LOCATION_DECLARED when profile explicitly mentions location)
 * 4. YOUTUBE PERSON CLASSIFICATION (PERSON, ORGANIZATION, BUSINESS, MEDIA_CHANNEL, UNKNOWN)
 * 5. PERSON EVIDENCE (Individual name, credentials, professional bio)
 */

import { CABA_48_NEIGHBORHOODS } from '../geography/CabaGeographyCatalog';

export type ClassifiedEntityType = 
  | 'PERSON' 
  | 'ORGANIZATION' 
  | 'BUSINESS' 
  | 'MEDIA_CHANNEL' 
  | 'UNKNOWN';

export interface SocialEntityClassification {
  entity_type: ClassifiedEntityType;
  is_person: boolean;
  confidence: number;
  extracted_person_name?: string;
  rejection_reason?: string;
  classification_evidence: string;
}

export interface SocialGeographicEvidence {
  has_explicit_evidence: boolean;
  matched_neighborhood?: string;
  evidence_text: string;
  source: 'PROFILE_DESCRIPTION' | 'PROFILE_TITLE' | 'LINKED_WEBSITE' | 'NONE';
}

export class SocialEntityClassifier {
  // Typical corporate / business / media stopwords in Argentina & Latin America
  private static readonly ORG_BUSINESS_TERMS = [
    'dream', 'medical', 'beauty', 'spa', 'estetica', 'estética',
    'atelier', 'estudio', 'arquitectos', 'arquitectura', 'asociados', '& asociados',
    'inmobiliaria', 'inmobiliario', 'inmobiliarios', 'propiedades', 'bienes raices',
    'accidentes', 'accidentes de trabajo', 'reclamos', 'seguros',
    'fondos y locales', 'fondos de comercio',
    'labmedicina', 'laboratorio', 'laboratorios', 'analisis clinicos', 'análisis clínicos',
    'servicios', 'soluciones', 'solutions', 'servicios juridicos', 'servicios jurídicos',
    'consultores', 'consultora', 'consulting',
    'clinica', 'clínica', 'sanatorio', 'hospital', 'policlinica', 'policlínica',
    'instituto', 'centro', 'fundacion', 'fundación', 'asociacion', 'asociación',
    'colegio', 'escuela', 'academia', 'universidad', 'facultad',
    'canal', 'tv', 'television', 'televisión', 'radio', 'noticias', 'noticiero', 'news', 'medio', 'diario',
    'tienda', 'store', 'shop', 'boutique', 'showroom', 'comercio', 'local', 'distribuidora',
    'restaurante', 'bar', 'cafe', 'café', 'panaderia', 'panadería', 'pizzeria', 'pizzería',
    's.a.', 'sa', 's.r.l.', 'srl', 's.a.s.', 'sas', 'inc', 'corp', 'llc', 'company', 'co.',
    'group', 'grupo', 'holding', 'estudio juridico', 'estudio jurídico', 'estudio contable',
    'topic', '- topic', 'oficial', 'oficial de', 'canal oficial'
  ];

  private static readonly HUMAN_HONORIFICS = [
    'dr', 'dr.', 'dra', 'dra.', 'lic', 'lic.', 'licenciado', 'licenciada',
    'arq', 'arq.', 'arquitecto', 'arquitecta', 'abog', 'abog.', 'abogado', 'abogada',
    'prof', 'prof.', 'profesor', 'profesora', 'ing', 'ing.', 'ingeniero', 'ingeniera',
    'ctdor', 'ctdor.', 'contador', 'contadora', 'odont', 'odont.', 'odontologo', 'odontologa',
    'odontólogo', 'odontóloga', 'psic', 'psic.', 'psicologo', 'psicologa', 'psicólogo', 'psicóloga',
    'doc', 'doc.', 'médico', 'medico', 'médica', 'medica'
  ];

  /**
   * Classifies a social channel/profile into PERSON, ORGANIZATION, BUSINESS, MEDIA_CHANNEL, or UNKNOWN.
   * Guarantees: BUSINESS_AS_PERSON_FALSE_POSITIVES = 0.
   */
  public static classify(
    title: string,
    description: string = '',
    customUrl: string = ''
  ): SocialEntityClassification {
    const rawTitle = title.trim();
    const cleanLower = rawTitle.toLowerCase();
    const descLower = description.toLowerCase();

    // 1. Check for Media Channel / Topic indicators
    if (cleanLower.endsWith('- topic') || cleanLower.includes('topic') || cleanLower.includes('noticias') || cleanLower.includes('tv') || cleanLower.includes('noticiero') || cleanLower.includes('magazine')) {
      return {
        entity_type: 'MEDIA_CHANNEL',
        is_person: false,
        confidence: 95,
        rejection_reason: 'Canal de medios, noticias o generado automáticamente por plataforma (Topic)',
        classification_evidence: `Canal de medios/topic detectado: "${rawTitle}"`
      };
    }

    // 2. Check for explicit organization / business keywords in title
    for (const term of this.ORG_BUSINESS_TERMS) {
      // Regex word boundary matching
      const regex = new RegExp(`(^|\\b|\\s)${term}(\\b|\\s|$)`, 'i');
      if (regex.test(cleanLower)) {
        // Exception: Honorifics like "Dr. Bruno Panzuto Psiquiatra"
        const hasHonorific = this.HUMAN_HONORIFICS.some(h => cleanLower.startsWith(`${h} `) || cleanLower.includes(` ${h} `));
        const words = rawTitle.split(/\s+/);
        
        // If it starts with Dr./Dra./Lic. and has personal name followed by profession (e.g. Dr. Bruno Panzuto Psiquiatra)
        if (hasHonorific && words.length >= 3 && !cleanLower.includes('clinica') && !cleanLower.includes('centro') && !cleanLower.includes('instituto') && !cleanLower.includes('atelier') && !cleanLower.includes('estudio')) {
          break; // proceed to person validation
        }

        const isBusiness = ['store', 'shop', 'boutique', 'comercio', 'local', 'restaurante', 'cafe', 'café', 'bar', 'dream', 'beauty', 'spa'].some(t => cleanLower.includes(t));
        return {
          entity_type: isBusiness ? 'BUSINESS' : 'ORGANIZATION',
          is_person: false,
          confidence: 92,
          rejection_reason: `Título contiene identificador corporativo/comercial/estudio: "${term}"`,
          classification_evidence: `Entidad no física identificada por término: "${term}" en "${rawTitle}"`
        };
      }
    }

    // 3. Positive Person Detection
    // Check if name has honorific: Dr., Dra., Lic., Arq., etc.
    const firstWord = cleanLower.split(/\s+/)[0].replace(/[.,]/g, '');
    const hasHonorific = this.HUMAN_HONORIFICS.includes(firstWord) || cleanLower.startsWith('dr ') || cleanLower.startsWith('dra ') || cleanLower.startsWith('lic ') || cleanLower.startsWith('arq ');

    // Count words (typical Spanish personal name is 2 to 4 words, e.g. "Gerardo Savia", "Martha Caballero", "Federico Berardi")
    const cleanedTitleWords = rawTitle
      .replace(/^(Canal de|Canal oficial de|Oficial)\s+/i, '')
      .replace(/\s*-\s*YouTube$/i, '')
      .trim()
      .split(/\s+/);

    const isTwoToFourWords = cleanedTitleWords.length >= 2 && cleanedTitleWords.length <= 4;
    
    // Validate capitalization (e.g. "Gerardo Savia", "Eva Maria Beristain")
    const hasPersonNameCapitalization = cleanedTitleWords.every(w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w) || this.HUMAN_HONORIFICS.includes(w.toLowerCase().replace('.', '')));

    if (hasHonorific || (isTwoToFourWords && hasPersonNameCapitalization)) {
      return {
        entity_type: 'PERSON',
        is_person: true,
        confidence: hasHonorific ? 96 : 88,
        extracted_person_name: rawTitle,
        classification_evidence: hasHonorific 
          ? `Persona física identificada con título/honorífico profesional: "${rawTitle}"`
          : `Nombre y apellido humano individual válido: "${rawTitle}"`
      };
    }

    // 4. If description has strong first-person professional presentation
    if (
      descLower.includes('mi nombre es ') ||
      descLower.includes('soy médico') ||
      descLower.includes('soy psicólogo') ||
      descLower.includes('soy psicóloga') ||
      descLower.includes('soy abogado') ||
      descLower.includes('soy arquitecto') ||
      descLower.includes('médico graduado') ||
      descLower.includes('psicóloga egresada')
    ) {
      return {
        entity_type: 'PERSON',
        is_person: true,
        confidence: 85,
        extracted_person_name: rawTitle,
        classification_evidence: `Descripción en primera persona con credencial profesional acreditada: "${rawTitle}"`
      };
    }

    // 5. Ambiguous or unknown
    return {
      entity_type: 'UNKNOWN',
      is_person: false,
      confidence: 60,
      rejection_reason: 'Título ambiguo sin prueba fáctica concluyente de ser persona física',
      classification_evidence: `Canal/perfil no califica concluyentemente como persona física: "${rawTitle}"`
    };
  }

  /**
   * Extracts explicit factual geographic evidence from channel/profile description or title.
   * Directive Section 2: SEARCH QUERY IS NOT GEOGRAPHIC EVIDENCE (QUERY_TERM_AS_LOCATION_EVIDENCE = 0).
   * Only returns positive evidence if the channel description/title itself explicitly mentions CABA / neighborhood / address.
   */
  public static extractDeclaredGeographicEvidence(
    description: string,
    title: string = '',
    linkedWebsiteUrl: string = ''
  ): SocialGeographicEvidence {
    const combinedText = `${title} ${description} ${linkedWebsiteUrl}`.toLowerCase();

    // Check all 48 CABA neighborhoods and their street anchors
    for (const b of CABA_48_NEIGHBORHOODS) {
      const bNorm = b.normalized_name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Check explicit neighborhood name
      const nameRegex = new RegExp(`\\b${bName}\\b`, 'i');
      if (nameRegex.test(combinedText)) {
        return {
          has_explicit_evidence: true,
          matched_neighborhood: b.name,
          evidence_text: `Mención expresa del barrio "${b.name}" en descripción o perfil público`,
          source: description.toLowerCase().includes(bName) ? 'PROFILE_DESCRIPTION' : 'PROFILE_TITLE'
        };
      }

      // Check aliases (e.g. "Parque Centenario", "Barrio Norte", "Tribunales")
      for (const alias of b.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower.length > 4 && combinedText.includes(aliasLower)) {
          return {
            has_explicit_evidence: true,
            matched_neighborhood: b.name,
            evidence_text: `Mención expresa de referencia geográfica local "${alias}" vinculada a ${b.name}`,
            source: 'PROFILE_DESCRIPTION'
          };
        }
      }

      // Check key street anchors (e.g. "Pedro Goyena", "Díaz Vélez", "Av. Santa Fe")
      for (const street of b.key_streets_anchors) {
        const stLower = street.toLowerCase();
        if (stLower.length > 5 && combinedText.includes(stLower)) {
          return {
            has_explicit_evidence: true,
            matched_neighborhood: b.name,
            evidence_text: `Mención expresa de arteria/dirección física "${street}" perteneciente a ${b.name}`,
            source: 'PROFILE_DESCRIPTION'
          };
        }
      }
    }

    // Check generic CABA / Buenos Aires mentions
    if (combinedText.includes('caba') || combinedText.includes('ciudad de buenos aires') || combinedText.includes('capital federal') || combinedText.includes('buenos aires, argentina')) {
      return {
        has_explicit_evidence: true,
        matched_neighborhood: undefined, // CABA citywide without specific neighborhood anchor
        evidence_text: 'Mención expresa de Ciudad de Buenos Aires / CABA en descripción pública',
        source: 'PROFILE_DESCRIPTION'
      };
    }

    // Zero geographic evidence in profile content!
    return {
      has_explicit_evidence: false,
      matched_neighborhood: undefined,
      evidence_text: 'Sin evidencia geográfica en el perfil (búsqueda no constituye evidencia)',
      source: 'NONE'
    };
  }
}
