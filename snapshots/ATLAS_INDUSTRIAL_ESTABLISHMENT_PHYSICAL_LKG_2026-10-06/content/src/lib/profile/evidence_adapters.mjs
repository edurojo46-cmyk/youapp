/**
 * ATLAS PERSON PROFILE / EVIDENCE FUSION ENGINE V1
 * Source Adapters for Real Atlas Sources: ARCA, IGJ, BIEP, OpenAlex
 */

export function extractArcaObservations(record) {
  const observations = [];
  const now = record.observed_at || new Date().toISOString();

  if (record.raw_name || record.display_name) {
    observations.push({
      field_type: 'NAME',
      raw_value: record.raw_name || record.display_name,
      normalized_value: record.name_norm || (record.raw_name || record.display_name).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_arca_name_${record.source_person_id}`
    });
  }

  if (record.province || record.jurisdiction) {
    observations.push({
      field_type: 'PROVINCE',
      raw_value: record.province || record.jurisdiction,
      normalized_value: (record.province || record.jurisdiction).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_arca_prov_${record.source_person_id}`
    });
  }

  if (record.tax_status || record.source_status) {
    observations.push({
      field_type: 'SOURCE_STATUS',
      raw_value: record.tax_status || record.source_status || 'ACTIVO',
      normalized_value: (record.tax_status || record.source_status || 'ACTIVO').toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_arca_stat_${record.source_person_id}`
    });
  }

  return observations;
}

export function extractIgjObservations(record) {
  const observations = [];
  const now = record.observed_at || new Date().toISOString();

  if (record.full_name || record.display_name) {
    observations.push({
      field_type: 'NAME',
      raw_value: record.full_name || record.display_name,
      normalized_value: (record.full_name || record.display_name).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_igj_name_${record.source_person_id}`
    });
  }

  if (record.role || record.cargo) {
    observations.push({
      field_type: 'ROLE',
      raw_value: record.role || record.cargo,
      normalized_value: (record.role || record.cargo).toUpperCase().trim(),
      observed_at: now,
      valid_from: record.valid_from || null,
      valid_to: record.valid_to || null,
      evidence_id: `ev_igj_role_${record.source_person_id}`
    });
  }

  if (record.organization_name || record.razon_social) {
    observations.push({
      field_type: 'ORGANIZATION',
      raw_value: record.organization_name || record.razon_social,
      normalized_value: (record.organization_name || record.razon_social).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_igj_org_${record.source_person_id}`
    });
  }

  return observations;
}

export function extractBiepObservations(record) {
  const observations = [];
  const now = record.observed_at || new Date().toISOString();

  if (record.full_name || record.display_name) {
    observations.push({
      field_type: 'NAME',
      raw_value: record.full_name || record.display_name,
      normalized_value: (record.full_name || record.display_name).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_biep_name_${record.source_person_id}`
    });
  }

  if (record.role || record.position) {
    observations.push({
      field_type: 'ROLE',
      raw_value: record.role || record.position,
      normalized_value: (record.role || record.position).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_biep_role_${record.source_person_id}`
    });
  }

  if (record.profession || record.profession_name) {
    observations.push({
      field_type: 'PROFESSION',
      raw_value: record.profession || record.profession_name,
      normalized_value: (record.profession || record.profession_name).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_biep_prof_${record.source_person_id}`
    });
  }

  if (record.organization || record.institution) {
    observations.push({
      field_type: 'ORGANIZATION',
      raw_value: record.organization || record.institution,
      normalized_value: (record.organization || record.institution).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_biep_org_${record.source_person_id}`
    });
  }

  return observations;
}

export function extractOpenAlexObservations(record) {
  const observations = [];
  const now = record.observed_at || new Date().toISOString();

  if (record.display_name) {
    observations.push({
      field_type: 'NAME',
      raw_value: record.display_name,
      normalized_value: record.display_name.toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_openalex_name_${record.source_person_id}`
    });
  }

  if (record.institution || record.affiliation) {
    observations.push({
      field_type: 'ORGANIZATION',
      raw_value: record.institution || record.affiliation,
      normalized_value: (record.institution || record.affiliation).toUpperCase().trim(),
      observed_at: now,
      evidence_id: `ev_openalex_org_${record.source_person_id}`
    });
  }

  observations.push({
    field_type: 'PROFESSION',
    raw_value: 'INVESTIGADOR / ACADEMICO',
    normalized_value: 'INVESTIGADOR / ACADEMICO',
    observed_at: now,
    evidence_id: `ev_openalex_prof_${record.source_person_id}`
  });

  return observations;
}

export function adaptSourceRecord(sourceId, record) {
  const sid = (sourceId || '').toUpperCase();
  if (sid.startsWith('ARCA')) {
    return extractArcaObservations(record);
  }
  if (sid.startsWith('IGJ')) {
    return extractIgjObservations(record);
  }
  if (sid.startsWith('BIEP')) {
    return extractBiepObservations(record);
  }
  if (sid.startsWith('OPENALEX')) {
    return extractOpenAlexObservations(record);
  }
      // Generic fallback
      const obs = [];
      if (record.display_name) {
        obs.push({
          field_type: 'NAME',
          raw_value: record.display_name,
          normalized_value: record.display_name.toUpperCase().trim(),
          observed_at: record.observed_at || new Date().toISOString(),
          evidence_id: `ev_gen_${record.source_person_id}`
        });
      }
      return obs;
}
