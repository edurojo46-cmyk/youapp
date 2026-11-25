/**
 * ATLAS COMMERCE SIMULATION_ONLY V1
 * Module: AtlasCommerceGate.ts
 * Path: src/lib/atlas/commerce/AtlasCommerceGate.ts
 * 
 * Strict Security Gate for Commerce Operations.
 * 
 * INVARIANT:
 * ATLAS_COMMERCE_MODE = 'SIMULATION'
 * EXTERNAL_API_CALLS = 'DISABLED'
 * REAL_OAUTH = 'DISABLED'
 * REAL_WEBHOOKS = 'DISABLED'
 * REAL_ORDER_READS = 'DISABLED'
 * REAL_ORDER_WRITES = 'DISABLED'
 * REAL_CHECKOUT = 'DISABLED'
 * REAL_PAYMENTS = 'DISABLED'
 * 
 * If ANY real connector or external operation is attempted, FAIL CLOSED immediately.
 */

export type CommerceMode = 'SIMULATION' | 'DISABLED';
export type GateFlagState = 'DISABLED' | 'ENABLED';

export interface CommerceGateConfig {
  atlas_commerce_mode: CommerceMode;
  external_api_calls: GateFlagState;
  real_oauth: GateFlagState;
  real_webhooks: GateFlagState;
  real_order_reads: GateFlagState;
  real_order_writes: GateFlagState;
  real_checkout: GateFlagState;
  real_payments: GateFlagState;
}

export class CommerceGateViolationError extends Error {
  public readonly code: string;
  public readonly attemptedAction: string;

  constructor(message: string, code: string, attemptedAction: string) {
    super(`[FAIL-CLOSED GATE] ${message} (Action: ${attemptedAction}, Code: ${code})`);
    this.name = 'CommerceGateViolationError';
    this.code = code;
    this.attemptedAction = attemptedAction;
  }
}

export class AtlasCommerceGate {
  private static instance: AtlasCommerceGate;

  // STRICT GLOBAL CONSTANTS
  public readonly ATLAS_COMMERCE_MODE: CommerceMode = 'SIMULATION';
  public readonly EXTERNAL_API_CALLS: GateFlagState = 'DISABLED';
  public readonly REAL_OAUTH: GateFlagState = 'DISABLED';
  public readonly REAL_WEBHOOKS: GateFlagState = 'DISABLED';
  public readonly REAL_ORDER_READS: GateFlagState = 'DISABLED';
  public readonly REAL_ORDER_WRITES: GateFlagState = 'DISABLED';
  public readonly REAL_CHECKOUT: GateFlagState = 'DISABLED';
  public readonly REAL_PAYMENTS: GateFlagState = 'DISABLED';

  // Audit counters
  private externalCallsAttempted: number = 0;
  private realOauthAttempted: number = 0;
  private realWebhooksAttempted: number = 0;
  private realOrdersAttempted: number = 0;
  private realPaymentsAttempted: number = 0;

  private constructor() {
    this.assertFailClosedIntegrity();
  }

  public static getInstance(): AtlasCommerceGate {
    if (!AtlasCommerceGate.instance) {
      AtlasCommerceGate.instance = new AtlasCommerceGate();
    }
    return AtlasCommerceGate.instance;
  }

  /**
   * Asserts the gate's compile-time and runtime integrity.
   * If any real commerce capability is accidentally enabled, throws immediately (FAIL CLOSED).
   */
  public assertFailClosedIntegrity(): void {
    if (this.ATLAS_COMMERCE_MODE !== 'SIMULATION') {
      throw new CommerceGateViolationError(
        'ATLAS_COMMERCE_MODE must be strictly SIMULATION.',
        'ERR_INVALID_COMMERCE_MODE',
        'INIT'
      );
    }
    if (this.EXTERNAL_API_CALLS !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'EXTERNAL_API_CALLS must be strictly DISABLED.',
        'ERR_EXTERNAL_API_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_OAUTH !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_OAUTH must be strictly DISABLED.',
        'ERR_REAL_OAUTH_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_WEBHOOKS !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_WEBHOOKS must be strictly DISABLED.',
        'ERR_REAL_WEBHOOKS_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_ORDER_READS !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_ORDER_READS must be strictly DISABLED.',
        'ERR_REAL_ORDER_READS_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_ORDER_WRITES !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_ORDER_WRITES must be strictly DISABLED.',
        'ERR_REAL_ORDER_WRITES_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_CHECKOUT !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_CHECKOUT must be strictly DISABLED.',
        'ERR_REAL_CHECKOUT_NOT_DISABLED',
        'INIT'
      );
    }
    if (this.REAL_PAYMENTS !== 'DISABLED') {
      throw new CommerceGateViolationError(
        'REAL_PAYMENTS must be strictly DISABLED.',
        'ERR_REAL_PAYMENTS_NOT_DISABLED',
        'INIT'
      );
    }
  }

  /**
   * Intercepts and blocks any real external API request.
   */
  public blockExternalCall(destination: string, payload?: any): never {
    this.externalCallsAttempted++;
    throw new CommerceGateViolationError(
      `External API calls are blocked in SIMULATION mode (Target: ${destination}).`,
      'FAIL_CLOSED_EXTERNAL_API',
      destination
    );
  }

  /**
   * Intercepts and blocks any real OAuth attempt.
   */
  public blockRealOAuth(provider: string): never {
    this.realOauthAttempted++;
    throw new CommerceGateViolationError(
      `Real OAuth flows are blocked in SIMULATION mode (Provider: ${provider}).`,
      'FAIL_CLOSED_REAL_OAUTH',
      provider
    );
  }

  /**
   * Intercepts and blocks any real webhook listener or subscription.
   */
  public blockRealWebhook(endpoint: string): never {
    this.realWebhooksAttempted++;
    throw new CommerceGateViolationError(
      `Real webhooks are blocked in SIMULATION mode (Endpoint: ${endpoint}).`,
      'FAIL_CLOSED_REAL_WEBHOOK',
      endpoint
    );
  }

  /**
   * Intercepts and blocks any real order creation or mutation.
   */
  public blockRealOrder(orderId: string, action: string): never {
    this.realOrdersAttempted++;
    throw new CommerceGateViolationError(
      `Real order operations are blocked in SIMULATION mode (Order: ${orderId}, Action: ${action}).`,
      'FAIL_CLOSED_REAL_ORDER',
      action
    );
  }

  /**
   * Intercepts and blocks any real payment processing.
   */
  public blockRealPayment(amount: number, currency: string): never {
    this.realPaymentsAttempted++;
    throw new CommerceGateViolationError(
      `Real payments are strictly blocked in SIMULATION mode (Amount: ${amount} ${currency}).`,
      'FAIL_CLOSED_REAL_PAYMENT',
      'PAYMENT_ATTEMPT'
    );
  }

  /**
   * Returns current gate telemetry.
   */
  public getTelemetry() {
    return {
      ATLAS_COMMERCE_MODE: this.ATLAS_COMMERCE_MODE,
      EXTERNAL_API_CALLS: this.EXTERNAL_API_CALLS,
      REAL_OAUTH: this.REAL_OAUTH,
      REAL_WEBHOOKS: this.REAL_WEBHOOKS,
      REAL_ORDER_READS: this.REAL_ORDER_READS,
      REAL_ORDER_WRITES: this.REAL_ORDER_WRITES,
      REAL_CHECKOUT: this.REAL_CHECKOUT,
      REAL_PAYMENTS: this.REAL_PAYMENTS,
      counters: {
        external_calls_attempted: this.externalCallsAttempted,
        real_oauth_attempted: this.realOauthAttempted,
        real_webhooks_attempted: this.realWebhooksAttempted,
        real_orders_attempted: this.realOrdersAttempted,
        real_payments_attempted: this.realPaymentsAttempted
      },
      status: 'GATE_ENFORCED_FAIL_CLOSED'
    };
  }
}
