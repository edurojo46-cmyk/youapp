import crypto from 'node:crypto';

/**
 * ATLAS SIGNALS ENGINE V0
 * 
 * Downstream, asynchronous, evidence-linked, idempotent signals engine.
 * Emits observable person, organization, and aggregate demand signals from verified state deltas.
 */

export const SignalTypes = {
  // Person Signals
  PERSON_NEW_ROLE: 'PERSON_NEW_ROLE',
  PERSON_ROLE_ENDED: 'PERSON_ROLE_ENDED',
  PERSON_JOB_CHANGE: 'PERSON_JOB_CHANGE',
  PERSON_NEW_ORGANIZATION: 'PERSON_NEW_ORGANIZATION',
  PERSON_NEW_PUBLIC_PROFILE: 'PERSON_NEW_PUBLIC_PROFILE',
  PERSON_PROFILE_ATTRIBUTE_CHANGED: 'PERSON_PROFILE_ATTRIBUTE_CHANGED',

  // Organization Signals
  ORGANIZATION_NEW_EXECUTIVE: 'ORGANIZATION_NEW_EXECUTIVE',
  ORGANIZATION_EXECUTIVE_DEPARTURE: 'ORGANIZATION_EXECUTIVE_DEPARTURE',
  ORGANIZATION_NEW_LOCATION: 'ORGANIZATION_NEW_LOCATION',
  ORGANIZATION_NEW_PUBLICATION: 'ORGANIZATION_NEW_PUBLICATION',
  ORGANIZATION_HIRING_ACTIVITY_CHANGE: 'ORGANIZATION_HIRING_ACTIVITY_CHANGE',

  // Aggregated Demand Signals
  TOPIC_TREND_UP: 'TOPIC_TREND_UP',
  VIDEO_INTEREST_UP: 'VIDEO_INTEREST_UP',
  REGIONAL_ACTIVITY_UP: 'REGIONAL_ACTIVITY_UP',
  INDUSTRY_ACTIVITY_UP: 'INDUSTRY_ACTIVITY_UP'
};

export class SignalsEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Deterministic Deduplication Key generator
   */
  static generateDedupeKey(subjectType, subjectId, signalType, beforeEvidenceId, afterEvidenceId, effectiveAt) {
    const raw = `${subjectType}:${subjectId}:${signalType}:${beforeEvidenceId || 'none'}:${afterEvidenceId || 'none'}:${effectiveAt || 'latest'}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Calculate fact-based observable confidence metadata
   */
  static calculateConfidence(sourcesCount, sourceReliability, isDirectObservation) {
    let score = isDirectObservation ? 0.85 : 0.65;
    score += Math.min(sourcesCount * 0.05, 0.15);
    score = Math.min(Math.max(score, 0.5), 1.0);

    return {
      confidence_score: Number(score.toFixed(2)),
      source_count: sourcesCount,
      source_reliability: sourceReliability || 'HIGH',
      observation_nature: isDirectObservation ? 'DIRECT_STRUCTURED' : 'INFERRED_DELTA',
      contradictions_present: false
    };
  }

  /**
   * Evaluates delta between previous canonical person profile and new state
   */
  evaluatePersonDelta(atlasPersonId, beforeProfile, afterProfile, evidenceMeta = {}) {
    const signals = [];
    const effectiveAt = evidenceMeta.effective_at || new Date().toISOString();
    const detectedAt = new Date().toISOString();

    const beforeOrgs = new Set(beforeProfile?.organizations || []);
    const afterOrgs = new Set(afterProfile?.organizations || []);

    const beforeRoles = new Set(beforeProfile?.current_roles || []);
    const afterRoles = new Set(afterProfile?.current_roles || []);

    const beforeContacts = new Set(beforeProfile?.public_contacts || []);
    const afterContacts = new Set(afterProfile?.public_contacts || []);

    // 1. Organization & Job Changes
    const addedOrgs = Array.from(afterOrgs).filter(x => !beforeOrgs.has(x));
    const removedOrgs = Array.from(beforeOrgs).filter(x => !afterOrgs.has(x));

    for (const org of addedOrgs) {
      const dedupeKey = SignalsEngine.generateDedupeKey('PERSON', atlasPersonId, SignalTypes.PERSON_NEW_ORGANIZATION, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
      signals.push({
        signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
        subject_type: 'PERSON',
        subject_id: atlasPersonId,
        signal_type: SignalTypes.PERSON_NEW_ORGANIZATION,
        signal_class: 'DERIVED',
        detected_at: detectedAt,
        effective_at: effectiveAt,
        evidence_before_id: evidenceMeta.before_evidence_id || null,
        evidence_after_id: evidenceMeta.after_evidence_id || null,
        source_count: evidenceMeta.source_count || 1,
        confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
        signal_payload: {
          organization: org,
          previous_organizations: Array.from(beforeOrgs),
          display_name: afterProfile.display_name
        },
        dedupe_key: dedupeKey,
        signal_version: 1,
        status: 'ACTIVE'
      });

      // Also emit PERSON_JOB_CHANGE if moving between organizations
      if (beforeOrgs.size > 0) {
        const jobChangeKey = SignalsEngine.generateDedupeKey('PERSON', atlasPersonId, SignalTypes.PERSON_JOB_CHANGE, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
        signals.push({
          signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
          subject_type: 'PERSON',
          subject_id: atlasPersonId,
          signal_type: SignalTypes.PERSON_JOB_CHANGE,
          signal_class: 'DERIVED',
          detected_at: detectedAt,
          effective_at: effectiveAt,
          evidence_before_id: evidenceMeta.before_evidence_id || null,
          evidence_after_id: evidenceMeta.after_evidence_id || null,
          source_count: evidenceMeta.source_count || 1,
          confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
          signal_payload: {
            from_organization: Array.from(beforeOrgs)[0],
            to_organization: org,
            display_name: afterProfile.display_name
          },
          dedupe_key: jobChangeKey,
          signal_version: 1,
          status: 'ACTIVE'
        });
      }
    }

    // 2. Role Additions / Promotions
    const addedRoles = Array.from(afterRoles).filter(x => !beforeRoles.has(x));
    for (const role of addedRoles) {
      const dedupeKey = SignalsEngine.generateDedupeKey('PERSON', atlasPersonId, SignalTypes.PERSON_NEW_ROLE, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
      signals.push({
        signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
        subject_type: 'PERSON',
        subject_id: atlasPersonId,
        signal_type: SignalTypes.PERSON_NEW_ROLE,
        signal_class: 'OBSERVED',
        detected_at: detectedAt,
        effective_at: effectiveAt,
        evidence_before_id: evidenceMeta.before_evidence_id || null,
        evidence_after_id: evidenceMeta.after_evidence_id || null,
        source_count: evidenceMeta.source_count || 1,
        confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
        signal_payload: {
          role,
          previous_roles: Array.from(beforeRoles),
          display_name: afterProfile.display_name
        },
        dedupe_key: dedupeKey,
        signal_version: 1,
        status: 'ACTIVE'
      });
    }

    // 3. Role Endings / Departures
    const endedRoles = Array.from(beforeRoles).filter(x => !afterRoles.has(x));
    for (const role of endedRoles) {
      const dedupeKey = SignalsEngine.generateDedupeKey('PERSON', atlasPersonId, SignalTypes.PERSON_ROLE_ENDED, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
      signals.push({
        signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
        subject_type: 'PERSON',
        subject_id: atlasPersonId,
        signal_type: SignalTypes.PERSON_ROLE_ENDED,
        signal_class: 'OBSERVED',
        detected_at: detectedAt,
        effective_at: effectiveAt,
        evidence_before_id: evidenceMeta.before_evidence_id || null,
        evidence_after_id: evidenceMeta.after_evidence_id || null,
        source_count: evidenceMeta.source_count || 1,
        confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
        signal_payload: {
          ended_role: role,
          display_name: afterProfile.display_name
        },
        dedupe_key: dedupeKey,
        signal_version: 1,
        status: 'ACTIVE'
      });
    }

    // 4. Verified Public Profile / Social Link Addition
    const addedContacts = Array.from(afterContacts).filter(x => !beforeContacts.has(x));
    for (const contact of addedContacts) {
      // Must be verified link
      if (evidenceMeta.social_link_state === 'VERIFIED_LINK' || contact.startsWith('http')) {
        const dedupeKey = SignalsEngine.generateDedupeKey('PERSON', atlasPersonId, SignalTypes.PERSON_NEW_PUBLIC_PROFILE, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
        signals.push({
          signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
          subject_type: 'PERSON',
          subject_id: atlasPersonId,
          signal_type: SignalTypes.PERSON_NEW_PUBLIC_PROFILE,
          signal_class: 'OBSERVED',
          detected_at: detectedAt,
          effective_at: effectiveAt,
          evidence_before_id: evidenceMeta.before_evidence_id || null,
          evidence_after_id: evidenceMeta.after_evidence_id || null,
          source_count: evidenceMeta.source_count || 1,
          confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
          signal_payload: {
            public_profile_url: contact,
            display_name: afterProfile.display_name
          },
          dedupe_key: dedupeKey,
          signal_version: 1,
          status: 'ACTIVE'
        });
      }
    }

    return signals;
  }

  /**
   * Evaluates delta for organization profiles
   */
  evaluateOrganizationDelta(orgId, beforeOrg, afterOrg, evidenceMeta = {}) {
    const signals = [];
    const effectiveAt = evidenceMeta.effective_at || new Date().toISOString();
    const detectedAt = new Date().toISOString();

    const beforeExecs = new Set(beforeOrg?.executives || []);
    const afterExecs = new Set(afterOrg?.executives || []);

    // 1. New Executive
    const addedExecs = Array.from(afterExecs).filter(x => !beforeExecs.has(x));
    for (const execId of addedExecs) {
      const dedupeKey = SignalsEngine.generateDedupeKey('ORGANIZATION', orgId, SignalTypes.ORGANIZATION_NEW_EXECUTIVE, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
      signals.push({
        signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
        subject_type: 'ORGANIZATION',
        subject_id: orgId,
        signal_type: SignalTypes.ORGANIZATION_NEW_EXECUTIVE,
        signal_class: 'OBSERVED',
        detected_at: detectedAt,
        effective_at: effectiveAt,
        evidence_before_id: evidenceMeta.before_evidence_id || null,
        evidence_after_id: evidenceMeta.after_evidence_id || null,
        source_count: evidenceMeta.source_count || 1,
        confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
        signal_payload: {
          executive_id: execId,
          role: evidenceMeta.role || 'Executive'
        },
        dedupe_key: dedupeKey,
        signal_version: 1,
        status: 'ACTIVE'
      });
    }

    // 2. Executive Departure
    const removedExecs = Array.from(beforeExecs).filter(x => !afterExecs.has(x));
    for (const execId of removedExecs) {
      const dedupeKey = SignalsEngine.generateDedupeKey('ORGANIZATION', orgId, SignalTypes.ORGANIZATION_EXECUTIVE_DEPARTURE, evidenceMeta.before_evidence_id, evidenceMeta.after_evidence_id, effectiveAt);
      signals.push({
        signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
        subject_type: 'ORGANIZATION',
        subject_id: orgId,
        signal_type: SignalTypes.ORGANIZATION_EXECUTIVE_DEPARTURE,
        signal_class: 'OBSERVED',
        detected_at: detectedAt,
        effective_at: effectiveAt,
        evidence_before_id: evidenceMeta.before_evidence_id || null,
        evidence_after_id: evidenceMeta.after_evidence_id || null,
        source_count: evidenceMeta.source_count || 1,
        confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', true),
        signal_payload: {
          executive_id: execId,
          role: evidenceMeta.role || 'Executive'
        },
        dedupe_key: dedupeKey,
        signal_version: 1,
        status: 'ACTIVE'
      });
    }

    return signals;
  }

  /**
   * Generates aggregated topic demand signal
   */
  generateTopicDemandSignal(topicId, demandDelta, evidenceMeta = {}) {
    const effectiveAt = evidenceMeta.effective_at || new Date().toISOString();
    const detectedAt = new Date().toISOString();
    const dedupeKey = SignalsEngine.generateDedupeKey('DEMAND', topicId, SignalTypes.TOPIC_TREND_UP, null, evidenceMeta.after_evidence_id, effectiveAt);

    return {
      signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
      subject_type: 'DEMAND',
      subject_id: topicId,
      signal_type: SignalTypes.TOPIC_TREND_UP,
      signal_class: 'DERIVED',
      detected_at: detectedAt,
      effective_at: effectiveAt,
      evidence_before_id: null,
      evidence_after_id: evidenceMeta.after_evidence_id || null,
      source_count: evidenceMeta.source_count || 1,
      confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', false),
      signal_payload: {
        topic: demandDelta.topic,
        growth_rate: demandDelta.growth_rate,
        search_volume: demandDelta.search_volume,
        time_window: demandDelta.time_window
      },
      dedupe_key: dedupeKey,
      signal_version: 1,
      status: 'ACTIVE'
    };
  }

  /**
   * Generates video interest aggregate signal
   */
  generateVideoInterestSignal(videoId, videoDelta, evidenceMeta = {}) {
    const effectiveAt = evidenceMeta.effective_at || new Date().toISOString();
    const detectedAt = new Date().toISOString();
    const dedupeKey = SignalsEngine.generateDedupeKey('DEMAND', videoId, SignalTypes.VIDEO_INTEREST_UP, null, evidenceMeta.after_evidence_id, effectiveAt);

    return {
      signal_id: `sig_${crypto.randomBytes(8).toString('hex')}`,
      subject_type: 'DEMAND',
      subject_id: videoId,
      signal_type: SignalTypes.VIDEO_INTEREST_UP,
      signal_class: 'DERIVED',
      detected_at: detectedAt,
      effective_at: effectiveAt,
      evidence_before_id: null,
      evidence_after_id: evidenceMeta.after_evidence_id || null,
      source_count: evidenceMeta.source_count || 1,
      confidence_metadata: SignalsEngine.calculateConfidence(evidenceMeta.source_count || 1, 'HIGH', false),
      signal_payload: {
        video_id: videoDelta.video_id,
        topic: videoDelta.topic,
        view_velocity: videoDelta.view_velocity,
        engagement_rate: videoDelta.engagement_rate
      },
      dedupe_key: dedupeKey,
      signal_version: 1,
      status: 'ACTIVE'
    };
  }

  /**
   * Persist emitted signals with strict idempotency (ON CONFLICT DO NOTHING)
   */
  async persistSignals(clientOrSignals, maybeSignals) {
    let client;
    let signals;
    let shouldRelease = false;

    if (Array.isArray(clientOrSignals)) {
      signals = clientOrSignals;
      client = await this.pool.connect();
      shouldRelease = true;
    } else {
      client = clientOrSignals;
      signals = maybeSignals;
    }

    if (!signals || !signals.length) {
      if (shouldRelease) client.release();
      return { inserted: 0, rows: [] };
    }

    const inserted = [];
    try {
      for (const s of signals) {
        const res = await client.query(`
          INSERT INTO public.atlas_signals (
            signal_id, subject_type, subject_id, signal_type, signal_class,
            detected_at, effective_at, evidence_before_id, evidence_after_id,
            source_count, confidence_metadata, signal_payload, dedupe_key,
            signal_version, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (dedupe_key) DO NOTHING
          RETURNING *;
        `, [
          s.signal_id, s.subject_type, s.subject_id, s.signal_type, s.signal_class,
          s.detected_at, s.effective_at, s.evidence_before_id, s.evidence_after_id,
          s.source_count, JSON.stringify(s.confidence_metadata), JSON.stringify(s.signal_payload),
          s.dedupe_key, s.signal_version, s.status
        ]);

        if (res.rows.length > 0) {
          inserted.push(res.rows[0]);
        }
      }
      return { inserted: inserted.length, rows: inserted };
    } finally {
      if (shouldRelease) client.release();
    }
  }

  /**
   * Retract an existing signal with explanation and audit trail
   */
  async retractSignal(client, signalId, retractionReason, supersedingEvidenceId) {
    const res = await client.query(`
      UPDATE public.atlas_signals
      SET status = 'RETRACTED',
          updated_at = NOW(),
          signal_payload = signal_payload || jsonb_build_object(
            'retracted', true,
            'retraction_reason', $2::text,
            'superseding_evidence_id', $3::text,
            'retracted_at', NOW()
          )
      WHERE signal_id = $1
      RETURNING *;
    `, [signalId, retractionReason, supersedingEvidenceId]);

    return res.rows[0] || null;
  }

  /**
   * Retrieval API: Get signals for a person
   */
  async getSignalsForPerson(atlasPersonId, client = null) {
    const c = client || await this.pool.connect();
    try {
      const res = await c.query(`
        SELECT * FROM public.atlas_signals
        WHERE subject_type = 'PERSON' AND subject_id = $1 AND status = 'ACTIVE'
        ORDER BY effective_at DESC;
      `, [atlasPersonId]);
      return res.rows;
    } finally {
      if (!client) c.release();
    }
  }

  /**
   * Explain API: Get signal with detailed human-readable explanation
   */
  async getSignalWithExplanation(signalId, client = null) {
    const c = client || await this.pool.connect();
    try {
      const res = await c.query(`
        SELECT * FROM public.atlas_signals WHERE signal_id = $1;
      `, [signalId]);
      if (res.rows.length === 0) return null;
      const s = res.rows[0];

      return {
        signal: s,
        explanation: {
          what_changed: s.signal_type,
          subject: `${s.subject_type} ${s.subject_id}`,
          when_detected: s.detected_at,
          effective_date: s.effective_at,
          confidence_score: s.confidence_metadata?.confidence_score,
          supporting_evidence: {
            before_id: s.evidence_before_id,
            after_id: s.evidence_after_id,
            source_count: s.source_count
          },
          why_exists: `Emitted based on deterministic delta verification: ${JSON.stringify(s.signal_payload)}`
        }
      };
    } finally {
      if (!client) c.release();
    }
  }
}
