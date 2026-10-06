/**
 * ATLAS DOMAIN LIFECYCLE & STATE MACHINE V1
 * 
 * Manages progression of generated domains through formal quality gates:
 * DRAFT -> SHADOW -> CANARY -> CERTIFIED -> ACTIVE (requires manual approval)
 * 
 * Invariants:
 * - Direct jump DRAFT -> ACTIVE is strictly forbidden.
 * - CERTIFIED is the maximum automated state achievable by Search Factory.
 * - ACTIVE requires explicit human action (APPROVE_ACTIVATION).
 */

export type DomainLifecycleState = 
  | 'DRAFT'
  | 'SHADOW'
  | 'CANARY'
  | 'CERTIFIED'
  | 'ACTIVE'
  | 'BLOCKED';

export interface DomainGateResult {
  gate_name: string;
  passed: boolean;
  timestamp: string;
  score?: number;
  details: string;
  evidence_attached?: Record<string, any>;
}

export interface DomainLifecycleRecord {
  domain_id: string;
  spec_version: string;
  generator_version: string;
  compiled_spec_hash: string;
  current_state: DomainLifecycleState;
  created_at: string;
  updated_at: string;
  last_certified_at?: string;
  activated_at?: string;
  activated_by?: string;
  blocked_reason?: string;
  promotion_history: {
    from_state: DomainLifecycleState;
    to_state: DomainLifecycleState;
    timestamp: string;
    approved_by: string; // 'SYSTEM_FACTORY' | user_email
    reason: string;
  }[];
  gate_history: DomainGateResult[];
  manual_overrides: Record<string, any>;
}
