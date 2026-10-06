/**
 * ATLAS ATTRIBUTE SOURCE RADAR V1
 * 
 * Extends the Penta-Resonance Radar with Attribute Richness Scoring.
 * 
 * Total Value Model:
 * SCALE_VALUE = potential new entities
 * DEPTH_VALUE = potential new verified attributes (Email, Profession, Geography, Social, Identity Corroboration)
 * ATLAS_SOURCE_TOTAL_VALUE = (SCALE_VALUE * 0.40) + (DEPTH_VALUE * 0.60)
 */

export interface SourceAttributeScoring {
  source_id: string;
  source_name: string;
  strategy: 'EXPLORER' | 'DEEP_MINER' | 'PROTOCOL_HUNTER' | 'REPLICATOR' | 'UNLOCKER';
  scale_potential_people: number;
  email_coverage_potential: number; // 0-100
  profession_coverage_potential: number; // 0-100
  geography_coverage_potential: number; // 0-100
  social_coverage_potential: number; // 0-100
  identity_corroboration_potential: number; // 0-100
  scale_value_score: number; // 0-100
  depth_value_score: number; // 0-100
  atlas_source_total_value: number; // 0-100
  strategic_recommendation: 'HIGH_PRIORITY_DEPTH' | 'BALANCED_SCALE_DEPTH' | 'VOLUME_FOCUSED' | 'HOLD';
}

export class AtlasAttributeSourceRadar {
  public static scoreSource(
    source_id: string,
    source_name: string,
    strategy: 'EXPLORER' | 'DEEP_MINER' | 'PROTOCOL_HUNTER' | 'REPLICATOR' | 'UNLOCKER',
    scalePeople: number,
    emailPotential: number,
    professionPotential: number,
    geographyPotential: number,
    socialPotential: number,
    identityPotential: number
  ): SourceAttributeScoring {
    // Depth value is a weighted combination of attribute potentials
    const depthScore = Number((
      (professionPotential * 0.30) +
      (identityPotential * 0.25) +
      (geographyPotential * 0.20) +
      (emailPotential * 0.15) +
      (socialPotential * 0.10)
    ).toFixed(2));

    // Scale score normalized against a 100k benchmark
    const scaleScore = Number((Math.min(100, (scalePeople / 100000) * 100)).toFixed(2));

    // Atlas Source Total Value (Strategic 40% Scale / 60% Depth weighting)
    const totalValue = Number(((scaleScore * 0.40) + (depthScore * 0.60)).toFixed(2));

    let recommendation: 'HIGH_PRIORITY_DEPTH' | 'BALANCED_SCALE_DEPTH' | 'VOLUME_FOCUSED' | 'HOLD' = 'BALANCED_SCALE_DEPTH';
    if (depthScore >= 80) {
      recommendation = 'HIGH_PRIORITY_DEPTH';
    } else if (scaleScore >= 70 && depthScore >= 50) {
      recommendation = 'BALANCED_SCALE_DEPTH';
    } else if (scaleScore >= 70) {
      recommendation = 'VOLUME_FOCUSED';
    } else {
      recommendation = 'HOLD';
    }

    return {
      source_id,
      source_name,
      strategy,
      scale_potential_people: scalePeople,
      email_coverage_potential: emailPotential,
      profession_coverage_potential: professionPotential,
      geography_coverage_potential: geographyPotential,
      social_coverage_potential: socialPotential,
      identity_corroboration_potential: identityPotential,
      scale_value_score: scaleScore,
      depth_value_score: depthScore,
      atlas_source_total_value: totalValue,
      strategic_recommendation: recommendation
    };
  }
}
