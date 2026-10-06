export type ConceptDimension = 
  | 'PROFESSION' 
  | 'OCCUPATION' 
  | 'ACTIVITY' 
  | 'TRADE' 
  | 'SERVICE' 
  | 'ROLE_CLASS';

export interface WorkConcept {
  canonical_id: string;
  dimension: ConceptDimension;
  label: string;
  aliases: string[];
  related_activities: string[];
  allowed_evidence_terms: string[];
  provider_mappings: {
    wikidata_qid?: string;
    github_capable?: boolean;
    orcid_capable?: boolean;
    gemini_search_term?: string;
  };
}

export class WorkConceptResolver {
  private static concepts: WorkConcept[] = [
    {
      canonical_id: 'COMERCIANTE',
      dimension: 'OCCUPATION',
      label: 'Comerciante',
      aliases: ['comerciante', 'comerciantes', 'comercianta', 'merchant', 'retailer', 'vendedor', 'comercio'],
      related_activities: ['COMERCIO', 'VENTA_MINORISTA', 'VENTA_MAYORISTA'],
      allowed_evidence_terms: [
        'comerciante', 'comercio', 'comercial', 'merchant', 'retail', 'retailer', 
        'tienda', 'local comercial', 'negocio', 'propietario', 'titular de comercio', 
        'dueño de comercio', 'empresario comercial', 'almacén', 'mayorista', 'minorista', 
        'compra y venta', 'distribuidor', 'comercializa', 'venta de'
      ],
      provider_mappings: {
        wikidata_qid: 'Q215536',
        gemini_search_term: 'comerciante'
      }
    },
    {
      canonical_id: 'EMPLOYEE',
      dimension: 'ROLE_CLASS',
      label: 'Empleado',
      aliases: ['empleado', 'empleada', 'empleados', 'empleadas', 'employee', 'worker', 'trabajador', 'trabajadora', 'dependiente', 'personal'],
      related_activities: ['EMPLEO', 'RELACION_DE_DEPENDENCIA'],
      allowed_evidence_terms: [
        'empleado', 'empleada', 'trabaja', 'trabajador', 'trabajadora', 'works at', 'employee of', 'staff member', 
        'team member', 'relación laboral', 'relación de dependencia', 'contratado', 'contratada', 'contratado por', 
        'puesto', 'cargo', 'colaborador', 'colaborador en', 'desempeña', 'desempeña como', 'incorporado', 'incorporado a', 'equipo de',
        'administración', 'administrativo', 'administrativa', 'funcionario', 'funcionaria',
        'dependencia', 'personal de', 'staff', 'gabinete', 'organigrama', 'atención al cliente',
        'analista', 'ejecutivo', 'prestación de servicios', 'laboral', 'experiencia laboral', 
        'nombramiento', 'integrante', 'miembro', 'secretario', 'secretaria', 'secretaría', 'ministro', 'ministra', 'ministerio',
        'director', 'directora', 'dirección', 'jefe', 'jefa', 'responsable', 'asesor', 'asesora',
        'gobierno de la ciudad', 'gcba', 'banco ciudad', 'empresa', 'compañía'
      ],
      provider_mappings: {
        wikidata_qid: 'Q703534',
        gemini_search_term: 'empleado'
      }
    },
    {
      canonical_id: 'PLOMERO',
      dimension: 'TRADE',
      label: 'Plomero',
      aliases: ['plomero', 'plomera', 'plomeros', 'gasista', 'sanitarista', 'fontanero', 'plumber'],
      related_activities: ['PLOMERIA', 'GAS'],
      allowed_evidence_terms: [
        'plomero', 'plomera', 'plomería', 'gasista', 'sanitarista', 'fontanero', 
        'fontanería', 'cañerías', 'desagües', 'instalaciones sanitarias', 'destapaciones', 
        'grifería', 'plumber', 'termofusor'
      ],
      provider_mappings: {
        wikidata_qid: 'Q252924',
        gemini_search_term: 'plomero'
      }
    },
    {
      canonical_id: 'MEDICO',
      dimension: 'PROFESSION',
      label: 'Médico',
      aliases: ['medico', 'médico', 'médica', 'medica', 'doctor', 'doctora', 'médicos', 'physician'],
      related_activities: ['SALUD', 'MEDICINA'],
      allowed_evidence_terms: [
        'médico', 'médica', 'medicina', 'doctor', 'doctora', 'clínica', 'hospital', 
        'especialista', 'pacientes', 'consultorio', 'salud', 'sanatorio', 'cirujano', 
        'matrícula', 'm.n.', 'm.p.', 'pediatra', 'cardiólogo', 'traumatólogo'
      ],
      provider_mappings: {
        wikidata_qid: 'Q39631',
        gemini_search_term: 'médico'
      }
    },
    {
      canonical_id: 'PROGRAMADOR',
      dimension: 'PROFESSION',
      label: 'Programador',
      aliases: ['programador', 'programadora', 'desarrollador', 'desarrolladora', 'developer', 'software engineer'],
      related_activities: ['SOFTWARE_DEVELOPMENT', 'TECNOLOGIA'],
      allowed_evidence_terms: [
        'programador', 'desarrollador', 'developer', 'software', 'código', 'backend', 
        'frontend', 'fullstack', 'python', 'javascript', 'typescript', 'react', 
        'github', 'git', 'ingeniero de software', 'systems engineer'
      ],
      provider_mappings: {
        wikidata_qid: 'Q5482740',
        github_capable: true,
        gemini_search_term: 'programador'
      }
    },
    {
      canonical_id: 'ABOGADO',
      dimension: 'PROFESSION',
      label: 'Abogado',
      aliases: ['abogado', 'abogada', 'abogados', 'letrado', 'letrada', 'lawyer', 'attorney'],
      related_activities: ['DERECHO', 'LEGAL'],
      allowed_evidence_terms: [
        'abogado', 'abogada', 'derecho', 'estudio jurídico', 'jurídico', 'legal', 
        'litigios', 'causas', 'asesoría legal', 'tribunales', 'cpacf', 'colegio de abogados', 
        'defensa legal'
      ],
      provider_mappings: {
        wikidata_qid: 'Q40348',
        gemini_search_term: 'abogado'
      }
    },
    {
      canonical_id: 'ARQUITECTO',
      dimension: 'PROFESSION',
      label: 'Arquitecto',
      aliases: ['arquitecto', 'arquitecta', 'arquitectos', 'architect'],
      related_activities: ['ARQUITECTURA', 'CONSTRUCCION'],
      allowed_evidence_terms: [
        'arquitecto', 'arquitecta', 'arquitectura', 'estudio de arquitectura', 
        'diseño arquitectónico', 'obras', 'construcción', 'proyectos', 'cpau', 
        'colegio de arquitectos'
      ],
      provider_mappings: {
        wikidata_qid: 'Q42973',
        gemini_search_term: 'arquitecto'
      }
    },
    {
      canonical_id: 'DOCENTE',
      dimension: 'OCCUPATION',
      label: 'Docente',
      aliases: ['docente', 'profesor', 'profesora', 'maestro', 'maestra', 'educador', 'teacher'],
      related_activities: ['EDUCACION'],
      allowed_evidence_terms: [
        'docente', 'profesor', 'profesora', 'cátedra', 'escuela', 'universidad', 
        'facultad', 'colegio', 'enseñanza', 'alumnos', 'profesor titular', 'profesor adjunto'
      ],
      provider_mappings: {
        wikidata_qid: 'Q37226',
        orcid_capable: true,
        gemini_search_term: 'docente'
      }
    },
    {
      canonical_id: 'INVESTIGADOR',
      dimension: 'ROLE_CLASS',
      label: 'Investigador',
      aliases: ['investigador', 'investigadora', 'científico', 'cientifico', 'researcher', 'scholar'],
      related_activities: ['RESEARCH', 'CIENCIA'],
      allowed_evidence_terms: [
        'investigador', 'investigadora', 'conicet', 'paper', 'publicación científica', 
        'laboratorio', 'tesis', 'orcid', 'researcher', 'doctorado', 'postdoctorado'
      ],
      provider_mappings: {
        wikidata_qid: 'Q1650915',
        orcid_capable: true,
        gemini_search_term: 'investigador'
      }
    },
    {
      canonical_id: 'CONTADOR',
      dimension: 'PROFESSION',
      label: 'Contador Público',
      aliases: ['contador', 'contadora', 'contadores', 'auditor', 'auditora', 'accountant', 'ciencias economicas', 'ciencias económicas'],
      related_activities: ['CIENCIAS_ECONOMICAS', 'AUDITORIA', 'CONTABILIDAD'],
      allowed_evidence_terms: [
        'contador', 'contadora', 'contador público', 'estudio contable', 'auditor', 'auditoría',
        'balances', 'impuestos', 'cpcecaba', 'consejo profesional de ciencias económicas'
      ],
      provider_mappings: {
        wikidata_qid: 'Q1613416',
        gemini_search_term: 'contador'
      }
    },
    {
      canonical_id: 'PSICOLOGO',
      dimension: 'PROFESSION',
      label: 'Psicólogo',
      aliases: ['psicologo', 'psicólogo', 'psicologa', 'psicóloga', 'psicólogos', 'psicoanalista', 'terapeuta', 'psychologist'],
      related_activities: ['SALUD_MENTAL', 'PSICOLOGIA'],
      allowed_evidence_terms: [
        'psicólogo', 'psicóloga', 'psicología', 'psicoanalista', 'terapia', 'consultorio psicológico',
        'salud mental', 'licenciado en psicología', 'colegio de psicólogos'
      ],
      provider_mappings: {
        wikidata_qid: 'Q212990',
        gemini_search_term: 'psicólogo'
      }
    },
    {
      canonical_id: 'ODONTOLOGO',
      dimension: 'PROFESSION',
      label: 'Odontólogo',
      aliases: ['odontologo', 'odontólogo', 'odontologa', 'odontóloga', 'dentista', 'dentistas', 'dentist'],
      related_activities: ['SALUD', 'ODONTOLOGIA'],
      allowed_evidence_terms: [
        'odontólogo', 'odontóloga', 'odontología', 'dentista', 'consultorio odontológico', 'implantes', 'ortodoncia'
      ],
      provider_mappings: {
        wikidata_qid: 'Q27349',
        gemini_search_term: 'odontólogo'
      }
    },
    {
      canonical_id: 'INGENIERO',
      dimension: 'PROFESSION',
      label: 'Ingeniero',
      aliases: ['ingeniero', 'ingeniera', 'ingenieros', 'engineer'],
      related_activities: ['INGENIERIA', 'TECNOLOGIA'],
      allowed_evidence_terms: [
        'ingeniero', 'ingeniera', 'ingeniería', 'engineer', 'copime', 'cae', 'proyectos de ingeniería'
      ],
      provider_mappings: {
        wikidata_qid: 'Q81096',
        gemini_search_term: 'ingeniero'
      }
    },
    {
      canonical_id: 'EMPRESARIO',
      dimension: 'OCCUPATION',
      label: 'Empresario',
      aliases: ['empresario', 'empresaria', 'empresarios', 'emprendedor', 'emprendedora', 'emprendedores', 'founder', 'fundador', 'fundadora', 'director de empresa'],
      related_activities: ['EMPRESARIAL', 'NEGOCIOS', 'COMERCIO'],
      allowed_evidence_terms: [
        'empresario', 'empresaria', 'emprendedor', 'emprendedora', 'empresa', 'negocio', 'titular',
        'fundador', 'fundadora', 'socio gerente', 'director ejecutivo', 'pyme'
      ],
      provider_mappings: {
        wikidata_qid: 'Q43845',
        gemini_search_term: 'empresario'
      }
    }
  ];

  /**
   * Resolves a natural language term or query string to a canonical WorkConcept
   */
  public static resolve(term: string): WorkConcept | null {
    if (!term) return null;
    const clean = term.toLowerCase().trim();

    // 1. Direct canonical match
    const exact = this.concepts.find(c => c.canonical_id.toLowerCase() === clean);
    if (exact) return exact;

    // 2. Alias match
    for (const c of this.concepts) {
      if (c.aliases.includes(clean)) {
        return c;
      }
    }

    // 3. Partial / tokenized match
    const tokens = clean.split(/\s+/);
    for (const token of tokens) {
      if (['en', 'de', 'el', 'la', 'un', 'una', 'los', 'las'].includes(token)) continue;
      for (const c of this.concepts) {
        if (c.aliases.includes(token)) {
          return c;
        }
      }
    }

    return null;
  }

  /**
   * Evaluates if a text blob (e.g. bio, snippet, claim, profession label)
   * provides POSITIVE SEMANTIC EVIDENCE for the given concept.
   */
  public static evaluatePositiveEvidence(concept: WorkConcept, text: string): { matches: boolean; matchedTerm?: string } {
    if (!concept || !text) return { matches: false };
    const lower = text.toLowerCase();

    for (const term of concept.allowed_evidence_terms) {
      if (lower.includes(term.toLowerCase())) {
        return { matches: true, matchedTerm: term };
      }
    }

    return { matches: false };
  }

  /**
   * Get all registered concepts
   */
  public static getAllConcepts(): WorkConcept[] {
    return this.concepts;
  }
}
