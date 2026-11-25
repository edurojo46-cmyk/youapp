import crypto from 'node:crypto';

/**
 * ATLAS PERSON PROFILE / EVIDENCE FUSION ENGINE V1
 */

export class EvidenceFusionEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Ingest a set of normalized observations for an already-resolved atlas_person_id
   */
  async ingestObservations(client, atlasPersonId, sourceId, sourcePersonId, sourceRecordId, observations) {
    if (!observations || !observations.length) return [];

    const insertedObs = [];
    for (const obs of observations) {
      const observationId = `obs_${crypto.randomBytes(8).toString('hex')}`;
      const contentHash = crypto.createHash('md5').update(`${obs.field_type}:${obs.raw_value || ''}:${obs.observed_at || ''}`).digest('hex');
      const res = await client.query(`
        INSERT INTO public.atlas_person_observations (
          observation_id, atlas_person_id, source_id, source_person_id, source_record_id,
          field_type, raw_value, normalized_value, observed_at, source_published_at,
          valid_from, valid_to, evidence_id, observation_type, source_content_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (source_id, source_record_id, source_content_hash)
        DO UPDATE SET
          last_seen_at = NOW(),
          observation_id = COALESCE(atlas_person_observations.observation_id, EXCLUDED.observation_id)
        RETURNING *;
      `, [
        observationId,
        atlasPersonId,
        sourceId,
        sourcePersonId,
        sourceRecordId,
        obs.field_type,
        obs.raw_value,
        obs.normalized_value,
        obs.observed_at || new Date().toISOString(),
        obs.source_published_at || null,
        obs.valid_from || null,
        obs.valid_to || null,
        obs.evidence_id || null,
        obs.field_type,
        contentHash
      ]);
      insertedObs.push(res.rows[0]);

      // If observation is an organization relationship, create first-class temporal relation
      if (obs.field_type === 'ORGANIZATION') {
        const relationId = `rel_${crypto.randomBytes(8).toString('hex')}`;
        await client.query(`
          INSERT INTO public.atlas_person_organization_relations (
            relation_id, atlas_person_id, organization_key, organization_name,
            role, valid_from, valid_to, observation_id, evidence_id, observed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          relationId,
          atlasPersonId,
          obs.normalized_value.replace(/[^A-Z0-9]/g, '_'),
          obs.raw_value,
          obs.associated_role || null,
          obs.valid_from || null,
          obs.valid_to || null,
          observationId,
          obs.evidence_id || null,
          obs.observed_at || new Date().toISOString()
        ]);
      }
    }

    return insertedObs;
  }

  /**
   * Detect contradictions across source observations for an atlas_person_id
   */
  async detectContradictions(client, atlasPersonId) {
    const obsRes = await client.query(`
      SELECT observation_id, field_type, raw_value, normalized_value, source_id, observed_at
      FROM public.atlas_person_observations
      WHERE atlas_person_id = $1
      ORDER BY observed_at ASC
    `, [atlasPersonId]);

    const observations = obsRes.rows;
    const byField = {};
    for (const o of observations) {
      if (!byField[o.field_type]) byField[o.field_type] = [];
      byField[o.field_type].push(o);
    }

    const conflictsFound = [];

    // Check for explicit conflicting values (e.g. conflicting names or statuses)
    for (const [fieldType, list] of Object.entries(byField)) {
      if (['NAME', 'SOURCE_STATUS'].includes(fieldType) && list.length > 1) {
        const uniqueVals = Array.from(new Set(list.map(l => l.normalized_value)));
        if (uniqueVals.length > 1) {
          const conflictId = `conf_${crypto.randomBytes(8).toString('hex')}`;
          const obsA = list[0];
          const obsB = list[list.length - 1];
          const reason = `Multiple conflicting ${fieldType} values observed across sources: "${obsA.raw_value}" (${obsA.source_id}) vs "${obsB.raw_value}" (${obsB.source_id})`;

          await client.query(`
            INSERT INTO public.atlas_person_profile_conflicts (
              conflict_id, atlas_person_id, field_type, observation_a_id, observation_b_id, conflict_reason, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
            ON CONFLICT (conflict_id) DO NOTHING
          `, [conflictId, atlasPersonId, fieldType, obsA.observation_id, obsB.observation_id, reason]);

          conflictsFound.push({ conflictId, fieldType, reason });
        }
      }
    }

    return conflictsFound;
  }

  /**
   * Derive the canonical Person Profile projection from normalized observations
   */
  async deriveCanonicalProfile(client, atlasPersonId) {
    const obsRes = await client.query(`
      SELECT *
      FROM public.atlas_person_observations
      WHERE atlas_person_id = $1
      ORDER BY observed_at ASC
    `, [atlasPersonId]);

    const observations = obsRes.rows;
    if (!observations.length) return null;

    const relRes = await client.query(`
      SELECT *
      FROM public.atlas_person_organization_relations
      WHERE atlas_person_id = $1
      ORDER BY observed_at DESC
    `, [atlasPersonId]);
    const relations = relRes.rows;

    const sourcesSet = new Set(observations.map(o => o.source_id));
    const evidenceSet = new Set(observations.map(o => o.evidence_id).filter(Boolean));

    const names = [];
    const professions = new Set();
    const currentRoles = new Set();
    const historicalRoles = new Set();
    const organizations = new Set();
    const locations = new Set();
    const publicContacts = new Set();
    const provenance = {};

    let firstSeen = null;
    let lastSeen = null;

    for (const obs of observations) {
      const obsDate = new Date(obs.observed_at);
      if (!firstSeen || obsDate < firstSeen) firstSeen = obsDate;
      if (!lastSeen || obsDate > lastSeen) lastSeen = obsDate;

      switch (obs.field_type) {
        case 'NAME':
          names.push(obs);
          break;
        case 'PROFESSION':
          professions.add(obs.normalized_value);
          if (!provenance['professions']) provenance['professions'] = [];
          provenance['professions'].push({
            value: obs.normalized_value,
            source: obs.source_id,
            evidence_id: obs.evidence_id,
            observation_id: obs.observation_id,
            date: obs.observed_at,
            rationale: `Derived from ${obs.source_id} structured profession declaration`
          });
          break;
        case 'ROLE':
          if (obs.valid_to && new Date(obs.valid_to) < new Date()) {
            historicalRoles.add(obs.normalized_value);
          } else {
            currentRoles.add(obs.normalized_value);
          }
          if (!provenance['roles']) provenance['roles'] = [];
          provenance['roles'].push({
            value: obs.normalized_value,
            source: obs.source_id,
            evidence_id: obs.evidence_id,
            observation_id: obs.observation_id,
            date: obs.observed_at,
            rationale: `Recorded role from ${obs.source_id}`
          });
          break;
        case 'ORGANIZATION':
          organizations.add(obs.normalized_value);
          if (!provenance['organizations']) provenance['organizations'] = [];
          provenance['organizations'].push({
            value: obs.normalized_value,
            source: obs.source_id,
            evidence_id: obs.evidence_id,
            observation_id: obs.observation_id,
            date: obs.observed_at,
            rationale: `Affiliation observed in ${obs.source_id}`
          });
          break;
        case 'LOCATION':
        case 'PROVINCE':
          locations.add(obs.normalized_value);
          if (!provenance['locations']) provenance['locations'] = [];
          provenance['locations'].push({
            value: obs.normalized_value,
            source: obs.source_id,
            evidence_id: obs.evidence_id,
            observation_id: obs.observation_id,
            date: obs.observed_at,
            rationale: `Geographic evidence from ${obs.source_id}`
          });
          break;
        case 'PUBLIC_CONTACT':
          publicContacts.add(obs.raw_value);
          break;
      }
    }

    // Deterministic selection of canonical display name
    // Priority: Richer sources (IGJ / BIEP) > ARCA > latest observed
    let chosenNameObs = names[0];
    for (const n of names) {
      if (['IGJ_DIRECTORIOS', 'IGJ', 'BIEP'].includes(n.source_id)) {
        chosenNameObs = n;
        break;
      }
    }
    const displayName = chosenNameObs ? chosenNameObs.raw_value : 'UNKNOWN';
    provenance['display_name'] = {
      value: displayName,
      source: chosenNameObs?.source_id,
      evidence_id: chosenNameObs?.evidence_id,
      observation_id: chosenNameObs?.observation_id,
      date: chosenNameObs?.observed_at,
      rationale: `Selected based on priority source hierarchy (${chosenNameObs?.source_id})`
    };

    // Upsert into atlas_person_profiles
    const profileRes = await client.query(`
      INSERT INTO public.atlas_person_profiles (
        atlas_person_id, display_name, professions, current_roles, historical_roles,
        organizations, locations, public_contacts, first_seen_at, last_seen_at,
        source_count, evidence_count, profile_updated_at, provenance
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
      ON CONFLICT (atlas_person_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        professions = EXCLUDED.professions,
        current_roles = EXCLUDED.current_roles,
        historical_roles = EXCLUDED.historical_roles,
        organizations = EXCLUDED.organizations,
        locations = EXCLUDED.locations,
        public_contacts = EXCLUDED.public_contacts,
        first_seen_at = LEAST(atlas_person_profiles.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = GREATEST(atlas_person_profiles.last_seen_at, EXCLUDED.last_seen_at),
        source_count = EXCLUDED.source_count,
        evidence_count = EXCLUDED.evidence_count,
        profile_updated_at = NOW(),
        provenance = EXCLUDED.provenance
      RETURNING *;
    `, [
      atlasPersonId,
      displayName,
      JSON.stringify(Array.from(professions)),
      JSON.stringify(Array.from(currentRoles)),
      JSON.stringify(Array.from(historicalRoles)),
      JSON.stringify(Array.from(organizations)),
      JSON.stringify(Array.from(locations)),
      JSON.stringify(Array.from(publicContacts)),
      firstSeen,
      lastSeen,
      sourcesSet.size,
      evidenceSet.size,
      JSON.stringify(provenance)
    ]);

    return profileRes.rows[0];
  }

  /**
   * Incremental Profile Update for a single person
   */
  async incrementalUpdate(client, atlasPersonId, sourceId, sourcePersonId, sourceRecordId, newObservations) {
    // 1. Ingest new observations
    await this.ingestObservations(client, atlasPersonId, sourceId, sourcePersonId, sourceRecordId, newObservations);

    // 2. Detect any contradictions
    const conflicts = await this.detectContradictions(client, atlasPersonId);

    // 3. Re-derive canonical profile with updated provenance
    const profile = await this.deriveCanonicalProfile(client, atlasPersonId);

    return { profile, conflicts };
  }
}
