/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: MissionGraph (Section 5)
 * 
 * Represents each objective as a formal execution DAG:
 * MISSION -> SUBGOALS -> DEPENDENCIES -> STRATEGIES -> ACTIONS -> EVIDENCE -> RESULTS
 */

import type { MissionSpecification, SubgoalNode, StrategyPlan } from './types.ts';

export class MissionGraph {
  public mission: MissionSpecification;
  public subgoals: Map<string, SubgoalNode>;
  public executionOrder: string[];

  constructor(mission: MissionSpecification) {
    this.mission = mission;
    this.subgoals = new Map();
    this.executionOrder = [];
    this.buildGraph();
  }

  private buildGraph() {
    const m = this.mission;

    if (m.objectiveType === 'EXPERT_DISCOVERY') {
      this.addSubgoal({
        id: 'SUB_DOMAIN_EXPANSION',
        title: 'Identify Domain Topics and Keywords',
        description: 'Expand target technical field into specific sub-disciplines and keywords',
        status: 'PENDING',
        dependencies: [],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_SOURCE_IDENTIFICATION',
        title: 'Identify Knowledge Reservoirs',
        description: 'Identify specialized academic, institutional and professional source repositories',
        status: 'PENDING',
        dependencies: ['SUB_DOMAIN_EXPANSION'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_CANDIDATE_ACQUISITION',
        title: 'Acquire Candidate People',
        description: 'Call People Search adapter to retrieve identity-resolved professional records',
        status: 'PENDING',
        dependencies: ['SUB_SOURCE_IDENTIFICATION'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_EXPERTISE_VERIFICATION',
        title: 'Verify Domain Expertise Evidence',
        description: 'Validate publication record, institutional affiliation, and peer activity',
        status: 'PENDING',
        dependencies: ['SUB_CANDIDATE_ACQUISITION'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_MISSION_SYNTHESIS',
        title: 'Score and Assemble Final Expert Set',
        description: 'Score candidates against mission success function and verify provenance',
        status: 'PENDING',
        dependencies: ['SUB_EXPERTISE_VERIFICATION'],
        evidenceCollected: []
      });
    } else if (m.objectiveType === 'ORGANIZATION_DISCOVERY') {
      this.addSubgoal({
        id: 'SUB_SECTOR_TAXONOMY',
        title: 'Map Sector Taxonomy & Classifications',
        description: 'Define industrial/economic codes and qualifying business activities',
        status: 'PENDING',
        dependencies: [],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_REGISTRY_SEARCH',
        title: 'Query Public Corporate & Cooperative Registries',
        description: 'Search official registries, chambers of commerce, and industrial clusters',
        status: 'PENDING',
        dependencies: ['SUB_SECTOR_TAXONOMY'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_ACTIVITY_VERIFICATION',
        title: 'Verify Physical Entity & Economic Activity',
        description: 'Validate official CUIT/jurisdiction and active sector presence',
        status: 'PENDING',
        dependencies: ['SUB_REGISTRY_SEARCH'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_MISSION_SYNTHESIS',
        title: 'Assemble Verified Organization Dossier',
        description: 'Score organizational relevance and verify physical provenance',
        status: 'PENDING',
        dependencies: ['SUB_ACTIVITY_VERIFICATION'],
        evidenceCollected: []
      });
    } else if (m.objectiveType === 'SOURCE_DISCOVERY') {
      this.addSubgoal({
        id: 'SUB_TOPIC_RESERVOIR_SEARCH',
        title: 'Search Atlas Source Graph & Open Data Catalogs',
        description: 'Query known map and public CKAN portals for relevant topic datasets',
        status: 'PENDING',
        dependencies: [],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_ACCESSIBILITY_PROBE',
        title: 'Probe Public Endpoint Accessibility',
        description: 'Verify public status, HTTP response, format (CSV/JSON/API), and freshness',
        status: 'PENDING',
        dependencies: ['SUB_TOPIC_RESERVOIR_SEARCH'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_YIELD_EVALUATION',
        title: 'Evaluate Data Density & Target Relevance',
        description: 'Measure content yield and verify absence of access restrictions',
        status: 'PENDING',
        dependencies: ['SUB_ACCESSIBILITY_PROBE'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_MISSION_SYNTHESIS',
        title: 'Rank and Catalog Verified Public Sources',
        description: 'Rank by information yield, freshness, and public reliability',
        status: 'PENDING',
        dependencies: ['SUB_YIELD_EVALUATION'],
        evidenceCollected: []
      });
    } else if (m.objectiveType === 'PUBLIC_CONTACT_DISCOVERY') {
      this.addSubgoal({
        id: 'SUB_TARGET_DIRECTORY_MAPPING',
        title: 'Map Target Institutional Entities',
        description: 'Identify official organizations and departmental units holding contacts',
        status: 'PENDING',
        dependencies: [],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_PUBLIC_CHANNEL_EXTRACTION',
        title: 'Extract Physically Published Channels',
        description: 'Extract literal public professional emails, phones, or desk links',
        status: 'PENDING',
        dependencies: ['SUB_TARGET_DIRECTORY_MAPPING'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_CONTACT_VALIDATION',
        title: 'Validate Syntax, Legality & Public Context',
        description: 'Verify non-private status, Argentina linkage, and canonical format',
        status: 'PENDING',
        dependencies: ['SUB_PUBLIC_CHANNEL_EXTRACTION'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_MISSION_SYNTHESIS',
        title: 'Compile Verified Public Contact Registry',
        description: 'Retain complete observation provenance and deduplicate contacts',
        status: 'PENDING',
        dependencies: ['SUB_CONTACT_VALIDATION'],
        evidenceCollected: []
      });
    } else {
      // CONTENT_DISCOVERY (Video / Audiovisual)
      this.addSubgoal({
        id: 'SUB_CONTENT_INTENT_ANALYSIS',
        title: 'Analyze Audiovisual Intent & Entities',
        description: 'Decompose topic into primary media entities, works, and document types',
        status: 'PENDING',
        dependencies: [],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_VIDEO_SEARCH_EXECUTION',
        title: 'Execute Video Search via Specialized Engine',
        description: 'Call Video Search Adapter without altering internal ranking or indices',
        status: 'PENDING',
        dependencies: ['SUB_CONTENT_INTENT_ANALYSIS'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_PLAYABILITY_GATE',
        title: 'Verify Playability & Source Legality',
        description: 'Check playback metadata, quality score, and public streaming accessibility',
        status: 'PENDING',
        dependencies: ['SUB_VIDEO_SEARCH_EXECUTION'],
        evidenceCollected: []
      });

      this.addSubgoal({
        id: 'SUB_MISSION_SYNTHESIS',
        title: 'Assemble Verified Content Playlist',
        description: 'Aggregate verified audiovisual results with native specialized scores',
        status: 'PENDING',
        dependencies: ['SUB_PLAYABILITY_GATE'],
        evidenceCollected: []
      });
    }
  }

  private addSubgoal(node: SubgoalNode) {
    this.subgoals.set(node.id, node);
    this.executionOrder.push(node.id);
  }

  public getNextExecutableSubgoal(): SubgoalNode | null {
    for (const id of this.executionOrder) {
      const node = this.subgoals.get(id)!;
      if (node.status === 'PENDING') {
        const canExecute = node.dependencies.every(depId => {
          const dep = this.subgoals.get(depId);
          return dep && dep.status === 'COMPLETED';
        });
        if (canExecute) return node;
      }
    }
    return null;
  }

  public completeSubgoal(id: string, resultData?: any) {
    const node = this.subgoals.get(id);
    if (node) {
      node.status = 'COMPLETED';
      node.resultData = resultData;
    }
  }

  public failSubgoal(id: string, reason?: string) {
    const node = this.subgoals.get(id);
    if (node) {
      node.status = 'FAILED';
      node.resultData = { failureReason: reason };
    }
  }

  public isComplete(): boolean {
    return Array.from(this.subgoals.values()).every(n => n.status === 'COMPLETED');
  }

  public hasFailures(): boolean {
    return Array.from(this.subgoals.values()).some(n => n.status === 'FAILED');
  }
}
