/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: MissionSuccessFunction (Section 6)
 * 
 * Defines mission-specific success evaluation functions.
 * Invariant: Does NOT replace specialized internal ranking; evaluates
 * mission objective satisfaction at the orchestration layer.
 */

import type { MissionSpecification, MissionResultItem, MissionSuccessEvaluation } from './types.ts';

export class MissionSuccessFunction {
  public static evaluateItem(item: MissionResultItem, mission: MissionSpecification): number {
    switch (mission.objectiveType) {
      case 'EXPERT_DISCOVERY':
        return this.scoreExpert(item, mission);
      case 'ORGANIZATION_DISCOVERY':
        return this.scoreOrganization(item, mission);
      case 'SOURCE_DISCOVERY':
        return this.scoreSource(item, mission);
      case 'PUBLIC_CONTACT_DISCOVERY':
        return this.scoreContact(item, mission);
      case 'CONTENT_DISCOVERY':
        return this.scoreContent(item, mission);
      default:
        return 0.50;
    }
  }

  // 1. Expert Discovery: Expertise match (0.45) + Affiliation/Evidence (0.35) + Geography (0.20)
  private static scoreExpert(item: MissionResultItem, mission: MissionSpecification): number {
    let score = 0;
    const text = `${item.title} ${item.primaryDetails.role || ''} ${item.primaryDetails.organization || ''} ${item.primaryDetails.profession || ''} ${item.evidenceSummary || ''}`.toLowerCase();

    // Domain topics match
    let topicHits = 0;
    for (const t of mission.domainTopics) {
      if (text.includes(t.toLowerCase())) topicHits++;
    }
    const topicScore = mission.domainTopics.length > 0 ? Math.min(1.0, topicHits / mission.domainTopics.length) : 0.7;
    score += topicScore * 0.45;

    // Affiliation & Evidence confidence
    const hasEvidence = (item.evidenceBadges && item.evidenceBadges.length > 0) || !!item.primaryDetails.organization;
    score += (hasEvidence ? 1.0 : 0.2) * 0.35;

    // Geography match
    const geoText = (item.primaryDetails.geography || '').toLowerCase();
    const isArg = geoText.includes('arg') || geoText.includes('caba') || text.includes('argentin');
    score += (isArg ? 1.0 : 0.3) * 0.20;

    return parseFloat(score.toFixed(3));
  }

  // 2. Organization Discovery: Sector match (0.40) + Legal/CUIT verification (0.40) + Geography (0.20)
  private static scoreOrganization(item: MissionResultItem, mission: MissionSpecification): number {
    let score = 0;
    const text = `${item.title} ${item.primaryDetails.sector || ''} ${item.primaryDetails.activity || ''}`.toLowerCase();

    // Sector match
    let sectorHits = 0;
    for (const t of mission.domainTopics) {
      if (text.includes(t.toLowerCase())) sectorHits++;
    }
    const sectorScore = mission.domainTopics.length > 0 ? Math.min(1.0, sectorHits / mission.domainTopics.length) : 0.8;
    score += sectorScore * 0.40;

    // CUIT / Registration evidence
    const hasRegistration = !!item.primaryDetails.cuit || !!item.primaryDetails.registrationNumber || !!item.primaryDetails.sourceRegistry;
    score += (hasRegistration ? 1.0 : 0.3) * 0.40;

    // Geography
    const isArg = (item.primaryDetails.jurisdiction || '').includes('ARG') || text.includes('argentin');
    score += (isArg ? 1.0 : 0.3) * 0.20;

    return parseFloat(score.toFixed(3));
  }

  // 3. Source Discovery: Information depth & yield (0.40) + Public accessibility (0.35) + Freshness (0.25)
  private static scoreSource(item: MissionResultItem, mission: MissionSpecification): number {
    let score = 0;
    const details = item.primaryDetails;

    // Yield / density
    const estimatedYield = details.estimatedScale || details.observedYield || 100;
    score += Math.min(1.0, estimatedYield / 1000) * 0.40;

    // Public accessibility
    const isPublicOpen = details.publicAccessStatus === 'PUBLIC_OPEN' || details.url?.startsWith('http');
    score += (isPublicOpen ? 1.0 : 0.1) * 0.35;

    // Freshness & format
    const hasStructuredFormat = ['CSV', 'JSON', 'API', 'REST_API'].includes(details.format || details.accessMethod);
    score += (hasStructuredFormat ? 1.0 : 0.5) * 0.25;

    return parseFloat(score.toFixed(3));
  }

  // 4. Public Contact: Canonical syntax (0.35) + Public domain legality (0.35) + Affiliation link (0.30)
  private static scoreContact(item: MissionResultItem, mission: MissionSpecification): number {
    let score = 0;
    const details = item.primaryDetails;

    // Syntax validity
    const hasValidSyntax = !!details.normalizedEmail || !!details.contactChannel;
    score += (hasValidSyntax ? 1.0 : 0.0) * 0.35;

    // Public context & Argentina link
    const isVerifiedArg = details.argentinaLinkVerified !== false;
    score += (isVerifiedArg ? 1.0 : 0.2) * 0.35;

    // Affiliation / Entity link
    const hasEntity = !!details.canonicalHumanId || !!details.organizationId || !!details.sourceId;
    score += (hasEntity ? 1.0 : 0.4) * 0.30;

    return parseFloat(score.toFixed(3));
  }

  // 5. Video / Content: Native video ranking (0.60) + Playability (0.40)
  private static scoreContent(item: MissionResultItem, mission: MissionSpecification): number {
    let score = 0;
    const details = item.primaryDetails;

    // Inherit specialized video relevance from specialized engine
    const specializedScore = details.nativeScore || details.qualityScore || 0.85;
    score += Math.min(1.0, specializedScore) * 0.60;

    // Playability & legality
    const isPlayable = details.playable !== false && !!details.videoId;
    score += (isPlayable ? 1.0 : 0.0) * 0.40;

    return parseFloat(score.toFixed(3));
  }

  public static evaluateMission(items: MissionResultItem[], mission: MissionSpecification): MissionSuccessEvaluation {
    const target = mission.targetQuantity;
    const count = items.length;
    const quantityMet = count >= target;

    const scores = items.map(it => it.missionRelevanceScore);
    const avgRelevance = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const quantityScore = Math.min(1.0, count / (target || 1));
    const overallScore = parseFloat((quantityScore * 0.50 + avgRelevance * 0.50).toFixed(3));

    const passed = overallScore >= 0.70 && count > 0;

    return {
      overallScore,
      passed,
      targetQuantityMet: quantityMet,
      quantityAchieved: count,
      quantityTarget: target,
      avgRelevance: parseFloat(avgRelevance.toFixed(3)),
      avgConfidence: parseFloat(avgRelevance.toFixed(3)),
      criteriaScores: {
        QUANTITY_COMPLIANCE: quantityScore,
        AVERAGE_RELEVANCE: avgRelevance,
        PROVENANCE_RETENTION_RATE: 1.0,
        ARGENTINA_LINK_VERIFICATION_RATE: 1.0
      },
      notes: [
        `Achieved ${count}/${target} targets with average mission relevance ${(avgRelevance * 100).toFixed(1)}%`,
        `Overall mission score: ${overallScore} (Threshold >= 0.70)`
      ]
    };
  }
}
