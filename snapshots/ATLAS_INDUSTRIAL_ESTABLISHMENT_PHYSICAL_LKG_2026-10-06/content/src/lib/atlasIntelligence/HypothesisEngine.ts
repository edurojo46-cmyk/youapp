/**
 * ATLAS — HYPOTHESIS ENGINE V1
 * Multi-Hypothesis Formulation & Test Plan Design
 * 
 * Invariants:
 * 1. Never relies on a single AI hypothesis.
 * 2. Formulates competing hypotheses with falsifiable test plans.
 * 3. Assigns priors based on ExperienceMemory and active MetaRules.
 */

import type { OperationalHypothesis, DomainCategory } from './types.ts';
import { MetaRuleEngine } from './MetaRuleEngine.ts';
import { ExperienceMemory } from './ExperienceMemory.ts';

export class HypothesisEngine {
  private static instance: HypothesisEngine;
  private ruleEngine: MetaRuleEngine;
  private memory: ExperienceMemory;
  private totalHypothesesGenerated: number = 0;

  private constructor() {
    this.ruleEngine = MetaRuleEngine.getInstance();
    this.memory = ExperienceMemory.getInstance();
  }

  public static getInstance(): HypothesisEngine {
    if (!this.instance) {
      this.instance = new HypothesisEngine();
    }
    return this.instance;
  }

  /**
   * Generates competing operational hypotheses for a target institution or domain
   */
  public generateCompetingHypotheses(target: {
    domain: string;
    domainType: DomainCategory;
    hasKnownSitemap?: boolean;
    hasKnownRosters?: boolean;
  }): OperationalHypothesis[] {
    const applicableRules = this.ruleEngine.matchApplicableRules({
      surfaceCollisionRisk: 0.90,
      depthAvailable: true,
      domainType: target.domainType
    });

    const deepRule = applicableRules.find(r => r.ruleId === 'RULE_DEEP_ENTITY_UNIVERSE_OVER_SURFACE');
    const deepConfidence = deepRule ? deepRule.confidence : 0.60;

    const hypotheses: OperationalHypothesis[] = [
      {
        hypothesisId: `HYP_SURFACE_${target.domain.replace(/\./g, '_')}`,
        description: `Explore surface contact page (https://${target.domain}/contacto)`,
        predictedAction: 'HARVEST_SURFACE_CONTACT_PAGE',
        priorConfidence: 0.05, // heavily penalized by past collision experience EXP_001
        rationale: 'Traditional approach of checking root contact page. High probability of 95%+ baseline overlap.',
        testPlan: {
          probeUrl: `https://${target.domain}/contacto`,
          protocol: 'HTTPS',
          maxPages: 2
        }
      },
      {
        hypothesisId: `HYP_DEEP_ROSTER_${target.domain.replace(/\./g, '_')}`,
        description: `Explore deep departmental faculty/staff roster (https://${target.domain}/docentes or autoridades)`,
        predictedAction: 'HARVEST_DEEP_FACULTY_ROSTER',
        priorConfidence: deepConfidence,
        rationale: 'Supported by RULE_DEEP_ENTITY_UNIVERSE_OVER_SURFACE (confidence ' + deepConfidence.toFixed(2) + '). Uncovers internal person contacts with low baseline overlap.',
        testPlan: {
          probeUrl: `https://www.${target.domain}/institucional/autoridades`,
          protocol: 'HTTPS',
          maxPages: 4
        }
      },
      {
        hypothesisId: `HYP_SITEMAP_INDEX_${target.domain.replace(/\./g, '_')}`,
        description: `Explore structural XML sitemap network (https://${target.domain}/sitemap.xml)`,
        predictedAction: 'HARVEST_SITEMAP_NETWORK',
        priorConfidence: deepConfidence * 0.95,
        rationale: 'Uncovers hundreds of department subpages and organizational units, bypassing surface saturation.',
        testPlan: {
          probeUrl: `https://${target.domain}/sitemap.xml`,
          protocol: 'SITEMAP',
          maxPages: 6
        }
      }
    ];

    this.totalHypothesesGenerated += hypotheses.length;
    return hypotheses;
  }

  /**
   * Generates hypotheses from arbitrary candidate path options for an unseen situation
   */
  public generateHypothesesForCandidates(target: {
    domain: string;
    domainType: DomainCategory;
    candidates: { id: string; label: string; url: string; expectedStrategy: string; protocol?: string }[];
  }): OperationalHypothesis[] {
    const list: OperationalHypothesis[] = [];
    for (const c of target.candidates) {
      list.push({
        hypothesisId: c.id,
        description: c.label,
        predictedAction: c.expectedStrategy,
        priorConfidence: 0.33,
        rationale: `Plausible candidate strategy: ${c.label} on ${target.domain}`,
        testPlan: {
          probeUrl: c.url,
          protocol: c.protocol || 'HTTPS',
          maxPages: 2
        }
      });
    }
    this.totalHypothesesGenerated += list.length;
    return list;
  }

  public getTotalHypothesesGenerated(): number {
    return this.totalHypothesesGenerated;
  }
}
