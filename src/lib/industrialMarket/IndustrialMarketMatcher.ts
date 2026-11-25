export type MarketPostType = 'OFFER' | 'DEMAND';
export type ProductOrService = 'PRODUCT' | 'SERVICE';
export type GeographicScope = 'BARRIO' | 'CABA' | 'ARGENTINA';
export type MarketPostStatus = 'DRAFT' | 'ACTIVE' | 'MATCHED' | 'EXPIRED' | 'DISABLED';

export interface IndustrialMarketPost {
  post_id: string;
  organization_id: string;
  created_by_user_id?: string | null;
  type: MarketPostType;
  title: string;
  description: string;
  product_or_service: ProductOrService;
  category: string;
  geographic_scope: GeographicScope;
  neighborhood?: string | null;
  city?: string | null;
  province?: string | null;
  valid_until?: string | null;
  status: MarketPostStatus;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type MatchBasis = 'EXACT_PRODUCT_MATCH' | 'CATEGORY_MATCH' | 'SECTOR_MATCH';
export type GeographicRelation = 'SAME_NEIGHBORHOOD' | 'SAME_CITY' | 'NATIONAL' | 'EXTERIOR';

export type ContactabilityBadge =
  | 'CONTACTO DIRECTO'
  | 'CONTACTO ORGANIZACIONAL'
  | 'CONTACTO INSTITUCIONAL'
  | 'VÍA DIGITAL'
  | 'SIN CONTACTO VERIFICADO';

export interface IndustrialMatchResult {
  match_id: string;
  post_id: string;
  counterparty_organization_id: string;
  counterparty_name: string;
  counterparty_type: 'BUYER' | 'SUPPLIER';
  match_basis: MatchBasis;
  geographic_relation: GeographicRelation;
  product_category_relation: string;
  contactability: {
    status: ContactabilityBadge;
    raw_status?: string;
    direct_email?: string | null;
    organization_email?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  evidence: {
    matched_term: string;
    source_field: string;
    category?: string;
    industry?: string;
    address?: string;
    products_sample?: string[];
  };
}

export interface MatcherOptions {
  limit?: number;
}

const SPANISH_STOP_WORDS = new Set([
  'para', 'como', 'este', 'esta', 'estos', 'estas', 'todo', 'toda', 'todos', 'todas',
  'sobre', 'entre', 'desde', 'hasta', 'hacia', 'pero', 'sino', 'cada', 'otro', 'otra',
  'otros', 'otras', 'donde', 'cuando', 'quien', 'quienes', 'cual', 'cuales', 'unos', 'unas',
  'algo', 'nada', 'tengo', 'necesito', 'busco', 'buscamos', 'ofrezco', 'ofrecemos',
  'servicio', 'producto', 'servicios', 'productos', 'buenos', 'aires', 'caba', 'argentina', 'barrio'
]);

export class IndustrialMarketMatcher {
  constructor(private dbPool: any) {}

  /**
   * Helper: Normalize contact status to required display labels
   */
  public static mapContactability(summary?: any): {
    status: ContactabilityBadge;
    raw_status?: string;
    direct_email?: string | null;
    organization_email?: string | null;
    phone?: string | null;
    website?: string | null;
  } {
    if (!summary) {
      return { status: 'SIN CONTACTO VERIFICADO' };
    }

    const raw = summary.contact_status;
    const emailType = summary.email_type;
    const orgPath = summary.organization_contact_path;

    if (raw === 'DIRECT CONTACT') {
      return {
        status: 'CONTACTO DIRECTO',
        raw_status: raw,
        direct_email: summary.direct_email,
        phone: summary.phone,
        website: summary.website
      };
    }

    if (raw === 'ORGANIZATION CONTACT') {
      if (emailType === 'INSTITUTIONAL_EMAIL') {
        return {
          status: 'CONTACTO INSTITUCIONAL',
          raw_status: raw,
          organization_email: orgPath?.organization_email || summary.direct_email,
          phone: orgPath?.organization_phone || summary.phone,
          website: summary.website
        };
      }
      return {
        status: 'CONTACTO ORGANIZACIONAL',
        raw_status: raw,
        organization_email: orgPath?.organization_email || summary.direct_email,
        phone: orgPath?.organization_phone || summary.phone,
        website: summary.website
      };
    }

    if (raw === 'DIGITAL PATH') {
      return {
        status: 'VÍA DIGITAL',
        raw_status: raw,
        website: summary.website,
        phone: summary.phone
      };
    }

    return {
      status: 'SIN CONTACTO VERIFICADO',
      raw_status: raw
    };
  }

  /**
   * Finds deterministic counterparties for a given market post.
   * Invariant:
   * - OFFER -> Potential BUYERS
   * - DEMAND -> Potential SUPPLIERS
   * - Strictly deterministic, separating EXACT_PRODUCT_MATCH, CATEGORY_MATCH, SECTOR_MATCH.
   */
  public async matchPost(post: IndustrialMarketPost, options: MatcherOptions = {}): Promise<IndustrialMatchResult[]> {
    const limit = options.limit || 50;
    const client = await this.dbPool.connect();

    try {
      if (post.type === 'OFFER') {
        return await this.matchOfferToBuyers(client, post, limit);
      } else {
        return await this.matchDemandToSuppliers(client, post, limit);
      }
    } finally {
      client.release();
    }
  }

  /**
   * MATCH OFFER -> BUYERS
   * The offerer is selling goods/services. Prospective buyers are businesses
   * in the target geography whose profile consumes those goods/services.
   */
  private async matchOfferToBuyers(
    client: pg.PoolClient,
    post: IndustrialMarketPost,
    limit: number
  ): Promise<IndustrialMatchResult[]> {
    // Extract keywords from title and category
    const cleanTerms = `${post.title} ${post.category}`
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !SPANISH_STOP_WORDS.has(t));

    // Fetch local businesses respecting geographic scope
    let geoFilter = '';
    const params: any[] = [post.organization_id];

    if (post.geographic_scope === 'BARRIO' && post.neighborhood) {
      params.push(post.neighborhood.toLowerCase());
      geoFilter = `AND LOWER(neighborhood_id) = $${params.length}`;
    } else if (post.geographic_scope === 'CABA') {
      geoFilter = `AND (address ILIKE '%CABA%' OR address ILIKE '%Buenos Aires%')`;
    }

    const querySql = `
      SELECT 
        organization_id, name, category, industry, address,
        neighborhood_id, contact_summary, products
      FROM public.atlas_local_businesses
      WHERE organization_id != $1
        ${geoFilter}
      LIMIT 100;
    `;

    const res = await client.query(querySql, params);
    const candidates = res.rows;
    const matches: IndustrialMatchResult[] = [];

    for (const cand of candidates) {
      const candCategory = (cand.category || '').toLowerCase();
      const candIndustry = (cand.industry || '').toLowerCase();
      const candProducts = (Array.isArray(cand.products) ? cand.products : []).map((p: string) => String(p).toLowerCase());

      let matchBasis: MatchBasis | null = null;
      let matchedTerm = '';
      let sourceField = '';
      let relationDesc = '';

      // 1. EXACT_PRODUCT_MATCH check
      for (const term of cleanTerms) {
        const prodHit = candProducts.find(p => p.includes(term));
        if (prodHit) {
          matchBasis = 'EXACT_PRODUCT_MATCH';
          matchedTerm = term;
          sourceField = 'products';
          relationDesc = `Contraparte demandante con catálogo registrado de insumos afines (${term})`;
          break;
        }
      }

      // 2. CATEGORY_MATCH check
      if (!matchBasis) {
        for (const term of cleanTerms) {
          if (candCategory.includes(term)) {
            matchBasis = 'CATEGORY_MATCH';
            matchedTerm = term;
            sourceField = 'category';
            relationDesc = `Comercio en categoría consumidora (${cand.category})`;
            break;
          }
        }
      }

      // 3. SECTOR_MATCH check (Cross-sector buyer demand in local market)
      if (!matchBasis) {
        // Broad sector alignments for packaging, supplies, professional services
        const isBroadBuyer =
          candCategory.includes('EQUIPOS') ||
          candCategory.includes('COMERCIAL') ||
          candCategory.includes('ALQUILER') ||
          candCategory.includes('FOTOGRAFIA') ||
          candIndustry.includes('COMERCIO') ||
          candIndustry.includes('SERVICIOS');

        if (isBroadBuyer) {
          matchBasis = 'SECTOR_MATCH';
          matchedTerm = cand.industry || cand.category;
          sourceField = 'industry';
          relationDesc = `Comercio de proximidad en sector con demanda comercial activa (${cand.industry || cand.category})`;
        }
      }

      if (matchBasis) {
        const geoRelation: GeographicRelation = 
          cand.neighborhood_id?.toLowerCase() === post.neighborhood?.toLowerCase()
            ? 'SAME_NEIGHBORHOOD'
            : (cand.address?.includes('CABA') ? 'SAME_CITY' : 'NATIONAL');

        matches.push({
          match_id: `match_${post.post_id.slice(0, 8)}_${cand.organization_id.slice(0, 8)}`,
          post_id: post.post_id,
          counterparty_organization_id: cand.organization_id,
          counterparty_name: cand.name,
          counterparty_type: 'BUYER',
          match_basis: matchBasis,
          geographic_relation: geoRelation,
          product_category_relation: relationDesc,
          contactability: IndustrialMarketMatcher.mapContactability(cand.contact_summary),
          evidence: {
            matched_term: matchedTerm,
            source_field: sourceField,
            category: cand.category,
            industry: cand.industry,
            address: cand.address,
            products_sample: cand.products?.slice(0, 3)
          }
        });
      }
    }

    // Sort: EXACT_PRODUCT_MATCH first, then CATEGORY_MATCH, then SECTOR_MATCH
    const rank: Record<MatchBasis, number> = {
      EXACT_PRODUCT_MATCH: 1,
      CATEGORY_MATCH: 2,
      SECTOR_MATCH: 3
    };

    matches.sort((a, b) => rank[a.match_basis] - rank[b.match_basis]);
    return matches.slice(0, limit);
  }

  /**
   * MATCH DEMAND -> SUPPLIERS
   * The demand creator needs a product/service. Prospective suppliers
   * are businesses offering or producing that product/service.
   */
  private async matchDemandToSuppliers(
    client: pg.PoolClient,
    post: IndustrialMarketPost,
    limit: number
  ): Promise<IndustrialMatchResult[]> {
    const cleanTerms = `${post.title} ${post.category}`
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !SPANISH_STOP_WORDS.has(t));

    let geoFilter = '';
    const params: any[] = [post.organization_id];

    if (post.geographic_scope === 'BARRIO' && post.neighborhood) {
      params.push(post.neighborhood.toLowerCase());
      geoFilter = `AND LOWER(neighborhood_id) = $${params.length}`;
    } else if (post.geographic_scope === 'CABA') {
      geoFilter = `AND (address ILIKE '%CABA%' OR address ILIKE '%Buenos Aires%')`;
    }

    // Search suppliers from atlas_local_businesses
    const localSql = `
      SELECT 
        organization_id, name, category, industry, address,
        neighborhood_id, contact_summary, products
      FROM public.atlas_local_businesses
      WHERE organization_id != $1
        ${geoFilter}
      LIMIT 100;
    `;

    const localRes = await client.query(localSql, params);
    const candidates = localRes.rows;
    const matches: IndustrialMatchResult[] = [];

    for (const cand of candidates) {
      const candCategory = (cand.category || '').toLowerCase();
      const candIndustry = (cand.industry || '').toLowerCase();
      const candProducts = (Array.isArray(cand.products) ? cand.products : []).map((p: string) => String(p).toLowerCase());

      let matchBasis: MatchBasis | null = null;
      let matchedTerm = '';
      let sourceField = '';
      let relationDesc = '';

      // 1. EXACT_PRODUCT_MATCH: Candidate offers the demanded item
      for (const term of cleanTerms) {
        const prodHit = candProducts.find(p => p.includes(term));
        if (prodHit) {
          matchBasis = 'EXACT_PRODUCT_MATCH';
          matchedTerm = term;
          sourceField = 'products';
          relationDesc = `Proveedor con producto exacto en catálogo (${term})`;
          break;
        }
      }

      // 2. CATEGORY_MATCH: Candidate operates directly in the demanded category
      if (!matchBasis) {
        for (const term of cleanTerms) {
          if (candCategory.includes(term)) {
            matchBasis = 'CATEGORY_MATCH';
            matchedTerm = term;
            sourceField = 'category';
            relationDesc = `Proveedor fabricante especializado en la categoría (${cand.category})`;
            break;
          }
        }
      }

      // 3. SECTOR_MATCH: Candidate industry is part of supplying sector
      if (!matchBasis) {
        const isIndustrialSupplier =
          candIndustry.includes('IMPRENTA') ||
          candIndustry.includes('EQUIPOS') ||
          candIndustry.includes('METALURGICA') ||
          candIndustry.includes('FABRICACION');

        if (isIndustrialSupplier) {
          matchBasis = 'SECTOR_MATCH';
          matchedTerm = cand.industry;
          sourceField = 'industry';
          relationDesc = `Proveedor industrial activo en el rubro afín (${cand.industry})`;
        }
      }

      if (matchBasis) {
        const geoRelation: GeographicRelation = 
          cand.neighborhood_id?.toLowerCase() === post.neighborhood?.toLowerCase()
            ? 'SAME_NEIGHBORHOOD'
            : (cand.address?.includes('CABA') ? 'SAME_CITY' : 'NATIONAL');

        matches.push({
          match_id: `match_${post.post_id.slice(0, 8)}_${cand.organization_id.slice(0, 8)}`,
          post_id: post.post_id,
          counterparty_organization_id: cand.organization_id,
          counterparty_name: cand.name,
          counterparty_type: 'SUPPLIER',
          match_basis: matchBasis,
          geographic_relation: geoRelation,
          product_category_relation: relationDesc,
          contactability: IndustrialMarketMatcher.mapContactability(cand.contact_summary),
          evidence: {
            matched_term: matchedTerm,
            source_field: sourceField,
            category: cand.category,
            industry: cand.industry,
            address: cand.address,
            products_sample: cand.products?.slice(0, 3)
          }
        });
      }
    }

    const rank: Record<MatchBasis, number> = {
      EXACT_PRODUCT_MATCH: 1,
      CATEGORY_MATCH: 2,
      SECTOR_MATCH: 3
    };

    matches.sort((a, b) => rank[a.match_basis] - rank[b.match_basis]);
    return matches.slice(0, limit);
  }
}
