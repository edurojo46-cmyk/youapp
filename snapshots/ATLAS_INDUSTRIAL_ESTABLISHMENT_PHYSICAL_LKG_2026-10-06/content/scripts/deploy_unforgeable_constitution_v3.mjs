import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function deployUnforgeableConstitutionV3() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('========================================================================');
  console.log('🔒 DEPLOYING ATLAS CONSTITUTION UNFORGEABLE CERTIFICATION V3 (DDL)');
  console.log('========================================================================\n');

  // 1. Enable pgcrypto
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  // 2. Create authoritative append-only ledger: public.atlas_constitution_decisions
  console.log('>>> [1/4] Creating authoritative append-only decision ledger: public.atlas_constitution_decisions...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_constitution_decisions (
      decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      constitution_version VARCHAR(32) NOT NULL DEFAULT '1.0',
      mission_id VARCHAR(128) NOT NULL,
      mission_scope VARCHAR(128) NOT NULL,
      object_type VARCHAR(64) NOT NULL,
      object_id VARCHAR(255) NOT NULL,
      object_fingerprint VARCHAR(64) NOT NULL,
      evidence_fingerprint VARCHAR(64) NOT NULL,
      mission_fit_status VARCHAR(64) NOT NULL,
      evidence_status VARCHAR(64) NOT NULL,
      novelty_status VARCHAR(64) NOT NULL,
      final_decision VARCHAR(32) NOT NULL CHECK (final_decision IN ('CERTIFY', 'REJECT', 'PENDING')),
      rules_triggered JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_const_dec_obj ON public.atlas_constitution_decisions (object_id, final_decision);
    CREATE INDEX IF NOT EXISTS idx_const_dec_fp ON public.atlas_constitution_decisions (object_fingerprint, evidence_fingerprint);
  `);
  console.log('  [PASS] public.atlas_constitution_decisions ready.');

  // 3. Create append-only enforcement trigger on decision ledger
  console.log('\n>>> [2/4] Deploying Append-Only Trigger on public.atlas_constitution_decisions...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_atlas_constitution_decisions_append_only()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'CONSTITUTIONAL_LEDGER_IMMUTABLE: public.atlas_constitution_decisions is strictly append-only. Mutation of historical decisions is prohibited.';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_atlas_constitution_decisions_append_only ON public.atlas_constitution_decisions;
    CREATE TRIGGER trg_atlas_constitution_decisions_append_only
    BEFORE UPDATE OR DELETE ON public.atlas_constitution_decisions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atlas_constitution_decisions_append_only();
  `);
  console.log('  [PASS] Decision ledger sealed as append-only.');

  // 4. Deploy unforgeable product certification trigger on atlas_products
  console.log('\n>>> [3/4] Deploying Unforgeable Fingerprint-Bound Trigger on public.atlas_products...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_enforce_constitutional_authorization()
    RETURNS TRIGGER AS $$
    DECLARE
      v_dec_id UUID;
      v_decision RECORD;
      v_current_obj_fp VARCHAR(64);
      v_current_ev_fp VARCHAR(64);
      v_mission_scope VARCHAR(128);
      v_is_material_update BOOLEAN := FALSE;
    BEGIN
      -- 1. Check if record is ACTIVE or CERTIFIED
      IF NEW.status = 'ACTIVE' OR NEW.status = 'CERTIFIED' THEN
        
        -- Check for UPDATE on existing record
        IF TG_OP = 'UPDATE' THEN
          -- Check if any material field changed
          IF (NEW.name IS DISTINCT FROM OLD.name)
             OR (NEW.category IS DISTINCT FROM OLD.category)
             OR (NEW.description IS DISTINCT FROM OLD.description)
             OR (COALESCE(NEW.attributes_json->>'company_name', '') IS DISTINCT FROM COALESCE(OLD.attributes_json->>'company_name', ''))
             OR (COALESCE(NEW.attributes_json->>'company_id', '') IS DISTINCT FROM COALESCE(OLD.attributes_json->>'company_id', ''))
             OR (COALESCE(NEW.attributes_json->>'relationship_type', '') IS DISTINCT FROM COALESCE(OLD.attributes_json->>'relationship_type', ''))
             OR (COALESCE(NEW.attributes_json->'evidence', '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.attributes_json->'evidence', '{}'::jsonb))
             OR (COALESCE(NEW.attributes_json->>'source_id', '') IS DISTINCT FROM COALESCE(OLD.attributes_json->>'source_id', ''))
             OR (COALESCE(NEW.attributes_json->'constitutional_authorization', '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.attributes_json->'constitutional_authorization', '{}'::jsonb))
          THEN
            v_is_material_update := TRUE;
          ELSE
            -- Non-material operational update only (e.g. updated_at, search counters, access times) -> ALLOW
            RETURN NEW;
          END IF;
        END IF;

        -- 2. Must contain constitutional authorization block in attributes_json
        IF NEW.attributes_json IS NULL 
           OR NEW.attributes_json->'constitutional_authorization' IS NULL 
           OR NEW.attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NULL THEN
           
           -- Preserve legacy records if completely untouched and existing
           IF TG_OP = 'UPDATE' AND NOT v_is_material_update AND OLD.status = 'ACTIVE' THEN
             RETURN NEW;
           END IF;

           RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Direct certification write blocked. Record % lacks constitutional_authorization metadata.', NEW.product_id;
        END IF;

        -- Extract decision UUID
        BEGIN
          v_dec_id := (NEW.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Invalid constitution_decision_id format: %', NEW.attributes_json->'constitutional_authorization'->>'constitution_decision_id';
        END;

        -- 3. Lookup decision in trusted ledger public.atlas_constitution_decisions
        SELECT * INTO v_decision 
        FROM public.atlas_constitution_decisions 
        WHERE decision_id = v_dec_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Forged authorization! Decision ID % does not exist in atlas_constitution_decisions ledger.', v_dec_id;
        END IF;

        -- Check decision outcome and statuses
        IF v_decision.final_decision != 'CERTIFY' 
           OR v_decision.mission_fit_status != 'MISSION_QUALIFIED' 
           OR v_decision.evidence_status != 'VERIFIED_PHYSICAL' THEN
          RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Decision % did not certify record (final_decision=%, mission_fit=%, evidence=%).',
            v_dec_id, v_decision.final_decision, v_decision.mission_fit_status, v_decision.evidence_status;
        END IF;

        -- 4. BIND DECISION TO RECORD: Deterministic Fingerprint Verification
        v_mission_scope := COALESCE(NEW.attributes_json->'constitutional_authorization'->>'mission_scope', v_decision.mission_scope, 'BUSCADOR_INDUSTRIAL');

        v_current_obj_fp := encode(digest(
          LOWER(
            TRIM(NEW.product_id::text) || '|' ||
            TRIM(COALESCE(NEW.name, '')) || '|' ||
            TRIM(COALESCE(NEW.category, '')) || '|' ||
            TRIM(COALESCE(NEW.attributes_json->>'company_name', NEW.attributes_json->>'company_id', '')) || '|' ||
            TRIM(COALESCE(NEW.attributes_json->>'relationship_type', 'UNKNOWN')) || '|' ||
            TRIM(v_mission_scope)
          ), 'sha256'
        ), 'hex');

        v_current_ev_fp := encode(digest(
          LOWER(
            TRIM(COALESCE(NEW.attributes_json->'evidence'->>'certificate_id', '')) || '|' ||
            TRIM(COALESCE(NEW.attributes_json->>'source_id', NEW.attributes_json->'evidence'->>'source_id', '')) || '|' ||
            TRIM(COALESCE(NEW.attributes_json->'evidence'->>'file', ''))
          ), 'sha256'
        ), 'hex');

        IF v_decision.object_fingerprint != v_current_obj_fp THEN
          RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Object fingerprint mismatch! Decision % was authorized for object fingerprint %, but current record computes %.',
            v_dec_id, v_decision.object_fingerprint, v_current_obj_fp;
        END IF;

        IF v_decision.evidence_fingerprint != v_current_ev_fp THEN
          RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Evidence fingerprint mismatch! Decision % was authorized for evidence fingerprint %, but current record computes %.',
            v_dec_id, v_decision.evidence_fingerprint, v_current_ev_fp;
        END IF;

      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_enforce_constitutional_authorization ON public.atlas_products;
    CREATE TRIGGER trg_enforce_constitutional_authorization
    BEFORE INSERT OR UPDATE ON public.atlas_products
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_constitutional_authorization();
  `);
  console.log('  [PASS] Fingerprint binding and active update bypass protection deployed on public.atlas_products.');

  // 5. Deploy source knowledge map defense
  console.log('\n>>> [4/4] Deploying Defense Trigger on public.atlas_source_knowledge_map...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_enforce_source_constitution_authorization()
    RETURNS TRIGGER AS $$
    DECLARE
      v_dec_id UUID;
      v_decision RECORD;
      v_is_true_new BOOLEAN := FALSE;
    BEGIN
      IF NEW.current_status IN ('ACTIVE', 'CERTIFIED', 'PROMOTED') THEN
        v_is_true_new := (NEW.field_telemetry->>'novelty_status' = 'TRUE_NEW_SOURCE') 
                         OR (NEW.source_universe ILIKE '%AUTONOMOUS%')
                         OR (NEW.owner_organization = 'Registro Oficial Nacional' AND TG_OP = 'INSERT');

        -- If marked as TRUE_NEW_SOURCE, require decision_id in field_telemetry
        IF v_is_true_new THEN
          IF NEW.field_telemetry IS NULL 
             OR NEW.field_telemetry->'constitutional_authorization' IS NULL 
             OR NEW.field_telemetry->'constitutional_authorization'->>'constitution_decision_id' IS NULL THEN
            RAISE EXCEPTION 'CONSTITUTIONAL_SOURCE_DEFENSE_VIOLATION: Direct TRUE_NEW_SOURCE registration blocked. Source % lacks constitutional decision.', NEW.source_id;
          END IF;

          BEGIN
            v_dec_id := (NEW.field_telemetry->'constitutional_authorization'->>'constitution_decision_id')::UUID;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'CONSTITUTIONAL_SOURCE_DEFENSE_VIOLATION: Invalid constitution_decision_id format: %', NEW.field_telemetry->'constitutional_authorization'->>'constitution_decision_id';
          END;

          SELECT * INTO v_decision 
          FROM public.atlas_constitution_decisions 
          WHERE decision_id = v_dec_id;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'CONSTITUTIONAL_SOURCE_DEFENSE_VIOLATION: Forged authorization! Decision % not found in ledger.', v_dec_id;
          END IF;

          IF v_decision.novelty_status != 'TRUE_NEW_SOURCE' OR v_decision.final_decision != 'CERTIFY' THEN
            RAISE EXCEPTION 'CONSTITUTIONAL_SOURCE_DEFENSE_VIOLATION: Decision % does not certify source % as TRUE_NEW_SOURCE (novelty=%, final_decision=%).',
              v_dec_id, NEW.source_id, v_decision.novelty_status, v_decision.final_decision;
          END IF;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_enforce_source_constitution_authorization ON public.atlas_source_knowledge_map;
    CREATE TRIGGER trg_enforce_source_constitution_authorization
    BEFORE INSERT OR UPDATE ON public.atlas_source_knowledge_map
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_source_constitution_authorization();
  `);
  console.log('  [PASS] Source knowledge defense trigger deployed on public.atlas_source_knowledge_map.');

  console.log('\n========================================================================');
  console.log('✅ ALL UNFORGEABLE CONSTITUTION V3 DEFENSES DEPLOYED CLEANLY');
  console.log('========================================================================');

  await client.end();
}

deployUnforgeableConstitutionV3().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
