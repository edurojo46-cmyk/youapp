import { SupabaseClient } from '@supabase/supabase-js';
import { ThrottlingProfile } from './types';

export interface DomainThrottleState {
  domain: string;
  currentRatePerMinute: number;
  currentBackoffSeconds: number;
  activeConnections: number;
  lastDeferralTimestamp?: number;
  status: 'HEALTHY' | 'THROTTLED' | 'DEGRADED' | 'SUSPENDED';
}

export class AtlasMailDomainThrottler {
  private inMemoryProfiles: Map<string, ThrottlingProfile> = new Map();
  private domainStates: Map<string, DomainThrottleState> = new Map();

  constructor(private supabase?: SupabaseClient) {
    this.initDefaultProfiles();
  }

  private initDefaultProfiles(): void {
    const defaults: ThrottlingProfile[] = [
      {
        domain_pattern: 'default',
        provider_family: 'GENERIC',
        max_messages_per_minute: 30,
        max_concurrent_connections: 2,
        max_messages_per_connection: 10,
        initial_backoff_seconds: 60,
        max_backoff_seconds: 3600,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'gmail.com',
        provider_family: 'GOOGLE',
        max_messages_per_minute: 120,
        max_concurrent_connections: 10,
        max_messages_per_connection: 50,
        initial_backoff_seconds: 60,
        max_backoff_seconds: 3600,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'googlemail.com',
        provider_family: 'GOOGLE',
        max_messages_per_minute: 120,
        max_concurrent_connections: 10,
        max_messages_per_connection: 50,
        initial_backoff_seconds: 60,
        max_backoff_seconds: 3600,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'outlook.com',
        provider_family: 'MICROSOFT',
        max_messages_per_minute: 60,
        max_concurrent_connections: 5,
        max_messages_per_connection: 20,
        initial_backoff_seconds: 120,
        max_backoff_seconds: 7200,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'hotmail.com',
        provider_family: 'MICROSOFT',
        max_messages_per_minute: 60,
        max_concurrent_connections: 5,
        max_messages_per_connection: 20,
        initial_backoff_seconds: 120,
        max_backoff_seconds: 7200,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'yahoo.com',
        provider_family: 'YAHOO',
        max_messages_per_minute: 60,
        max_concurrent_connections: 4,
        max_messages_per_connection: 20,
        initial_backoff_seconds: 180,
        max_backoff_seconds: 7200,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      },
      {
        domain_pattern: 'icloud.com',
        provider_family: 'APPLE',
        max_messages_per_minute: 40,
        max_concurrent_connections: 3,
        max_messages_per_connection: 10,
        initial_backoff_seconds: 300,
        max_backoff_seconds: 7200,
        retry_window_seconds: 86400,
        degradation_status: 'HEALTHY',
        is_active: true
      }
    ];

    for (const p of defaults) {
      this.inMemoryProfiles.set(p.domain_pattern.toLowerCase(), p);
    }
  }

  /**
   * Helper to normalize input to domain name
   */
  public extractDomain(emailOrDomain: string): string {
    const trimmed = emailOrDomain.toLowerCase().trim();
    if (trimmed.includes('@')) {
      return trimmed.split('@')[1];
    }
    return trimmed;
  }

  /**
   * Loads throttling profiles from database.
   */
  async loadProfiles(): Promise<void> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('atlas_mail_fabric_throttling_profiles')
        .select('*')
        .eq('is_active', true);

      if (!error && data) {
        for (const p of data) {
          this.inMemoryProfiles.set(p.domain_pattern.toLowerCase(), p as ThrottlingProfile);
        }
      }
    }
  }

  /**
   * Sets or updates a dynamic profile for a domain or MX provider family.
   */
  public setProfile(profile: ThrottlingProfile): void {
    this.inMemoryProfiles.set(profile.domain_pattern.toLowerCase(), profile);
  }

  /**
   * Resolves the best matching profile for a recipient domain.
   */
  public getProfileForDomain(emailOrDomain: string): ThrottlingProfile {
    const domain = this.extractDomain(emailOrDomain);
    if (this.inMemoryProfiles.has(domain)) {
      return this.inMemoryProfiles.get(domain)!;
    }
    return this.inMemoryProfiles.get('default')!;
  }

  /**
   * Checks if an email can be sent immediately to the destination domain.
   */
  public checkRateLimit(emailOrDomain: string): { allowed: boolean; backoffSeconds: number; reason?: string } {
    const domain = this.extractDomain(emailOrDomain);
    const profile = this.getProfileForDomain(domain);
    const state = this.domainStates.get(domain) || {
      domain,
      currentRatePerMinute: 0,
      currentBackoffSeconds: 0,
      activeConnections: 0,
      status: 'HEALTHY'
    };

    if (state.status === 'SUSPENDED') {
      return { allowed: false, backoffSeconds: profile.max_backoff_seconds, reason: 'DOMAIN_SUSPENDED' };
    }

    if (state.currentBackoffSeconds > 0 && state.lastDeferralTimestamp) {
      const elapsed = (Date.now() - state.lastDeferralTimestamp) / 1000;
      if (elapsed < state.currentBackoffSeconds) {
        return {
          allowed: false,
          backoffSeconds: Math.ceil(state.currentBackoffSeconds - elapsed),
          reason: 'DOMAIN_THROTTLED_BACKOFF'
        };
      }
    }

    return { allowed: true, backoffSeconds: 0 };
  }

  /**
   * Reports a 4xx deferral from a receiver MX (e.g. 421 Rate limit exceeded).
   * Applies adaptive exponential backoff up to max_backoff_seconds.
   */
  public reportDeferral(emailOrDomain: string, _responseCode: number): void {
    const domain = this.extractDomain(emailOrDomain);
    const profile = this.getProfileForDomain(domain);
    const state = this.domainStates.get(domain) || {
      domain,
      currentRatePerMinute: 0,
      currentBackoffSeconds: 0,
      activeConnections: 0,
      status: 'HEALTHY'
    };

    let nextBackoff = state.currentBackoffSeconds === 0 
      ? profile.initial_backoff_seconds 
      : Math.min(state.currentBackoffSeconds * 2, profile.max_backoff_seconds);

    state.currentBackoffSeconds = nextBackoff;
    state.lastDeferralTimestamp = Date.now();
    state.status = 'THROTTLED';

    this.domainStates.set(domain, state);
  }

  /**
   * Reports a successful 250 OK delivery to relax backoff.
   */
  public reportSuccess(emailOrDomain: string): void {
    const domain = this.extractDomain(emailOrDomain);
    const state = this.domainStates.get(domain);
    if (state && state.currentBackoffSeconds > 0) {
      state.currentBackoffSeconds = Math.max(0, state.currentBackoffSeconds - 10);
      if (state.currentBackoffSeconds === 0) {
        state.status = 'HEALTHY';
      }
    }
  }
}
