import { dbPool } from '../server/db.ts';
import { AtlasConnectorExecutor } from '../server/services/industrial/connectors/AtlasConnectorExecutor.ts';
import { AtlasSourceKnowledgePlanner } from '../server/services/industrial/AtlasSourceKnowledgePlanner.ts';

async function testSources() {
  const kmPlanner = AtlasSourceKnowledgePlanner.getInstance(dbPool);
  const sources = await kmPlanner.planKnownSources({
    category: 'SERVICIOS_AUTOMOTORES',
    entity_subtype: 'garages y playas de estacionamiento',
    geography: 'ARG_CABA',
    entity_type: 'ESTABLISHMENT',
    row_unit: 'ESTABLISHMENT',
    relation: 'SERVICE_PROVIDER'
  } as any, 'GARAGE CABA');

  console.log('Planned sources count:', sources.length);
  for (const s of sources) {
    console.log(`Source: ${s.source_id} | ${s.source_name} | url: ${s.canonical_url}`);
    const executor = AtlasConnectorExecutor.getInstance(dbPool);
    const res = await executor.execute(s.capability_ir, undefined, { maxRows: 10, timeoutMs: 5000 });
    console.log(` -> Status: ${res.status} | Scanned: ${res.records_scanned} | Extracted: ${res.records_extracted} | Resource: ${res.resource_selected}`);
    if (res.entities && res.entities.length > 0) {
      console.log(' -> Sample entity:', res.entities[0]);
    }
  }
  process.exit(0);
}

testSources().catch(err => {
  console.error(err);
  process.exit(1);
});
