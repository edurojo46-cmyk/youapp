/**
 * Atlas Demand Radar V1 — Source Capabilities Registry & Privacy Guards
 * Hardened Source-Native Semantics & Zero PII Enforcement
 */

import type { SourcePlatform, SourceCapability, DemandSignal } from './types';

export const SOURCE_CAPABILITIES_REGISTRY: Record<SourcePlatform, SourceCapability> = {
  GOOGLE_TRENDS_FAST: {
    platform: 'GOOGLE_TRENDS_FAST',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'SEARCH_INTEREST_INDEX',
    metric_unit: 'INDEX_0_100',
    default_measurement_window: 'WINDOW_10M',
    max_freshness_seconds: 1800, // 30 minutes max age for fast signals
    documentation_ref: 'https://support.google.com/trends/answer/3076011'
  },
  GOOGLE_TRENDS_SLOW: {
    platform: 'GOOGLE_TRENDS_SLOW',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'SEARCH_INTEREST_INDEX',
    metric_unit: 'INDEX_0_100',
    default_measurement_window: 'WINDOW_7D',
    max_freshness_seconds: 172800, // 48 hours for historical baseline
    documentation_ref: 'https://developers.google.com/search/blog/2025/07/trends-api'
  },
  X_TWITTER: {
    platform: 'X_TWITTER',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'PUBLIC_POST_COUNT',
    metric_unit: 'POST_COUNT',
    default_measurement_window: 'WINDOW_10M',
    max_freshness_seconds: 3600, // 1 hour
    documentation_ref: 'https://docs.x.com/x-api/posts/search-recent-posts'
  },
  YOUTUBE: {
    platform: 'YOUTUBE',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'CONTENT_PUBLICATION_SIGNAL',
    metric_unit: 'VIDEO_COUNT',
    default_measurement_window: 'WINDOW_24H',
    max_freshness_seconds: 7200, // 2 hours
    documentation_ref: 'https://developers.google.com/youtube/v3/docs/search/list'
  },
  NEWS_WEB: {
    platform: 'NEWS_WEB',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'ARTICLE_COUNT',
    metric_unit: 'ARTICLE_COUNT',
    default_measurement_window: 'WINDOW_24H',
    max_freshness_seconds: 14400, // 4 hours
    documentation_ref: 'Atlas News Harvester Registry'
  },
  MASTODON: {
    platform: 'MASTODON',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'PUBLIC_POST_COUNT',
    metric_unit: 'POST_COUNT',
    default_measurement_window: 'WINDOW_10M',
    max_freshness_seconds: 3600,
    documentation_ref: 'Mastodon Fediverse Public API'
  },
  BLUESKY: {
    platform: 'BLUESKY',
    capability_status: 'PROVEN',
    commercial_use_authorized: true,
    metric_kind: 'PUBLIC_POST_COUNT',
    metric_unit: 'POST_COUNT',
    default_measurement_window: 'WINDOW_10M',
    max_freshness_seconds: 3600,
    documentation_ref: 'Bluesky Jetstream Public Firehose'
  },
  TIKTOK_PUBLIC: {
    platform: 'TIKTOK_PUBLIC',
    capability_status: 'UNKNOWN',
    commercial_use_authorized: false, // Strict BLOCK: Research API is non-commercial/restricted
    metric_kind: 'PUBLIC_POST_COUNT',
    metric_unit: 'POST_COUNT',
    default_measurement_window: 'WINDOW_24H',
    max_freshness_seconds: 3600,
    documentation_ref: 'https://developers.tiktok.com/products/research-api'
  }
};

/**
 * Validates whether a source platform has a PROVEN and commercially authorized capability.
 * Fail-closed rule: UNKNOWN or DISABLED capabilities return BLOCK.
 */
export function validateSourceCapability(platform: SourcePlatform): {
  is_authorized: boolean;
  capability?: SourceCapability;
  rejection_reason?: string;
} {
  const cap = SOURCE_CAPABILITIES_REGISTRY[platform];
  if (!cap) {
    return {
      is_authorized: false,
      rejection_reason: `SOURCE_CAPABILITY_NOT_FOUND: Platform '${platform}' is unregistered in Atlas.`
    };
  }

  if (cap.capability_status !== 'PROVEN') {
    return {
      is_authorized: false,
      capability: cap,
      rejection_reason: `SOURCE_CAPABILITY_UNKNOWN: Platform '${platform}' status is '${cap.capability_status}' (Strict BLOCK).`
    };
  }

  if (!cap.commercial_use_authorized) {
    return {
      is_authorized: false,
      capability: cap,
      rejection_reason: `SOURCE_NOT_AUTHORIZED_COMMERCIAL: Platform '${platform}' is not authorized for commercial usage.`
    };
  }

  return {
    is_authorized: true,
    capability: cap
  };
}

/**
 * Checks signal freshness against capability SLA.
 */
export function isSignalFresh(signal: DemandSignal, nowIso?: string): {
  is_fresh: boolean;
  age_seconds: number;
  max_allowed_seconds: number;
} {
  const cap = SOURCE_CAPABILITIES_REGISTRY[signal.source_platform];
  const maxAllowed = cap ? cap.max_freshness_seconds : 3600;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const observedAt = new Date(signal.observed_at).getTime();

  const ageSeconds = Math.max(0, Math.floor((now - observedAt) / 1000));
  const isFresh = ageSeconds <= maxAllowed;

  return {
    is_fresh: isFresh,
    age_seconds: ageSeconds,
    max_allowed_seconds: maxAllowed
  };
}

/**
 * Zero PII Validator — strictly ensures query/topic payloads contain NO user-identifiable data:
 * - No email addresses
 * - No phone numbers or raw credit card numbers
 * - No IP addresses
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const IPV4_REGEX = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{1,4}\)?[\s-]?){2,5}\d{2,4}/;

export function validateZeroPii(text: string): {
  is_clean: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (EMAIL_REGEX.test(text)) {
    violations.push('EMAIL_PATTERN_DETECTED');
  }

  if (IPV4_REGEX.test(text)) {
    violations.push('IP_ADDRESS_PATTERN_DETECTED');
  }

  // Only trigger phone regex if there are at least 7 digits in total
  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount >= 7 && PHONE_REGEX.test(text)) {
    violations.push('PHONE_NUMBER_PATTERN_DETECTED');
  }

  return {
    is_clean: violations.length === 0,
    violations
  };
}
