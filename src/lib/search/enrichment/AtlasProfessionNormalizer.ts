/**
 * ATLAS PROFESSION NORMALIZER V1
 * 
 * Deterministic, evidence-first normalization of public roles, job titles,
 * and organizational positions into standardized, canonical professions.
 * 
 * Principle:
 * - Deterministic rule engine first (zero hallucination).
 * - LLM can only suggest if deterministic rule validates evidence before persistence.
 * - Fail-closed on ambiguous roles ("Empleado", "Agente", "Personal").
 */

export interface NormalizedProfessionResult {
  RAW_ROLE: string;
  NORMALIZED_PROFESSION: string | null;
  NORMALIZATION_CONFIDENCE: number;
  SOURCE_EVIDENCE: string;
  NORMALIZATION_RULE_VERSION: string;
  PROFESSION_CATEGORY: string | null;
  IS_CANONICAL: boolean;
}

interface ProfessionRule {
  profession: string;
  category: string;
  keywords: string[];
  requiredOrgs?: string[];
  confidence: number;
}

export class AtlasProfessionNormalizer {
  public static readonly RULE_VERSION = 'v1.0-deterministic-ssot';

  private static readonly RULES: ProfessionRule[] = [
    // 1. Investigadores & Científicos
    {
      profession: 'Investigador / Científico',
      category: 'Investigación y Desarrollo',
      keywords: ['investigador', 'investigadora', 'researcher', 'scientist', 'becario doctoral', 'becaria doctoral', 'becario postdoctoral', 'conicet'],
      confidence: 0.98
    },
    // 2. Docentes Universitarios y Catedráticos
    {
      profession: 'Docente Universitario / Académico',
      category: 'Educación Superior',
      keywords: ['profesor titular', 'profesora titular', 'profesor adjunto', 'profesora adjunta', 'profesor asociado', 'docente universitario', 'jefe de trabajos practicos', 'jtp', 'ayudante de primera', 'catedratico', 'decanato', 'rector', 'vicerrector'],
      confidence: 0.96
    },
    // 3. Magistrados y Funcionarios Judiciales
    {
      profession: 'Magistrado / Funcionario Judicial',
      category: 'Poder Judicial',
      keywords: ['juez', 'jueza', 'magistrado', 'magistrada', 'fiscal', 'fiscal general', 'defensor publico', 'defensora publica', 'secretario de juzgado', 'secretaria de juzgado', 'secretario judicial', 'prosecretario judicial', 'camarista'],
      confidence: 0.99
    },
    // 4. Abogados y Asesores Legales
    {
      profession: 'Abogado / Asesor Legal',
      category: 'Servicios Jurídicos',
      keywords: ['abogado', 'abogada', 'asesor legal', 'asesora legal', 'dictaminante', 'letrado', 'apoderado legal', 'apoderada legal', 'defensor letrado'],
      confidence: 0.94
    },
    // 5. Médicos y Especialistas en Salud
    {
      profession: 'Médico / Especialista de la Salud',
      category: 'Salud',
      keywords: ['medico', 'medica', 'cirujano', 'cirujana', 'jefe de servicio medico', 'jefe de sala', 'residente medico', 'medico especialista', 'cardiólogo', 'pediatra', 'anestesiólogo', 'oncólogo', 'traumatólogo', 'tocoginecólogo'],
      confidence: 0.98
    },
    // 6. Bioquímicos y Farmacéuticos
    {
      profession: 'Bioquímico / Farmacéutico',
      category: 'Salud y Farmacia',
      keywords: ['bioquimico', 'bioquimica', 'farmaceutico', 'farmaceutica', 'director tecnico de farmacia', 'farmacia hospitalaria'],
      confidence: 0.96
    },
    // 7. Directores y Autoridades Societarias
    {
      profession: 'Director / Ejecutivo de Empresa',
      category: 'Dirección Empresarial',
      keywords: ['presidente de directorio', 'vicepresidente de directorio', 'director titular', 'directora titular', 'director suplente', 'gerente general', 'ceo', 'director ejecutivo', 'sindico titular', 'sindica titular', 'miembro del consejo directivo'],
      confidence: 0.95
    },
    // 8. Altos Funcionarios de Administración Pública
    {
      profession: 'Funcionario Público / Alta Dirección Pública',
      category: 'Administración Pública',
      keywords: ['director nacional', 'directora nacional', 'director general', 'directora general', 'secretario de estado', 'subsecretario de estado', 'ministro', 'ministra', 'coordinador general', 'subdirector general', 'auditor interno'],
      confidence: 0.95
    },
    // 9. Contadores Públicos y Auditores Financieros
    {
      profession: 'Contador Público / Auditor Financiero',
      category: 'Contabilidad y Finanzas',
      keywords: ['contador publico', 'contadora publica', 'auditor contable', 'analista contable senior', 'sindicatura societaria contable', 'actuario'],
      confidence: 0.95
    },
    // 10. Ingenieros
    {
      profession: 'Ingeniero / Especialista Técnico',
      category: 'Ingeniería',
      keywords: ['ingeniero', 'ingeniera', 'ingeniero civil', 'ingeniero industrial', 'ingeniero agronomo', 'ingeniero mecanico', 'ingeniero quimico', 'jefe de planta'],
      confidence: 0.95
    },
    // 11. Ingenieros y Especialistas de Sistemas / Tecnología
    {
      profession: 'Especialista en Sistemas / Tecnología',
      category: 'Tecnología y Datos',
      keywords: ['ingeniero de software', 'desarrollador', 'desarrolladora', 'arquitecto de soluciones', 'data scientist', 'administrador de base de datos', 'analista de sistemas', 'cto', 'jefe de sistemas'],
      confidence: 0.94
    },
    // 12. Arquitectos y Urbanistas
    {
      profession: 'Arquitecto / Urbanista',
      category: 'Arquitectura y Urbanismo',
      keywords: ['arquitecto', 'arquitecta', 'director de obra de arquitectura', 'urbanista'],
      confidence: 0.94
    },
    // 13. Economistas y Especialistas Financieros
    {
      profession: 'Economista / Analista Financiero',
      category: 'Economía y Finanzas',
      keywords: ['economista', 'licenciado en economia', 'analista macroeconomico', 'gestor de cartera', 'asesor financiero'],
      confidence: 0.93
    }
  ];

  // Generic roles that must deliberately FAIL-CLOSED to avoid false precision
  private static readonly AMBIGUOUS_TERMS = [
    'empleado', 'empleada', 'personal', 'agente', 'planta permanente', 'planta transitoria',
    'contratado', 'contratada', 'auxiliar', 'asistente administrativo', 'administrativo',
    'administrativa', 'miembro', 'personal de gabinete', 'locacion de servicios'
  ];

  public normalize(rawRole: string | null | undefined, organization?: string, sourceId?: string): NormalizedProfessionResult {
    if (!rawRole || rawRole.trim() === '') {
      return {
        RAW_ROLE: '',
        NORMALIZED_PROFESSION: null,
        NORMALIZATION_CONFIDENCE: 0.0,
        SOURCE_EVIDENCE: `Source: ${sourceId || 'UNKNOWN'} (Empty raw role)`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: null,
        IS_CANONICAL: false
      };
    }

    const cleanedRole = rawRole.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const orgClean = (organization || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Check specific source heuristics first
    if (sourceId === 'CONICET_OAI_PMH') {
      return {
        RAW_ROLE: rawRole,
        NORMALIZED_PROFESSION: 'Investigador / Científico',
        NORMALIZATION_CONFIDENCE: 0.99,
        SOURCE_EVIDENCE: `CONICET Registry Official Author: ${rawRole}`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: 'Investigación y Desarrollo',
        IS_CANONICAL: true
      };
    }

    if (sourceId && sourceId.includes('UNIVERSIDADES_NACIONALES')) {
      return {
        RAW_ROLE: rawRole,
        NORMALIZED_PROFESSION: 'Docente Universitario / Académico',
        NORMALIZATION_CONFIDENCE: 0.98,
        SOURCE_EVIDENCE: `CONEAU / SPU Official Academic Roster: ${rawRole}`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: 'Educación Superior',
        IS_CANONICAL: true
      };
    }

    if (sourceId && (sourceId.includes('PJN') || sourceId.includes('SCBA') || sourceId.includes('JUSTICIA'))) {
      return {
        RAW_ROLE: rawRole,
        NORMALIZED_PROFESSION: 'Magistrado / Funcionario Judicial',
        NORMALIZATION_CONFIDENCE: 0.99,
        SOURCE_EVIDENCE: `Official Judicial Gazette Appointment: ${rawRole}`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: 'Poder Judicial',
        IS_CANONICAL: true
      };
    }

    if (sourceId && sourceId.includes('BORA_AUTORIDADES_SOCIETARIAS')) {
      return {
        RAW_ROLE: rawRole,
        NORMALIZED_PROFESSION: 'Director / Ejecutivo de Empresa',
        NORMALIZATION_CONFIDENCE: 0.96,
        SOURCE_EVIDENCE: `BORA Corporate Edits Appointment: ${rawRole}`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: 'Dirección Empresarial',
        IS_CANONICAL: true
      };
    }

    // Check deterministic rules against cleanedRole
    for (const rule of AtlasProfessionNormalizer.RULES) {
      for (const kw of rule.keywords) {
        if (cleanedRole.includes(kw)) {
          return {
            RAW_ROLE: rawRole,
            NORMALIZED_PROFESSION: rule.profession,
            NORMALIZATION_CONFIDENCE: rule.confidence,
            SOURCE_EVIDENCE: `Rule Match keyword "${kw}" on raw role "${rawRole}" (Org: ${organization || 'N/A'})`,
            NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
            PROFESSION_CATEGORY: rule.category,
            IS_CANONICAL: true
          };
        }
      }
    }

    // Fail-closed for ambiguous terms
    const isAmbiguous = AtlasProfessionNormalizer.AMBIGUOUS_TERMS.some(t => cleanedRole.includes(t));
    if (isAmbiguous) {
      return {
        RAW_ROLE: rawRole,
        NORMALIZED_PROFESSION: null,
        NORMALIZATION_CONFIDENCE: 0.35,
        SOURCE_EVIDENCE: `Ambiguous public role ("${rawRole}") — suppressed from false precision`,
        NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
        PROFESSION_CATEGORY: null,
        IS_CANONICAL: false
      };
    }

    // Organization context fallback for high-confidence entities
    if (orgClean.includes('hospital') || orgClean.includes('sanatorio') || orgClean.includes('clinica')) {
      if (cleanedRole.includes('jefe') || cleanedRole.includes('coordinador') || cleanedRole.includes('medico') || cleanedRole.includes('atencion')) {
        return {
          RAW_ROLE: rawRole,
          NORMALIZED_PROFESSION: 'Médico / Especialista de la Salud',
          NORMALIZATION_CONFIDENCE: 0.90,
          SOURCE_EVIDENCE: `Hospital organizational anchor: "${organization}" with role "${rawRole}"`,
          NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
          PROFESSION_CATEGORY: 'Salud',
          IS_CANONICAL: true
        };
      }
    }

    return {
      RAW_ROLE: rawRole,
      NORMALIZED_PROFESSION: null,
      NORMALIZATION_CONFIDENCE: 0.40,
      SOURCE_EVIDENCE: `Unmatched specific rule for: "${rawRole}"`,
      NORMALIZATION_RULE_VERSION: AtlasProfessionNormalizer.RULE_VERSION,
      PROFESSION_CATEGORY: null,
      IS_CANONICAL: false
    };
  }
}
