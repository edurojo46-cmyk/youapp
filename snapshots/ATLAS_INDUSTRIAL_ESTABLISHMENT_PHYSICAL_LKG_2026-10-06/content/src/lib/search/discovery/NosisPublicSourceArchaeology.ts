/**
 * NOSIS PUBLIC SOURCE ARCHAEOLOGY V1
 * 
 * Reconstructs the PRIMARY PUBLIC SOURCES feeding commercial data broker categories.
 * 
 * ETHICAL & LEGAL INVARIANTS:
 * - NO scraping Nosis.
 * - NO automating commercial broker search engines.
 * - NO CAPTCHA bypass.
 * - NO copying proprietary reports or derived commercial credit scores.
 * - ONLY public statutory disclosures, official gazettes, and open government registries.
 * - SENSITIVE DATA GUARD: Excludes individual debt, credit behavior, banking data, confidential tax,
 *   individual pensions, health records, and private addresses from People Graph.
 * 
 * CORE QUESTION FOR EACH ATTRIBUTE:
 * "WHAT IS THE PRIMARY PUBLIC SOURCE?"
 */

import type { RegisteredSource } from '../SourceCapabilityRegistry';

export interface CommercialAttributeArchaeology {
  commercial_category: string;
  primary_public_source_name: string;
  source_id: string;
  public_organism: string;
  public_endpoint_url: string;
  format: 'CSV' | 'ZIP' | 'API' | 'JSON' | 'HTML_ROSTER' | 'OFFICIAL_GAZETTE';
  access_mode: 'OPEN_DOWNLOAD' | 'PUBLIC_LOOKUP' | 'RESTRICTED_QUERY';
  enumerability: boolean;
  estimated_cardinality: number;
  yield_class: 'MASS' | 'LARGE' | 'MEDIUM' | 'SMALL';
  primary_attributes: string[];
  sensitive_fields_prohibited: string[];
  allowed_atlas_domains: ('PEOPLE_PUBLIC_PROFESSIONAL' | 'ORGANIZATION_GRAPH' | 'TERRITORY' | 'DEMOGRAPHICS_AGGREGATE' | 'FINANCIAL_SYSTEM_AGGREGATE' | 'LIVE_QUERY_ONLY' | 'BLOCKED_FOR_PEOPLE')[];
  privacy_class: 'PUBLIC_GOVERNMENT_DIRECTORY' | 'PUBLIC_PROFESSIONAL_REGISTRY' | 'PUBLIC_ACADEMIC_REPOSITORY' | 'PUBLIC_COMMERCIAL_GAZETTE' | 'SENSITIVE_FINANCIAL_RESTRICTED' | 'CONFIDENTIAL_TAX_RESTRICTED';
  legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH' | 'LEGAL_REVIEW_REQUIRED' | 'RESTRICTED_AGGREGATE_ONLY';
  source_value_score: number;
}

export class NosisPublicSourceArchaeology {
  private static archeologyCatalog: CommercialAttributeArchaeology[] = [
    {
      commercial_category: 'DIRECTORES_Y_AUTORIDADES_SOCIETARIAS',
      primary_public_source_name: 'Boletín Oficial de la República Argentina — Segunda Sección (Sociedades Comerciales)',
      source_id: 'BORA_SECCION_2_SOCIEDADES',
      public_organism: 'Secretaría Legal y Técnica de la Presidencia de la Nación',
      public_endpoint_url: 'https://www.boletinoficial.gob.ar/seccion/segunda',
      format: 'OFFICIAL_GAZETTE',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 450000,
      yield_class: 'MASS',
      primary_attributes: ['denominacion_sociedad', 'cuit_sociedad', 'directores_titulares', 'socios_gerentes', 'cargo', 'fecha_designacion'],
      sensitive_fields_prohibited: ['domicilio_privado', 'cuil_no_publico'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL', 'ORGANIZATION_GRAPH'],
      privacy_class: 'PUBLIC_COMMERCIAL_GAZETTE',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 94.5
    },
    {
      commercial_category: 'SOCIEDADES_Y_AUTORIDADES_IGJ',
      primary_public_source_name: 'Inspección General de Justicia (IGJ) — Registro de Entidades y Autoridades',
      source_id: 'IGJ_REGISTRO_AUTORIDADES_PUBLICO',
      public_organism: 'Ministerio de Justicia de la Nación',
      public_endpoint_url: 'https://datos.gob.ar/dataset/justicia-registro-nacional-sociedades',
      format: 'CSV',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 180000,
      yield_class: 'MASS',
      primary_attributes: ['numero_correlativo', 'razon_social', 'tipo_societario', 'autoridades_vigentes', 'sede_social'],
      sensitive_fields_prohibited: ['patrimonio_privado', 'accionistas_minoritarios_no_publicos'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL', 'ORGANIZATION_GRAPH'],
      privacy_class: 'PUBLIC_COMMERCIAL_GAZETTE',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 92.0
    },
    {
      commercial_category: 'PADRON_CONSTANCIA_INSCRIPCION_TRIBUTARIA',
      primary_public_source_name: 'ARCA (ex-AFIP) — Padrón Público de Constancia de Inscripción CUIT/CUIL',
      source_id: 'ARCA_PADRON_PUBLICO_CONSTANCIA',
      public_organism: 'Agencia de Recaudación y Control Aduanero (ARCA)',
      public_endpoint_url: 'https://servicioscf.afip.gob.ar/Facturacion/facturas/consultas/consultaConstancia.aspx',
      format: 'ZIP',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 4500000,
      yield_class: 'MASS',
      primary_attributes: ['cuit', 'denominacion_o_apellido_nombre', 'estado_tributario', 'actividad_economica_principal', 'categoria_monotributo_iva'],
      sensitive_fields_prohibited: [
        'deuda_individual', 'monto_facturacion', 'declaraciones_juradas', 
        'cuentas_bancarias', 'bienes_personales', 'domicilio_fiscal_privado'
      ],
      allowed_atlas_domains: ['ORGANIZATION_GRAPH', 'DEMOGRAPHICS_AGGREGATE', 'LIVE_QUERY_ONLY'],
      privacy_class: 'CONFIDENTIAL_TAX_RESTRICTED',
      legal_review_status: 'LEGAL_REVIEW_REQUIRED',
      source_value_score: 88.0
    },
    {
      commercial_category: 'CENTRAL_DEUDORES_FINANCIEROS',
      primary_public_source_name: 'Banco Central de la República Argentina (BCRA) — Central de Deudores del Sistema Financiero',
      source_id: 'BCRA_CENTRAL_DEUDORES_REGISTRO',
      public_organism: 'Banco Central de la República Argentina',
      public_endpoint_url: 'https://www.bcra.gob.ar/BCRAyVos/Situacion_Crediticia.asp',
      format: 'ZIP',
      access_mode: 'OPEN_DOWNLOAD',
      estimated_cardinality: 12000000,
      yield_class: 'MASS',
      enumerability: true,
      primary_attributes: ['identificacion_tributaria', 'entidad_financiera', 'situacion_crediticia_clasificacion', 'monto_tramo'],
      sensitive_fields_prohibited: [
        'deuda_individual', 'comportamiento_crediticio_personal', 'limites_tarjeta_credito',
        'juicios_ejecutivos_financieros', 'detalle_operaciones'
      ],
      allowed_atlas_domains: ['FINANCIAL_SYSTEM_AGGREGATE', 'BLOCKED_FOR_PEOPLE'],
      privacy_class: 'SENSITIVE_FINANCIAL_RESTRICTED',
      legal_review_status: 'RESTRICTED_AGGREGATE_ONLY',
      source_value_score: 75.0
    },
    {
      commercial_category: 'CHEQUES_RECHAZADOS_CENTRAL',
      primary_public_source_name: 'BCRA — Central de Cheques Denunciados y Rechazados',
      source_id: 'BCRA_CHEQUES_RECHAZADOS',
      public_organism: 'Banco Central de la República Argentina',
      public_endpoint_url: 'https://www.bcra.gob.ar/BCRAyVos/Cheques_rechazados.asp',
      format: 'ZIP',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 350000,
      yield_class: 'MASS',
      primary_attributes: ['cuit_emisor', 'causal_rechazo', 'fecha_rechazo', 'estado_pago_multa'],
      sensitive_fields_prohibited: ['cuenta_corriente', 'datos_personales_bancarios'],
      allowed_atlas_domains: ['FINANCIAL_SYSTEM_AGGREGATE', 'BLOCKED_FOR_PEOPLE'],
      privacy_class: 'SENSITIVE_FINANCIAL_RESTRICTED',
      legal_review_status: 'RESTRICTED_AGGREGATE_ONLY',
      source_value_score: 68.0
    },
    {
      commercial_category: 'EMPLEADORES_Y_RIESGOS_TRABAJO',
      primary_public_source_name: 'Superintendencia de Riesgos del Trabajo (SRT) — Registro de Empleadores Afiliados',
      source_id: 'SRT_REGISTRO_EMPLEADORES_ART',
      public_organism: 'Superintendencia de Riesgos del Trabajo (SRT)',
      public_endpoint_url: 'https://www.srt.gob.ar/estadisticas/empleadores_art.php',
      format: 'CSV',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 520000,
      yield_class: 'MASS',
      primary_attributes: ['cuit_empleador', 'razon_social', 'art_aseguradora', 'ciiu_actividad', 'rango_trabajadores', 'provincia'],
      sensitive_fields_prohibited: ['nomina_trabajadores_nominal', 'siniestros_individuales', 'salarios'],
      allowed_atlas_domains: ['ORGANIZATION_GRAPH', 'TERRITORY', 'DEMOGRAPHICS_AGGREGATE'],
      privacy_class: 'PUBLIC_GOVERNMENT_DIRECTORY',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 91.0
    },
    {
      commercial_category: 'MATRICULAS_PROFESIONALES_SALUD',
      primary_public_source_name: 'Ministerio de Salud — Registro Federal de Profesionales de la Salud (REFEPS)',
      source_id: 'MSAL_REFEPS_PROFESIONALES_SALUD',
      public_organism: 'Ministerio de Salud de la Nación',
      public_endpoint_url: 'https://sisa.msal.gov.ar/sisa/#sisa',
      format: 'API',
      access_mode: 'PUBLIC_LOOKUP',
      enumerability: true,
      estimated_cardinality: 480000,
      yield_class: 'MASS',
      primary_attributes: ['nombre_completo', 'profesion', 'especialidad', 'matricula_nacional_o_provincial', 'estado_matricula', 'jurisdiccion'],
      sensitive_fields_prohibited: ['domicilio_particular', 'telefono_privado', 'dni_en_claro'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL'],
      privacy_class: 'PUBLIC_PROFESSIONAL_REGISTRY',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 96.0
    },
    {
      commercial_category: 'MATRICULAS_ABOGADOS_CABA',
      primary_public_source_name: 'Colegio Público de la Abogacía de la Capital Federal (CPACF) — Padrón Oficial de Matriculados',
      source_id: 'CPACF_PADRON_OFICIAL_MATRICULADOS',
      public_organism: 'Colegio Público de la Abogacía de la Capital Federal',
      public_endpoint_url: 'https://www.cpacf.org.ar/guia_abogados',
      format: 'HTML_ROSTER',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 85000,
      yield_class: 'LARGE',
      primary_attributes: ['nombre_completo', 'tomo', 'folio', 'estado_matricula', 'domicilio_procesal_publico', 'email_profesional'],
      sensitive_fields_prohibited: ['domicilio_real_privado', 'dni_en_claro', 'causas_disciplinarias_no_firmes'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL'],
      privacy_class: 'PUBLIC_PROFESSIONAL_REGISTRY',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 95.0
    },
    {
      commercial_category: 'MATRICULAS_CIENCIAS_ECONOMICAS_CABA',
      primary_public_source_name: 'Consejo Profesional de Ciencias Económicas de la CABA (CPCECABA) — Guía Oficial de Matriculados',
      source_id: 'CPCECABA_GUIA_MATRICULADOS',
      public_organism: 'Consejo Profesional de Ciencias Económicas de la Ciudad Autónoma de Buenos Aires',
      public_endpoint_url: 'https://www.consejo.org.ar/guia_matriculados',
      format: 'HTML_ROSTER',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 62000,
      yield_class: 'LARGE',
      primary_attributes: ['nombre_completo', 'titulo_profesional', 'tomo', 'folio', 'estado_matricula', 'domicilio_profesional'],
      sensitive_fields_prohibited: ['domicilio_real_privado', 'dni_en_claro'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL'],
      privacy_class: 'PUBLIC_PROFESSIONAL_REGISTRY',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 93.0
    },
    {
      commercial_category: 'PERITOS_Y_AUXILIARES_JUSTICIA',
      primary_public_source_name: 'Poder Judicial de la Nación (PJN) — Padrón de Peritos y Auxiliares de Justicia',
      source_id: 'PJN_PADRON_PERITOS_AUXILIARES',
      public_organism: 'Poder Judicial de la Nación — Corte Suprema de Justicia de la Nación',
      public_endpoint_url: 'https://pjn.gov.ar/peritos',
      format: 'CSV',
      access_mode: 'OPEN_DOWNLOAD',
      enumerability: true,
      estimated_cardinality: 28000,
      yield_class: 'LARGE',
      primary_attributes: ['nombre_completo', 'especialidad_pericial', 'fuero', 'jurisdiccion', 'matricula_habilitante', 'domicilio_procesal'],
      sensitive_fields_prohibited: ['domicilio_privado', 'telefono_personal', 'dni_en_claro'],
      allowed_atlas_domains: ['PEOPLE_PUBLIC_PROFESSIONAL'],
      privacy_class: 'PUBLIC_PROFESSIONAL_REGISTRY',
      legal_review_status: 'CLEARED_FOR_PEOPLE_GRAPH',
      source_value_score: 92.5
    }
  ];

  public static getArcheologyCatalog(): CommercialAttributeArchaeology[] {
    return this.archeologyCatalog;
  }

  public static toRegisteredSource(arch: CommercialAttributeArchaeology): RegisteredSource {
    return {
      source_id: arch.source_id,
      source_name: arch.primary_public_source_name,
      source_type: arch.format === 'OFFICIAL_GAZETTE' ? 'GOVERNMENT_ROSTER' : 'OPEN_DATASET',
      domain: new URL(arch.public_endpoint_url).hostname,
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: arch.allowed_atlas_domains.includes('PEOPLE_PUBLIC_PROFESSIONAL'),
      supports_search: true,
      supports_listing: arch.enumerability,
      supports_pagination: true,
      supports_known_total: true,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      endpoint_url: arch.public_endpoint_url,
      purpose: arch.commercial_category,
      authority_level: 'GOVERNMENT_PRIMARY',
      privacy_class: arch.privacy_class,
      personal_data_class: 'PUBLIC_PROFESSIONAL',
      purpose_status: 'COMPATIBLE_PUBLIC_TRANSPARENCY',
      commercial_reuse_status: 'ALLOWED',
      legal_review_status: arch.legal_review_status,
      allowed_atlas_domains: arch.allowed_atlas_domains,
      maturity: 'PROFILED',
      person_yield_class: arch.yield_class,
      raw_people_estimate: arch.estimated_cardinality,
      metadata: {
        commercial_category: arch.commercial_category,
        public_organism: arch.public_organism,
        sensitive_fields_prohibited: arch.sensitive_fields_prohibited
      }
    };
  }
}
