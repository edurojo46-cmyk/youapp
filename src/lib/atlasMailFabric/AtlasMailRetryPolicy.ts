export interface RetryDecision {
  shouldRetry: boolean;
  nextAttemptSeconds: number;
  reason: string;
}

export class AtlasMailRetryPolicy {
  /**
   * Evaluates if a failed delivery attempt should be retried.
   * Strictly forbids retrying permanent failures (5xx, hard bounces, suppressions, complaints).
   */
  public static evaluateRetry(
    statusCode: number | string,
    attemptCount: number,
    enqueuedAt: Date,
    maxAttempts = 5,
    maxAgeHours = 24
  ): RetryDecision {
    const numCode = typeof statusCode === 'string' ? parseInt(statusCode, 10) : statusCode;
    const now = Date.now();
    const elapsedHours = (now - enqueuedAt.getTime()) / (1000 * 60 * 60);

    // 1. Check Maximum Queue Age
    if (elapsedHours >= maxAgeHours) {
      return {
        shouldRetry: false,
        nextAttemptSeconds: 0,
        reason: 'EXPIRED_MAX_QUEUE_AGE'
      };
    }

    // 2. Permanent Failures (5xx, HARD_BOUNCE, COMPLAINT, INVALID_RECIPIENT)
    if (
      (numCode >= 500 && numCode < 600) ||
      statusCode === 'HARD_BOUNCE' ||
      statusCode === 'COMPLAINT' ||
      statusCode === 'SUPPRESSED' ||
      statusCode === 'INVALID_RECIPIENT'
    ) {
      return {
        shouldRetry: false,
        nextAttemptSeconds: 0,
        reason: 'PERMANENT_FAILURE_NO_RETRY'
      };
    }

    // 3. Max Attempts Exceeded
    if (attemptCount >= maxAttempts) {
      return {
        shouldRetry: false,
        nextAttemptSeconds: 0,
        reason: 'MAX_RETRY_ATTEMPTS_EXCEEDED'
      };
    }

    // 4. Temporary Failures (4xx, TIMEOUT, DEFERRAL) -> Exponential backoff with jitter
    if ((numCode >= 400 && numCode < 500) || statusCode === 'TIMEOUT' || statusCode === 'DEFERRAL') {
      // Base backoff: 30s * 2^(attemptCount - 1) + jitter
      const baseBackoff = Math.min(30 * Math.pow(2, attemptCount - 1), 3600);
      const jitter = Math.floor(Math.random() * 10);
      const delay = baseBackoff + jitter;

      return {
        shouldRetry: true,
        nextAttemptSeconds: delay,
        reason: 'TEMPORARY_FAILURE_RETRY_SCHEDULED'
      };
    }

    // Default fail-closed
    return {
      shouldRetry: false,
      nextAttemptSeconds: 0,
      reason: 'UNKNOWN_FAILURE_FAIL_CLOSED'
    };
  }
}
