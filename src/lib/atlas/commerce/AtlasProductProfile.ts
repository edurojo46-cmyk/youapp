/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasProductProfile.ts
 * Path: src/lib/atlas/commerce/AtlasProductProfile.ts
 * 
 * Normalized representation of what a user or enterprise sells.
 * Decoupled from Opportunity Signals and Truth Graph identities.
 */

export type ProductBuyerType = 'PERSON' | 'COMPANY' | 'BOTH';
export type ProductPurchaseMode = 'ONLINE' | 'SUBSCRIPTION' | 'MARKETPLACE' | 'ONE_OFF' | 'NOT_SPECIFIED' | 'UNKNOWN';

export interface TargetAttributes {
  target_activities?: string[];
  target_industries?: string[];
  target_roles?: string[];
  target_professions?: string[];
  min_company_size?: number;
  max_company_size?: number;
  required_technologies?: string[];
  keywords?: string[];
  declared_interests?: string[];
  required_criteria?: string[];
  negative_indicators?: string[];
  [key: string]: any;
}

export interface ExclusionAttributes {
  excluded_activities?: string[];
  excluded_geos?: string[];
  excluded_organization_types?: string[];
  negative_indicators?: string[];
  [key: string]: any;
}

export interface AtlasProductProfileData {
  product_id?: string;
  product_name: string;
  description?: string;
  category: string;
  buyer_type: ProductBuyerType;
  price?: number | null;
  currency?: string | null;
  purchase_mode?: ProductPurchaseMode;
  horizontal_classification?: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL';
  primary_buyer_needs?: string[];
  buyer_operating_contexts?: string[];
  buyer_industries_positive?: string[];
  buyer_industries_neutral?: string[];
  buyer_industries_excluded?: string[];
  target_attributes: TargetAttributes;
  exclusion_attributes: ExclusionAttributes;
  geo_available: string[];
  purchase_url?: string;
}

export class AtlasProductProfile {
  public readonly product_id: string;
  public readonly product_name: string;
  public readonly description: string;
  public readonly category: string;
  public readonly buyer_type: ProductBuyerType;
  public readonly price: number | null;
  public readonly currency: string;
  public readonly purchase_mode: ProductPurchaseMode;
  public readonly horizontal_classification: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL';
  public readonly primary_buyer_needs: string[];
  public readonly buyer_operating_contexts: string[];
  public readonly buyer_industries_positive: string[];
  public readonly buyer_industries_neutral: string[];
  public readonly buyer_industries_excluded: string[];
  public readonly target_attributes: TargetAttributes;
  public readonly exclusion_attributes: ExclusionAttributes;
  public readonly geo_available: string[];
  public readonly purchase_url: string;
  public readonly required_criteria: string[];
  public readonly negative_indicators: string[];

  constructor(data: AtlasProductProfileData) {
    this.product_id = data.product_id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.product_name = data.product_name.trim();
    this.description = data.description || `Oferta comercial para ${data.product_name}`;
    this.category = data.category || 'GENERAL_B2B';
    this.buyer_type = data.buyer_type || 'COMPANY';
    this.price = data.price !== undefined ? data.price : null;
    this.currency = data.currency || (data.price !== null && data.price !== undefined ? 'ARS' : 'UNKNOWN');
    this.purchase_mode = data.purchase_mode || 'UNKNOWN';
    this.horizontal_classification = data.horizontal_classification || 'HORIZONTAL';
    this.primary_buyer_needs = data.primary_buyer_needs || [];
    this.buyer_operating_contexts = data.buyer_operating_contexts || [];
    this.buyer_industries_positive = data.buyer_industries_positive || [];
    this.buyer_industries_neutral = data.buyer_industries_neutral || [];
    this.buyer_industries_excluded = data.buyer_industries_excluded || [];
    this.target_attributes = data.target_attributes || {};
    this.exclusion_attributes = data.exclusion_attributes || {};
    this.geo_available = data.geo_available || ['ALL'];
    this.purchase_url = data.purchase_url || '';
    this.required_criteria = this.target_attributes.required_criteria || [];
    this.negative_indicators = this.target_attributes.negative_indicators || this.exclusion_attributes.negative_indicators || [];
  }

  /**
   * Helper that builds an intelligent product profile from a natural query like "¿QUÉ VENDÉS?".
   * Resets all previous state and avoids inventing default price, currency or subscription.
   */
  public static fromNaturalQuery(query: string, buyerTypeOverride?: ProductBuyerType): AtlasProductProfile {
    const qLower = query.toLowerCase().trim();
    let category = 'GENERAL_COMMERCE';
    let buyerType: ProductBuyerType = buyerTypeOverride || 'COMPANY';
    let purchaseMode: ProductPurchaseMode = 'UNKNOWN';
    let price: number | null = null;
    let currency = 'UNKNOWN';

    // Parse explicit price if provided in query (e.g. "$150", "150 USD", "20000 ARS")
    const priceRegex = /(?:\$|usd|ars|u\$s)?\s*(\d+(?:[.,]\d+)?)\s*(usd|ars|u\$s|\$)?/i;
    const explicitPriceMatch = qLower.match(priceRegex);
    if (explicitPriceMatch && explicitPriceMatch[1]) {
      const parsed = parseFloat(explicitPriceMatch[1].replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0 && (qLower.includes('$') || qLower.includes('usd') || qLower.includes('ars') || qLower.includes('precio'))) {
        price = parsed;
        if (qLower.includes('usd') || qLower.includes('u$s')) {
          currency = 'USD';
        } else if (qLower.includes('ars')) {
          currency = 'ARS';
        } else {
          currency = 'ARS';
        }
      }
    }

    if (qLower.includes('suscripcion') || qLower.includes('suscripción') || qLower.includes('/mes') || qLower.includes('mensual')) {
      purchaseMode = 'SUBSCRIPTION';
    }

    const targetAttrs: TargetAttributes = {
      target_activities: [],
      target_industries: [],
      keywords: qLower.split(/\s+/).filter(w => w.length > 2),
      required_criteria: [],
      negative_indicators: []
    };
    const exclusionAttrs: ExclusionAttributes = {
      excluded_activities: [],
      excluded_geos: [],
      negative_indicators: []
    };

    let horizontalClassification: 'HORIZONTAL' | 'VERTICAL' | 'SEMI_HORIZONTAL' = 'HORIZONTAL';
    let primaryBuyerNeeds: string[] = [];
    let buyerOperatingContexts: string[] = [];
    let buyerIndustriesPositive: string[] = [];
    let buyerIndustriesNeutral: string[] = [];
    let buyerIndustriesExcluded: string[] = [];

    if (qLower.includes('recursos humanos') || qLower.includes('rrhh') || qLower.includes('human resources') || qLower.includes('payroll') || qLower.includes('nómina') || qLower.includes('nomina') || qLower.includes('personal')) {
      category = 'SOFTWARE_HR';
      horizontalClassification = 'HORIZONTAL';
      buyerType = buyerTypeOverride || 'COMPANY';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'SUBSCRIPTION';
      primaryBuyerNeeds = ['GESTION_EMPLEADOS', 'NOMINA_Y_SUELDOS', 'GESTION_TALENTO', 'ADMINISTRACION_TURNOS', 'CONTROL_LABORAL'];
      buyerOperatingContexts = ['OPERACION_MULTI_SEDE', 'EMPRESA_CON_DOTACION', 'PLANTA_INDUSTRIAL', 'CORPORATIVO', 'RED_SUCURSALES'];
      buyerIndustriesPositive = [
        'Tecnología y Software',
        'Hotelería',
        'Salud y Medicina',
        'Banca y Finanzas',
        'Comercio y Retail',
        'Construcción y Reformas',
        'Industria y Manufactura',
        'Telecomunicaciones',
        'Servicios Profesionales'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = buyerIndustriesPositive;
      targetAttrs.target_roles = ['Gerente de RRHH', 'Director de Recursos Humanos', 'People & Culture Lead', 'Director General', 'CEO'];
      targetAttrs.min_company_size = 10;
      targetAttrs.required_criteria = [
        'EMPLOYEE_SCALE',
        'ORGANIZATION_COMPLEXITY',
        'HIRING_ACTIVITY',
        'MULTIPLE_LOCATIONS',
        'WORKFORCE_INTENSITY',
        'INDUSTRY_RELEVANCE',
        'HR_OPERATION_COMPLEXITY'
      ];
      targetAttrs.negative_indicators = [
        'UNIPERSONAL_ESTABLISHMENT',
        'NO_EMPLOYEES_ACTIVITY',
        'MICRO_RETAIL_KIOSK',
        'SINGLE_BAKERY_SHOP',
        'OUT_OF_GEO'
      ];
      exclusionAttrs.negative_indicators = targetAttrs.negative_indicators;
    } else if (qLower.includes('perro') || qLower.includes('perros') || qLower.includes('alimento') || qLower.includes('mascota') || qLower.includes('mascotas') || qLower.includes('canino') || qLower.includes('veterinaria')) {
      category = 'PET_CARE_FOOD';
      horizontalClassification = 'VERTICAL';
      buyerType = buyerTypeOverride || 'COMPANY';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONLINE';
      primaryBuyerNeeds = ['NUTRICION_CANINA', 'STOCK_ALIMENTOS_BALANCEADOS', 'VENTA_VETERINARIA', 'DIETA_MASCOTAS'];
      buyerOperatingContexts = ['CLINICA_VETERINARIA', 'PET_SHOP_RETAIL', 'DISTRIBUIDOR_VETERINARIO'];
      buyerIndustriesPositive = [
        'VETERINARIA',
        'VETERINARIAS',
        'Veterinaria',
        'VETERINARY',
        'Pet Shop',
        'Alimentos Balanceados',
        'Guardería Canina',
        'Forrajería y Mascotas'
      ];
      buyerIndustriesExcluded = [
        'Tecnología y Software',
        'Consultoría IT y Desarrollo',
        'Banca y Finanzas',
        'Industria Química Pesada',
        'Construcción y Reformas'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'VETERINARIA',
        'VETERINARIAS',
        'VETERINARY',
        'PET_CARE',
        'ANIMAL_HEALTH'
      ];
      targetAttrs.required_criteria = [
        'PET_INDUSTRY_AFFINITY',
        'RETAIL_DISTRIBUTION_CAPACITY',
        'ANIMAL_CARE_SERVICES'
      ];
      targetAttrs.negative_indicators = [
        'SOFTWARE_IT_CONSULTING',
        'BANKING_FINANCE',
        'HEAVY_CHEMICAL_INDUSTRY',
        'LEGAL_NOTARY'
      ];
      exclusionAttrs.negative_indicators = targetAttrs.negative_indicators;
    } else if (qLower.includes('muebles de oficina') || qLower.includes('mobiliario de oficina') || qLower.includes('escritorio corporativo') || qLower.includes('silla de oficina')) {
      category = 'OFFICE_FURNITURE';
      horizontalClassification = 'HORIZONTAL';
      buyerType = buyerTypeOverride || 'COMPANY';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONE_OFF';
      primaryBuyerNeeds = ['MOBILIARIO_CORPORATIVO', 'PUESTOS_DE_TRABAJO', 'ERGONOMIA_OFICINA'];
      buyerIndustriesPositive = [
        'Servicios Profesionales',
        'Tecnología y Software',
        'BANCO',
        'HOTELES',
        'Actividades inmobiliarias',
        'Consultoría y Auditoría',
        'Salud y Medicina',
        'SUPERMARKET'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Servicios Profesionales',
        'Tecnología',
        'Banca y Finanzas',
        'Hotelería',
        'Inmobiliaria'
      ];
      targetAttrs.required_criteria = ['ORGANIZATION_COMPLEXITY', 'FACILITY_OR_RETAIL_SCALE'];
    } else if (qLower.includes('limpieza') || qLower.includes('mantenimiento de instalaciones') || qLower.includes('facility')) {
      category = 'FACILITY_SERVICES';
      horizontalClassification = 'HORIZONTAL';
      buyerType = buyerTypeOverride || 'BOTH';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONLINE';
      primaryBuyerNeeds = ['HIGIENE_EDILICIA', 'MANTENIMIENTO_FACILITY', 'LIMPIEZA_CORPORATIVA'];
      buyerIndustriesPositive = [
        'HOTELES',
        'Salud y Medicina',
        'SUPERMARKET',
        'Edificios y Oficinas',
        'Gastronomía y Bebidas',
        'Banca y Finanzas',
        'Comercio y Retail',
        'Industria y Manufactura'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Hotelería',
        'Salud y Medicina',
        'Retail',
        'Banca y Finanzas',
        'Industria'
      ];
      targetAttrs.required_criteria = ['FACILITY_OR_RETAIL_SCALE', 'OPERATIONAL_EQUIPMENT_NEED'];
    } else if (qLower.includes('computadora') || qLower.includes('computadoras') || qLower.includes('notebook') || qLower.includes('laptop') || qLower.includes('ordenador')) {
      category = 'OFFICE_HARDWARE_IT';
      horizontalClassification = 'HORIZONTAL';
      buyerType = buyerTypeOverride || 'BOTH';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONE_OFF';
      primaryBuyerNeeds = ['EQUIPAMIENTO_IT', 'PUESTOS_DE_TRABAJO', 'COMPUTACION_CORPORATIVA'];
      buyerIndustriesPositive = [
        'Tecnología y Software',
        'Consultoría y Auditoría',
        'Servicios Profesionales',
        'Educación',
        'BANCO',
        'Banca y Finanzas',
        'HOTELES',
        'Comercio'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Tecnología y Software',
        'Consultoría',
        'Educación',
        'Finanzas',
        'Comercio'
      ];
      targetAttrs.required_criteria = ['ORGANIZATION_COMPLEXITY', 'DIGITAL_INFRASTRUCTURE'];
    } else if (qLower.includes('alfombra') || qLower.includes('revestimiento') || qLower.includes('tapiz') || qLower.includes('mueble') || qLower.includes('decoración') || qLower.includes('decoracion') || qLower.includes('interiorismo')) {
      category = 'HOME_DECOR_FLOORING';
      horizontalClassification = 'SEMI_HORIZONTAL';
      buyerType = buyerTypeOverride || 'BOTH';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONE_OFF';
      primaryBuyerNeeds = ['REVESTIMIENTO_SUELOS', 'DECORACION_INTERIOR', 'AISLACION_ACUSTICA', 'EQUIPAMIENTO_HOGAR_OFICINA'];
      buyerOperatingContexts = ['HOTELERIA', 'SHOWROOM_MUEBLES', 'OFICINAS_CORPORATIVAS', 'LOCAL_COMERCIAL', 'VIVIENDA'];
      buyerIndustriesPositive = [
        'furniture',
        'Mobiliario y Decoración',
        'Construcción y Reformas',
        'Actividades inmobiliarias',
        'HOTELES',
        'Arquitectura y Diseño de Interiores',
        'Comercio Minorista de Muebles y Artículos para el Hogar'
      ];
      buyerIndustriesNeutral = ['Salud y Medicina', 'Educación', 'Banca y Finanzas'];
      buyerIndustriesExcluded = ['Tecnología y Software', 'Industria Química Pesada'];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Mobiliario y Decoración',
        'Construcción y Reformas',
        'Hotelería',
        'Actividades inmobiliarias',
        'Arquitectura'
      ];
      targetAttrs.required_criteria = [
        'INTERIOR_DECOR_AFFINITY',
        'FACILITY_OR_RETAIL_SCALE'
      ];
      targetAttrs.negative_indicators = [
        'SOFTWARE_IT_CONSULTING',
        'HEAVY_CHEMICAL_INDUSTRY'
      ];
      exclusionAttrs.negative_indicators = targetAttrs.negative_indicators;
    } else if (qLower.includes('taladro') || qLower.includes('herramienta') || qLower.includes('soldador') || qLower.includes('maquinaria') || qLower.includes('ferreter')) {
      category = 'HARDWARE_TOOLS';
      horizontalClassification = 'SEMI_HORIZONTAL';
      buyerType = buyerTypeOverride || 'BOTH';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONE_OFF';
      primaryBuyerNeeds = ['PERFORACION', 'INSTALACION_TECNICA', 'OBRA_CONSTRUCCION', 'MANTENIMIENTO_EDILICIO', 'MONTAJE_Y_REPARACION'];
      buyerOperatingContexts = ['OBRA_CONSTRUCCION', 'TALLER_MECANICO', 'SERVICIO_TECNICO', 'FACILITY_MANAGEMENT_MANTENIMIENTO'];
      buyerIndustriesPositive = [
        'Ferretería y Afines',
        'CERRAJERÍA',
        'Construcción y Reformas',
        'Mantenimiento y Reparación',
        'Metalmecánica',
        'Instalaciones Eléctricas',
        'Carpintería y Muebles'
      ];
      buyerIndustriesNeutral = [
        'Salud y Medicina',
        'Hotelería',
        'Comercio y Supermercados',
        'Educación',
        'Banca y Finanzas',
        'Industria y Manufactura'
      ];
      buyerIndustriesExcluded = [
        'Servicios Financieros Puros',
        'Consultoría Contable y Legal',
        'Software y Desarrollo Cloud'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Ferretería y Afines',
        'Construcción',
        'Mantenimiento y Reparación',
        'Metalmecánica'
      ];
      targetAttrs.required_criteria = [
        'HARDWARE_CAPACITY',
        'OPERATIONAL_EQUIPMENT_NEED'
      ];
      targetAttrs.negative_indicators = [
        'HEALTHCARE_CLINIC',
        'LEGAL_NOTARY'
      ];
      exclusionAttrs.negative_indicators = targetAttrs.negative_indicators;
    } else if (qLower.includes('seguro') || qLower.includes('inversiones') || qLower.includes('crédito') || qLower.includes('prestamo')) {
      category = 'PROFESSIONAL_INSURANCE';
      horizontalClassification = 'SEMI_HORIZONTAL';
      buyerType = buyerTypeOverride || 'BOTH';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'ONLINE';
      primaryBuyerNeeds = ['COBERTURA_RESPONSABILIDAD_CIVIL', 'PROTECCION_MALA_PRAXIS', 'POLIZA_PROFESIONAL'];
      buyerOperatingContexts = ['CONSULTORIO_MEDICO', 'ESTUDIO_PROFESIONAL', 'CLINICA_U_HOSPITAL', 'OBRA_INGENIERIA'];
      buyerIndustriesPositive = [
        'Servicios Profesionales',
        'Consultoría y Auditoría',
        'Salud y Medicina',
        'Ingeniería y Arquitectura',
        'Banca y Finanzas',
        'ESCRIBANIAS'
      ];
      buyerIndustriesNeutral = ['Comercio y Retail', 'Hotelería'];
      buyerIndustriesExcluded = ['Ferretería y Afines', 'Agro y Ganadería', 'Gastronomía y Bebidas'];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = [
        'Servicios Profesionales',
        'Salud y Medicina',
        'Ingeniería',
        'Finanzas'
      ];
      targetAttrs.required_criteria = ['FISCAL_REGISTRY', 'INDUSTRY_RELEVANCE'];
    } else if (qLower.includes('ciberseguridad') || qLower.includes('seguridad informática') || qLower.includes('cloud') || qLower.includes('erp') || qLower.includes('crm') || qLower.includes('software')) {
      category = 'SOFTWARE_ENTERPRISE';
      horizontalClassification = 'HORIZONTAL';
      buyerType = buyerTypeOverride || 'COMPANY';
      if (purchaseMode === 'UNKNOWN') purchaseMode = 'SUBSCRIPTION';
      primaryBuyerNeeds = ['AUTOMATIZACION_PROCESOS', 'DIGITALIZACION_OPERATIVA', 'SEGURIDAD_DIGITAL'];
      buyerIndustriesPositive = [
        'Tecnología y Software',
        'Fintech',
        'Banca y Finanzas',
        'Servicios',
        'Comercio Electrónico y Fintech'
      ];
      targetAttrs.target_activities = buyerIndustriesPositive;
      targetAttrs.target_industries = buyerIndustriesPositive;
      targetAttrs.required_criteria = [
        'ORGANIZATION_COMPLEXITY',
        'DIGITAL_INFRASTRUCTURE',
        'INDUSTRY_RELEVANCE'
      ];
      targetAttrs.negative_indicators = [
        'MICRO_RETAIL_KIOSK',
        'UNIPERSONAL_ESTABLISHMENT'
      ];
    } else {
      targetAttrs.required_criteria = ['INDUSTRY_RELEVANCE', 'ORGANIZATION_COMPLEXITY'];
    }

    return new AtlasProductProfile({
      product_name: query.trim(),
      description: `Solución comercial para: ${query.trim()}`,
      category,
      buyer_type: buyerType,
      price: price,
      currency: currency,
      purchase_mode: purchaseMode,
      horizontal_classification: horizontalClassification,
      primary_buyer_needs: primaryBuyerNeeds,
      buyer_operating_contexts: buyerOperatingContexts,
      buyer_industries_positive: buyerIndustriesPositive,
      buyer_industries_neutral: buyerIndustriesNeutral,
      buyer_industries_excluded: buyerIndustriesExcluded,
      target_attributes: targetAttrs,
      exclusion_attributes: exclusionAttrs,
      geo_available: ['ALL'],
      purchase_url: `https://atlas.youapp.tv/checkout?product=${encodeURIComponent(query.trim())}`
    });
  }
}
