export interface ConceptMapping {
  concept: string;
  predicates: string[];
  entity_types?: string[];
  description: string;
}

export class SemanticConceptMap {
  private static readonly mappings: ConceptMapping[] = [
    {
      concept: 'ROLE_EMPLOYMENT',
      predicates: ['HAS_ROLE', 'WORKS_AT'],
      entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION'],
      description: 'Job titles, roles, positions, and company employment'
    },
    {
      concept: 'COMPANY_WORK',
      predicates: ['WORKS_AT'],
      entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION'],
      description: 'Where a person works or employer relationships'
    },
    {
      concept: 'ROLE_TITLE',
      predicates: ['HAS_ROLE'],
      entity_types: ['PERSON'],
      description: 'Person role, profession, or job title'
    },
    {
      concept: 'LOCATION_GEO',
      predicates: ['LOCATED_IN', 'HEADQUARTERED_IN'],
      entity_types: ['PERSON', 'COMPANY', 'ORGANIZATION', 'LOCATION'],
      description: 'Geographic location, city, country, or headquarters'
    },
    {
      concept: 'OFFERINGS',
      predicates: ['OFFERS', 'BELONGS_TO'],
      entity_types: ['COMPANY', 'ORGANIZATION', 'PRODUCT', 'SERVICE'],
      description: 'Products or services offered by an organization'
    },
    {
      concept: 'FOUNDERSHIP',
      predicates: ['FOUNDED_BY'],
      entity_types: ['COMPANY', 'ORGANIZATION', 'PERSON'],
      description: 'Founders and creators of companies or organizations'
    },
    {
      concept: 'INDUSTRY_SECTOR',
      predicates: ['INDUSTRY'],
      entity_types: ['COMPANY', 'ORGANIZATION'],
      description: 'Industry domain or economic sector'
    },
    {
      concept: 'TECHNOLOGY',
      predicates: ['TECH_STACK'],
      entity_types: ['COMPANY', 'PRODUCT', 'SERVICE'],
      description: 'Technology stack, software, or tools used'
    },
    {
      concept: 'HIRING',
      predicates: ['HIRING_FOR_ROLE', 'OPEN_POSITIONS_COUNT'],
      entity_types: ['COMPANY', 'ORGANIZATION'],
      description: 'Job openings and recruitment activity'
    }
  ];

  private static readonly keywordToPredicates: Record<string, string[]> = {
    // Roles
    'role': ['HAS_ROLE'],
    'cargo': ['HAS_ROLE'],
    'puesto': ['HAS_ROLE'],
    'job title': ['HAS_ROLE'],
    'titulo': ['HAS_ROLE'],
    'título': ['HAS_ROLE'],
    'profession': ['HAS_ROLE'],
    'profesion': ['HAS_ROLE'],
    'profesión': ['HAS_ROLE'],
    'trabaja de': ['HAS_ROLE'],

    // Employment
    'works at': ['WORKS_AT'],
    'work at': ['WORKS_AT'],
    'work': ['WORKS_AT'],
    'works': ['WORKS_AT'],
    'trabaja en': ['WORKS_AT'],
    'trabaja': ['WORKS_AT'],
    'trabajan': ['WORKS_AT'],
    'empleado': ['WORKS_AT'],
    'empleador': ['WORKS_AT'],
    'employer': ['WORKS_AT'],
    'company': ['WORKS_AT'],
    'empresa': ['WORKS_AT'],

    // Location
    'located in': ['LOCATED_IN'],
    'located': ['LOCATED_IN'],
    'location': ['LOCATED_IN'],
    'ubicacion': ['LOCATED_IN'],
    'ubicación': ['LOCATED_IN'],
    'ubicado': ['LOCATED_IN'],
    'donde vive': ['LOCATED_IN'],
    'where lives': ['LOCATED_IN'],
    'ciudad': ['LOCATED_IN'],
    'city': ['LOCATED_IN'],
    'pais': ['LOCATED_IN'],
    'país': ['LOCATED_IN'],
    'country': ['LOCATED_IN'],
    'headquarters': ['HEADQUARTERED_IN'],
    'sede': ['HEADQUARTERED_IN'],

    // Offerings
    'offers': ['OFFERS'],
    'ofrece': ['OFFERS'],
    'productos': ['OFFERS'],
    'products': ['OFFERS'],
    'servicios': ['OFFERS'],
    'services': ['OFFERS'],

    // Industry / Tech
    'industry': ['INDUSTRY'],
    'industria': ['INDUSTRY'],
    'sector': ['INDUSTRY'],
    'tech': ['TECH_STACK'],
    'technology': ['TECH_STACK'],
    'tecnologia': ['TECH_STACK'],
    'tecnología': ['TECH_STACK'],
    'stack': ['TECH_STACK'],
    'software': ['TECH_STACK'],
    'herramientas': ['TECH_STACK'],
    'lenguajes': ['TECH_STACK'],

    // Founders
    'founder': ['FOUNDED_BY'],
    'founded': ['FOUNDED_BY'],
    'founded by': ['FOUNDED_BY'],
    'fundador': ['FOUNDED_BY'],
    'fundado': ['FOUNDED_BY'],
    'fundado por': ['FOUNDED_BY'],
    'creador': ['FOUNDED_BY'],
    'creó': ['FOUNDED_BY']
  };

  /**
   * Resolves concept keywords to governed predicate codes.
   */
  public static mapTextToPredicates(text: string): string[] {
    const lower = text.toLowerCase();
    const predicates = new Set<string>();

    for (const [kw, preds] of Object.entries(this.keywordToPredicates)) {
      if (lower.includes(kw)) {
        for (const p of preds) predicates.add(p);
      }
    }

    return Array.from(predicates);
  }

  public static getGovernedPredicates(): string[] {
    return [
      'WORKS_AT', 'FOUNDED_BY', 'LOCATED_IN', 'HEADQUARTERED_IN',
      'OFFERS', 'EMPLOYS', 'INTERESTED_IN', 'HAS_NEED', 'OPENED_LOCATION',
      'EXPANDED_TO', 'ASSOCIATED_WITH', 'OWNS', 'BELONGS_TO',
      'EMPLOYEE_COUNT', 'INDUSTRY', 'ANNUAL_REVENUE', 'TECH_STACK',
      'HAS_ROLE', 'HIRING_FOR_ROLE', 'OPEN_POSITIONS_COUNT'
    ];
  }
}
