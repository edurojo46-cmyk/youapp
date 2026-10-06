import { dbPool } from '../server/db.ts';
import { AtlasConnectorExecutor } from '../server/services/industrial/connectors/AtlasConnectorExecutor.ts';

async function testSingle() {
  const kmRes = await dbPool.query(`
    SELECT source_id, source_name, canonical_url, source_family, supported_motor_template, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403'
  `);
  
  const kmRow = kmRes.rows[0];
  const capIR = kmRow.field_telemetry?.capability_ir;
  console.log('Testing:', kmRow.source_id, kmRow.source_name);
  
  const executor = AtlasConnectorExecutor.getInstance(dbPool);
  const res = await executor.execute(capIR, undefined, {
    maxRows: 50,
    timeoutMs: 15000
  });

  console.log('Status:', res.status);
  console.log('Records scanned:', res.records_scanned);
  console.log('Records extracted:', res.records_extracted);
  console.log('Resource selected:', res.resource_selected);
  if (res.entities && res.entities.length > 0) {
    console.log('First entity:', JSON.stringify(res.entities[0], null, 2));
  } else {
    console.log('No entities');
  }
  process.exit(0);
}

testSingle().catch(err => {
  console.error(err);
  process.exit(1);
});
