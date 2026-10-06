/**
 * ATLAS GLOBAL SOURCE-NATIVE IDENTITY RECONCILER V1
 * @server/services/industrial/SourceNativeIdentityReconciler.ts
 * 
 * Reconciles historical establishment duplicates possessing identical source native IDs
 * in an append-only, non-destructive, provenance-preserving manner.
 */

import type pg from 'pg';

export interface DuplicateGroupItem {
  canonical_entity_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  created_at: string;
  mission_id: string | null;
  cuit: string | null;
  source: string;
  source_entity_id: string;
}

export interface DuplicateGroupAudit {
  source_id: string;
  source_entity_id: string;
  row_count: number;
  classification: 'SAME_PHYSICAL_ENTITY' | 'CONFLICTING_ENTITY' | 'UNCERTAIN';
  items: DuplicateGroupItem[];
}

export interface AuditReport {
  total_establishments: number;
  with_source_native_id: number;
  duplicate_source_id_groups: number;
  duplicate_rows_total: number;
  same_physical_entity_groups: number;
  conflicting_groups: number;
  uncertain_groups: number;
  groups: DuplicateGroupAudit[];
}

export class SourceNativeIdentityReconciler {
  constructor(private dbPool: pg.Pool) {}

  public async auditGlobalDuplicates(): Promise<AuditReport> {
    // 1. Total establishments
    const totalEstRes = await this.dbPool.query(`
      SELECT COUNT(*)::int AS count
      FROM public.atlas_canonical_entities
      WHERE status = 'ACTIVE'
        AND (metadata->>'row_unit' = 'ESTABLISHMENT' OR entity_type = 'ORGANIZATION');
    `);
    const total_establishments = totalEstRes.rows[0]?.count || 0;

    // 2. Fetch all establishments with a source native identifier
    const rowsRes = await this.dbPool.query(`
      SELECT 
        canonical_entity_id,
        canonical_name,
        created_at,
        metadata
      FROM public.atlas_canonical_entities
      WHERE status = 'ACTIVE'
        AND (metadata->>'row_unit' = 'ESTABLISHMENT' OR entity_type = 'ORGANIZATION')
        AND (
          metadata->>'source_entity_id' IS NOT NULL 
          OR metadata->>'osm_id' IS NOT NULL 
          OR (metadata->>'cuit' IS NOT NULL AND metadata->>'cuit' LIKE 'OSM-EST-%')
        )
      ORDER BY created_at ASC;
    `);

    const with_source_native_id = rowsRes.rows.length;

    // Group by (source + source_entity_id)
    const groupMap = new Map<string, DuplicateGroupItem[]>();
    for (const r of rowsRes.rows) {
      const meta = r.metadata || {};
      const source = meta.source || meta.source_id || 'UNKNOWN_SOURCE';
      const source_entity_id = meta.source_entity_id || meta.osm_id || meta.cuit;
      if (!source_entity_id) continue;

      const key = `${source}:::${source_entity_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }

      groupMap.get(key)!.push({
        canonical_entity_id: r.canonical_entity_id,
        name: r.canonical_name,
        address: meta.address || null,
        lat: meta.latitude || null,
        lon: meta.longitude || null,
        created_at: r.created_at,
        mission_id: meta.mission_id || null,
        cuit: meta.cuit || null,
        source,
        source_entity_id
      });
    }

    const duplicateGroups: DuplicateGroupAudit[] = [];
    let duplicate_rows_total = 0;
    let same_physical_entity_groups = 0;
    let conflicting_groups = 0;
    let uncertain_groups = 0;

    for (const [key, items] of groupMap.entries()) {
      if (items.length > 1) {
        duplicate_rows_total += items.length;
        const [source_id, source_entity_id] = key.split(':::');

        // Check if same physical entity
        const uniqueNames = new Set(items.map(i => i.name.toLowerCase().trim()));
        let classification: 'SAME_PHYSICAL_ENTITY' | 'CONFLICTING_ENTITY' | 'UNCERTAIN' = 'SAME_PHYSICAL_ENTITY';
        if (uniqueNames.size === 1) {
          classification = 'SAME_PHYSICAL_ENTITY';
          same_physical_entity_groups++;
        } else {
          // If names vary only slightly or same name normalized
          const first = items[0].name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const allMatch = items.every(i => i.name.toLowerCase().replace(/[^a-z0-9]/g, '') === first);
          if (allMatch) {
            classification = 'SAME_PHYSICAL_ENTITY';
            same_physical_entity_groups++;
          } else {
            classification = 'CONFLICTING_ENTITY';
            conflicting_groups++;
          }
        }

        duplicateGroups.push({
          source_id,
          source_entity_id,
          row_count: items.length,
          classification,
          items
        });
      }
    }

    // Query specific status breakdown for the 5 heladerias
    const h5Res = await this.dbPool.query(`
      SELECT 
        canonical_name, 
        status, 
        metadata->>'source_entity_id' AS source_entity_id,
        metadata->>'cuit' AS cuit,
        COUNT(*)::int AS count
      FROM public.atlas_canonical_entities
      WHERE canonical_name IN ('Muy Heladobar', 'Volta', 'Alessandro', 'Baronia', 'Sabayon')
      GROUP BY canonical_name, status, metadata->>'source_entity_id', metadata->>'cuit'
      ORDER BY canonical_name, status;
    `);

    const h5Active = h5Res.rows.filter(r => r.status === 'ACTIVE');
    const h5Merged = h5Res.rows.filter(r => r.status === 'MERGED');

    return {
      total_establishments,
      with_source_native_id,
      duplicate_source_id_groups: duplicateGroups.length,
      duplicate_rows_total,
      same_physical_entity_groups,
      conflicting_groups,
      uncertain_groups,
      heladeria_five_active_count: h5Active.reduce((sum, r) => sum + r.count, 0),
      heladeria_five_merged_count: h5Merged.reduce((sum, r) => sum + r.count, 0),
      heladeria_five_details: h5Res.rows,
      groups: duplicateGroups
    };
  }

  /**
   * Reconciles duplicate groups append-only without deleting records.
   * Remaps products to survivor and marks superseded entities.
   */
  public async reconcileDuplicates(): Promise<{
    reconciled_groups: number;
    superseded_entities: number;
    remapped_products: number;
    unique_index_created: boolean;
  }> {
    const audit = await this.auditGlobalDuplicates();
    let reconciled_groups = 0;
    let superseded_entities = 0;
    let remapped_products = 0;

    for (const g of audit.groups) {
      if (g.classification === 'SAME_PHYSICAL_ENTITY' && g.items.length > 1) {
        // Deterministic survivor: oldest created_at
        const sorted = [...g.items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const survivor = sorted[0];
        const toSupersede = sorted.slice(1);

        for (const loser of toSupersede) {
          // 1. Mark canonical entity as SUPERSEDED with lineage pointer
          await this.dbPool.query(`
            UPDATE public.atlas_canonical_entities
            SET 
              status = 'MERGED',
              updated_at = NOW(),
              metadata = metadata || jsonb_build_object(
                'merged_into', $1::text,
                'superseded_at', NOW(),
                'superseded_reason', 'SOURCE_NATIVE_ID_COLLISION',
                'original_mission_id', metadata->>'mission_id'
              )
            WHERE canonical_entity_id = $2;
          `, [survivor.canonical_entity_id, loser.canonical_entity_id]);

          // 2. Remap associated products in atlas_products
          const prodUpdateRes = await this.dbPool.query(`
            UPDATE public.atlas_products
            SET 
              updated_at = NOW(),
              attributes_json = jsonb_set(
                jsonb_set(
                  COALESCE(attributes_json, '{}'::jsonb),
                  '{company_id}',
                  to_jsonb($1::text)
                ),
                '{reconciliation}',
                jsonb_build_object(
                  'remapped_from', $2::text,
                  'remapped_to', $1::text,
                  'at', NOW()
                )
              )
            WHERE attributes_json->>'company_id' = $2;
          `, [survivor.canonical_entity_id, loser.canonical_entity_id]);

          remapped_products += prodUpdateRes.rowCount || 0;
          superseded_entities++;
        }

        reconciled_groups++;
      }
    }

    // Enforce structural unique protection on active entities
    let unique_index_created = false;
    try {
      await this.dbPool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_active_canonical_osm_entity 
        ON public.atlas_canonical_entities (
          (metadata->>'source'),
          (COALESCE(metadata->>'source_entity_id', metadata->>'osm_id', metadata->>'cuit'))
        ) 
        WHERE status = 'ACTIVE' 
          AND metadata->>'source' IS NOT NULL 
          AND (
            metadata->>'source_entity_id' IS NOT NULL 
            OR metadata->>'osm_id' IS NOT NULL 
            OR (metadata->>'cuit' IS NOT NULL AND metadata->>'cuit' LIKE 'OSM-EST-%')
          );
      `);
      unique_index_created = true;
    } catch (e: any) {
      console.warn('[SourceNativeIdentityReconciler] Unique index creation notice:', e.message);
    }

    return {
      reconciled_groups,
      superseded_entities,
      remapped_products,
      unique_index_created
    };
  }
}
