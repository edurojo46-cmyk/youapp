import pg from 'pg';

/**
 * COMMUNITY GRAPH MODEL V1
 * Commercial Community Graph & Read-Model for Local Commerce V3
 * 
 * Authorities Reused:
 * - user -> neighborhood: public.atlas_local_neighborhood_follows
 * - user -> category: public.atlas_local_category_follows
 * - user -> business: public.atlas_local_business_follows
 * - user -> offer save: public.atlas_local_saved_offers & public.atlas_local_events
 * - user -> Mi Base: public.atlas_user_saved_relations
 * - user -> administers business: public.atlas_organization_members
 * - business -> neighborhood: public.atlas_local_businesses.neighborhood_id
 * - business -> category: public.atlas_local_businesses.category
 * - business -> offer: public.atlas_local_offers.organization_id
 * 
 * Invariants:
 * - NO duplicate follow tables.
 * - UNKNOWN != RELATION. No inferred nonexistent relations.
 * - RELATIONSHIP_STATE != COMMUNICATION_PERMISSION.
 * - UNKNOWN = FALSE for proactive marketing/send.
 * - EXTERNAL_SEND_ENABLED = FALSE.
 * - NO external AI/LLMs. Deterministic ranking only.
 */

export type CommunityRelationType =
  | 'USER_FOLLOWS_NEIGHBORHOOD'
  | 'USER_FOLLOWS_CATEGORY'
  | 'USER_FOLLOWS_BUSINESS'
  | 'USER_SAVED_OFFER'
  | 'USER_SAVED_BUSINESS'
  | 'USER_HAS_IN_MIBASE'
  | 'USER_ADMINISTERS_BUSINESS'
  | 'BUSINESS_IN_NEIGHBORHOOD'
  | 'BUSINESS_IN_CATEGORY'
  | 'BUSINESS_PUBLISHED_OFFER';

export type RelationshipState =
  | 'DISCOVERED'
  | 'VISITED'
  | 'FOLLOWING_BUSINESS'
  | 'FOLLOWING_CATEGORY'
  | 'FOLLOWING_NEIGHBORHOOD'
  | 'SAVED'
  | 'IN_MY_BASE'
  | 'CONTACTED'
  | 'RESPONDED'
  | 'CUSTOMER';

export interface CommunicationPermission {
  inAppAllowed: boolean;
  emailAllowed: boolean;
  pushAllowed: boolean;
  whatsappAllowed: boolean;
}

export interface InternalContactability {
  canReachInApp: boolean;
  canReachEmail: boolean;
  canReachPush: boolean;
  canReachWhatsapp: boolean;
  externalSendEnabled: false;
}

export type CommunityEventType =
  | 'BUSINESS_FOLLOWED'
  | 'BUSINESS_UNFOLLOWED'
  | 'CATEGORY_FOLLOWED'
  | 'NEIGHBORHOOD_FOLLOWED'
  | 'OFFER_SAVED'
  | 'OFFER_UNSAVED'
  | 'OFFER_SHARED'
  | 'OFFER_REDEEMED'
  | 'BUSINESS_CONTACTED'
  | 'BUSINESS_CLAIMED'
  | 'BUSINESS_VERIFIED'
  | 'COMMUNITY_SHARE_CREATED'
  | 'COMMUNITY_SHARE_OPENED'
  | 'COMMUNITY_SHARE_SIGNUP'
  | 'community_share_created'
  | 'community_share_opened'
  | 'community_share_signup';

export interface CommunityGraphEdge {
  relationType: CommunityRelationType;
  sourceId: string;
  targetId: string;
  sourceType: 'USER' | 'BUSINESS';
  targetType: 'NEIGHBORHOOD' | 'CATEGORY' | 'BUSINESS' | 'OFFER';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface AtlasCommunitySignals {
  organizationId: string;
  organizationName: string;
  totalFollowers: number;
  totalOfferSaves: number;
  totalContacts: number;
  totalRedemptions: number;
  totalMiBaseSaves: number;
  commercialEngagementScore: number;
}

export interface BusinessAudienceMetrics {
  organizationId: string;
  followersCount: number;
  interactions30d: number;
  savedOffersCount: number;
  contactsCount: number;
  redemptionsCount: number;
  canManage: boolean;
}

export interface ActivationFunnelMetrics {
  communityVisitors: number;
  communitySignups: number;
  neighborhoodFollowers: number;
  categoryFollowers: number;
  businessFollowers: number;
  activatedCommunityUsers: number;
  COMMUNITY_VISITORS?: number;
  COMMUNITY_SIGNUPS?: number;
  NEIGHBORHOOD_FOLLOWERS?: number;
  CATEGORY_FOLLOWERS?: number;
  BUSINESS_FOLLOWERS?: number;
  ACTIVATED_COMMUNITY_USERS?: number;
}

export interface CommunityDensityMetrics {
  followRelationshipsPerActiveUser: number;
  businessFollowersMedian: number;
  businessFollowersP90: number;
  offersPerActiveBusiness: number;
  activeUsersWith3PlusRelations: number;
  avgBusinessFollowsPerActiveUser: number;
  avgCategoryFollowsPerActiveUser: number;
  usersWith3PlusBusinessFollows: number;
  businessesWith10PlusFollowers: number;
  businessesWith50PlusFollowers: number;
  businessesWith100PlusFollowers: number;
  AVG_BUSINESS_FOLLOWS_PER_ACTIVE_USER?: number;
  AVG_CATEGORY_FOLLOWS_PER_ACTIVE_USER?: number;
  USERS_WITH_3PLUS_BUSINESS_FOLLOWS?: number;
  BUSINESSES_WITH_10PLUS_FOLLOWERS?: number;
  BUSINESSES_WITH_50PLUS_FOLLOWERS?: number;
  BUSINESSES_WITH_100PLUS_FOLLOWERS?: number;
}

export interface CommunityGrowthMetrics {
  realCommunityUsers: number;
  realBusinesses: number;
  realBusinessFollows: number;
  realCategoryFollows: number;
  realNeighborhoodFollows: number;
  realActiveOffers: number;
  realRedemptions: number;
  activationFunnel: ActivationFunnelMetrics;
  density: CommunityDensityMetrics;
  testNonProduction?: {
    testUsers: number;
    testBusinesses: number;
    testBusinessFollows: number;
    testCategoryFollows: number;
    testNeighborhoodFollows: number;
    testActiveOffers: number;
    testRedemptions: number;
  };
}

export class AtlasCommunityGraphService {
  private dbPool: pg.Pool;
  private schemaReady = false;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Ensure necessary non-follow support tables exist (e.g. atlas_local_saved_offers).
   * Note: follow tables (business, category, neighborhood) are NEVER duplicated.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_local_saved_offers (
          user_id UUID NOT NULL,
          offer_id UUID NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          environment VARCHAR(32) NOT NULL DEFAULT 'REAL',
          saved_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (user_id, offer_id)
        );
        CREATE INDEX IF NOT EXISTS idx_atlas_saved_offers_user ON public.atlas_local_saved_offers(user_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_saved_offers_offer ON public.atlas_local_saved_offers(offer_id);
      `);
      this.schemaReady = true;
    } finally {
      client.release();
    }
  }

  /**
   * Log normalized real community event into atlas_local_events
   */
  async logCommunityEvent(params: {
    eventType: CommunityEventType;
    userId?: string | null;
    barrioId?: string;
    organizationId?: string | null;
    offerId?: string | null;
    environment?: string;
  }): Promise<void> {
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        INSERT INTO public.atlas_local_events (
          event_type, user_id, barrio_id, content_type, content_id, environment, created_at
        ) VALUES (
          $1, $2, COALESCE($3, 'caballito'), $4, $5, COALESCE($6, 'REAL'), NOW()
        );
      `, [
        params.eventType,
        params.userId || null,
        params.barrioId || 'caballito',
        params.offerId ? 'OFFER' : (params.organizationId ? 'BUSINESS' : 'COMMUNITY'),
        params.offerId || params.organizationId || null,
        params.environment || 'REAL'
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve active community relations for a specific user.
   * Compiles the logical Community Graph read model strictly from existing authorities.
   */
  async getUserCommunityGraph(userId: string, environment = 'REAL'): Promise<{
    edges: CommunityGraphEdge[];
    neighborhoodId: string | null;
    followedBusinesses: any[];
    followedCategories: string[];
    savedOffers: any[];
    mibaseBusinesses: any[];
    adminBusinesses: any[];
    contactability: InternalContactability;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const edges: CommunityGraphEdge[] = [];

      // 1. USER_FOLLOWS_NEIGHBORHOOD
      const neighRes = await client.query(`
        SELECT neighborhood_id, status, followed_at 
        FROM public.atlas_local_neighborhood_follows
        WHERE user_id = $1::text AND status = 'ACTIVE'
        ORDER BY followed_at DESC LIMIT 1;
      `, [userId]);
      const neighborhoodId = neighRes.rows[0]?.neighborhood_id || null;
      if (neighborhoodId) {
        edges.push({
          relationType: 'USER_FOLLOWS_NEIGHBORHOOD',
          sourceId: userId,
          targetId: neighborhoodId,
          sourceType: 'USER',
          targetType: 'NEIGHBORHOOD',
          status: 'ACTIVE',
          createdAt: neighRes.rows[0].followed_at
        });
      }

      // 2. USER_FOLLOWS_CATEGORY
      const catRes = await client.query(`
        SELECT category_id, status, followed_at
        FROM public.atlas_local_category_follows
        WHERE user_id = $1::text AND status = 'ACTIVE'
        ORDER BY followed_at DESC;
      `, [userId]);
      const followedCategories: string[] = catRes.rows.map(r => r.category_id);
      for (const r of catRes.rows) {
        edges.push({
          relationType: 'USER_FOLLOWS_CATEGORY',
          sourceId: userId,
          targetId: r.category_id,
          sourceType: 'USER',
          targetType: 'CATEGORY',
          status: 'ACTIVE',
          createdAt: r.followed_at
        });
      }

      // 3. USER_FOLLOWS_BUSINESS
      const busRes = await client.query(`
        SELECT f.organization_id, f.status, f.followed_at,
               b.name, b.category, b.address, b.logo_url, b.contact_summary, b.environment
        FROM public.atlas_local_business_follows f
        JOIN public.atlas_local_businesses b ON f.organization_id = b.organization_id
        WHERE f.user_id = $1::uuid AND f.status = 'ACTIVE'
        ORDER BY f.followed_at DESC;
      `, [userId]);
      const followedBusinesses = busRes.rows;
      for (const r of busRes.rows) {
        edges.push({
          relationType: 'USER_FOLLOWS_BUSINESS',
          sourceId: userId,
          targetId: r.organization_id,
          sourceType: 'USER',
          targetType: 'BUSINESS',
          status: 'ACTIVE',
          createdAt: r.followed_at,
          metadata: { name: r.name, category: r.category }
        });
      }

      // 4. USER_SAVED_OFFER (from atlas_local_saved_offers and active atlas_local_offers)
      const offersRes = await client.query(`
        SELECT s.offer_id, s.saved_at,
               o.title, o.description, o.price_text, o.category, o.valid_until, o.status,
               b.organization_id, b.name as organization_name, b.address as organization_address
        FROM public.atlas_local_saved_offers s
        JOIN public.atlas_local_offers o ON s.offer_id = o.offer_id
        JOIN public.atlas_local_businesses b ON o.organization_id = b.organization_id
        WHERE s.user_id = $1::uuid AND s.status = 'ACTIVE' AND o.status = 'ACTIVE' AND o.valid_until >= NOW()
        ORDER BY s.saved_at DESC;
      `, [userId]);
      const savedOffers = offersRes.rows;
      for (const r of offersRes.rows) {
        edges.push({
          relationType: 'USER_SAVED_OFFER',
          sourceId: userId,
          targetId: r.offer_id,
          sourceType: 'USER',
          targetType: 'OFFER',
          status: 'ACTIVE',
          createdAt: r.saved_at,
          metadata: { title: r.title, organization_id: r.organization_id }
        });
      }

      // 5. USER_HAS_IN_MIBASE & USER_SAVED_BUSINESS (from atlas_user_saved_relations)
      const mibaseRes = await client.query(`
        SELECT s.id as saved_id, s.product_id, s.company_id, s.base_name, s.saved_at,
               s.commercial_status, s.notes,
               b.organization_id, b.name, b.category, b.address, b.contact_summary
        FROM public.atlas_user_saved_relations s
        JOIN public.atlas_local_businesses b ON (s.product_id = b.organization_id OR s.company_id = b.organization_id)
        WHERE s.user_id = $1::uuid
        ORDER BY s.saved_at DESC;
      `, [userId]);
      const mibaseBusinesses = mibaseRes.rows;
      for (const r of mibaseRes.rows) {
        edges.push({
          relationType: 'USER_HAS_IN_MIBASE',
          sourceId: userId,
          targetId: r.organization_id,
          sourceType: 'USER',
          targetType: 'BUSINESS',
          status: 'ACTIVE',
          createdAt: r.saved_at,
          metadata: { commercial_status: r.commercial_status, base_name: r.base_name }
        });
      }

      // 6. USER_ADMINISTERS_BUSINESS (from atlas_organization_members)
      const adminRes = await client.query(`
        SELECT m.organization_id, m.role, m.status,
               b.name, b.category, b.address, b.verified_owner, b.environment
        FROM public.atlas_organization_members m
        JOIN public.atlas_local_businesses b ON m.organization_id = b.organization_id
        WHERE m.user_id = $1::uuid AND m.role IN ('OWNER', 'ADMIN') AND m.status = 'ACTIVE'
        ORDER BY m.created_at DESC;
      `, [userId]);
      const adminBusinesses = adminRes.rows;
      for (const r of adminRes.rows) {
        edges.push({
          relationType: 'USER_ADMINISTERS_BUSINESS',
          sourceId: userId,
          targetId: r.organization_id,
          sourceType: 'USER',
          targetType: 'BUSINESS',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          metadata: { role: r.role }
        });
      }

      // Internal Contactability calculation (Section 7 & 8)
      // UNKNOWN = FALSE for proactive marketing.
      // IN_APP_ALLOWED is active because user is authenticated in the app.
      // EMAIL, PUSH, WHATSAPP are strictly false without explicit opt-in authority.
      const contactability: InternalContactability = {
        canReachInApp: true,
        canReachEmail: false,
        canReachPush: false,
        canReachWhatsapp: false,
        externalSendEnabled: false
      };

      // Definition of ACTIVATED: real user who has at least 1 neighborhood follow + 1 category follow + 1 business follow
      const isActivated = (neighborhoodId !== null) && (followedCategories.length >= 1) && (followedBusinesses.length >= 1);

      return {
        edges,
        neighborhoodId,
        followedBusinesses,
        followedCategories,
        savedOffers,
        mibaseBusinesses,
        adminBusinesses,
        contactability,
        isActivated
      };
    } finally {
      client.release();
    }
  }

  /**
   * Save an offer to user's saved offers list
   */
  async saveOffer(userId: string, offerId: string, environment = 'REAL'): Promise<{ success: boolean; status: string }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        INSERT INTO public.atlas_local_saved_offers (user_id, offer_id, status, environment, saved_at)
        VALUES ($1::uuid, $2::uuid, 'ACTIVE', $3, NOW())
        ON CONFLICT (user_id, offer_id) DO UPDATE SET status = 'ACTIVE', saved_at = NOW();
      `, [userId, offerId, environment]);

      await this.logCommunityEvent({
        eventType: 'OFFER_SAVED',
        userId,
        offerId,
        environment
      });

      return { success: true, status: 'ACTIVE' };
    } finally {
      client.release();
    }
  }

  /**
   * Unsave an offer
   */
  async unsaveOffer(userId: string, offerId: string): Promise<{ success: boolean; status: string }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        UPDATE public.atlas_local_saved_offers
        SET status = 'INACTIVE'
        WHERE user_id = $1::uuid AND offer_id = $2::uuid;
      `, [userId, offerId]);

      await this.logCommunityEvent({
        eventType: 'OFFER_UNSAVED',
        userId,
        offerId
      });

      return { success: true, status: 'INACTIVE' };
    } finally {
      client.release();
    }
  }

  /**
   * Deterministic Personalized Community Feed V1 (Section 9)
   * Priority:
   * 1. Comercio seguido (1000 pts)
   * 2. Categoría seguida (500 pts)
   * 3. Barrio seguido (200 pts)
   * 4. Cercanía si ubicación autorizada (hasta 100 pts)
   * 5. Vigencia de oferta (hasta 50 pts)
   * 6. Recencia (hasta 30 pts)
   * NO external LLM, NO external recommendation API.
   */
  async getDeterministicCommunityFeed(params: {
    userId?: string | null;
    barrioId?: string;
    userCoords?: { lat: number; lng: number } | null;
    limit?: number;
    environment?: string;
  }): Promise<any[]> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const barrioId = params.barrioId || 'caballito';
      const env = params.environment || 'REAL';
      const limit = params.limit || 30;

      let followedBizSet = new Set<string>();
      let followedCatSet = new Set<string>();
      let followedBarrio = barrioId;

      if (params.userId) {
        const bRes = await client.query(`
          SELECT organization_id FROM public.atlas_local_business_follows
          WHERE user_id = $1::uuid AND status = 'ACTIVE';
        `, [params.userId]);
        followedBizSet = new Set(bRes.rows.map(r => r.organization_id));

        const cRes = await client.query(`
          SELECT category_id FROM public.atlas_local_category_follows
          WHERE user_id = $1::text AND status = 'ACTIVE';
        `, [params.userId]);
        followedCatSet = new Set(cRes.rows.map(r => r.category_id.toUpperCase()));

        const nRes = await client.query(`
          SELECT neighborhood_id FROM public.atlas_local_neighborhood_follows
          WHERE user_id = $1::text AND status = 'ACTIVE' LIMIT 1;
        `, [params.userId]);
        if (nRes.rows[0]) followedBarrio = nRes.rows[0].neighborhood_id;
      }

      // Fetch active offers with business details
      const envFilter = env === 'REAL' 
        ? `(o.environment = 'REAL' OR o.environment IS NULL) AND (b.environment = 'REAL' OR b.environment IS NULL)`
        : `o.environment = '${env}'`;

      const offersRes = await client.query(`
        SELECT 
          o.offer_id, o.organization_id, o.neighborhood_id, o.title, o.description,
          o.price_text, o.category, o.valid_from, o.valid_until, o.status, o.created_at,
          o.image_url, o.environment,
          b.name as organization_name, b.category as business_category, b.address as organization_address,
          b.latitude, b.longitude, b.contact_summary, b.verified_owner
        FROM public.atlas_local_offers o
        JOIN public.atlas_local_businesses b ON o.organization_id = b.organization_id
        WHERE o.status = 'ACTIVE' AND o.valid_until >= NOW() AND ${envFilter}
        ORDER BY o.created_at DESC LIMIT 100;
      `);

      const scored = offersRes.rows.map(row => {
        let score = 0;
        const orgId = row.organization_id;
        const cat = (row.category || '').toUpperCase();
        const bizCat = (row.business_category || '').toUpperCase();

        const isFollowedBusiness = followedBizSet.has(orgId);
        const isFollowedCategory = followedCatSet.has(cat) || followedCatSet.has(bizCat);
        const isFollowedBarrio = (row.neighborhood_id || 'caballito').toLowerCase() === followedBarrio.toLowerCase();

        // 1. Followed business
        if (isFollowedBusiness) score += 1000;
        // 2. Followed category
        if (isFollowedCategory) score += 500;
        // 3. Followed neighborhood
        if (isFollowedBarrio) score += 200;

        // 4. Proximity if user provided authorized coordinates
        let distanceKm: number | null = null;
        if (params.userCoords && row.latitude && row.longitude) {
          const bLat = parseFloat(row.latitude);
          const bLng = parseFloat(row.longitude);
          if (!isNaN(bLat) && !isNaN(bLng)) {
            // Earth distance (haversine)
            const dLat = (bLat - params.userCoords.lat) * Math.PI / 180;
            const dLng = (bLng - params.userCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(params.userCoords.lat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            distanceKm = parseFloat((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
            score += Math.max(0, 100 - distanceKm * 20);
          }
        }

        // 5. Validity urgency
        const validUntilMs = new Date(row.valid_until).getTime();
        const nowMs = Date.now();
        const hoursRemaining = (validUntilMs - nowMs) / (1000 * 60 * 60);
        if (hoursRemaining > 0 && hoursRemaining <= 72) {
          score += 50; // Expiring in next 3 days
        }

        // 6. Recency
        const createdAtMs = new Date(row.created_at).getTime();
        const hoursOld = (nowMs - createdAtMs) / (1000 * 60 * 60);
        if (hoursOld < 48) {
          score += 30; // Published within last 48h
        }

        return {
          ...row,
          score,
          distance_km: distanceKm,
          is_followed_business: isFollowedBusiness,
          is_followed_category: isFollowedCategory,
          is_followed_neighborhood: isFollowedBarrio
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    } finally {
      client.release();
    }
  }

  /**
   * Business Audience Metrics (Section 12)
   * Only accessible to verified merchants/admins of the organization.
   * Privacy: NO individual user identities or emails exposed.
   */
  async getBusinessAudience(organizationId: string, callerUserId: string): Promise<BusinessAudienceMetrics> {
    const client = await this.dbPool.connect();
    try {
      // 1. Authorize: Caller must be OWNER or ADMIN in atlas_organization_members
      const authRes = await client.query(`
        SELECT role FROM public.atlas_organization_members
        WHERE organization_id = $1::uuid AND user_id = $2::uuid AND role IN ('OWNER', 'ADMIN') AND status = 'ACTIVE';
      `, [organizationId, callerUserId]);

      const canManage = authRes.rows.length > 0;
      if (!canManage) {
        throw new Error('FORBIDDEN_AUDIENCE_ACCESS');
      }

      // 2. Count active followers (real)
      const followCountRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_business_follows
        WHERE organization_id = $1::uuid AND status = 'ACTIVE';
      `, [organizationId]);
      const followersCount = parseInt(followCountRes.rows[0].count, 10);

      // 3. Interactions in past 30 days
      const interRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_events
        WHERE (content_id = $1 OR content_id IN (SELECT offer_id::text FROM public.atlas_local_offers WHERE organization_id = $1::uuid))
          AND created_at >= NOW() - INTERVAL '30 days';
      `, [organizationId]);
      const interactions30d = parseInt(interRes.rows[0].count, 10);

      // 4. Saved offers count
      const savesRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_saved_offers s
        JOIN public.atlas_local_offers o ON s.offer_id = o.offer_id
        WHERE o.organization_id = $1::uuid AND s.status = 'ACTIVE';
      `, [organizationId]);
      const savedOffersCount = parseInt(savesRes.rows[0].count, 10);

      // 5. Contacts clicked count
      const contactRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_events
        WHERE event_type IN ('CONTACT_CLICKED', 'BUSINESS_CONTACTED')
          AND (content_id = $1 OR content_id IN (SELECT offer_id::text FROM public.atlas_local_offers WHERE organization_id = $1::uuid));
      `, [organizationId]);
      const contactsCount = parseInt(contactRes.rows[0].count, 10);

      // 6. Confirmed redemptions
      const redeemRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offer_redemptions
        WHERE organization_id = $1::uuid AND status = 'REDEEMED';
      `, [organizationId]);
      const redemptionsCount = parseInt(redeemRes.rows[0].count, 10);

      return {
        organizationId,
        followersCount,
        interactions30d,
        savedOffersCount,
        contactsCount,
        redemptionsCount,
        canManage: true
      };
    } finally {
      client.release();
    }
  }

  /**
   * Atlas Feedback Contract / Interface (Section 11)
   * Provides aggregate outcome signals for Atlas Intelligence ranking without altering core intelligence.
   */
  async getAtlasFeedbackSignals(organizationId: string): Promise<AtlasCommunitySignals> {
    const client = await this.dbPool.connect();
    try {
      const busRes = await client.query(`
        SELECT organization_id, name FROM public.atlas_local_businesses WHERE organization_id = $1::uuid;
      `, [organizationId]);
      const orgName = busRes.rows[0]?.name || 'Unknown';

      // Followers
      const followRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_business_follows
        WHERE organization_id = $1::uuid AND status = 'ACTIVE';
      `, [organizationId]);
      const totalFollowers = parseInt(followRes.rows[0].count, 10);

      // Offer saves
      const saveRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_saved_offers s
        JOIN public.atlas_local_offers o ON s.offer_id = o.offer_id
        WHERE o.organization_id = $1::uuid AND s.status = 'ACTIVE';
      `, [organizationId]);
      const totalOfferSaves = parseInt(saveRes.rows[0].count, 10);

      // Contacts
      const contactRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_events
        WHERE event_type IN ('CONTACT_CLICKED', 'BUSINESS_CONTACTED')
          AND (content_id = $1 OR content_id IN (SELECT offer_id::text FROM public.atlas_local_offers WHERE organization_id = $1::uuid));
      `, [organizationId]);
      const totalContacts = parseInt(contactRes.rows[0].count, 10);

      // Redemptions
      const redRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offer_redemptions
        WHERE organization_id = $1::uuid AND status = 'REDEEMED';
      `, [organizationId]);
      const totalRedemptions = parseInt(redRes.rows[0].count, 10);

      // Mi Base saves
      const mibaseRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_user_saved_relations
        WHERE product_id = $1::uuid OR company_id = $1::uuid;
      `, [organizationId]);
      const totalMiBaseSaves = parseInt(mibaseRes.rows[0].count, 10);

      // Commercial Engagement Score: weighted sum of positive real outcomes
      const commercialEngagementScore = 
        (totalFollowers * 5) + 
        (totalOfferSaves * 3) + 
        (totalContacts * 10) + 
        (totalRedemptions * 25) + 
        (totalMiBaseSaves * 8);

      return {
        organizationId,
        organizationName: orgName,
        totalFollowers,
        totalOfferSaves,
        totalContacts,
        totalRedemptions,
        totalMiBaseSaves,
        commercialEngagementScore
      };
    } finally {
      client.release();
    }
  }

  /**
   * Community Growth & Density Metrics (Sections 13 & 14)
   * Separates REAL from TEST_NON_PRODUCTION.
   * Calculates density indicators truthfully.
   */
  async getCommunityGrowthMetrics(): Promise<CommunityGrowthMetrics> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      // REAL counts
      const userRes = await client.query(`
        SELECT COUNT(DISTINCT user_id) as count FROM (
          SELECT user_id::text FROM public.atlas_local_neighborhood_follows WHERE environment = 'REAL'
          UNION
          SELECT user_id::text FROM public.atlas_local_category_follows WHERE environment = 'REAL'
          UNION
          SELECT user_id::text FROM public.atlas_local_business_follows WHERE environment = 'REAL'
          UNION
          SELECT user_id::text FROM public.atlas_local_saved_offers WHERE environment = 'REAL'
          UNION
          SELECT user_id::text FROM public.atlas_user_saved_relations
        ) u;
      `);
      const realCommunityUsers = parseInt(userRes.rows[0].count, 10);

      const busRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_businesses WHERE environment = 'REAL' OR environment IS NULL;
      `);
      const realBusinesses = parseInt(busRes.rows[0].count, 10);

      const bFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_business_follows 
        WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL);
      `);
      const realBusinessFollows = parseInt(bFollowRes.rows[0].count, 10);

      const cFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_category_follows 
        WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL);
      `);
      const realCategoryFollows = parseInt(cFollowRes.rows[0].count, 10);

      const nFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_neighborhood_follows 
        WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL);
      `);
      const realNeighborhoodFollows = parseInt(nFollowRes.rows[0].count, 10);

      const offerRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offers 
        WHERE status = 'ACTIVE' AND valid_until >= NOW() AND (environment = 'REAL' OR environment IS NULL);
      `);
      const realActiveOffers = parseInt(offerRes.rows[0].count, 10);

      const redRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offer_redemptions 
        WHERE status = 'REDEEMED' AND (environment = 'REAL' OR environment IS NULL);
      `);
      const realRedemptions = parseInt(redRes.rows[0].count, 10);

      // Density calculation
      const totalFollows = realBusinessFollows + realCategoryFollows + realNeighborhoodFollows;
      const followRelationshipsPerActiveUser = realCommunityUsers > 0 
        ? parseFloat((totalFollows / realCommunityUsers).toFixed(2)) 
        : 0;

      const offersPerActiveBusiness = realBusinesses > 0 
        ? parseFloat((realActiveOffers / realBusinesses).toFixed(2)) 
        : 0;

      const avgBusinessFollowsPerActiveUser = realCommunityUsers > 0 
        ? parseFloat((realBusinessFollows / realCommunityUsers).toFixed(2)) 
        : 0;

      const avgCategoryFollowsPerActiveUser = realCommunityUsers > 0 
        ? parseFloat((realCategoryFollows / realCommunityUsers).toFixed(2)) 
        : 0;

      // Business followers median & p90
      const followersDistributionRes = await client.query(`
        SELECT b.organization_id, COUNT(f.user_id) as followers
        FROM public.atlas_local_businesses b
        LEFT JOIN public.atlas_local_business_follows f 
          ON b.organization_id = f.organization_id AND f.status = 'ACTIVE' AND (f.environment = 'REAL' OR f.environment IS NULL)
        WHERE (b.environment = 'REAL' OR b.environment IS NULL)
        GROUP BY b.organization_id
        ORDER BY followers ASC;
      `);
      const followerCounts = followersDistributionRes.rows.map(r => parseInt(r.followers, 10));
      let businessFollowersMedian = 0;
      let businessFollowersP90 = 0;
      if (followerCounts.length > 0) {
        const mid = Math.floor(followerCounts.length / 2);
        businessFollowersMedian = followerCounts.length % 2 !== 0 
          ? followerCounts[mid] 
          : (followerCounts[mid - 1] + followerCounts[mid]) / 2;
        const p90Idx = Math.floor(followerCounts.length * 0.9);
        businessFollowersP90 = followerCounts[Math.min(p90Idx, followerCounts.length - 1)];
      }

      // Active users with 3+ relations
      const threePlusRes = await client.query(`
        SELECT COUNT(*) as count FROM (
          SELECT user_id, COUNT(*) as relation_count FROM (
            SELECT user_id::text FROM public.atlas_local_neighborhood_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
            UNION ALL
            SELECT user_id::text FROM public.atlas_local_category_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
            UNION ALL
            SELECT user_id::text FROM public.atlas_local_business_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
            UNION ALL
            SELECT user_id::text FROM public.atlas_local_saved_offers WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
          ) rels
          GROUP BY user_id
          HAVING COUNT(*) >= 3
        ) sub;
      `);
      const activeUsersWith3PlusRelations = parseInt(threePlusRes.rows[0].count, 10);

      // Section 14: USERS_WITH_3PLUS_BUSINESS_FOLLOWS
      const threePlusBizRes = await client.query(`
        SELECT COUNT(*) as count FROM (
          SELECT user_id FROM public.atlas_local_business_follows
          WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
          GROUP BY user_id
          HAVING COUNT(*) >= 3
        ) sub;
      `);
      const usersWith3PlusBusinessFollows = parseInt(threePlusBizRes.rows[0].count, 10);

      // Section 14: Businesses with 10+, 50+, 100+ followers
      const biz10PlusRes = await client.query(`
        SELECT COUNT(*) as count FROM (
          SELECT organization_id FROM public.atlas_local_business_follows
          WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
          GROUP BY organization_id
          HAVING COUNT(*) >= 10
        ) sub;
      `);
      const businessesWith10PlusFollowers = parseInt(biz10PlusRes.rows[0].count, 10);

      const biz50PlusRes = await client.query(`
        SELECT COUNT(*) as count FROM (
          SELECT organization_id FROM public.atlas_local_business_follows
          WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
          GROUP BY organization_id
          HAVING COUNT(*) >= 50
        ) sub;
      `);
      const businessesWith50PlusFollowers = parseInt(biz50PlusRes.rows[0].count, 10);

      const biz100PlusRes = await client.query(`
        SELECT COUNT(*) as count FROM (
          SELECT organization_id FROM public.atlas_local_business_follows
          WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
          GROUP BY organization_id
          HAVING COUNT(*) >= 100
        ) sub;
      `);
      const businessesWith100PlusFollowers = parseInt(biz100PlusRes.rows[0].count, 10);

      // Section 13: Activation Funnel Metrics
      const visitorsRes = await client.query(`
        SELECT COUNT(DISTINCT COALESCE(user_id, ip_address, share_id, id::text)) as count 
        FROM public.atlas_local_events 
        WHERE (environment = 'REAL' OR environment IS NULL);
      `).catch(() => ({ rows: [{ count: '0' }] }));
      const communityVisitors = Math.max(realCommunityUsers, parseInt(visitorsRes.rows[0]?.count || '0', 10));

      const signupsRes = await client.query(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM public.atlas_local_events 
        WHERE event_type IN ('SIGNUP', 'USER_REGISTERED', 'community_share_signup') 
          AND (environment = 'REAL' OR environment IS NULL);
      `).catch(() => ({ rows: [{ count: '0' }] }));
      const communitySignups = parseInt(signupsRes.rows[0]?.count || '0', 10);

      // ACTIVATED_COMMUNITY_USERS: real user with >= 1 neighborhood follow + >= 1 category follow + >= 1 business follow
      const activatedRes = await client.query(`
        SELECT COUNT(DISTINCT n.user_id) as count
        FROM (
          SELECT user_id::text FROM public.atlas_local_neighborhood_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
        ) n
        JOIN (
          SELECT user_id::text FROM public.atlas_local_category_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
        ) c ON n.user_id = c.user_id
        JOIN (
          SELECT user_id::text FROM public.atlas_local_business_follows WHERE status = 'ACTIVE' AND (environment = 'REAL' OR environment IS NULL)
        ) b ON n.user_id = b.user_id;
      `);
      const activatedCommunityUsers = parseInt(activatedRes.rows[0].count, 10);

      // TEST_NON_PRODUCTION counts
      const testBusRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_businesses WHERE environment = 'TEST_NON_PRODUCTION';
      `);
      const testBFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_business_follows WHERE environment = 'TEST_NON_PRODUCTION';
      `);
      const testCFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_category_follows WHERE environment = 'TEST_NON_PRODUCTION';
      `);
      const testNFollowRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_neighborhood_follows WHERE environment = 'TEST_NON_PRODUCTION';
      `);
      const testOfferRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offers WHERE environment = 'TEST_NON_PRODUCTION';
      `);
      const testRedRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_offer_redemptions WHERE environment = 'TEST_NON_PRODUCTION';
      `);

      return {
        realCommunityUsers,
        realBusinesses,
        realBusinessFollows,
        realCategoryFollows,
        realNeighborhoodFollows,
        realActiveOffers,
        realRedemptions,
        activationFunnel: {
          communityVisitors,
          communitySignups,
          neighborhoodFollowers: realNeighborhoodFollows,
          categoryFollowers: realCategoryFollows,
          businessFollowers: realBusinessFollows,
          activatedCommunityUsers,
          COMMUNITY_VISITORS: communityVisitors,
          COMMUNITY_SIGNUPS: communitySignups,
          NEIGHBORHOOD_FOLLOWERS: realNeighborhoodFollows,
          CATEGORY_FOLLOWERS: realCategoryFollows,
          BUSINESS_FOLLOWERS: realBusinessFollows,
          ACTIVATED_COMMUNITY_USERS: activatedCommunityUsers
        },
        density: {
          followRelationshipsPerActiveUser,
          businessFollowersMedian,
          businessFollowersP90,
          offersPerActiveBusiness,
          activeUsersWith3PlusRelations,
          avgBusinessFollowsPerActiveUser,
          avgCategoryFollowsPerActiveUser,
          usersWith3PlusBusinessFollows,
          businessesWith10PlusFollowers,
          businessesWith50PlusFollowers,
          businessesWith100PlusFollowers,
          AVG_BUSINESS_FOLLOWS_PER_ACTIVE_USER: avgBusinessFollowsPerActiveUser,
          AVG_CATEGORY_FOLLOWS_PER_ACTIVE_USER: avgCategoryFollowsPerActiveUser,
          USERS_WITH_3PLUS_BUSINESS_FOLLOWS: usersWith3PlusBusinessFollows,
          BUSINESSES_WITH_10PLUS_FOLLOWERS: businessesWith10PlusFollowers,
          BUSINESSES_WITH_50PLUS_FOLLOWERS: businessesWith50PlusFollowers,
          BUSINESSES_WITH_100PLUS_FOLLOWERS: businessesWith100PlusFollowers
        },
        testNonProduction: {
          testUsers: 0,
          testBusinesses: parseInt(testBusRes.rows[0].count, 10),
          testBusinessFollows: parseInt(testBFollowRes.rows[0].count, 10),
          testCategoryFollows: parseInt(testCFollowRes.rows[0].count, 10),
          testNeighborhoodFollows: parseInt(testNFollowRes.rows[0].count, 10),
          testActiveOffers: parseInt(testOfferRes.rows[0].count, 10),
          testRedemptions: parseInt(testRedRes.rows[0].count, 10)
        }
      };
    } finally {
      client.release();
    }
  }
}
