-- Eliminar los casos antiguos si existen para ser idempotentes
DELETE FROM asset_semantic_annotations WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);

INSERT INTO asset_semantic_annotations 
(id, asset_id, semantic_entity_id, semantic_work_id, semantic_venue_id, content_type, performance_mode, content_role, overall_confidence, evidence, annotation_status, semantic_version)
VALUES
('11111111-1111-1111-1111-111111111111', 'ebd0f6b9-94eb-4973-ad5a-2425e349fb4b', 'fito_paez', 'polaroid_de_locura_ordinaria', null, null, null, 'PRIMARY', 0.98, '{
  "sources": [{"field": "title", "value": "Fito Paez - Polaroid De Locura Ordinaria", "weight": 0.98}],
  "reason": "explicit_work_title_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

('22222222-2222-2222-2222-222222222222', 'ad55182b-a7d9-45e4-a160-4d5443fb21b4', 'fito_paez', 'brillante_sobre_el_mic', null, null, null, 'PRIMARY', 0.98, '{
  "sources": [{"field": "title", "value": "Fito Paez - Brillante Sobre El Mic", "weight": 0.98}],
  "reason": "explicit_work_title_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

('33333333-3333-3333-3333-333333333333', '6bacaa96-02f9-4c7d-8c49-3115a16855d9', 'fito_paez', null, 'Estadio Vélez Sarsfield', null, 'LIVE', 'PRIMARY', 0.96, '{
  "sources": [{"field": "title", "value": "Fito Páez - Vélez", "weight": 0.96}],
  "reason": "explicit_venue_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1),

('44444444-4444-4444-4444-444444444444', '68b8405f-ca95-4e49-a772-bfafb524ddb4', 'the_beatles', null, null, 'MAKING_OF', null, 'PRIMARY', 0.90, '{
  "sources": [{"field": "title", "value": "The Beatles - Making Of", "weight": 0.90}],
  "reason": "explicit_content_type_plus_primary_artist",
  "classifier": "semantic-repair-v1.4",
  "provenance": "local_semantic_repair"
}'::jsonb, 'ACTIVE', 1);
