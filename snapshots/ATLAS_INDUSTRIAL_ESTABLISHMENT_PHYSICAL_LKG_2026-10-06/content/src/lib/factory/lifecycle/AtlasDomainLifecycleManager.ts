/**
 * ATLAS DOMAIN LIFECYCLE MANAGER V1
 * 
 * Governs the advancement of generated domains across formal gates:
 * DRAFT -> SHADOW -> CANARY -> CERTIFIED -> ACTIVE
 * 
 * Strict Invariants (Correction 4):
 * - Search Factory can automatically advance up to CERTIFIED if physical gates pass.
 * - CERTIFIED -> ACTIVE strictly requires manual action (approveActivation).
 * - Direct jumps (e.g. DRAFT -> ACTIVE) are rejected.
 */

import type { DomainLifecycleRecord, DomainLifecycleState, DomainGateResult } from '../contracts/AtlasDomainLifecycle';
import { AtlasDomainSpecRepository } from '../storage/AtlasDomainSpecRepository';
import type { AtlasDomainSpecification } from '../contracts/AtlasDomainSpecification';

export class AtlasDomainLifecycleManager {
  private repository: AtlasDomainSpecRepository;

  constructor(repository: AtlasDomainSpecRepository) {
    this.repository = repository;
  }

  public initializeLifecycle(spec: AtlasDomainSpecification): DomainLifecycleRecord {
    const now = new Date().toISOString();
    const record: DomainLifecycleRecord = {
      domain_id: spec.domain_id,
      spec_version: spec.spec_version,
      generator_version: spec.generator_version,
      compiled_spec_hash: AtlasDomainSpecRepository.computeSpecHash(spec),
      current_state: 'DRAFT',
      created_at: now,
      updated_at: now,
      promotion_history: [
        {
          from_state: 'DRAFT',
          to_state: 'DRAFT',
          timestamp: now,
          approved_by: 'SEARCH_FACTORY_INIT',
          reason: 'Initial specification parsed and drafted'
        }
      ],
      gate_history: [],
      manual_overrides: {}
    };

    return record;
  }

  public advanceState(
    record: DomainLifecycleRecord,
    targetState: DomainLifecycleState,
    approvedBy: string,
    reason: string,
    gateResult?: DomainGateResult
  ): DomainLifecycleRecord {
    // Validate transitions
    const validTransitions: Record<DomainLifecycleState, DomainLifecycleState[]> = {
      'DRAFT': ['SHADOW', 'BLOCKED'],
      'SHADOW': ['CANARY', 'BLOCKED', 'DRAFT'],
      'CANARY': ['CERTIFIED', 'BLOCKED', 'SHADOW'],
      'CERTIFIED': ['ACTIVE', 'BLOCKED'],
      'ACTIVE': ['BLOCKED', 'CERTIFIED'],
      'BLOCKED': ['DRAFT', 'SHADOW']
    };

    const allowed = validTransitions[record.current_state] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`[AtlasDomainLifecycleManager] Invalid state transition from '${record.current_state}' to '${targetState}'.`);
    }

    // Correction 4: CERTIFIED -> ACTIVE strictly requires explicit human authorization
    if (record.current_state === 'CERTIFIED' && targetState === 'ACTIVE') {
      if (approvedBy === 'SYSTEM_FACTORY' || approvedBy === 'AUTO_PROMOTION') {
        throw new Error(`[AtlasDomainLifecycleManager] Automated transition to ACTIVE is forbidden in V1. Requires human operator APPROVE_ACTIVATION.`);
      }
    }

    const now = new Date().toISOString();
    const previousState = record.current_state;
    record.current_state = targetState;
    record.updated_at = now;

    if (targetState === 'CERTIFIED') {
      record.last_certified_at = now;
    }
    if (targetState === 'ACTIVE') {
      record.activated_at = now;
      record.activated_by = approvedBy;
    }

    record.promotion_history.push({
      from_state: previousState,
      to_state: targetState,
      timestamp: now,
      approved_by: approvedBy,
      reason
    });

    if (gateResult) {
      record.gate_history.push(gateResult);
    }

    return record;
  }

  /**
   * Human operator approves domain activation from Atlas Control Center
   */
  public approveActivation(
    spec: AtlasDomainSpecification,
    record: DomainLifecycleRecord,
    operatorEmail: string,
    notes: string
  ): DomainLifecycleRecord {
    const updated = this.advanceState(
      record,
      'ACTIVE',
      operatorEmail,
      `Explicit human activation approved from Control Center: ${notes}`
    );
    this.repository.saveDomain(spec, updated);
    return updated;
  }
}
