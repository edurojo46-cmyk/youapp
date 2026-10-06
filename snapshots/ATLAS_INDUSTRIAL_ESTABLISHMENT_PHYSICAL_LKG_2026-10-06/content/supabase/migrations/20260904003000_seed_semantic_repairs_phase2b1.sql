-- Eliminar los casos antiguos si existen para ser idempotentes
DELETE FROM asset_semantic_annotations WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);

-- Insert the 4 verified Semantic Repairs with REAL asset IDs
INSERT INTO asset_semantic_annotations (
  id, asset_id, semantic_entity_id, semantic_work_id, semantic_venue_id, content_type, content_role, entity_confidence, evidence, annotation_status, semantic_version
) VALUES
(gen_random_uuid(), 'eb9c0306-df33-499c-a935-2ffa7b6a4a6d', 'entity_fito_paez', 'work_polaroid_de_locura_ordinaria', null, null, 'PRIMARY', 0.98, '{
  "sources": [{"field": "title", "value": "Fito Páez Polaroid De Locura Ordinaria", "weight": 0.98}],
  "reason": "explicit_work_title_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

(gen_random_uuid(), '06c437a7-b051-4349-93c4-0182d83a7e8a', 'entity_fito_paez', 'work_brillante_sobre_el_mic', null, null, 'PRIMARY', 0.98, '{
  "sources": [{"field": "title", "value": "Fito Paez - Brillante Sobre El Mic", "weight": 0.98}],
  "reason": "explicit_work_title_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

(gen_random_uuid(), '074ccb60-5aff-4648-bfa7-9606850c3866', 'entity_fito_paez', null, 'venue_estadio_velez_sarsfield', null, 'PRIMARY', 0.96, '{
  "sources": [{"field": "title", "value": "Fito Paez en Vélez 1993", "weight": 0.96}],
  "reason": "explicit_venue_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

(gen_random_uuid(), '5bbcd815-48b4-4850-a9ec-0ec37d7d172a', 'entity_the_beatles', null, null, 'MAKING_OF', 'PRIMARY', 0.90, '{
  "sources": [{"field": "title", "value": "The Beatles - Making Of", "weight": 0.90}],
  "reason": "explicit_content_type_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1);
