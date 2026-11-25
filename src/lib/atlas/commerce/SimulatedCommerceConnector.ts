/**
 * ATLAS COMMERCE SIMULATION_ONLY V1
 * Module: SimulatedCommerceConnector.ts
 * Path: src/lib/atlas/commerce/SimulatedCommerceConnector.ts
 * 
 * Simulated in-house catalog connector.
 * Provides rich test products across diverse industries for buyer-product matching.
 * ZERO external API calls, ZERO real OAuth, ZERO webhooks, ZERO real checkout.
 */

import type { AtlasCommerceConnector, CommerceSellerInfo, CommerceOrderInfo } from './AtlasCommerceConnector.ts';
import { AtlasProduct } from './AtlasProduct.ts';
import { AtlasCommerceGate } from './AtlasCommerceGate.ts';

export interface SimulatedProductDefinition {
  atlas_product_id: string;
  seller_id: string;
  seller_name: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  price: number;
  currency: string;
  stock: number;
  purchase_url: string;
  target_buyer_type: 'PERSON' | 'COMPANY' | 'BOTH';
  target_keywords: string[];
  target_industries: string[];
  target_activities: string[];
  min_scale?: number;
  environment: 'SIMULATION';
}

export class SimulatedCommerceConnector implements AtlasCommerceConnector {
  private static instance: SimulatedCommerceConnector;
  private gate: AtlasCommerceGate;
  private catalog: Map<string, SimulatedProductDefinition> = new Map();
  private isConnected: boolean = true;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.seedSimulationCatalog();
  }

  public static getInstance(): SimulatedCommerceConnector {
    if (!SimulatedCommerceConnector.instance) {
      SimulatedCommerceConnector.instance = new SimulatedCommerceConnector();
    }
    return SimulatedCommerceConnector.instance;
  }

  /**
   * Seeds 10 distinct simulated products covering diverse buyer profiles.
   */
  private seedSimulationCatalog(): void {
    const products: SimulatedProductDefinition[] = [
      {
        atlas_product_id: 'PROD_BOSCH_DRILL_01',
        seller_id: 'SELLER_FERRETERIA_DEMO',
        seller_name: 'Ferretería Demo',
        title: 'Taladro Percutor Bosch Professional GSB 13 RE 650W',
        description: 'Herramienta eléctrica profesional de alta durabilidad para obras, talleres y mantenimiento técnico.',
        category: 'HARDWARE_TOOLS',
        brand: 'Bosch',
        price: 120000,
        currency: 'ARS',
        stock: 4,
        purchase_url: 'SIMULATED://checkout?product=PROD_BOSCH_DRILL_01',
        target_buyer_type: 'BOTH',
        target_keywords: ['taladro', 'herramientas', 'ferreteria', 'construccion', 'mantenimiento', 'obra'],
        target_industries: ['Construcción', 'Ferretería y Afines', 'Mantenimiento y Reparación', 'Metalmecánica'],
        target_activities: ['Ferretería', 'Construcción y Reformas', 'Instalaciones Eléctricas', 'Mecánica'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_HR_CORP_01',
        seller_id: 'SELLER_ATLAS_SOFTWARE',
        seller_name: 'Atlas Software Hub',
        title: 'Atlas HR Suite — Licencia Corporativa Anual',
        description: 'Plataforma integral de gestión de personal, legajos digitales, nómina y control de presentismo para empresas con nómina activa.',
        category: 'SOFTWARE_HR',
        brand: 'Atlas HR',
        price: 185000,
        currency: 'ARS',
        stock: 999,
        purchase_url: 'SIMULATED://checkout?product=PROD_HR_CORP_01',
        target_buyer_type: 'COMPANY',
        target_keywords: ['rrhh', 'recursos humanos', 'payroll', 'personal', 'software rrhh', 'nómina', 'talento'],
        target_industries: ['Tecnología y Software', 'Consultoría IT y Desarrollo', 'Banca y Finanzas', 'Consumo Masivo', 'Telecomunicaciones'],
        target_activities: ['Soluciones de TI y Desarrollo Global', 'Aceleración Digital y Consultoría IT', 'Software de Gestión Empresarial ERP', 'Sistemas ERP y Gestión Empresarial', 'Ingeniería de Software y Transformación Digital'],
        min_scale: 10,
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_PET_FOOD_01',
        seller_id: 'SELLER_PET_DISTRIBUIDORA',
        seller_name: 'Distribuidora Pet Market',
        title: 'Alimento Balanceado Premium Perros Adultos 15kg',
        description: 'Bolsa de nutrición avanzada con alta palatabilidad y proteínas hidrolizadas para veterinarias y pet shops.',
        category: 'PET_CARE_FOOD',
        brand: 'NutriCan Pro',
        price: 38500,
        currency: 'ARS',
        stock: 45,
        purchase_url: 'SIMULATED://checkout?product=PROD_PET_FOOD_01',
        target_buyer_type: 'BOTH',
        target_keywords: ['perro', 'alimento para perro', 'mascota', 'veterinaria', 'pet shop', 'canino'],
        target_industries: ['VETERINARIA', 'VETERINARIAS', 'VETERINARY', 'PET_CARE', 'ANIMAL_HEALTH'],
        target_activities: ['Veterinaria', 'Pet Shop', 'Alimentos Balanceados', 'Forrajería y Mascotas', 'Guardería Canina'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_AGRO_BIO_01',
        seller_id: 'SELLER_AGRO_PAMPA',
        seller_name: 'AgroInsumos Pampa S.A.',
        title: 'Fertilizante Foliar Bio-Orgánico Bidón 20L',
        description: 'Nutrición vegetal de rápida absorción con bioestimulantes de floración para cultivos extensivos e intensivos.',
        category: 'AGRO_CHEMICALS',
        brand: 'BioPampa',
        price: 95000,
        currency: 'ARS',
        stock: 20,
        purchase_url: 'SIMULATED://checkout?product=PROD_AGRO_BIO_01',
        target_buyer_type: 'COMPANY',
        target_keywords: ['agro', 'fertilizante', 'cultivos', 'campo', 'semillas', 'agronomia'],
        target_industries: ['Agro y Ganadería', 'Industria Química y Soluciones Agrícolas', 'Protección de Cultivos y Semillas', 'Ciencias de la Vida y Agricultura'],
        target_activities: ['Protección de Cultivos y Semillas', 'Microbiología y Nutrición de Cultivos', 'Genética y Mejoramiento de Semillas', 'Biotecnología Agrícola', 'Agronegocios y Exportación de Granos'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_OFFICE_SET_01',
        seller_id: 'SELLER_OFFICE_FURNITURE',
        seller_name: 'Muebles & Espacios SRL',
        title: 'Puesto de Trabajo Ergonómico Corporativo (Escritorio + Silla Pro)',
        description: 'Estación de trabajo regulable en altura con silla de malla transpirable y soporte lumbar certificado.',
        category: 'OFFICE_SUPPLIES',
        brand: 'ErgoWork',
        price: 260000,
        currency: 'ARS',
        stock: 8,
        purchase_url: 'SIMULATED://checkout?product=PROD_OFFICE_SET_01',
        target_buyer_type: 'BOTH',
        target_keywords: ['oficina', 'mobiliario', 'escritorio', 'silla ergonomica', 'puesto de trabajo'],
        target_industries: ['Servicios Corporativos', 'Consultoría y Auditoría', 'Desarrollo de Software', 'Estudios Jurídicos y Contables'],
        target_activities: ['Consultoría Estratégica y Tecnología', 'Bienes de Consumo Masivo e Higiene', 'Servicios Profesionales'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_PAPER_A4_01',
        seller_id: 'SELLER_LIBRERIA_MAYORISTA',
        seller_name: 'Librería Mayorista Centro',
        title: 'Caja Resmas de Papel A4 75g (5 Resmas x 500 Hojas)',
        description: 'Papel multifunción ultra blanco apto para impresión láser e inkjet de alto volumen en oficinas y escribanías.',
        category: 'OFFICE_SUPPLIES',
        brand: 'Ledesma Autor',
        price: 29000,
        currency: 'ARS',
        stock: 80,
        purchase_url: 'SIMULATED://checkout?product=PROD_PAPER_A4_01',
        target_buyer_type: 'BOTH',
        target_keywords: ['papel', 'resmas', 'libreria', 'a4', 'impresion', 'oficina'],
        target_industries: ['Estudios Contables', 'Escribanías', 'Administración Pública', 'Comercios y Servicios'],
        target_activities: ['Auditoría Contable', 'Servicios Notariales', 'Administración PyME'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_TAX_AUDIT_01',
        seller_id: 'SELLER_TAX_CONSULTING',
        seller_name: 'Consultora Tributaria B&A',
        title: 'Abono Mensual Auditoría Fiscal y Liquidación PyME',
        description: 'Servicio integral de asesoramiento contable, presentación de DDJJ y auditoría preventiva de cumplimiento AFIP/ARBA.',
        category: 'FINANCIAL_SERVICES',
        brand: 'B&A Tributaria',
        price: 140000,
        currency: 'ARS',
        stock: 15,
        purchase_url: 'SIMULATED://checkout?product=PROD_TAX_AUDIT_01',
        target_buyer_type: 'COMPANY',
        target_keywords: ['impuestos', 'contador', 'auditoria fiscal', 'afip', 'contabilidad', 'pyme'],
        target_industries: ['Comercio Minorista y Mayorista', 'Manufactura', 'Servicios Médicos', 'Gastronomía'],
        target_activities: ['Comercio', 'Industria Manufacturera', 'Distribución Mayorista'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_SAFETY_TRAIN_01',
        seller_id: 'SELLER_SAFETY_TECH',
        seller_name: 'Prevención Activa Tech',
        title: 'Capacitación Digital en Seguridad e Higiene Laboral (Pack 50 Licencias)',
        description: 'Plataforma e-learning certificada para cumplimiento normativo ART en prevención de riesgos de trabajo.',
        category: 'EDUCATION_TRAINING',
        brand: 'PrevenciónOnline',
        price: 75000,
        currency: 'ARS',
        stock: 500,
        purchase_url: 'SIMULATED://checkout?product=PROD_SAFETY_TRAIN_01',
        target_buyer_type: 'COMPANY',
        target_keywords: ['seguridad e higiene', 'art', 'capacitacion laboral', 'prevencion riesgos', 'cursos rrhh'],
        target_industries: ['Industria Química', 'Construcción', 'Manufactura Pesada', 'Logística y Transporte'],
        target_activities: ['Ciencia de Materiales y Plásticos', 'Industria Química y Soluciones Agrícolas', 'Obras Civiles e Infraestructura'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_ESPRESSO_COMM_01',
        seller_id: 'SELLER_GASTRO_EQUIP',
        seller_name: 'Equipamiento Gastronómico Austral',
        title: 'Cafetera Espresso Comercial 2 Grupos para Cafetería / Bar',
        description: 'Máquina profesional de espresso italiana con caldera de cobre de 11L, dosificación volumétrica y lanzas de vapor.',
        category: 'GASTRONOMY_EQUIPMENT',
        brand: 'Austral Barista',
        price: 850000,
        currency: 'ARS',
        stock: 3,
        purchase_url: 'SIMULATED://checkout?product=PROD_ESPRESSO_COMM_01',
        target_buyer_type: 'BOTH',
        target_keywords: ['cafetera espresso', 'gastronomia', 'cafeteria', 'bar', 'restaurante', 'cafe comercial'],
        target_industries: ['Gastronomía y Bebidas', 'Hotelería y Turismo', 'Cafeterías de Especialidad'],
        target_activities: ['Cafetería y Bar', 'Restaurante', 'Servicios de Alimentos y Bebidas'],
        environment: 'SIMULATION'
      },
      {
        atlas_product_id: 'PROD_INSURANCE_PROF_01',
        seller_id: 'SELLER_INSURANCE_MERCANTIL',
        seller_name: 'Aseguradora Mercantil S.A.',
        title: 'Seguro de Responsabilidad Civil Profesional (Mala Praxis Médica / Legal)',
        description: 'Póliza de cobertura integral ante demandas por mala praxis para profesionales de la salud, abogacía e ingeniería.',
        category: 'INSURANCE',
        brand: 'Mercantil Seguros',
        price: 42000,
        currency: 'ARS',
        stock: 9999,
        purchase_url: 'SIMULATED://checkout?product=PROD_INSURANCE_PROF_01',
        target_buyer_type: 'PERSON',
        target_keywords: ['seguro profesional', 'mala praxis', 'responsabilidad civil', 'medico', 'abogado', 'poliza'],
        target_industries: ['Salud y Medicina', 'Servicios Jurídicos y Notariales', 'Ingeniería y Arquitectura'],
        target_activities: ['Ejercicio Profesional Médico', 'Práctica Jurídica y Litigios', 'Consultoría Profesional Independiente'],
        environment: 'SIMULATION'
      }
    ];

    for (const p of products) {
      this.catalog.set(p.atlas_product_id, p);
    }
  }

  public async connect(_credentials?: any): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  public async getSeller(sellerId: string): Promise<CommerceSellerInfo | null> {
    for (const p of this.catalog.values()) {
      if (p.seller_id === sellerId) {
        return {
          seller_id: p.seller_id,
          name: p.seller_name,
          country: 'AR',
          status: 'ACTIVE',
          currency: 'ARS'
        };
      }
    }
    return null;
  }

  public async getProducts(filter?: { category?: string; query?: string; buyer_type?: string }): Promise<AtlasProduct[]> {
    let list = Array.from(this.catalog.values());

    if (filter?.category) {
      list = list.filter(p => p.category.toLowerCase() === filter.category!.toLowerCase());
    }

    if (filter?.buyer_type && filter.buyer_type !== 'BOTH') {
      list = list.filter(p => p.target_buyer_type === 'BOTH' || p.target_buyer_type === filter.buyer_type);
    }

    if (filter?.query) {
      const qLower = filter.query.toLowerCase().trim();
      list = list.filter(p => 
        p.title.toLowerCase().includes(qLower) ||
        p.description.toLowerCase().includes(qLower) ||
        p.target_keywords.some(k => k.includes(qLower) || qLower.includes(k))
      );
    }

    return list.map(p => this.toAtlasProduct(p));
  }

  public async getProduct(productId: string): Promise<AtlasProduct | null> {
    const raw = this.catalog.get(productId);
    if (!raw) return null;
    return this.toAtlasProduct(raw);
  }

  public getRawProductDefinition(productId: string): SimulatedProductDefinition | null {
    return this.catalog.get(productId) || null;
  }

  public getAllRawProducts(): SimulatedProductDefinition[] {
    return Array.from(this.catalog.values());
  }

  public async getPrice(productId: string): Promise<{ price: number; currency: string } | null> {
    const p = this.catalog.get(productId);
    if (!p) return null;
    return { price: p.price, currency: p.currency };
  }

  public async getInventory(productId: string): Promise<number> {
    const p = this.catalog.get(productId);
    return p ? p.stock : 0;
  }

  public async getPurchaseUrl(productId: string, buyerContext?: any): Promise<string> {
    const p = this.catalog.get(productId);
    if (!p) return 'SIMULATED://checkout?product=UNKNOWN';
    let url = p.purchase_url;
    if (buyerContext?.buyer_id) {
      url += `&buyer_id=${encodeURIComponent(buyerContext.buyer_id)}`;
    }
    return url;
  }

  public async getOrders(_filter?: any): Promise<CommerceOrderInfo[]> {
    // Orders are retrieved exclusively from simulated purchases table, no external calls
    return [];
  }

  public async getOrder(_orderId: string): Promise<CommerceOrderInfo | null> {
    return null;
  }

  public async subscribeWebhooks(endpoint: string, _events: string[]): Promise<boolean> {
    // FAIL CLOSED on real webhooks
    this.gate.blockRealWebhook(endpoint);
  }

  private toAtlasProduct(p: SimulatedProductDefinition): AtlasProduct {
    return new AtlasProduct({
      atlas_product_id: p.atlas_product_id,
      external_product_id: `SIM_${p.atlas_product_id}`,
      provider: 'SIMULATED_INTERNAL',
      seller_id: p.seller_id,
      title: p.title,
      description: p.description,
      category: p.category,
      brand: p.brand,
      price: p.price,
      currency: p.currency,
      stock: p.stock,
      purchase_url: p.purchase_url,
      geo: ['ARGENTINA'],
      delivery_options: ['SIMULATED_DELIVERY']
    });
  }
}
