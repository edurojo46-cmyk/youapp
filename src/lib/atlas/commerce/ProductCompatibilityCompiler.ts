/**
 * ATLAS COMMERCE — PRODUCT COMPATIBILITY COMPILER
 * Module: ProductCompatibilityCompiler.ts
 * Path: src/lib/atlas/commerce/ProductCompatibilityCompiler.ts
 * 
 * Compiles natural language product descriptions and raw catalog items
 * into formal ProductCompatibilitySpec structures.
 * 
 * Translates intent and domain boundaries into data-driven specifications
 * so that the match engine remains 100% generic.
 */

import type { ProductCompatibilitySpec, BuyerType, UsageContext } from './ProductCompatibilitySpec.ts';

export interface RawProductInput {
  title: string;
  description?: string;
  category?: string;
  domain?: string;
  target_buyer_type?: 'PERSON' | 'COMPANY' | 'BOTH';
  target_keywords?: string[];
  target_industries?: string[];
  target_activities?: string[];
  excluded_industries?: string[];
  target_professions?: string[];
  excluded_professions?: string[];
  use_cases?: string[];
  usage_context?: UsageContext[];
  required_attributes?: string[];
  preferred_attributes?: string[];
  incompatible_attributes?: string[];
  is_commodity?: boolean;
}

export class ProductCompatibilityCompiler {
  /**
   * Compiles natural language string or raw product input into a standardized ProductCompatibilitySpec.
   */
  public static compile(input: string | RawProductInput): ProductCompatibilitySpec {
    if (typeof input === 'string') {
      return this.compileFromNaturalLanguage(input);
    }
    return this.compileFromStructuredInput(input);
  }

  /**
   * Compiles purely from a natural language string.
   * Example: "Seguro de responsabilidad civil para profesionales independientes"
   */
  public static compileFromNaturalLanguage(text: string): ProductCompatibilitySpec {
    const lower = text.toLowerCase();

    // 1. Infer buyer types
    const buyerTypes: BuyerType[] = [];
    if (/corporativ|empresarial|empresa|\bb2b\b|in-company|n[oó]minas|equipos corporativos/i.test(lower)) {
      buyerTypes.push('COMPANY', 'ORGANIZATION');
    } else if (/profesional(es)?\s+independiente(s)?|persona|individual|particular|mala praxis/i.test(lower)) {
      buyerTypes.push('PERSON');
    } else {
      buyerTypes.push('COMPANY', 'PERSON', 'ORGANIZATION');
    }

    // 2. Infer usage context
    const usageContext: UsageContext[] = [];
    if (/industrial|taller|planta|obra|f[aá]brica|almac[eé]n/i.test(lower)) usageContext.push('INDUSTRIAL');
    if (/profesional|independiente|consultor|estudio|consultorio/i.test(lower)) usageContext.push('PROFESSIONAL');
    if (/corporativ|empresa|b2b|negocio|oficina/i.test(lower)) usageContext.push('BUSINESS');
    if (/retail|comercio|gastronom|tienda|bar|caf[eé]/i.test(lower)) usageContext.push('RETAIL');
    if (/personal|mascota|hogar|familiar/i.test(lower)) usageContext.push('PERSONAL');
    if (usageContext.length === 0) usageContext.push('BUSINESS', 'PROFESSIONAL');

    // 3. Infer product domain
    let productDomain = 'GENERAL_COMMERCE';
    if (/seguro|responsabilidad civil|p[oó]liza|mala praxis/i.test(lower)) {
      productDomain = 'PROFESSIONAL_INSURANCE';
    } else if (/software|saas|cloud|app|sistema|plataforma|gesti[oó]n digital/i.test(lower)) {
      productDomain = 'SOFTWARE_SAAS';
    } else if (/herramienta|taladro|soldador|generador|maquinaria|ferreter/i.test(lower)) {
      productDomain = 'HARDWARE_EQUIPMENT';
    } else if (/alimento|pet|mascota|perro|veterinar/i.test(lower)) {
      productDomain = 'PET_CARE_NUTRITION';
    } else if (/alfombra|revestimiento|tapiz|piso|decoraci[oó]n|mueble|interiorismo/i.test(lower)) {
      productDomain = 'HOME_DECOR_FLOORING';
    } else if (/fertiliz|agro|cultiv|campo|agron[oó]mic/i.test(lower)) {
      productDomain = 'AGRO_INPUTS';
    } else if (/caf[eé]|espresso|gastronom|cocina|barista/i.test(lower)) {
      productDomain = 'GASTRONOMY_EQUIPMENT';
    } else if (/curso|capacitaci[oó]n|idioma|ingl[eé]s|formaci[oó]n/i.test(lower)) {
      productDomain = 'CORPORATE_TRAINING';
    } else if (/fotograf[ií]a|video|audiovisual|relevamiento/i.test(lower)) {
      productDomain = 'PROFESSIONAL_MEDIA_SERVICES';
    } else if (/impresora|etiqueta|c[oó]digo de barra|t[eé]rmica/i.test(lower)) {
      productDomain = 'INDUSTRIAL_PRINTING_LOGISTICS';
    } else if (/uniforme|indumentaria|ambo|chaqueta|ropa de trabajo/i.test(lower)) {
      productDomain = 'WORKWEAR_UNIFORMS';
    } else if (/limpieza|mantenimiento de instalaciones|facility/i.test(lower)) {
      productDomain = 'FACILITY_CLEANING_SERVICES';
    } else if (/computadora|computadoras|laptop|notebook|\bpc\b|ordenador/i.test(lower)) {
      productDomain = 'OFFICE_HARDWARE_IT';
    } else if (/muebles de oficina|mobiliario de oficina|silla de oficina|escritorio corporativo/i.test(lower)) {
      productDomain = 'OFFICE_FURNITURE';
    } else if (/papel|resma|escritorio|mobiliario/i.test(lower)) {
      productDomain = 'OFFICE_SUPPLIES';
    }

    // 4. Infer classification, target/excluded industries, buyer needs, operating contexts
    let horizontalClassification: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL' = 'HORIZONTAL';
    let primaryBuyerNeeds: string[] = [];
    let buyerOperatingContexts: string[] = [];
    const targetIndustries: string[] = [];
    const positiveIndustries: string[] = [];
    const neutralIndustries: string[] = [];
    const excludedIndustries: string[] = [];
    const targetProfessions: string[] = [];
    const excludedProfessions: string[] = [];
    const requiredBuyerAttributes: string[] = [];
    const preferredBuyerAttributes: string[] = [];
    let useCases: string[] = [text];

    if (productDomain === 'PROFESSIONAL_INSURANCE') {
      horizontalClassification = 'SEMI_HORIZONTAL';
      useCases = [
        'cobertura de mala praxis',
        'responsabilidad civil profesional',
        'protección patrimonial ante litigios',
        'resguardo legal de actividad profesional'
      ];
      primaryBuyerNeeds = [
        'COBERTURA_RESPONSABILIDAD_CIVIL',
        'PROTECCION_MALA_PRAXIS',
        'POLIZA_PROFESIONAL'
      ];
      buyerOperatingContexts = [
        'CONSULTORIO_MEDICO',
        'ESTUDIO_PROFESIONAL',
        'CLINICA_U_HOSPITAL',
        'OBRA_INGENIERIA'
      ];
      positiveIndustries.push('Salud y Medicina', 'Ingeniería y Arquitectura', 'Servicios Profesionales', 'Consultoría');
      neutralIndustries.push('Comercio y Retail', 'Hotelería');
      excludedIndustries.push('Ferretería y Afines', 'Agro y Ganadería', 'Gastronomía y Bebidas');
      targetProfessions.push('médico', 'cirujano', 'ingeniero', 'abogado', 'arquitecto', 'consultor');
      targetIndustries.push(...positiveIndustries);
      requiredBuyerAttributes.push('FISCAL_REGISTRY');
      preferredBuyerAttributes.push('PROFESSIONAL_PRACTICE');
    } else if (productDomain === 'SOFTWARE_SAAS') {
      if (/rrhh|recursos humanos|n[oó]minas|capital humano|gesti[oó]n de personal|empleados/i.test(lower)) {
        // HORIZONTAL PRODUCT: Any enterprise with employees/workforce is a valid buyer!
        horizontalClassification = 'HORIZONTAL';
        useCases = [
          'gestión de personal y talento',
          'liquidación de sueldos y nómina',
          'administración de legajos laborales',
          'control de asistencia y turnos de trabajo',
          'evaluación de desempeño'
        ];
        primaryBuyerNeeds = [
          'GESTION_EMPLEADOS',
          'NOMINA_Y_SUELDOS',
          'GESTION_TALENTO',
          'ADMINISTRACION_TURNOS',
          'CONTROL_LABORAL'
        ];
        buyerOperatingContexts = [
          'OPERACION_MULTI_SEDE',
          'EMPRESA_CON_DOTACION',
          'PLANTA_INDUSTRIAL',
          'CORPORATIVO',
          'RED_SUCURSALES'
        ];
        // Cross-domain employer industries - NO software lock!
        positiveIndustries.push(
          'Tecnología y Software',
          'Hotelería',
          'Salud y Medicina',
          'Banca y Finanzas',
          'Comercio y Retail',
          'Construcción y Reformas',
          'Industria y Manufactura',
          'Telecomunicaciones',
          'Servicios Profesionales'
        );
        targetIndustries.push(...positiveIndustries);
        // Exclude only purely unipersonal/micro activities
        excludedIndustries.push(); // Empty - no domain lock
        targetProfessions.push('gerente de rrhh', 'director de personal', 'people operations', 'director general', 'ceo');
        requiredBuyerAttributes.push('ORGANIZATION_FORMALITY');
        preferredBuyerAttributes.push('ACTIVE_WORKFORCE', 'MULTI_LOCATION', 'ACTIVE_HIRING');
      } else if (/odontol[oó]g|dental/i.test(lower)) {
        // VERTICAL PRODUCT: Specific to dental clinics
        horizontalClassification = 'VERTICAL';
        useCases = ['gestión odontológica', 'historias clínicas dentales', 'turnos odontología'];
        primaryBuyerNeeds = ['GESTION_ODONTOLOGICA', 'HISTORIA_CLINICA_DENTAL', 'TURNOS_CONSULTORIO'];
        buyerOperatingContexts = ['CONSULTORIO_ODONTOLOGICO', 'CLINICA_DENTAL'];
        positiveIndustries.push('Odontología', 'Salud y Medicina', 'Clínicas Dentales');
        targetIndustries.push(...positiveIndustries);
        excludedIndustries.push('Construcción', 'Ferretería', 'Gastronomía', 'Agro', 'Banca y Finanzas');
        targetProfessions.push('odontólogo', 'dentista', 'cirujano dentista');
      } else if (/turnos|agenda|consultorio|m[eé]dic/i.test(lower)) {
        horizontalClassification = 'VERTICAL';
        useCases = ['agenda médica', 'gestión de turnos clínicos', 'atención de pacientes'];
        primaryBuyerNeeds = ['AGENDA_MEDICA', 'GESTION_TURNOS', 'HISTORIA_CLINICA'];
        buyerOperatingContexts = ['CONSULTORIO_MEDICO', 'CLINICA_MEDICA'];
        positiveIndustries.push('Salud y Medicina', 'Clínicas y Consultorios');
        targetIndustries.push(...positiveIndustries);
        excludedIndustries.push('Ferretería', 'Construcción', 'Gastronomía', 'Agro');
        targetProfessions.push('médico', 'médico cirujano', 'especialista en salud');
      } else {
        // General SaaS: HORIZONTAL
        horizontalClassification = 'HORIZONTAL';
        useCases = ['digitalización de operaciones', 'gestión en la nube', 'automatización de procesos'];
        primaryBuyerNeeds = ['AUTOMATIZACION_PROCESOS', 'DIGITALIZACION_OPERATIVA'];
        buyerOperatingContexts = ['OFICINAS_CORPORATIVAS', 'OPERACION_DIGITAL'];
        positiveIndustries.push('Tecnología y Software', 'Servicios Profesionales', 'Banca y Finanzas', 'Comercio');
        targetIndustries.push(...positiveIndustries);
      }
    } else if (productDomain === 'HOME_DECOR_FLOORING') {
      horizontalClassification = 'SEMI_HORIZONTAL';
      useCases = [
        'decoración interior',
        'revestimiento de pisos',
        'ambientación comercial y hotelera',
        'equipamiento de oficinas y locales'
      ];
      primaryBuyerNeeds = [
        'REVESTIMIENTO_SUELOS',
        'DECORACION_INTERIOR',
        'AISLACION_ACUSTICA',
        'EQUIPAMIENTO_HOGAR_OFICINA'
      ];
      buyerOperatingContexts = [
        'HOTELERIA',
        'SHOWROOM_MUEBLES',
        'OFICINAS_CORPORATIVAS',
        'LOCAL_COMERCIAL',
        'VIVIENDA'
      ];
      positiveIndustries.push('Mobiliario y Decoración', 'furniture', 'Construcción y Reformas', 'Hotelería', 'Actividades inmobiliarias', 'Arquitectura y Diseño');
      neutralIndustries.push('Salud y Medicina', 'Educación', 'Banca y Finanzas');
      excludedIndustries.push('Tecnología y Software', 'Farmacéutica y Salud', 'Química Pesada');
      targetProfessions.push('diseñador de interiores', 'arquitecto', 'decorador', 'administrador');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'PET_CARE_NUTRITION') {
      // VERTICAL PRODUCT: Niche to animal health, veterinary, and pet retail
      horizontalClassification = 'VERTICAL';
      useCases = [
        'nutrición canina',
        'venta de alimento balanceado',
        'atención y salud de mascotas',
        'distribución veterinaria'
      ];
      primaryBuyerNeeds = [
        'NUTRICION_CANINA',
        'STOCK_ALIMENTOS_BALANCEADOS',
        'VENTA_VETERINARIA',
        'DIETA_MASCOTAS'
      ];
      buyerOperatingContexts = [
        'CLINICA_VETERINARIA',
        'PET_SHOP_RETAIL',
        'DISTRIBUIDOR_VETERINARIO'
      ];
      positiveIndustries.push('VETERINARIAS', 'Veterinaria', 'VETERINARY', 'Pet Shop', 'Alimentos Balanceados', 'Cuidado Animal', 'Forrajería y Mascotas');
      excludedIndustries.push('Tecnología y Software', 'Consultoría IT y Desarrollo', 'Banca y Finanzas', 'Industria Química Pesada', 'Construcción y Reformas');
      targetProfessions.push('veterinario', 'veterinaria', 'cuidador', 'criador', 'pet shop manager');
      targetIndustries.push(...positiveIndustries);
      requiredBuyerAttributes.push('PET_CARE_CHANNEL');
      preferredBuyerAttributes.push('VETERINARY_CLINIC', 'PET_SHOP_RETAIL');
    } else if (productDomain === 'HARDWARE_EQUIPMENT') {
      // SEMI_HORIZONTAL: Core trades have primary affinity; facilities buy only for maintenance
      horizontalClassification = 'SEMI_HORIZONTAL';
      useCases = [
        'perforación de materiales',
        'instalación técnica',
        'obra y construcción',
        'mantenimiento edilicio',
        'montaje y reparación'
      ];
      primaryBuyerNeeds = [
        'PERFORACION',
        'INSTALACION_TECNICA',
        'OBRA_CONSTRUCCION',
        'MANTENIMIENTO_EDILICIO',
        'MONTAJE_Y_REPARACION'
      ];
      buyerOperatingContexts = [
        'OBRA_CONSTRUCCION',
        'TALLER_MECANICO',
        'SERVICIO_TECNICO',
        'FACILITY_MANAGEMENT_MANTENIMIENTO'
      ];
      positiveIndustries.push(
        'Construcción y Reformas',
        'Ferretería y Afines',
        'Mantenimiento y Reparación',
        'Metalmecánica',
        'Instalaciones Eléctricas',
        'CERRAJERÍA',
        'Carpintería y Muebles'
      );
      neutralIndustries.push(
        'Salud y Medicina',
        'Hotelería',
        'Comercio y Supermercados',
        'Educación',
        'Banca y Finanzas',
        'Industria y Manufactura'
      );
      excludedIndustries.push(
        'Servicios Financieros Puros',
        'Consultoría Contable y Legal',
        'Software y Desarrollo Cloud'
      );
      targetProfessions.push('técnico', 'instalador', 'carpintero', 'electricista', 'contratista', 'maestro mayor de obras', 'jefe de mantenimiento');
      targetIndustries.push(...positiveIndustries);
      requiredBuyerAttributes.push('OPERATIONAL_EQUIPMENT_NEED');
      preferredBuyerAttributes.push('TECHNICAL_TRADES_ACTIVITY', 'MAINTENANCE_OPERATION');
    } else if (productDomain === 'CORPORATE_TRAINING') {
      horizontalClassification = 'HORIZONTAL';
      useCases = ['capacitación corporativa', 'formación de personal', 'desarrollo de habilidades'];
      primaryBuyerNeeds = ['CAPACITACION_EQUIPOS', 'DESARROLLO_HABILIDADES'];
      buyerOperatingContexts = ['CORPORATIVO', 'OFICINAS'];
      positiveIndustries.push('Tecnología y Software', 'Servicios Profesionales', 'Consultoría', 'Banca y Finanzas', 'Hotelería');
      targetIndustries.push(...positiveIndustries);
      targetProfessions.push('gerente de rrhh', 'capacitador', 'responsable de formación');
    } else if (productDomain === 'INDUSTRIAL_PRINTING_LOGISTICS') {
      horizontalClassification = 'SEMI_HORIZONTAL';
      positiveIndustries.push('Ferretería y Afines', 'Logística y Almacén', 'Comercio Mayorista', 'Construcción');
      neutralIndustries.push('Retail', 'Industria');
      excludedIndustries.push('Salud y Medicina', 'Consultoría Legal');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'PROFESSIONAL_MEDIA_SERVICES') {
      horizontalClassification = 'SEMI_HORIZONTAL';
      positiveIndustries.push('Ingeniería y Arquitectura', 'Inmobiliaria', 'Construcción', 'Publicidad');
      neutralIndustries.push('Comercio', 'Hotelería');
      excludedIndustries.push('Veterinaria', 'Gastronomía');
      targetProfessions.push('arquitecto', 'ingeniero', 'diseñador');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'WORKWEAR_UNIFORMS') {
      horizontalClassification = 'SEMI_HORIZONTAL';
      positiveIndustries.push('Gastronomía y Bebidas', 'Cafetería y Bar', 'Hotelería', 'Industria y Manufactura', 'Salud y Medicina');
      targetProfessions.push('barista', 'cocinero', 'chef', 'personal de cocina', 'enfermero', 'operario');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'FACILITY_CLEANING_SERVICES') {
      horizontalClassification = 'HORIZONTAL';
      useCases = ['limpieza de instalaciones', 'mantenimiento e higiene de edificios', 'sanitización de oficinas y plantas'];
      primaryBuyerNeeds = ['HIGIENE_EDILICIA', 'MANTENIMIENTO_FACILITY', 'LIMPIEZA_CORPORATIVA'];
      buyerOperatingContexts = ['OFICINAS', 'HOTELES', 'HOSPITALES', 'SUPERMERCADOS', 'PLANTAS'];
      positiveIndustries.push('HOTELES', 'Hotelería', 'Salud y Medicina', 'SUPERMARKET', 'Gastronomía y Bebidas', 'Edificios y Oficinas', 'Educación', 'Banca y Finanzas', 'Comercio y Retail', 'Industria');
      targetProfessions.push('administrador', 'gerente de operaciones', 'responsable de mantenimiento', 'intendente');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'OFFICE_HARDWARE_IT') {
      horizontalClassification = 'HORIZONTAL';
      useCases = ['equipamiento informático', 'puestos de trabajo digital', 'computación corporativa'];
      primaryBuyerNeeds = ['EQUIPAMIENTO_IT', 'PUESTOS_DE_TRABAJO', 'COMPUTACION_CORPORATIVA'];
      buyerOperatingContexts = ['OFICINAS', 'SUCURSALES', 'CENTROS_EDUCATIVOS', 'CLINICAS'];
      positiveIndustries.push('Tecnología y Software', 'Consultoría y Auditoría', 'Servicios Profesionales', 'Educación', 'BANCO', 'Banca y Finanzas', 'HOTELES', 'Comercio');
      targetProfessions.push('gerente de IT', 'director de tecnología', 'analista', 'administrador');
      targetIndustries.push(...positiveIndustries);
    } else if (productDomain === 'OFFICE_FURNITURE') {
      horizontalClassification = 'HORIZONTAL';
      useCases = ['equipamiento de oficinas', 'mobiliario corporativo', 'puestos de trabajo ergonómicos'];
      primaryBuyerNeeds = ['MOBILIARIO_CORPORATIVO', 'PUESTOS_DE_TRABAJO', 'ERGONOMIA_OFICINA'];
      buyerOperatingContexts = ['OFICINAS_CORPORATIVAS', 'SEDES_EMPRESARIALES'];
      positiveIndustries.push('Servicios Profesionales', 'Consultoría y Auditoría', 'Tecnología y Software', 'BANCO', 'Banca y Finanzas', 'HOTELES', 'Actividades inmobiliarias', 'Salud y Medicina');
      targetProfessions.push('gerente de compras', 'diseñador de interiores', 'administrador', 'facility manager');
      targetIndustries.push(...positiveIndustries);
    } else {
      // General commerce fallback
      targetIndustries.push('Comercio General', 'Servicios');
    }

    const isHorizontal = horizontalClassification === 'HORIZONTAL' || /escritorio|papel|resma|librer[ií]a|limpieza|computadora|muebles de oficina/i.test(lower);

    return {
      buyer_types: buyerTypes,
      primary_buyer_types: buyerTypes,
      usage_context: usageContext,
      product_domain: productDomain,
      horizontal_classification: horizontalClassification,
      use_cases: useCases,
      primary_buyer_needs: primaryBuyerNeeds,
      buyer_operating_contexts: buyerOperatingContexts,
      target_industries: targetIndustries,
      buyer_industries_positive: positiveIndustries,
      buyer_industries_neutral: neutralIndustries,
      excluded_industries: excludedIndustries,
      buyer_industries_excluded: excludedIndustries,
      target_professions: targetProfessions,
      excluded_professions: excludedProfessions,
      required_buyer_attributes: requiredBuyerAttributes,
      buyer_attributes_required: requiredBuyerAttributes,
      preferred_buyer_attributes: preferredBuyerAttributes,
      buyer_attributes_preferred: preferredBuyerAttributes,
      incompatible_buyer_attributes: [],
      evidence_requirements: [`Afinidad evidenciada en contexto ${productDomain}`],
      is_horizontal_commodity: isHorizontal
    };
  }

  /**
   * Compiles from structured input with explicit field mappings and domain inference.
   */
  public static compileFromStructuredInput(input: RawProductInput): ProductCompatibilitySpec {
    const rawLower = `${input.title} ${input.description || ''} ${input.category || ''}`.toLowerCase();

    let buyerTypes: BuyerType[] = [];
    if (input.target_buyer_type === 'COMPANY') {
      buyerTypes = ['COMPANY', 'ORGANIZATION'];
    } else if (input.target_buyer_type === 'PERSON') {
      buyerTypes = ['PERSON'];
    } else if (input.target_buyer_type === 'BOTH') {
      buyerTypes = ['COMPANY', 'PERSON', 'ORGANIZATION'];
    } else {
      if (/corporativ|empresa|\bb2b\b|n[oó]minas/i.test(rawLower)) {
        buyerTypes = ['COMPANY', 'ORGANIZATION'];
      } else if (/profesional(es)?\s+independiente(s)?|persona|individual/i.test(rawLower)) {
        buyerTypes = ['PERSON'];
      } else {
        buyerTypes = ['COMPANY', 'PERSON', 'ORGANIZATION'];
      }
    }

    const usageContext: UsageContext[] = input.usage_context && input.usage_context.length > 0
      ? input.usage_context
      : (buyerTypes.includes('PERSON') ? ['PROFESSIONAL', 'PERSONAL'] : ['BUSINESS', 'INDUSTRIAL']);

    const domain = input.domain || input.category || 'COMMERCE_PRODUCT';

    // Classification
    let horizontalClassification: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL' = 'HORIZONTAL';
    if (/PET_CARE|alimento perros|mascotas|veterinar|odontol/i.test(domain) || /nutrican|perros|mascotas|odontol/i.test(rawLower)) {
      horizontalClassification = 'VERTICAL';
    } else if (/HARDWARE_TOOLS|taladro|soldadora|herramienta|PROFESSIONAL_INSURANCE|seguro|HOME_DECOR|alfombra/i.test(domain) || /taladro|soldadora|herramienta|mala praxis|seguro|alfombra/i.test(rawLower)) {
      horizontalClassification = 'SEMI_HORIZONTAL';
    } else {
      horizontalClassification = 'HORIZONTAL';
    }

    // Infer excluded industries if not explicitly provided
    const excludedIndustries = [...(input.excluded_industries || [])];
    if (excludedIndustries.length === 0) {
      if (horizontalClassification === 'VERTICAL') {
        if (/PET_CARE|alimento perros|mascotas/i.test(domain) || /nutrican|perros/i.test(rawLower)) {
          excludedIndustries.push('Tecnología y Software', 'Construcción', 'Estudios Contables', 'Agro y Ganadería', 'Banca y Finanzas');
        } else if (/AGRO|fertilizante|cultivos/i.test(domain) || /biopampa|fertilizante/i.test(rawLower)) {
          excludedIndustries.push('Salud y Medicina', 'Tecnología y Software', 'Gastronomía y Bebidas', 'VETERINARIA', 'Estudios Contables');
        }
      } else if (horizontalClassification === 'SEMI_HORIZONTAL') {
        if (/HARDWARE_TOOLS|taladro|soldadora/i.test(domain) || /bosch|herramientas/i.test(rawLower)) {
          excludedIndustries.push('Servicios Financieros Puros', 'Consultoría Contable y Legal', 'Software y Desarrollo Cloud');
        } else if (/PROFESSIONAL_INSURANCE/i.test(domain) || /mala praxis|responsabilidad civil/i.test(rawLower)) {
          excludedIndustries.push('Ferretería y Afines', 'Agro y Ganadería', 'Gastronomía y Bebidas');
        }
      }
      // For HORIZONTAL products (e.g. SOFTWARE_SAAS, HR, Cleaning, Computers): NO industry exclusions by default
    }

    const useCases = [
      ...(input.use_cases || []),
      ...(input.target_activities || []),
      ...(input.target_keywords || [])
    ];

    const targetProfessions = [...(input.target_professions || [])];
    if (targetProfessions.length === 0) {
      if (/m[eé]dic|cirujan|salud/i.test(rawLower)) targetProfessions.push('médico', 'médico cirujano');
      if (/ingenier|arquitect/i.test(rawLower)) targetProfessions.push('ingeniero', 'arquitecto', 'consultor');
      if (/contab|auditor|impuest/i.test(rawLower)) targetProfessions.push('contador', 'auditor');
      if (/veterinar/i.test(rawLower)) targetProfessions.push('veterinario', 'pet shop');
      if (/construcc|obra|reforma/i.test(rawLower)) targetProfessions.push('maestro mayor de obras', 'contratista');
      if (/barista|caf[eé]/i.test(rawLower)) targetProfessions.push('barista', 'cafetero');
      if (/software|desarrollo/i.test(rawLower)) targetProfessions.push('desarrollador', 'director de ti');
      if (/rrhh|recursos humanos|n[oó]mina/i.test(rawLower)) targetProfessions.push('gerente de rrhh', 'director de personal', 'people operations');
    }

    const primaryBuyerNeeds: string[] = [];
    if (/rrhh|recursos humanos|n[oó]mina/i.test(rawLower)) {
      primaryBuyerNeeds.push('GESTION_EMPLEADOS', 'NOMINA_Y_SUELDOS', 'GESTION_TALENTO', 'ADMINISTRACION_TURNOS', 'CONTROL_LABORAL');
    } else if (/taladro|herramienta/i.test(rawLower)) {
      primaryBuyerNeeds.push('PERFORACION', 'INSTALACION_TECNICA', 'OBRA_CONSTRUCCION', 'MANTENIMIENTO_EDILICIO');
    } else if (/perro|mascota|alimento balanceado/i.test(rawLower)) {
      primaryBuyerNeeds.push('NUTRICION_CANINA', 'STOCK_ALIMENTOS_BALANCEADOS', 'VENTA_VETERINARIA');
    }

    return {
      buyer_types: buyerTypes,
      primary_buyer_types: buyerTypes,
      usage_context: usageContext,
      product_domain: domain,
      horizontal_classification: horizontalClassification,
      use_cases: useCases.length > 0 ? useCases : [input.title],
      primary_buyer_needs: primaryBuyerNeeds,
      target_industries: input.target_industries || [],
      buyer_industries_positive: input.target_industries || [],
      buyer_industries_neutral: [],
      excluded_industries: excludedIndustries,
      buyer_industries_excluded: excludedIndustries,
      target_professions: targetProfessions,
      excluded_professions: input.excluded_professions || [],
      required_buyer_attributes: input.required_attributes || [],
      buyer_attributes_required: input.required_attributes || [],
      preferred_buyer_attributes: input.preferred_attributes || [],
      buyer_attributes_preferred: input.preferred_attributes || [],
      incompatible_buyer_attributes: input.incompatible_attributes || [],
      is_horizontal_commodity: input.is_commodity ?? (/resma|papel a4|escritorio/i.test(rawLower))
    };
  }
}
