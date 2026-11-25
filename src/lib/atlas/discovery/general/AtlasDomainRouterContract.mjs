/**
 * src/lib/atlas/discovery/general/AtlasDomainRouterContract.mjs
 * 
 * ATLAS DOMAIN ROUTER CONTRACT (CONTROL PLANE INTERFACE)
 * 
 * Architecture:
 * SOURCE SURFACE -> ACQUISITION MOTOR -> NORMALIZED SOURCE ITEM -> DOMAIN ROUTER
 *                                                                ├── People Domain Router (Candidate + Evidence)
 *                                                                ├── Video Domain Router (Reference + Media Asset)
 *                                                                ├── Business Domain Router (Future: Corporate Entity)
 *                                                                └── Events Domain Router (Future: Civic / Temporal Event)
 * 
 * Invariants:
 * - FETCH ONCE, NORMALIZE ONCE, ROUTE MANY.
 * - Single fetch feeds multiple domain interpreters without duplicating network requests.
 * - In Gate #27: Contract specification only. Zero active routing execution over Video.
 */

export const SUPPORTED_DOMAINS = Object.freeze({
  PEOPLE: 'PEOPLE',
  VIDEO: 'VIDEO',
  BUSINESS: 'BUSINESS',
  EVENTS: 'EVENTS'
});

export class AtlasDomainRouterContract {
  constructor() {
    this.handlers = new Map(); // domain -> handler function
    this.metrics = {
      items_routed_total: 0,
      dispatched_to_people: 0,
      dispatched_to_video: 0,
      dispatched_to_business: 0,
      dispatched_to_events: 0,
      multi_domain_fanouts: 0
    };
  }

  registerDomainHandler(domain, handlerFn) {
    if (!SUPPORTED_DOMAINS[domain]) {
      throw new Error(`UNSUPPORTED_DOMAIN: Domain '${domain}' is not registered in SUPPORTED_DOMAINS.`);
    }
    this.handlers.set(domain, handlerFn);
  }

  /**
   * Evaluates and routes a single normalized source item to all interested domains
   */
  routeItem(normalizedItem, targetDomains = [SUPPORTED_DOMAINS.PEOPLE]) {
    this.metrics.items_routed_total++;
    let activeDispatches = 0;

    for (const domain of targetDomains) {
      const handler = this.handlers.get(domain);
      if (handler) {
        handler(normalizedItem);
        activeDispatches++;
        if (domain === SUPPORTED_DOMAINS.PEOPLE) this.metrics.dispatched_to_people++;
        if (domain === SUPPORTED_DOMAINS.VIDEO) this.metrics.dispatched_to_video++;
        if (domain === SUPPORTED_DOMAINS.BUSINESS) this.metrics.dispatched_to_business++;
        if (domain === SUPPORTED_DOMAINS.EVENTS) this.metrics.dispatched_to_events++;
      }
    }

    if (activeDispatches > 1) {
      this.metrics.multi_domain_fanouts++;
    }

    return {
      item_id: normalizedItem.item_id,
      dispatched_domains: targetDomains,
      active_dispatches: activeDispatches
    };
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
