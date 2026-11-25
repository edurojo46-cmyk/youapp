/**
 * ATLAS PERSON PROFILE / EVIDENCE FUSION ENGINE V1
 * Explainable Profile API
 */

export class ExplainableProfileApi {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Standard Profile Retrieval Contract
   */
  async getPersonProfile(atlasPersonId, passedClient = null) {
    const client = passedClient || await this.pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          atlas_person_id,
          display_name,
          professions,
          current_roles,
          historical_roles,
          organizations,
          locations,
          public_contacts,
          first_seen_at,
          last_seen_at,
          source_count,
          evidence_count,
          profile_updated_at
        FROM public.atlas_person_profiles
        WHERE atlas_person_id = $1;
      `, [atlasPersonId]);

      if (!res.rows.length) return null;
      return res.rows[0];
    } finally {
      if (!passedClient) client.release();
    }
  }

  /**
   * Explainable Profile Retrieval Contract (PERSON PROFILE + EXPLAIN)
   */
  async getPersonProfileWithExplanation(atlasPersonId, passedClient = null) {
    const client = passedClient || await this.pool.connect();
    try {
      const profileRes = await client.query(`
        SELECT *
        FROM public.atlas_person_profiles
        WHERE atlas_person_id = $1;
      `, [atlasPersonId]);

      if (!profileRes.rows.length) return null;
      const profile = profileRes.rows[0];

      // Fetch all supporting observations
      const obsRes = await client.query(`
        SELECT 
          observation_id,
          source_id,
          source_person_id,
          source_record_id,
          field_type,
          raw_value,
          normalized_value,
          observed_at,
          evidence_id
        FROM public.atlas_person_observations
        WHERE atlas_person_id = $1
        ORDER BY observed_at ASC;
      `, [atlasPersonId]);

      // Fetch temporal organization relations
      const relRes = await client.query(`
        SELECT 
          relation_id,
          organization_name,
          role,
          valid_from,
          valid_to,
          evidence_id,
          observed_at
        FROM public.atlas_person_organization_relations
        WHERE atlas_person_id = $1
        ORDER BY observed_at DESC;
      `, [atlasPersonId]);

      // Fetch any detected contradictions
      const confRes = await client.query(`
        SELECT 
          conflict_id,
          field_type,
          conflict_reason,
          status,
          detected_at
        FROM public.atlas_person_profile_conflicts
        WHERE atlas_person_id = $1;
      `, [atlasPersonId]);

      return {
        profile: {
          atlas_person_id: profile.atlas_person_id,
          display_name: profile.display_name,
          professions: profile.professions,
          current_roles: profile.current_roles,
          historical_roles: profile.historical_roles,
          organizations: profile.organizations,
          locations: profile.locations,
          public_contacts: profile.public_contacts,
          first_seen_at: profile.first_seen_at,
          last_seen_at: profile.last_seen_at,
          source_count: profile.source_count,
          evidence_count: profile.evidence_count,
          profile_updated_at: profile.profile_updated_at
        },
        explanation: {
          field_provenance: profile.provenance,
          supporting_observations_count: obsRes.rows.length,
          supporting_observations: obsRes.rows,
          temporal_relations: relRes.rows,
          contradictions_count: confRes.rows.length,
          contradictions: confRes.rows
        }
      };
    } finally {
      if (!passedClient) client.release();
    }
  }
}
