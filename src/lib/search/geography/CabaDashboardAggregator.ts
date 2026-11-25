/**
 * CABA Dashboard Aggregator & Coverage Engine
 * Directives:
 * 38. CABA DASHBOARD (Total, By Commune, By Neighborhood with complete metrics)
 * 39. CABA COVERAGE (NOT_STARTED, LOW, GROWING, GOOD, HIGH based on explicit methodology)
 */

import { CABA_COMMUNES, CABA_48_NEIGHBORHOODS, CabaNeighborhood, CabaCommune } from './CabaGeographyCatalog';
import { AtlasDiscoveryIndex, DiscoveryIndexRecord } from '../discoveryIndex/AtlasDiscoveryIndex';

export type CoverageLevel = 'NOT_STARTED' | 'LOW' | 'GROWING' | 'GOOD' | 'HIGH';

export interface GeographyMetricsSnapshot {
  geography_id: string;
  name: string;
  type: 'COMMUNE' | 'NEIGHBORHOOD' | 'TOTAL_CABA';
  official_population_2022?: number;
  unique_indexed_candidates: number;
  with_public_email: number;
  with_public_phone: number;
  with_social: number;
  work_relations: number;
  professional_practice: number;
  business_relations: number;
  residence_confirmed: number;
  publication_associated?: number;
  live_sources_count: number;
  live_sources: string[];
  coverage_level: CoverageLevel;
  last_refresh: string;
}

export interface CabaDashboardReport {
  caba_total: GeographyMetricsSnapshot;
  by_commune: GeographyMetricsSnapshot[];
  by_neighborhood: GeographyMetricsSnapshot[];
  timestamp: string;
  methodology: string;
}

export class CabaDashboardAggregator {
  /**
   * Explicit empirical coverage methodology (Directive Section 39):
   * - NOT_STARTED: 0 candidates
   * - LOW: 1 to 24 candidates
   * - GROWING: 25 to 99 candidates
   * - GOOD: 100 to 499 candidates
   * - HIGH: >= 500 candidates
   */
  public static calculateCoverageLevel(uniqueCount: number): CoverageLevel {
    if (uniqueCount === 0) return 'NOT_STARTED';
    if (uniqueCount < 25) return 'LOW';
    if (uniqueCount < 100) return 'GROWING';
    if (uniqueCount < 500) return 'GOOD';
    return 'HIGH';
  }

  public static generateReport(records: DiscoveryIndexRecord[]): CabaDashboardReport {
    const now = new Date().toISOString();

    // 1. Group records by neighborhood
    const neighRecordsMap = new Map<string, DiscoveryIndexRecord[]>();
    for (const b of CABA_48_NEIGHBORHOODS) {
      neighRecordsMap.set(b.id, []);
    }

    // Helper for matching record to neighborhood
    for (const r of records) {
      const neigh = (r.neighborhood || '').toLowerCase();
      const ev = (r.location_evidence || '').toLowerCase();

      let matched = false;
      for (const b of CABA_48_NEIGHBORHOODS) {
        const bNorm = b.normalized_name.toLowerCase();
        if (neigh.includes(bNorm) || ev.includes(bNorm) || b.aliases.some(a => neigh.includes(a.toLowerCase()) || ev.includes(a.toLowerCase()))) {
          neighRecordsMap.get(b.id)!.push(r);
          matched = true;
          break;
        }
      }
      if (!matched && (neigh.includes('caballito') || ev.includes('caballito'))) {
        neighRecordsMap.get('caballito')!.push(r);
      }
    }

    // 2. Build Neighborhood Snapshots
    const by_neighborhood: GeographyMetricsSnapshot[] = CABA_48_NEIGHBORHOODS.map(b => {
      const recs = neighRecordsMap.get(b.id) || [];
      const sourcesSet = new Set(recs.map(r => r.source_id));

      return {
        geography_id: b.id,
        name: b.name,
        type: 'NEIGHBORHOOD',
        official_population_2022: b.official_population_2022,
        unique_indexed_candidates: recs.length,
        with_public_email: recs.filter(r => !!r.public_email).length,
        with_public_phone: recs.filter(r => !!r.public_phone).length,
        with_social: recs.filter(r => r.social_profiles && r.social_profiles.length > 0).length,
        work_relations: recs.filter(r => r.location_relation_type === 'WORKS_IN' || r.location_relation_type === 'TEACHES_IN').length,
        professional_practice: recs.filter(r => r.location_relation_type === 'PROFESSIONAL_PRACTICE_IN').length,
        business_relations: recs.filter(r => r.location_relation_type === 'BUSINESS_LOCATED_IN').length,
        residence_confirmed: recs.filter(r => r.location_relation_type === 'RESIDES_IN').length,
        live_sources_count: sourcesSet.size,
        live_sources: Array.from(sourcesSet),
        coverage_level: this.calculateCoverageLevel(recs.length),
        last_refresh: now
      };
    });

    // 3. Build Commune Snapshots
    const by_commune: GeographyMetricsSnapshot[] = CABA_COMMUNES.map(c => {
      const communeNeighSnapshots = by_neighborhood.filter(b => {
        const neighDef = CABA_48_NEIGHBORHOODS.find(n => n.id === b.geography_id);
        return neighDef && neighDef.commune_number === c.number;
      });

      const uniqueCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.unique_indexed_candidates, 0);
      const emailCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.with_public_email, 0);
      const phoneCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.with_public_phone, 0);
      const socialCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.with_social, 0);
      const workCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.work_relations, 0);
      const profCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.professional_practice, 0);
      const bizCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.business_relations, 0);
      const resCount = communeNeighSnapshots.reduce((acc, curr) => acc + curr.residence_confirmed, 0);

      const allSources = Array.from(new Set(communeNeighSnapshots.flatMap(s => s.live_sources)));

      return {
        geography_id: c.id,
        name: c.name,
        type: 'COMMUNE',
        official_population_2022: c.official_population_2022,
        unique_indexed_candidates: uniqueCount,
        with_public_email: emailCount,
        with_public_phone: phoneCount,
        with_social: socialCount,
        work_relations: workCount,
        professional_practice: profCount,
        business_relations: bizCount,
        residence_confirmed: resCount,
        live_sources_count: allSources.length,
        live_sources: allSources,
        coverage_level: this.calculateCoverageLevel(uniqueCount),
        last_refresh: now
      };
    });

    // 4. Total CABA Snapshot
    const totalUnique = records.length;
    const totalSources = Array.from(new Set(records.map(r => r.source_id)));

    const caba_total: GeographyMetricsSnapshot = {
      geography_id: 'caba_total',
      name: 'Ciudad Autónoma de Buenos Aires (Total)',
      type: 'TOTAL_CABA',
      official_population_2022: 3121707, // Censo Nacional 2022 Total CABA
      unique_indexed_candidates: totalUnique,
      with_public_email: records.filter(r => !!r.public_email).length,
      with_public_phone: records.filter(r => !!r.public_phone).length,
      with_social: records.filter(r => r.social_profiles && r.social_profiles.length > 0).length,
      work_relations: records.filter(r => r.location_relation_type === 'WORKS_IN' || r.location_relation_type === 'TEACHES_IN').length,
      professional_practice: records.filter(r => r.location_relation_type === 'PROFESSIONAL_PRACTICE_IN').length,
      business_relations: records.filter(r => r.location_relation_type === 'BUSINESS_LOCATED_IN').length,
      residence_confirmed: records.filter(r => r.location_relation_type === 'RESIDES_IN').length,
      publication_associated: records.filter(r => r.location_relation_type === 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE').length,
      live_sources_count: totalSources.length,
      live_sources: totalSources,
      coverage_level: this.calculateCoverageLevel(totalUnique),
      last_refresh: now
    };

    return {
      caba_total,
      by_commune,
      by_neighborhood,
      timestamp: now,
      methodology: 'Metodología Fáctica Empírica: NOT_STARTED (0), LOW (1-24), GROWING (25-99), GOOD (100-499), HIGH (>=500) candidatos únicos reales indexados.'
    };
  }
}
