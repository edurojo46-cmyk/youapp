/**
 * ATLAS RELATION REGISTRY V1
 * @server/services/industrial/AtlasRelationRegistry.ts
 * 
 * Data-driven registry of business verbs, commercial actions, and entity relations.
 * Prevents relation inversion errors:
 * - supplier vs buyer
 * - manufacturer vs seller
 * - journalist vs media outlet
 * - importer vs exporter
 */

import type { UniversalRole, UniversalAction, UniversalRelation, UniversalEntityType } from './AtlasMissionIR.ts';

export interface RelationDefinition {
  relation_id: UniversalRelation;
  canonical_name: string;
  action: UniversalAction;
  default_role: UniversalRole;
  direction: string;
  source_entity_types: UniversalEntityType[];
  target_entity_types: UniversalEntityType[];
  inverse_relation?: UniversalRelation;
  patterns: RegExp[];
  required_evidence_type: string;
  negative_relations: UniversalRelation[];
  negative_roles: UniversalRole[];
  provenance: string;
  confidence: number;
}

export class AtlasRelationRegistry {
  private static instance: AtlasRelationRegistry;
  private relations: Map<UniversalRelation, RelationDefinition> = new Map();

  private constructor() {
    this.seedRelations();
  }

  public static getInstance(): AtlasRelationRegistry {
    if (!this.instance) {
      this.instance = new AtlasRelationRegistry();
    }
    return this.instance;
  }

  private seedRelations(): void {
    const definitions: RelationDefinition[] = [
      {
        relation_id: 'MANUFACTURES',
        canonical_name: 'Fabricación y Producción Industrial',
        action: 'MANUFACTURE',
        default_role: 'MANUFACTURER',
        direction: 'manufacturer -> product',
        source_entity_types: ['COMPANY', 'ESTABLISHMENT'],
        target_entity_types: ['PRODUCT'],
        inverse_relation: 'USES',
        patterns: [
          /\b(fabricant(es)?|fabricas?|fabrican|que fabriquen|producen|que produzcan|productor(es)?|elaboran|elaboradores?|elaboran|manufacturan|elaboracion\s+de|fabricacion\s+de|produccion\s+de|industria\s+de)\b/i
        ],
        required_evidence_type: 'MANUFACTURING_ACTIVITY',
        negative_relations: ['SELLS', 'BUYS', 'DISTRIBUTES'],
        negative_roles: ['RETAILER', 'SELLER', 'BUYER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.98
      },
      {
        relation_id: 'SELLS',
        canonical_name: 'Comercialización y Venta Minorista',
        action: 'SELL',
        default_role: 'SELLER',
        direction: 'seller -> consumer',
        source_entity_types: ['ESTABLISHMENT', 'COMPANY'],
        target_entity_types: ['PRODUCT', 'SERVICE'],
        inverse_relation: 'BUYS',
        patterns: [
          /\b(vendedor(as?|es)?|venden|que vendan|venda(n)?|venta\s+de|tiendas?\s+de|locales?\s+de|comercializan|comercios?\s+de|negocios?\s+de|mueblerias?|zapaterias?|librerias?|farmacias?|carnicerias?|verdulerias?|panaderias?|jugueterias?)\b/i
        ],
        required_evidence_type: 'RETAIL_ACTIVITY',
        negative_relations: ['MANUFACTURES', 'BUYS'],
        negative_roles: ['MANUFACTURER', 'BUYER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.96
      },
      {
        relation_id: 'BUYS',
        canonical_name: 'Demanda, Compra y Adquisición Corporativa',
        action: 'BUY',
        default_role: 'BUYER',
        direction: 'buyer -> product',
        source_entity_types: ['COMPANY', 'ORGANIZATION'],
        target_entity_types: ['PRODUCT', 'SERVICE'],
        inverse_relation: 'SELLS',
        patterns: [
          /\b(compran|compren|comprador(as?|es)?|que compren|que compran|que puedan comprar|consumidores?|que consuman|demanda\s+de|adquieren|adquieran|empresas\s+que\s+compren|empresas\s+que\s+compran)\b/i
        ],
        required_evidence_type: 'BUYER_RELATION',
        negative_relations: ['SELLS', 'MANUFACTURES', 'SUPPLIES_TO'],
        negative_roles: ['SELLER', 'RETAILER', 'MANUFACTURER', 'SUPPLIER', 'DISTRIBUTOR'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.98
      },
      {
        relation_id: 'SUPPLIES_TO',
        canonical_name: 'Abastecimiento y Provisión B2B a Sector de Destino',
        action: 'SUPPLY',
        default_role: 'SUPPLIER',
        direction: 'supplier -> target_entity',
        source_entity_types: ['COMPANY', 'ESTABLISHMENT'],
        target_entity_types: ['COMPANY', 'ESTABLISHMENT', 'INSTITUTION'],
        inverse_relation: 'PURCHASES_FROM',
        patterns: [
          /\b(proveedor(as?|es)?|proveen\s+(?:a|para)|provea(n)?|provean\s+a|proveedores\s+para|abastecen\s+a|abastecedores?\s+de|suppliers?)\b/i
        ],
        required_evidence_type: 'SUPPLIER_RELATION',
        negative_relations: ['PURCHASES_FROM', 'BUYS'],
        negative_roles: ['BUYER', 'CLIENT'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.97
      },
      {
        relation_id: 'PURCHASES_FROM',
        canonical_name: 'Adquisición y Aprovisionamiento desde Proveedor',
        action: 'BUY',
        default_role: 'CLIENT',
        direction: 'client -> supplier',
        source_entity_types: ['COMPANY', 'ESTABLISHMENT'],
        target_entity_types: ['COMPANY'],
        inverse_relation: 'SUPPLIES_TO',
        patterns: [
          /\b(compran\s+a|se\s+abastecen\s+de|adquieren\s+de)\b/i
        ],
        required_evidence_type: 'PURCHASE_FROM_RELATION',
        negative_relations: ['SUPPLIES_TO'],
        negative_roles: ['SUPPLIER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.95
      },
      {
        relation_id: 'DISTRIBUTES',
        canonical_name: 'Distribución Mayorista y Logística de Canal',
        action: 'DISTRIBUTE',
        default_role: 'DISTRIBUTOR',
        direction: 'distributor -> product',
        source_entity_types: ['COMPANY', 'ESTABLISHMENT'],
        target_entity_types: ['PRODUCT'],
        inverse_relation: 'BUYS',
        patterns: [
          /\b(distribuidor(as?|es)?|distribuyen|que distribuyan|distribucion|distribuidora(s)?|mayoristas?(?:\s+(?:de|que vendan))?|venta\s+al\s+por\s+mayor)\b/i
        ],
        required_evidence_type: 'DISTRIBUTION_ACTIVITY',
        negative_relations: ['MANUFACTURES', 'BUYS'],
        negative_roles: ['BUYER', 'USER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.96
      },
      {
        relation_id: 'EXPORTS',
        canonical_name: 'Comercio Exterior - Exportación',
        action: 'EXPORT',
        default_role: 'EXPORTER',
        direction: 'exporter -> product',
        source_entity_types: ['COMPANY'],
        target_entity_types: ['PRODUCT'],
        inverse_relation: 'IMPORTS',
        patterns: [
          /\b(exportan|que exporten|exportador(as?|es)?|exportacion\s+de|que exportan)\b/i
        ],
        required_evidence_type: 'EXPORT_ACTIVITY',
        negative_relations: ['IMPORTS'],
        negative_roles: ['IMPORTER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.98
      },
      {
        relation_id: 'IMPORTS',
        canonical_name: 'Comercio Exterior - Importación',
        action: 'IMPORT',
        default_role: 'IMPORTER',
        direction: 'importer -> product',
        source_entity_types: ['COMPANY'],
        target_entity_types: ['PRODUCT'],
        inverse_relation: 'EXPORTS',
        patterns: [
          /\b(importan|que importen|importador(as?|es)?|importacion\s+de|que importan)\b/i
        ],
        required_evidence_type: 'IMPORT_ACTIVITY',
        negative_relations: ['EXPORTS'],
        negative_roles: ['EXPORTER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.98
      },
      {
        relation_id: 'USES',
        canonical_name: 'Uso, Consumo o Adopción de Bienes de Capital',
        action: 'USE',
        default_role: 'USER',
        direction: 'user -> tool',
        source_entity_types: ['COMPANY', 'PERSON'],
        target_entity_types: ['PRODUCT'],
        inverse_relation: 'MANUFACTURES',
        patterns: [
          /\b(usan|que usen|utilizan|que utilicen|usuari[oa]s?(?:\s+de)?)\b/i
        ],
        required_evidence_type: 'USAGE_EVIDENCE',
        negative_relations: ['SELLS', 'MANUFACTURES'],
        negative_roles: ['SELLER', 'MANUFACTURER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.94
      },
      {
        relation_id: 'WRITES_ABOUT',
        canonical_name: 'Cobertura Periodística y Redacción de Contenidos',
        action: 'WRITE_ABOUT',
        default_role: 'JOURNALIST',
        direction: 'journalist -> topic',
        source_entity_types: ['PERSON'],
        target_entity_types: ['TOPIC' as any, 'MEDIA_OUTLET'],
        patterns: [
          /\b(periodistas?|prensa|cronistas?|redactores?|que cubran|cubren|escriben\s+sobre|que escriban\s+sobre)\b/i
        ],
        required_evidence_type: 'JOURNALIST_ROLE',
        negative_relations: ['PROVIDES_SERVICE'],
        negative_roles: ['MEDIA_OUTLET' as any],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.98
      },
      {
        relation_id: 'PROVIDES_SERVICE',
        canonical_name: 'Prestación de Servicios Profesionales o Especializados',
        action: 'PROVIDE_SERVICE',
        default_role: 'SERVICE_PROVIDER',
        direction: 'provider -> service',
        source_entity_types: ['COMPANY', 'ESTABLISHMENT', 'PERSON'],
        target_entity_types: ['SERVICE'],
        patterns: [
          /\b(servicios?\s+de|prestan\s+servicios?|consultor(as?|es|ias?)?|estudios?\s+(?:contables?|juridicos?|de arquitectura)|agencias?\s+de|empresas?\s+de\s+limpieza|seguridad\s+privada)\b/i
        ],
        required_evidence_type: 'SERVICE_ACTIVITY',
        negative_relations: ['MANUFACTURES'],
        negative_roles: ['MANUFACTURER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.92
      },
      {
        relation_id: 'ESTABLISHMENT_SERVICE',
        canonical_name: 'Servicio de Atención en Establecimiento de Cara al Público',
        action: 'PROVIDE_SERVICE',
        default_role: 'SERVICE_PROVIDER',
        direction: 'establishment -> consumer',
        source_entity_types: ['ESTABLISHMENT'],
        target_entity_types: ['SERVICE', 'PRODUCT'],
        patterns: [
          /\b(hoteles?|restaurantes?|bares?|clinicas?|hospitales?|sanatorios?|consultorios?|gomerias?|talleres?|veterinarias?|peluquerias?|gimnasios?)\b/i
        ],
        required_evidence_type: 'ESTABLISHMENT_ACTIVITY',
        negative_relations: ['SUPPLIES_TO'],
        negative_roles: ['SUPPLIER'],
        provenance: 'ATLAS_SEMANTIC_ONTOLOGY',
        confidence: 0.95
      },
      {
        relation_id: 'PROFESSIONAL_PRACTICES_AS_LAWYER',
        canonical_name: 'Ejercicio Profesional del Derecho / Abogacía',
        action: 'PROVIDE_SERVICE',
        default_role: 'PROFESSIONAL',
        direction: 'professional -> legal_practice',
        source_entity_types: ['PERSON'],
        target_entity_types: ['SERVICE'],
        patterns: [
          /\b(abogad[oa]s?|letrad[oa]s?)\b/i
        ],
        required_evidence_type: 'PROFESSIONAL_LICENSE',
        negative_relations: ['MANUFACTURES', 'SELLS'],
        negative_roles: ['MANUFACTURER', 'SELLER'],
        provenance: 'ATLAS_PROFESSIONAL_REGISTRY',
        confidence: 0.98
      },
      {
        relation_id: 'PROFESSIONAL_PRACTICES_AS_ACCOUNTANT',
        canonical_name: 'Ejercicio Profesional de Ciencias Económicas / Contaduría',
        action: 'PROVIDE_SERVICE',
        default_role: 'PROFESSIONAL',
        direction: 'professional -> accounting_practice',
        source_entity_types: ['PERSON'],
        target_entity_types: ['SERVICE'],
        patterns: [
          /\b(contador(as?|es)?\s+p[uú]blic[oa]s?|contadores?|contadoras?)\b/i
        ],
        required_evidence_type: 'PROFESSIONAL_LICENSE',
        negative_relations: ['MANUFACTURES', 'SELLS'],
        negative_roles: ['MANUFACTURER', 'SELLER'],
        provenance: 'ATLAS_PROFESSIONAL_REGISTRY',
        confidence: 0.98
      },
      {
        relation_id: 'PROFESSIONAL_PRACTICES_AS_ARCHITECT',
        canonical_name: 'Ejercicio Profesional de Arquitectura y Urbanismo',
        action: 'PROVIDE_SERVICE',
        default_role: 'PROFESSIONAL',
        direction: 'professional -> architecture_practice',
        source_entity_types: ['PERSON'],
        target_entity_types: ['SERVICE'],
        patterns: [
          /\b(arquitect[oa]s?)\b/i
        ],
        required_evidence_type: 'PROFESSIONAL_LICENSE',
        negative_relations: ['MANUFACTURES', 'SELLS'],
        negative_roles: ['MANUFACTURER', 'SELLER'],
        provenance: 'ATLAS_PROFESSIONAL_REGISTRY',
        confidence: 0.98
      },
      {
        relation_id: 'PRACTICES_PROFESSION',
        canonical_name: 'Ejercicio Profesional Habilitado / Matrícula Oficial',
        action: 'PROVIDE_SERVICE',
        default_role: 'PROFESSIONAL',
        direction: 'professional -> practice',
        source_entity_types: ['PERSON'],
        target_entity_types: ['SERVICE'],
        patterns: [
          /\b(profesional(es)?\s+matriculad[oa]s?|matriculad[oa]s?)\b/i
        ],
        required_evidence_type: 'PROFESSIONAL_LICENSE',
        negative_relations: ['MANUFACTURES', 'SELLS'],
        negative_roles: ['MANUFACTURER', 'SELLER'],
        provenance: 'ATLAS_PROFESSIONAL_REGISTRY',
        confidence: 0.95
      }
    ];

    for (const d of definitions) {
      this.relations.set(d.relation_id, d);
    }
  }

  public getRelation(relationId: UniversalRelation): RelationDefinition | undefined {
    return this.relations.get(relationId);
  }

  public getAllRelations(): RelationDefinition[] {
    return Array.from(this.relations.values());
  }

  /**
   * Matches relation from input natural text
   */
  public matchRelation(text: string): { relation: RelationDefinition; score: number } | null {
    const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Priority checks for contrastive pairs (verbs matter!)
    // 1. Explicit buyer demand: "compran", "que compren", "demanda de"
    if (/\b(compran|compren|comprador(as?|es)?|que compren|que compran|demanda\s+de|adquieren)\b/i.test(lower)) {
      const def = this.relations.get('BUYS')!;
      return { relation: def, score: 0.98 };
    }

    // 2. Explicit supply to sector: "proveedores para hoteles", "proveen a"
    if (/\b(proveedor(as?|es)?|proveen\s+(?:a|para)|provea(n)?|proveedores\s+para|abastecedores?)\b/i.test(lower)) {
      const def = this.relations.get('SUPPLIES_TO')!;
      return { relation: def, score: 0.98 };
    }

    // 3. Explicit foreign trade: exportan / importan
    if (/\b(exportan|que exporten|exportador(as?|es)?|exportacion\s+de)\b/i.test(lower)) {
      return { relation: this.relations.get('EXPORTS')!, score: 0.98 };
    }
    if (/\b(importan|que importen|importador(as?|es)?|importacion\s+de)\b/i.test(lower)) {
      return { relation: this.relations.get('IMPORTS')!, score: 0.98 };
    }

    // 4. Explicit usage: empresas que usan maquinaria
    if (/\b(usan|que usen|utilizan|que utilicen|usuario(s)?\s+de)\b/i.test(lower)) {
      return { relation: this.relations.get('USES')!, score: 0.96 };
    }

    // 5. Explicit journalism: periodistas de economia
    if (/\b(periodistas?|prensa|cronistas?|redactores?|que cubran|escriben\s+sobre|que escriban\s+sobre)\b/i.test(lower)) {
      return { relation: this.relations.get('WRITES_ABOUT')!, score: 0.98 };
    }

    // 6. Explicit manufacturing: fabricantes de...
    if (/\b(fabricant(es)?|fabricas?|fabrican|que fabriquen|producen|que produzcan|productor(es)?|elaboradores?|manufacturan)\b/i.test(lower)) {
      return { relation: this.relations.get('MANUFACTURES')!, score: 0.97 };
    }

    // 7. Explicit wholesale / distribution:
    if (/\b(distribuidor(as?|es)?|distribuyen|que distribuyan|distribuidora(s)?|mayoristas?)\b/i.test(lower)) {
      return { relation: this.relations.get('DISTRIBUTES')!, score: 0.96 };
    }

    // 8. General retail selling:
    if (/\b(venden|que vendan|vendedor(as?|es)?|venta\s+de|tiendas?\s+de|locales?\s+de)\b/i.test(lower)) {
      return { relation: this.relations.get('SELLS')!, score: 0.94 };
    }

    // Iterate other patterns
    for (const def of this.relations.values()) {
      for (const pat of def.patterns) {
        if (pat.test(lower)) {
          return { relation: def, score: def.confidence };
        }
      }
    }

    return null;
  }
}
