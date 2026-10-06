import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function deployDefenseInDepth() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('>>> Deploying Constitutional Defense-in-Depth Trigger on public.atlas_products...');

  const ddl = `
    CREATE OR REPLACE FUNCTION public.fn_enforce_constitutional_authorization()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Database Defense in Depth: New certified records require valid constitutional authorization
      IF NEW.status = 'ACTIVE' OR NEW.status = 'CERTIFIED' THEN
        -- If existing active record is updated without status change, preserve compatibility
        IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
          RETURN NEW;
        END IF;

        IF NEW.attributes_json IS NULL 
           OR NEW.attributes_json->'constitutional_authorization' IS NULL 
           OR NEW.attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NULL 
           OR NEW.attributes_json->'constitutional_authorization'->>'constitution_version' IS NULL
           OR NEW.attributes_json->'constitutional_authorization'->>'qualification_timestamp' IS NULL
           OR NEW.attributes_json->'constitutional_authorization'->>'mission_fit_status' != 'MISSION_QUALIFIED'
           OR NEW.attributes_json->'constitutional_authorization'->>'evidence_status' != 'VERIFIED_PHYSICAL' THEN
           
           RAISE EXCEPTION 'CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION: Direct certification write blocked. Record % lacks valid constitutional_authorization metadata.', NEW.product_id;
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
  `;

  await client.query(ddl);
  console.log('✅ Trigger trg_enforce_constitutional_authorization deployed successfully.');

  await client.end();
}

deployDefenseInDepth().catch(err => {
  console.error('Failed to deploy trigger:', err);
  process.exit(1);
});
