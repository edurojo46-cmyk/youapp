/**
 * Atlas Commerce V1 — Channel Policy Evaluator
 * Gate Zero: Enforces fail-closed channel dispatch rules.
 * Strict Rule: UNKNOWN = BLOCK. EMAIL = BLOCK by default.
 */

import { CommerceChannelType, VersionedChannelPolicy, ChannelPolicyStatus } from './types';

export class ChannelPolicyEngine {
  /**
   * Evaluates if a given channel is permitted to distribute affiliate links.
   * Fails closed: returns BLOCK if no policy exists, if policy is UNKNOWN, or if policy is explicitly BLOCK.
   */
  static evaluateChannel(
    channel: CommerceChannelType | string,
    policies: VersionedChannelPolicy[],
    evaluationTime: Date = new Date()
  ): { status: ChannelPolicyStatus; reason: string; policy_version?: string } {
    const isoTime = evaluationTime.toISOString();

    // Find active policy for channel
    const matchingPolicy = policies.find((p) => {
      if (p.channel !== channel) return false;
      if (p.effective_from > isoTime) return false;
      if (p.effective_to && p.effective_to < isoTime) return false;
      return true;
    });

    if (!matchingPolicy) {
      return {
        status: 'BLOCK',
        reason: `MISSING_POLICY: No active versioned policy found for channel '${channel}' (fail-closed)`
      };
    }

    if (matchingPolicy.policy_status === 'UNKNOWN') {
      return {
        status: 'BLOCK',
        reason: `UNKNOWN_POLICY_BLOCKED: Policy for '${channel}' has status UNKNOWN (fail-closed)`,
        policy_version: matchingPolicy.policy_version
      };
    }

    if (matchingPolicy.policy_status === 'BLOCK') {
      return {
        status: 'BLOCK',
        reason: `CHANNEL_BLOCKED: Channel '${channel}' is explicitly prohibited by policy version ${matchingPolicy.policy_version}`,
        policy_version: matchingPolicy.policy_version
      };
    }

    if (matchingPolicy.policy_status === 'ALLOW') {
      return {
        status: 'ALLOW',
        reason: `CHANNEL_ALLOWED: Channel '${channel}' permitted under policy version ${matchingPolicy.policy_version}`,
        policy_version: matchingPolicy.policy_version
      };
    }

    // Default safety fallback
    return {
      status: 'BLOCK',
      reason: `UNRECOGNIZED_STATUS: Default fail-closed fallback triggered for channel '${channel}'`
    };
  }

  /**
   * Returns default Gate Zero baseline policies for Mercado Libre Argentina.
   */
  static getBaselineMlaPolicies(): VersionedChannelPolicy[] {
    const now = new Date('2026-09-09T00:00:00Z').toISOString();
    return [
      {
        policy_id: 'pol-mla-web-v1',
        channel: 'OWN_PUBLIC_WEBSITE',
        policy_status: 'ALLOW',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/ayuda/30228',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        policy_id: 'pol-mla-social-v1',
        channel: 'OWN_PUBLIC_SOCIAL',
        policy_status: 'ALLOW',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/ayuda/30228',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        policy_id: 'pol-mla-email-v1',
        channel: 'EMAIL',
        policy_status: 'BLOCK',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        policy_id: 'pol-mla-sms-v1',
        channel: 'SMS',
        policy_status: 'BLOCK',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        policy_id: 'pol-mla-dm-v1',
        channel: 'PRIVATE_DM',
        policy_status: 'BLOCK',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      },
      {
        policy_id: 'pol-mla-group-v1',
        channel: 'CLOSED_GROUP',
        policy_status: 'BLOCK',
        policy_version: '2026-09-MLA-V1',
        source_url: 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas',
        observed_at: now,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
      }
    ];
  }
}
