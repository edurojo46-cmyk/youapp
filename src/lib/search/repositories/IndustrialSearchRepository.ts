import { SupabaseClient } from '@supabase/supabase-js';

export const INDUSTRIAL_CANONICAL_SOURCE = 'atlas_canonical_entities';
export const INDUSTRIAL_SEARCH_VIEW = 'atlas_canonical_entities';

export interface IndustrialSearchParams {
  query: string;
  limit?: number;
  page?: number;
  sortBy?: string;
  missionId?: string;
}

export class IndustrialSearchRepository {
  constructor(private supabase: SupabaseClient) {}

  async search(params: IndustrialSearchParams) {
    const qs = params.query ? params.query.trim() : '';
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;
    
    // CATALOG MODE (no query and no missionId)
    if (qs.length === 0 && !params.missionId) {
      let orderCol = 'name';
      let orderDir = true;
      if (params.sortBy === 'Empresa A-Z') {
        orderCol = 'tenant_id'; // we don't have company_name top-level, so sorting might be tricky, let's just stick to name for now or attributes_json->company_name if possible. But name works for Producto A-Z.
      } else if (params.sortBy === 'Más recientes') {
        orderCol = 'created_at';
        orderDir = false;
      }
      
      const { data: prodData, count: prodCount, error: prodErr } = await this.supabase
        .from('atlas_products')
        .select('*', { count: 'exact' })
        .eq('status', 'ACTIVE')
        .order(orderCol, { ascending: orderDir })
        .range(offset, offset + limit - 1);

      if (prodErr) throw prodErr;

      const companyIds = Array.from(new Set(
        (prodData || []).map(p => p.attributes_json?.company_id || p.tenant_id).filter(Boolean)
      ));

      const entityMap = new Map<string, any>();
      if (companyIds.length > 0) {
        const { data: entData } = await this.supabase
          .from('atlas_canonical_entities')
          .select('canonical_entity_id, canonical_name, entity_type, primary_domain, metadata')
          .in('canonical_entity_id', companyIds);
        (entData || []).forEach(ent => {
          entityMap.set(ent.canonical_entity_id, ent);
        });
      }

      const results = (prodData || []).map(pRow => {
        const meta = pRow.attributes_json || {};
        const companyId = meta.company_id || pRow.tenant_id;
        const ent = entityMap.get(companyId);
        const entMeta = ent?.metadata || {};

        let realWebsite: string | null = null;
        if (meta.website && typeof meta.website === 'string' && !meta.website.includes('produccion.gob.ar')) {
          realWebsite = meta.website.trim();
        } else if (entMeta.website && typeof entMeta.website === 'string' && !entMeta.website.includes('produccion.gob.ar')) {
          realWebsite = entMeta.website.trim();
        } else if (ent?.primary_domain && typeof ent.primary_domain === 'string' && !ent.primary_domain.includes('produccion.gob.ar')) {
          realWebsite = ent.primary_domain.trim();
        }

        const taxId = meta.cuit || meta.tax_id || meta.evidence?.cuit || entMeta.cuit || entMeta.tax_id || null;
        const description = pRow.description || meta.description || entMeta.description || null;
        const employeeRange = meta.employee_range || meta.employee_count || entMeta.employee_range || entMeta.employee_count || null;
        const foundedYear = meta.founded_year || entMeta.founded_year || null;

        const relationId = meta.evidence?.relation_id || meta.evidence?.certificate_id || `rel:${pRow.product_id}:${companyId}`;
        const isConstitutional = Boolean(meta.constitutional_authorization?.constitution_decision_id);
        const trustLevel = isConstitutional ? 'CONSTITUTIONAL' : (meta.relationship_type === 'UNKNOWN' ? 'PENDING' : 'LEGACY');

        return {
          id: pRow.product_id, // unique key for catalog rows
          PRODUCT_ID: pRow.product_id,
          COMPANY_ID: companyId,
          COMPANY_METADATA_ENTITY_ID: companyId,
          EVIDENCE_RELATION_ID: relationId,
          COMPANY_NAME: meta.company_name || ent?.canonical_name || 'Desconocido',
          TAX_ID: taxId,
          WEBSITE: realWebsite,
          DESCRIPTION: description,
          EMPLOYEE_RANGE: employeeRange,
          FOUNDED_YEAR: foundedYear,
          ENTITY_TYPE: ent?.entity_type || 'COMPANY',
          ROLE: meta.relationship_type || 'Proveedor',
          CATEGORY: meta.category || pRow.category || entMeta.category || '',
          PROVINCE: meta.province || entMeta.province || '',
          CITY: meta.city || entMeta.city || '',
          PUBLIC_EMAIL: meta.email || entMeta.email || '',
          PUBLIC_PHONE: meta.phone || entMeta.phone || '',
          SOURCE: meta.source || entMeta.source || 'Atlas Discovery',
          EVIDENCE_COUNT: 1,
          IS_CONSTITUTIONAL: isConstitutional,
          TRUST_LEVEL: trustLevel,
          VERIFIED_STATUS: isConstitutional ? 'VERIFIED' : 'UNVERIFIED',
          name: meta.company_name || ent?.canonical_name || 'Desconocido',
          initials: (meta.company_name || ent?.canonical_name || 'D').substring(0, 2).toUpperCase(),
          color: '#1e4d8c',
          MATCH_TYPE: 'product',
          MATCH_SCORE: 4,
          PRODUCTS: [{ name: pRow.name, evidence: meta.evidence }]
        };
      });

      // Fetch dynamic global stats from DB RPC
      let catalogStats = {
        totalRelations: prodCount || 0,
        totalProducts: 0,
        totalEntities: 0,
        totalCategories: 0,
        totalProvinces: 0,
        certifiedRelations: 0,
        constitutionalCoveragePercent: 0,
        globalCoveragePercent: 0,
        missionFitCoveragePercent: 0,
        totalPhysicalRows: 0,
        activeMissionFitRelations: 0
      };

      try {
        const { data: statsData } = await this.supabase.rpc('get_atlas_industrial_catalog_stats');
        if (statsData) {
          catalogStats = {
            totalRelations: statsData.totalRelations || prodCount || 0,
            totalProducts: statsData.totalProducts || 0,
            totalEntities: statsData.totalEntities || 0,
            totalCategories: statsData.totalCategories || 0,
            totalProvinces: statsData.totalProvinces || 0,
            certifiedRelations: statsData.certifiedRelations || 0,
            constitutionalCoveragePercent: statsData.constitutionalCoveragePercent || statsData.globalCoveragePercent || 0,
            globalCoveragePercent: statsData.globalCoveragePercent || 0,
            missionFitCoveragePercent: statsData.missionFitCoveragePercent || 0,
            totalPhysicalRows: statsData.totalPhysicalRows || 0,
            activeMissionFitRelations: statsData.activeMissionFitRelations || 0
          };
        }
      } catch (err) {
        console.warn('Could not fetch dynamic catalog stats via RPC:', err);
      }

      return { 
        results, 
        facets: { provinces: [], categories: [], types: [], roles: [], products: [] },
        catalogStats,
        totalCount: prodCount || 0
      };
    }

    // SEARCH MODE
    const effectiveMissionId = params.missionId || (params as any).mission_id || (qs.startsWith('MISS_') ? qs : null);

    let missionSearchTerms: string[] = [];
    if (effectiveMissionId) {
      try {
        const { data: missionRow } = await this.supabase
          .from('atlas_discovery_missions')
          .select('objective, criteria')
          .eq('mission_id', effectiveMissionId)
          .maybeSingle();

        if (missionRow) {
          const crit = missionRow.criteria || {};
          const uni = crit.universal_spec || {};
          const cat = crit.category || uni.category || '';
          if (cat) missionSearchTerms.push(cat.toLowerCase());
          if (missionRow.objective) {
            const cleanObj = missionRow.objective.replace(/\b(en|de|para|la|el|los|las|argentina|caba|nacional)\b/gi, '').trim().toLowerCase();
            if (cleanObj.length >= 3) missionSearchTerms.push(cleanObj);
          }
        }
      } catch (mErr) {
        console.warn('Error fetching mission for objective query:', mErr);
      }
    }

    let qCompanies = this.supabase
      .from(INDUSTRIAL_SEARCH_VIEW)
      .select('*')
      .in('entity_type', ['COMPANY', 'PERSON', 'ORGANIZATION'])
      .limit(1000);
      
    if (effectiveMissionId) {
      if (missionSearchTerms.length > 0) {
        const orClauses = [
          `metadata->>mission_id.eq.${effectiveMissionId}`,
          ...missionSearchTerms.map(t => `canonical_name.ilike.%${t}%`),
          ...missionSearchTerms.map(t => `metadata->>category.ilike.%${t}%`)
        ].join(',');
        qCompanies = qCompanies.or(orClauses);
      } else {
        qCompanies = qCompanies.eq('metadata->>mission_id', effectiveMissionId);
      }
    } else {
      qCompanies = qCompanies.or(`canonical_name.ilike.%${qs}%,metadata->>industry.ilike.%${qs}%,metadata->>category.ilike.%${qs}%,metadata->>province.ilike.%${qs}%,metadata->>city.ilike.%${qs}%`);
    }

    let qProducts = this.supabase
      .from('atlas_products')
      .select('*')
      .eq('status', 'ACTIVE')
      .limit(1000);
      
    if (effectiveMissionId) {
      if (missionSearchTerms.length > 0) {
        const orClauses = [
          `attributes_json->>mission_id.eq.${effectiveMissionId}`,
          ...missionSearchTerms.map(t => `name.ilike.%${t}%`),
          ...missionSearchTerms.map(t => `category.ilike.%${t}%`)
        ].join(',');
        qProducts = qProducts.or(orClauses);
      } else {
        qProducts = qProducts.eq('attributes_json->>mission_id', effectiveMissionId);
      }
    } else {
      qProducts = qProducts.or(`name.ilike.%${qs}%,attributes_json->>company_name.ilike.%${qs}%,category.ilike.%${qs}%`);
    }

    const [compRes, prodRes] = await Promise.all([qCompanies, qProducts]);

    if (compRes.error) throw new Error(compRes.error.message);
    if (prodRes.error) throw new Error(prodRes.error.message);

    const companyRows = (compRes.data || []).filter(row => row.metadata?.mission_qualified !== false && row.metadata?.mission_qualified !== 'false');
    const productRows = (prodRes.data || []).filter(row => row.attributes_json?.mission_qualified !== false && row.attributes_json?.mission_qualified !== 'false');

    const resultsMap = new Map<string, any>();
    
    companyRows.forEach(row => {
      const meta = row.metadata || {};
      const companyId = row.canonical_entity_id;
      let realWebsite: string | null = null;
      if (meta.website && typeof meta.website === 'string' && !meta.website.includes('produccion.gob.ar')) {
        realWebsite = meta.website.trim();
      } else if (row.primary_domain && typeof row.primary_domain === 'string' && !row.primary_domain.includes('produccion.gob.ar')) {
        realWebsite = row.primary_domain.trim();
      }

      const relationId = meta.evidence?.relation_id || meta.evidence?.certificate_id || `rel:entity:${companyId}`;
      const isConstitutional = Boolean(meta.constitutional_authorization?.constitution_decision_id);
      const trustLevel = isConstitutional ? 'CONSTITUTIONAL' : (meta.role === 'UNKNOWN' ? 'PENDING' : 'LEGACY');
      const isNewFromMission = Boolean(effectiveMissionId && meta.mission_id === effectiveMissionId);

      resultsMap.set(companyId, {
        id: companyId,
        PRODUCT_ID: companyId,
        COMPANY_ID: companyId,
        COMPANY_METADATA_ENTITY_ID: companyId,
        EVIDENCE_RELATION_ID: relationId,
        COMPANY_NAME: row.canonical_name || '',
        TAX_ID: meta.cuit || meta.tax_id || null,
        WEBSITE: realWebsite,
        DESCRIPTION: meta.description || null,
        EMPLOYEE_RANGE: meta.employee_range || meta.employee_count || null,
        FOUNDED_YEAR: meta.founded_year || null,
        ENTITY_TYPE: meta.row_unit || row.entity_type || 'COMPANY',
        ROLE: meta.role || 'Proveedor',
        CATEGORY: meta.category || meta.industry || '',
        PROVINCE: meta.province || '',
        CITY: meta.city || '',
        PUBLIC_EMAIL: meta.email || meta.public_email || '',
        PUBLIC_PHONE: meta.phone || meta.public_phone || '',
        SOURCE: meta.source || 'Atlas Discovery',
        EVIDENCE_COUNT: meta.evidence_count || 1,
        IS_CONSTITUTIONAL: isConstitutional,
        TRUST_LEVEL: trustLevel,
        VERIFIED_STATUS: isConstitutional ? 'VERIFIED' : 'UNVERIFIED',
        IS_NEW_FROM_THIS_MISSION: isNewFromMission,
        MISSION_ID: meta.mission_id || null,
        name: row.canonical_name || '',
        initials: (row.canonical_name || 'D').substring(0, 2).toUpperCase(),
        color: '#1e4d8c',
        MATCH_TYPE: 'company',
        MATCH_SCORE: isNewFromMission ? 10 : 5,
        PRODUCTS: []
      });
    });

    productRows.forEach(pRow => {
      const meta = pRow.attributes_json || {};
      const companyId = meta.company_id || pRow.tenant_id;
      
      let score = 3;
      if (qs && pRow.name.toLowerCase() === qs.toLowerCase()) score = 4;
      
      const relationId = meta.evidence?.relation_id || meta.evidence?.certificate_id || `rel:${pRow.product_id}:${companyId}`;
      const isConstitutional = Boolean(meta.constitutional_authorization?.constitution_decision_id);
      const trustLevel = isConstitutional ? 'CONSTITUTIONAL' : (meta.relationship_type === 'UNKNOWN' ? 'PENDING' : 'LEGACY');

      if (resultsMap.has(companyId)) {
        const existing = resultsMap.get(companyId);
        existing.PRODUCTS.push({ name: pRow.name, evidence: meta.evidence });
        if (!existing.PRODUCT_ID) existing.PRODUCT_ID = pRow.product_id;
        if (!existing.EVIDENCE_RELATION_ID) existing.EVIDENCE_RELATION_ID = relationId;
        if (!existing.DESCRIPTION && pRow.description) {
          existing.DESCRIPTION = pRow.description;
        }
        if (!existing.TAX_ID && (meta.cuit || meta.evidence?.cuit)) {
          existing.TAX_ID = meta.cuit || meta.evidence?.cuit;
        }
        if (!existing.PUBLIC_EMAIL && (meta.public_email || meta.email)) {
          existing.PUBLIC_EMAIL = meta.public_email || meta.email;
        }
        if (score > existing.MATCH_SCORE) {
          existing.MATCH_SCORE = score;
          existing.MATCH_TYPE = 'product';
        }
      } else {
        let realWebsite: string | null = null;
        if (meta.website && typeof meta.website === 'string' && !meta.website.includes('produccion.gob.ar')) {
          realWebsite = meta.website.trim();
        }

        resultsMap.set(companyId, {
          id: companyId, // use companyId to group
          PRODUCT_ID: pRow.product_id,
          COMPANY_ID: companyId,
          COMPANY_METADATA_ENTITY_ID: companyId,
          EVIDENCE_RELATION_ID: relationId,
          COMPANY_NAME: meta.company_name || 'Desconocido',
          TAX_ID: meta.cuit || meta.tax_id || meta.evidence?.cuit || null,
          WEBSITE: realWebsite,
          DESCRIPTION: pRow.description || meta.description || null,
          EMPLOYEE_RANGE: meta.employee_range || meta.employee_count || null,
          FOUNDED_YEAR: meta.founded_year || null,
          ENTITY_TYPE: 'COMPANY',
          ROLE: meta.relationship_type || 'Proveedor',
          CATEGORY: meta.category || pRow.category || '',
          PROVINCE: meta.province || '',
          CITY: meta.city || '',
          PUBLIC_EMAIL: meta.public_email || meta.email || '',
          PUBLIC_PHONE: meta.public_phone || meta.phone || '',
          SOURCE: meta.source || 'Atlas Discovery',
          EVIDENCE_COUNT: 1,
          IS_CONSTITUTIONAL: isConstitutional,
          TRUST_LEVEL: trustLevel,
          VERIFIED_STATUS: isConstitutional ? 'VERIFIED' : 'UNVERIFIED',
          name: meta.company_name || 'Desconocido',
          initials: (meta.company_name || 'D').substring(0, 2).toUpperCase(),
          color: '#1e4d8c',
          MATCH_TYPE: 'product',
          MATCH_SCORE: score,
          PRODUCTS: [{ name: pRow.name, evidence: meta.evidence }]
        });
      }
    });

    const allResults = Array.from(resultsMap.values());
    allResults.sort((a, b) => b.MATCH_SCORE - a.MATCH_SCORE);

    const provincesMap: Record<string, number> = {};
    const categoriesMap: Record<string, number> = {};
    const typesMap: Record<string, number> = {};
    const rolesMap: Record<string, number> = {};
    const productsMap: Record<string, number> = {};

    allResults.forEach(r => {
      const prov = r.PROVINCE || 'No especificada';
      provincesMap[prov] = (provincesMap[prov] || 0) + 1;
      
      const cat = r.CATEGORY || 'General';
      const cats = typeof cat === 'string' ? cat.split(',').map(c => c.trim()) : [cat];
      cats.forEach(c => {
        if (c) categoriesMap[c] = (categoriesMap[c] || 0) + 1;
      });
      
      const type = r.ENTITY_TYPE || 'Desconocido';
      typesMap[type] = (typesMap[type] || 0) + 1;
      
      const role = r.ROLE || 'Proveedor';
      rolesMap[role] = (rolesMap[role] || 0) + 1;
      
      r.PRODUCTS.forEach((p: any) => {
        productsMap[p.name] = (productsMap[p.name] || 0) + 1;
      });
    });

    const formatFacets = (map: Record<string, number>) => {
      return Object.entries(map)
        .map(([label, count]) => ({ label, count, checked: false }))
        .sort((a, b) => b.count - a.count);
    };

    const facets = {
      provinces: formatFacets(provincesMap),
      categories: formatFacets(categoriesMap),
      types: formatFacets(typesMap),
      roles: formatFacets(rolesMap),
      products: formatFacets(productsMap)
    };

    const newCount = allResults.filter(r => r.IS_NEW_FROM_THIS_MISSION).length;
    const paginatedRows = allResults.slice(offset, offset + limit);

    return { 
      results: paginatedRows, 
      facets,
      totalCount: allResults.length,
      newCount
    };
  }
}
