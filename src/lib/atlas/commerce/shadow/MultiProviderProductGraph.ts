/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: MultiProviderProductGraph.ts
 * Path: src/lib/atlas/commerce/shadow/MultiProviderProductGraph.ts
 * 
 * Non-destructive multi-provider product graph.
 * Ingests and stores offers from Mercado Libre, Tiendanube, and WooCommerce
 * linked to canonical Product Identities without destructive flattening.
 * 
 * Strictly isolated: environment = 'SIMULATION' on all records.
 */

import { dbPool } from '../../../../../server/db.ts';
import { AtlasCommerceGate } from '../AtlasCommerceGate.ts';
import { AtlasProductIdentity, AtlasOffer, NormalizedProductCatalogItem } from './AtlasProductOffer.ts';
import { ProductCompatibilityCompiler } from '../ProductCompatibilityCompiler.ts';
import { MercadoLibreShadowConnector } from './MercadoLibreShadowConnector.ts';
import { TiendanubeShadowConnector } from './TiendanubeShadowConnector.ts';
import { WooCommerceShadowConnector } from './WooCommerceShadowConnector.ts';
import { AtlasOfferRanker, BuyerOfferContext, RankedOfferItem } from './AtlasOfferRanker.ts';

export class MultiProviderProductGraph {
  private static instance: MultiProviderProductGraph;
  private gate: AtlasCommerceGate;
  private isSchemaInitialized: boolean = false;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
  }

  public static getInstance(): MultiProviderProductGraph {
    if (!MultiProviderProductGraph.instance) {
      MultiProviderProductGraph.instance = new MultiProviderProductGraph();
    }
    return MultiProviderProductGraph.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isSchemaInitialized) return;
    this.gate.assertFailClosedIntegrity();

    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_shadow_product_identities (
          product_identity_id TEXT PRIMARY KEY,
          canonical_title TEXT NOT NULL,
          canonical_brand TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          target_buyer_type TEXT NOT NULL DEFAULT 'BOTH',
          target_keywords JSONB NOT NULL DEFAULT '[]',
          target_industries JSONB NOT NULL DEFAULT '[]',
          target_activities JSONB NOT NULL DEFAULT '[]',
          environment TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (environment = 'SIMULATION'),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.atlas_shadow_offers (
          offer_id TEXT PRIMARY KEY,
          product_identity_id TEXT NOT NULL REFERENCES public.atlas_shadow_product_identities(product_identity_id) ON DELETE CASCADE,
          provider TEXT NOT NULL CHECK (provider IN ('MERCADO_LIBRE', 'TIENDANUBE', 'WOOCOMMERCE', 'INTERNAL_SIMULATED')),
          external_product_id TEXT NOT NULL,
          seller_id TEXT NOT NULL,
          seller_name TEXT NOT NULL,
          seller_reputation NUMERIC NOT NULL DEFAULT 5.0,
          title TEXT NOT NULL,
          price NUMERIC NOT NULL,
          currency TEXT NOT NULL DEFAULT 'ARS',
          stock INTEGER NOT NULL DEFAULT 0,
          delivery JSONB NOT NULL DEFAULT '{}',
          purchase_url TEXT NOT NULL,
          environment TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (environment = 'SIMULATION'),
          last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_shadow_offers_prod_id ON public.atlas_shadow_offers(product_identity_id);
        CREATE INDEX IF NOT EXISTS idx_shadow_offers_provider ON public.atlas_shadow_offers(provider);
      `);
      this.isSchemaInitialized = true;
    } catch (err) {
      console.warn('[MultiProviderProductGraph] initSchema warning:', err);
    }
  }

  /**
   * Builds canonical product identity definitions for the catalog.
   */
  private getProductIdentitiesDefinitions(): AtlasProductIdentity[] {
    return [
      {
        product_identity_id: 'PROD_ID_BOSCH_DRILL',
        canonical_title: 'Taladro Percutor Bosch Professional GSB 13 RE 650W',
        canonical_brand: 'Bosch',
        category: 'HARDWARE_TOOLS',
        description: 'Herramienta eléctrica industrial de alto impacto y precisión para talleres, mantenimiento y obra.',
        target_buyer_type: 'BOTH',
        target_keywords: ['taladro', 'bosch', 'herramientas', 'ferreteria', 'construccion', 'obra'],
        target_industries: ['Ferretería y Afines', 'Construcción', 'Mantenimiento'],
        target_activities: ['Ferretería', 'Construcción y Reformas', 'Obras Particulares'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_FOOD',
        canonical_title: 'Alimento Balanceado Premium Perros Adultos 15kg NutriCan Pro',
        canonical_brand: 'NutriCan Pro',
        category: 'PET_CARE_FOOD',
        description: 'Nutrición balanceada de alta gama con proteínas seleccionadas para caninos adultos.',
        target_buyer_type: 'BOTH',
        target_keywords: ['alimento perros', 'nutrican', 'mascota', 'veterinaria', 'pet shop'],
        target_industries: ['VETERINARIA', 'PET_CARE', 'ANIMAL_HEALTH'],
        target_activities: ['Veterinaria', 'Pet Shop y Mascotas Caninas', 'Alimentos Balanceados'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PAPER_A4',
        canonical_title: 'Caja Resmas de Papel A4 75g (5 Resmas x 500 Hojas) Ledesma Autor',
        canonical_brand: 'Ledesma Autor',
        category: 'OFFICE_SUPPLIES',
        description: 'Papel comercial de máxima blancura para empresas, estudios contables y notariales.',
        target_buyer_type: 'BOTH',
        target_keywords: ['resmas', 'papel a4', 'ledesma', 'libreria', 'oficina'],
        target_industries: ['Estudios Contables', 'Escribanías', 'Servicios Profesionales'],
        target_activities: ['Auditoría Contable y Liquidación de Impuestos', 'Administración'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_OFFICE_SET',
        canonical_title: 'Puesto de Trabajo Ergonómico Corporativo (Escritorio + Silla Pro)',
        canonical_brand: 'ErgoWork',
        category: 'OFFICE_SUPPLIES',
        description: 'Estación de trabajo ergonómica completa regulable con soporte lumbar certificado.',
        target_buyer_type: 'BOTH',
        target_keywords: ['escritorio', 'silla ergonomica', 'mobiliario', 'oficina'],
        target_industries: ['Consultoría y Auditoría', 'Desarrollo de Software', 'Servicios Profesionales'],
        target_activities: ['Consultoría Profesional Independiente', 'Soluciones de TI'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_AGRO_BIO',
        canonical_title: 'Fertilizante Foliar Bio-Orgánico 20L BioPampa',
        canonical_brand: 'BioPampa',
        category: 'AGRO_CHEMICALS',
        description: 'Biofertilizante foliar de rápida asimilación para nutrición vegetal intensiva.',
        target_buyer_type: 'COMPANY',
        target_keywords: ['fertilizante', 'biopampa', 'agro', 'cultivos', 'campo'],
        target_industries: ['Agro y Ganadería', 'Industria Química'],
        target_activities: ['Protección de Cultivos y Semillas', 'Agronegocios'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_WELDER_200A',
        canonical_title: 'Soldadora Inverter 200A Gamma Elite ARC Turbo',
        canonical_brand: 'Gamma',
        category: 'HARDWARE_TOOLS',
        description: 'Equipo de soldadura inverter monofásica de 200 Amperes para herrería y montaje.',
        target_buyer_type: 'BOTH',
        target_keywords: ['soldadora', 'inverter', 'gamma', 'herrería'],
        target_industries: ['Metalmecánica', 'Construcción'],
        target_activities: ['Construcción y Reformas', 'Mecánica'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_GENERATOR_3500W',
        canonical_title: 'Generador Eléctrico Naftero 3500W Lusqtoff Monofásico',
        canonical_brand: 'Lusqtoff',
        category: 'HARDWARE_TOOLS',
        description: 'Grupo electrógeno con arranque manual y motor 4 tiempos de 7 HP.',
        target_buyer_type: 'BOTH',
        target_keywords: ['generador', 'lusqtoff', 'energia', 'grupo electrogeno'],
        target_industries: ['Construcción', 'Comercio'],
        target_activities: ['Construcción y Reformas', 'Obras Particulares'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_SOCKET_SET_108',
        canonical_title: 'Juego Bocallaves Tubos Crique 108 Piezas Cromo Vanadio',
        canonical_brand: 'ProTool',
        category: 'HARDWARE_TOOLS',
        description: 'Maletín completo de tubos hexagonales y llaves crique con encastre 1/2 y 1/4.',
        target_buyer_type: 'BOTH',
        target_keywords: ['tubos', 'bocallaves', 'crique', 'herramientas'],
        target_industries: ['Mantenimiento y Reparación', 'Ferretería'],
        target_activities: ['Ferretería', 'Mecánica'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_WATER_PUMP_1HP',
        canonical_title: 'Bomba Centrífuga Elevadora de Agua 1HP Motorarg BC 100',
        canonical_brand: 'Motorarg',
        category: 'HARDWARE_TOOLS',
        description: 'Electrobomba centrífuga para elevación de agua limpia en edificios y viviendas.',
        target_buyer_type: 'BOTH',
        target_keywords: ['bomba', 'centrifuga', 'motorarg', 'sanitarios', 'agua'],
        target_industries: ['Ferretería y Afines', 'Sanitarios'],
        target_activities: ['Ferretería, Construcción y Reformas'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_LADDER_38M',
        canonical_title: 'Escalera Telescópica de Aluminio Plegable 3.8 Metros',
        canonical_brand: 'AluPro',
        category: 'HARDWARE_TOOLS',
        description: 'Escalera articulada extensible de aluminio reforzado con traba de seguridad.',
        target_buyer_type: 'BOTH',
        target_keywords: ['escalera', 'telescopica', 'aluminio', 'pintura', 'obra'],
        target_industries: ['Construcción', 'Ferretería'],
        target_activities: ['Construcción y Reformas Obras Particulares'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_SHAMPOO',
        canonical_title: 'Shampoo Medicado Antiséptico Canino 500ml Clorhexidina',
        canonical_brand: 'VetDerma',
        category: 'PET_CARE_FOOD',
        description: 'Fórmula dermatológica veterinaria para tratamiento de piodermias caninas.',
        target_buyer_type: 'BOTH',
        target_keywords: ['shampoo perro', 'clorhexidina', 'veterinaria', 'dermatologia'],
        target_industries: ['VETERINARIA', 'PET_CARE'],
        target_activities: ['Veterinaria y Alimentos Balanceados'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_PIPETA',
        canonical_title: 'Pipeta Antiparasitaria Externa Perros Grandes 20-40kg',
        canonical_brand: 'FiproMax',
        category: 'PET_CARE_FOOD',
        description: 'Antiparasitario externo contra pulgas y garrapatas con fipronil.',
        target_buyer_type: 'BOTH',
        target_keywords: ['pipeta', 'pulgas', 'garrapatas', 'perros'],
        target_industries: ['VETERINARIA', 'PET_CARE'],
        target_activities: ['Veterinaria', 'Pet Shop y Mascotas Caninas'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_BED_XL',
        canonical_title: 'Cama Ortopédica Antidesgarro Mascotas XL Memory Foam',
        canonical_brand: 'ComfortPet',
        category: 'PET_CARE_FOOD',
        description: 'Colchón viscoelástico impermeable de alto confort para perros grandes.',
        target_buyer_type: 'BOTH',
        target_keywords: ['cama perro', 'ortopedica', 'memory foam', 'pet shop'],
        target_industries: ['PET_CARE', 'VETERINARIA'],
        target_activities: ['Pet Shop y Mascotas Caninas'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_DENTAL_STICKS',
        canonical_title: 'Snack Dental Sticks Caninos Cuidado Bucal Pack x30',
        canonical_brand: 'DentixCan',
        category: 'PET_CARE_FOOD',
        description: 'Golosinas funcionales para higiene dental y control del sarro.',
        target_buyer_type: 'BOTH',
        target_keywords: ['dental sticks', 'snack perro', 'dientes perro'],
        target_industries: ['PET_CARE', 'VETERINARIA'],
        target_activities: ['Pet Shop y Mascotas Caninas'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_PET_CARRIER_IATA',
        canonical_title: 'Transportadora Canina Homologada IATA N°4 con Ruedas',
        canonical_brand: 'TravelPet Pro',
        category: 'PET_CARE_FOOD',
        description: 'Jaula transportadora con cerraduras perimetrales y homologación para vuelos.',
        target_buyer_type: 'BOTH',
        target_keywords: ['transportadora', 'jaula viaje perro', 'iata'],
        target_industries: ['PET_CARE', 'VETERINARIA'],
        target_activities: ['Pet Shop y Mascotas Caninas'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_ESPRESSO_COMM',
        canonical_title: 'Cafetera Espresso Comercial 2 Grupos Austral Barista Pro',
        canonical_brand: 'Austral Barista',
        category: 'GASTRONOMY_EQUIPMENT',
        description: 'Máquina espresso profesional para gastronomía con caldera de cobre de 11L.',
        target_buyer_type: 'BOTH',
        target_keywords: ['cafetera espresso', 'barista', 'cafeteria', 'gastronomia'],
        target_industries: ['Gastronomía y Bebidas'],
        target_activities: ['Cafetería y Bar', 'Restaurante'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_COFFEE_GRINDER',
        canonical_title: 'Molinillo de Café Profesional On Demand Barista Pro 64mm',
        canonical_brand: 'Austral Barista',
        category: 'GASTRONOMY_EQUIPMENT',
        description: 'Molino electrónico con tolva de 1.5kg y dosificación programable.',
        target_buyer_type: 'BOTH',
        target_keywords: ['molinillo cafe', 'on demand', 'barista', 'cafeteria'],
        target_industries: ['Gastronomía y Bebidas'],
        target_activities: ['Cafetería y Bar'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_HR_SUITE',
        canonical_title: 'Atlas HR Suite — Licencia Corporativa Anual (Gestión Integral RRHH y Nóminas)',
        canonical_brand: 'Atlas Software',
        category: 'ENTERPRISE_SOFTWARE',
        description: 'Plataforma empresarial cloud para administración integral de Recursos Humanos, liquidación masiva de sueldos, talento y legajos digitales corporativos.',
        target_buyer_type: 'COMPANY',
        target_keywords: ['software', 'rrhh', 'recursos humanos', 'nominas', 'sueldos', 'talento', 'ti', 'cloud', 'suite', 'desarrollo'],
        target_industries: ['Tecnología y Software', 'Consultoría y Auditoría', 'Servicios Profesionales', 'B2B Corporate'],
        target_activities: ['Soluciones de TI y Desarrollo Global', 'Consultoría y Servicios TI', 'Desarrollo de Software'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_INSURANCE_PROF',
        canonical_title: 'Seguro de Responsabilidad Civil Profesional (Mala Praxis Médica / Legal / Obras Ingeniería)',
        canonical_brand: 'Mercantil Seguros',
        category: 'PROFESSIONAL_INSURANCE',
        description: 'Póliza de resguardo patrimonial e indemnización ante reclamos por mala praxis y responsabilidad civil profesional para médicos cirujanos, abogados e ingenieros.',
        target_buyer_type: 'PERSON',
        target_keywords: ['seguro', 'responsabilidad civil', 'mala praxis', 'medico', 'cirujano', 'ingeniero', 'abogado', 'poliza', 'salud', 'profesional'],
        target_industries: ['Salud y Medicina', 'Ingeniería y Arquitectura', 'Servicios Profesionales'],
        target_activities: ['Ejercicio Profesional Médico Cirujano', 'Consultoría Profesional Independiente', 'Ingeniería y Arquitectura'],
        environment: 'SIMULATION'
      },
      {
        product_identity_id: 'PROD_ID_COFFEE_CUPS',
        canonical_title: 'Vajilla Café Especialidad x24 Pocillos Cerámica Doble Pared',
        canonical_brand: 'Austral Barista',
        category: 'GASTRONOMY_EQUIPMENT',
        description: 'Pocillos profesionales de cerámica densa con platillo para retención térmica.',
        target_buyer_type: 'BOTH',
        target_keywords: ['pocillos cafe', 'vajilla barista', 'tazas cafe'],
        target_industries: ['Gastronomía y Bebidas'],
        target_activities: ['Cafetería y Bar'],
        environment: 'SIMULATION'
      }
    ];
  }

  /**
   * Synchronizes all 3 shadow connectors and persists 30 offers across product identities.
   */
  public async syncAllProviders(): Promise<{
    identities_count: number;
    offers_count: number;
    ml_offers: number;
    tn_offers: number;
    wc_offers: number;
  }> {
    await this.initSchema();

    // 1. Sync Product Identities
    const identities = this.getProductIdentitiesDefinitions();
    for (const idDef of identities) {
      await dbPool.query(`
        INSERT INTO public.atlas_shadow_product_identities (
          product_identity_id, canonical_title, canonical_brand, category,
          description, target_buyer_type, target_keywords, target_industries,
          target_activities, environment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SIMULATION')
        ON CONFLICT (product_identity_id) DO UPDATE SET
          canonical_title = EXCLUDED.canonical_title,
          canonical_brand = EXCLUDED.canonical_brand,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          target_buyer_type = EXCLUDED.target_buyer_type,
          target_keywords = EXCLUDED.target_keywords,
          target_industries = EXCLUDED.target_industries,
          target_activities = EXCLUDED.target_activities,
          environment = 'SIMULATION';
      `, [
        idDef.product_identity_id,
        idDef.canonical_title,
        idDef.canonical_brand,
        idDef.category,
        idDef.description,
        idDef.target_buyer_type,
        JSON.stringify(idDef.target_keywords),
        JSON.stringify(idDef.target_industries),
        JSON.stringify(idDef.target_activities)
      ]);
    }

    // 2. Fetch offers from each connector
    const mlConnector = MercadoLibreShadowConnector.getInstance();
    const tnConnector = TiendanubeShadowConnector.getInstance();
    const wcConnector = WooCommerceShadowConnector.getInstance();

    const mlOffers = mlConnector.getOffers();
    const tnOffers = tnConnector.getOffers();
    const wcOffers = wcConnector.getOffers();

    const allOffers = [...mlOffers, ...tnOffers, ...wcOffers];

    // 3. Persist all 30 offers
    for (const offer of allOffers) {
      if (offer.environment !== 'SIMULATION') {
        throw new Error(`Contamination: Offer ${offer.offer_id} is not marked SIMULATION.`);
      }

      await dbPool.query(`
        INSERT INTO public.atlas_shadow_offers (
          offer_id, product_identity_id, provider, external_product_id,
          seller_id, seller_name, seller_reputation, title, price, currency,
          stock, delivery, purchase_url, environment, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SIMULATION', NOW())
        ON CONFLICT (offer_id) DO UPDATE SET
          product_identity_id = EXCLUDED.product_identity_id,
          provider = EXCLUDED.provider,
          external_product_id = EXCLUDED.external_product_id,
          seller_id = EXCLUDED.seller_id,
          seller_name = EXCLUDED.seller_name,
          seller_reputation = EXCLUDED.seller_reputation,
          title = EXCLUDED.title,
          price = EXCLUDED.price,
          currency = EXCLUDED.currency,
          stock = EXCLUDED.stock,
          delivery = EXCLUDED.delivery,
          purchase_url = EXCLUDED.purchase_url,
          environment = 'SIMULATION',
          last_synced_at = NOW();
      `, [
        offer.offer_id,
        offer.product_identity_id,
        offer.provider,
        offer.external_product_id,
        offer.seller_id,
        offer.seller_name,
        offer.seller_reputation,
        offer.title,
        offer.price,
        offer.currency,
        offer.stock,
        JSON.stringify(offer.delivery),
        offer.purchase_url
      ]);
    }

    return {
      identities_count: identities.length,
      offers_count: allOffers.length,
      ml_offers: mlOffers.length,
      tn_offers: tnOffers.length,
      wc_offers: wcOffers.length
    };
  }

  public getAllOffers(): AtlasOffer[] {
    const ml = MercadoLibreShadowConnector.getInstance().getOffers();
    const tn = TiendanubeShadowConnector.getInstance().getOffers();
    const wc = WooCommerceShadowConnector.getInstance().getOffers();
    return [...ml, ...tn, ...wc];
  }

  public getProductIdentities(): AtlasProductIdentity[] {
    return this.getProductIdentitiesDefinitions().map(item => ({
      ...item,
      compatibility_spec: item.compatibility_spec || ProductCompatibilityCompiler.compile({
        title: item.canonical_title,
        description: item.description,
        category: item.category,
        target_buyer_type: item.target_buyer_type,
        target_keywords: item.target_keywords,
        target_industries: item.target_industries,
        target_activities: item.target_activities
      })
    }));
  }

  public getOffersForProductIdentity(productIdentityId: string): AtlasOffer[] {
    return this.getAllOffers().filter(o => o.product_identity_id === productIdentityId);
  }

  /**
   * Finds the best offer for a specific buyer context and product identity.
   */
  public findBestOfferForBuyer(
    productIdentityId: string,
    buyerContext: BuyerOfferContext
  ): RankedOfferItem | null {
    const availableOffers = this.getOffersForProductIdentity(productIdentityId);
    if (availableOffers.length === 0) return null;
    const ranked = AtlasOfferRanker.rankOffers(availableOffers, buyerContext);
    return ranked[0] || null;
  }
}
