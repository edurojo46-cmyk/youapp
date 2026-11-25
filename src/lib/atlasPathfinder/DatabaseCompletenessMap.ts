/**
 * ATLAS — AI PATHFINDER V2
 * Module: DatabaseCompletenessMap (Sections 11, 24, 27)
 * 
 * Computes Four-Tier Completeness:
 * 1. STRUCTURAL_COMPLETENESS: Schema fields physically present.
 * 2. SEMANTIC_COMPLETENESS: Non-trivial domain values (not placeholders or empty tokens).
 * 3. EVIDENCE_COMPLETENESS: Backed by verifiable provenance and citations.
 * 4. QUALIFICATION_COMPLETENESS: Satisfying mission-specific mandatory criteria.
 * 
 * Invariant: If qualifiedRecords === 0, qualificationCompleteness = 0%.
 */

import type {
  MissionDatabaseSchema,
  DatabaseRecord,
  CompletenessMap
} from './types.ts';

export class DatabaseCompletenessMap {
  public static evaluate(
    schema: MissionDatabaseSchema,
    records: DatabaseRecord[],
    targetQuantity: number
  ): CompletenessMap {
    const fieldCompleteness: Record<string, number> = {};
    const totalRecords = records.length;

    if (totalRecords === 0) {
      for (const f of schema.fields) {
        fieldCompleteness[f.name] = 0;
      }
      return {
        fieldCompleteness,
        overallCompleteness: 0,
        structuralCompleteness: 0,
        semanticCompleteness: 0,
        evidenceCompleteness: 0,
        qualificationCompleteness: 0,
        hasDiscoveryGap: true,
        hasEnrichmentGap: false,
        hasEvidenceGap: false,
        hasCoverageGap: false,
        hasQualificationGap: true,
        recommendedMode: 'DISCOVERY',
        weakestFields: schema.fields.filter(f => f.required).map(f => f.name)
      };
    }

    // 1. Calculate per-field completeness percentage
    let totalScoreSum = 0;
    let totalSemanticSum = 0;
    const weakestFields: { field: string; pct: number }[] = [];

    for (const f of schema.fields) {
      let filledCount = 0;
      let semanticCount = 0;

      for (const r of records) {
        const val = r.data[f.name];
        if (val !== undefined && val !== null) {
          if (typeof val === 'string' && val.trim().length > 0 && val !== '—') {
            filledCount++;
            if (val.trim().length > 3 && !['none', 'null', 'undefined', 'n/a'].includes(val.toLowerCase())) {
              semanticCount++;
            }
          } else if (Array.isArray(val) && val.length > 0) {
            filledCount++;
            semanticCount++;
          } else if (typeof val === 'number' && !isNaN(val)) {
            filledCount++;
            semanticCount++;
          } else if (typeof val === 'boolean') {
            filledCount++;
            semanticCount++;
          } else if (typeof val === 'object' && Object.keys(val).length > 0) {
            filledCount++;
            semanticCount++;
          }
        }
      }

      const pct = Math.round((filledCount / totalRecords) * 100);
      const semPct = Math.round((semanticCount / totalRecords) * 100);
      fieldCompleteness[f.name] = pct;
      totalScoreSum += pct;
      totalSemanticSum += semPct;

      if (pct < 80) {
        weakestFields.push({ field: f.name, pct });
      }
    }

    const structuralCompleteness = Math.round(totalScoreSum / Math.max(1, schema.fields.length));
    const semanticCompleteness = Math.round(totalSemanticSum / Math.max(1, schema.fields.length));

    // 2. Evidence Completeness
    const verifiedCount = records.filter(r => r.verificationStatus === 'VERIFIED').length;
    const evidenceCompleteness = Math.round((verifiedCount / Math.max(1, totalRecords)) * 100);

    // 3. Qualification Completeness (Section 27)
    const qualifiedCount = records.filter(r => r.lifecycleState === 'MISSION_QUALIFIED').length;
    const qualificationCompleteness = qualifiedCount > 0
      ? Math.min(100, Math.round((qualifiedCount / Math.max(1, targetQuantity)) * 100))
      : 0;

    // 4. Identify Gaps
    const hasDiscoveryGap = totalRecords < targetQuantity;
    const hasEvidenceGap = (verifiedCount / (totalRecords || 1)) < 0.70;
    const hasQualificationGap = qualifiedCount < targetQuantity;

    const incompleteFields = weakestFields.filter(w => w.pct < 75);
    const hasEnrichmentGap = !hasDiscoveryGap && incompleteFields.length > 0;

    const geoPct = fieldCompleteness['geography'] ?? fieldCompleteness['jurisdiction'] ?? fieldCompleteness['province'] ?? 100;
    const hasCoverageGap = geoPct < 70;

    // 5. Determine Recommended Mode
    let recommendedMode: CompletenessMap['recommendedMode'] = 'DISCOVERY';

    if (qualifiedCount >= targetQuantity && evidenceCompleteness >= 70 && structuralCompleteness >= 80 && !hasCoverageGap) {
      recommendedMode = 'COMPLETED';
    } else if (hasDiscoveryGap) {
      recommendedMode = 'DISCOVERY';
    } else if (hasQualificationGap || hasEvidenceGap) {
      recommendedMode = 'EVIDENCE_VALIDATION';
    } else if (hasEnrichmentGap) {
      recommendedMode = 'ENRICHMENT';
    } else if (hasCoverageGap) {
      recommendedMode = 'COVERAGE_EXPANSION';
    }

    weakestFields.sort((a, b) => a.pct - b.pct);

    return {
      fieldCompleteness,
      overallCompleteness: structuralCompleteness,
      structuralCompleteness,
      semanticCompleteness,
      evidenceCompleteness,
      qualificationCompleteness,
      hasDiscoveryGap,
      hasEnrichmentGap,
      hasEvidenceGap,
      hasCoverageGap,
      hasQualificationGap,
      recommendedMode,
      weakestFields: weakestFields.map(w => w.field)
    };
  }
}
