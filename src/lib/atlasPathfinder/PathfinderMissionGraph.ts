/**
 * ATLAS — AI PATHFINDER V1
 * Module: PathfinderMissionGraph (Section 5)
 * 
 * Formal DAG representation:
 * OBJECTIVE → SUBGOALS → REQUIRED FIELDS → STRATEGIES → PATHS → ACTIONS → EVIDENCE → DATABASE UPDATES
 */

import type {
  ObjectiveAnalysis,
  PathPlan,
  PathfinderAction
} from './types.ts';

export interface GraphNode {
  id: string;
  title: string;
  associatedFields: string[];
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
  dependencies: string[];
  activePathId?: string;
}

export class PathfinderMissionGraph {
  public subgoals: Map<string, GraphNode> = new Map();
  public executionOrder: string[] = [];

  constructor(analysis: ObjectiveAnalysis, initialPath: PathPlan) {
    this.buildGraph(analysis, initialPath);
  }

  private buildGraph(analysis: ObjectiveAnalysis, initialPath: PathPlan) {
    const requiredFieldNames = analysis.schema.fields.filter(f => f.required).map(f => f.name);

    // Subgoal 1: Atlas Memory & Strategy Lookup
    this.addNode({
      id: 'SUB_ATLAS_MEMORY_PRIORS',
      title: 'Consult Atlas Memory & Knowledge Universe',
      associatedFields: [],
      status: 'PENDING',
      dependencies: [],
      activePathId: initialPath.pathId
    });

    // Subgoal 2: Entity Discovery & Candidate Acquisition
    this.addNode({
      id: 'SUB_ENTITY_DISCOVERY',
      title: 'Acquire Target Entities via Specialized Engine',
      associatedFields: [analysis.schema.primaryKeyField, analysis.schema.canonicalRelationField],
      status: 'PENDING',
      dependencies: ['SUB_ATLAS_MEMORY_PRIORS'],
      activePathId: initialPath.pathId
    });

    // Subgoal 3: Attribute & Relevance Enrichment
    this.addNode({
      id: 'SUB_FIELD_ENRICHMENT',
      title: 'Enrich Required Schema Fields',
      associatedFields: requiredFieldNames,
      status: 'PENDING',
      dependencies: ['SUB_ENTITY_DISCOVERY'],
      activePathId: initialPath.pathId
    });

    // Subgoal 4: Evidence Gate Validation & Provenance Attestation
    this.addNode({
      id: 'SUB_EVIDENCE_VALIDATION',
      title: 'Validate Physical Provenance & Linkage',
      associatedFields: ['verification_status', 'evidence_sources', 'relevance_evidence'],
      status: 'PENDING',
      dependencies: ['SUB_FIELD_ENRICHMENT'],
      activePathId: initialPath.pathId
    });

    // Subgoal 5: Database Synthesis & Mission Closure
    this.addNode({
      id: 'SUB_DATABASE_SYNTHESIS',
      title: 'Persist & Certify Mission Database',
      associatedFields: analysis.schema.fields.map(f => f.name),
      status: 'PENDING',
      dependencies: ['SUB_EVIDENCE_VALIDATION'],
      activePathId: initialPath.pathId
    });
  }

  private addNode(node: GraphNode) {
    this.subgoals.set(node.id, node);
    this.executionOrder.push(node.id);
  }

  public getNextExecutableSubgoal(): GraphNode | null {
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

  public completeSubgoal(id: string) {
    const node = this.subgoals.get(id);
    if (node) node.status = 'COMPLETED';
  }

  public isComplete(): boolean {
    return Array.from(this.subgoals.values()).every(n => n.status === 'COMPLETED');
  }

  public getCompletedSubgoals(): string[] {
    return Array.from(this.subgoals.values())
      .filter(n => n.status === 'COMPLETED')
      .map(n => n.title);
  }
}
