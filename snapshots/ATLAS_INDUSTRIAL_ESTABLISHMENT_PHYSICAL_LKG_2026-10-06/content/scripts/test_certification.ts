import { dbPool } from '../server/db.ts';
import { AtlasConnectorExecutor } from '../server/services/industrial/connectors/AtlasConnectorExecutor.ts';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

async function testCertification() {
  const kmRes = await dbPool.query(`
    SELECT source_id, source_name, canonical_url, source_family, supported_motor_template, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_BD572121C1'
  `);
  
  const kmRow = kmRes.rows[0];
  const capIR = kmRow.field_telemetry?.capability_ir;
  console.log('capIR:', capIR?.source_name, capIR?.connector_family);

  const executor = AtlasConnectorExecutor.getInstance(dbPool);
  const execRes = await executor.execute(capIR, undefined, { maxRows: 5, timeoutMs: 20000 });
  console.log('Entities extracted count:', execRes.entities?.length);
  
  if (execRes.entities && execRes.entities.length > 0) {
    const cand = execRes.entities[0];
    console.log('Sample candidate:', cand);
    
    const gateway = ConstitutionalCertificationGateway.getInstance();
    const certCandidate = {
      productId: 'test-p-1',
      name: `SERVICIOS_AUTOMOTORES — ${cand.name}`,
      category: 'SERVICIOS_AUTOMOTORES',
      description: `SERVICIOS_AUTOMOTORES — ${cand.name} provisto por ${cand.name}`,
      rawAttributes: {
        company_name: cand.name,
        company_id: 'test-c-1',
        relationship_type: 'SERVICE_PROVIDER',
        role: 'SERVICE_PROVIDER',
        row_unit: 'ESTABLISHMENT',
        entity_type: 'ESTABLISHMENT',
        target_sector: 'SERVICIOS_AUTOMOTORES',
        source_id: 'SRC_CKAN_PORTAL_8E56C7A403',
        evidence: {
          certificate_id: `CERT-123`,
          source_id: 'SRC_CKAN_PORTAL_8E56C7A403',
          url: cand.source_url || 'https://data.buenosaires.gob.ar/',
          official_registry: 'Buenos Aires Data - Estacionamientos Comerciales',
          cuit: cand.cuit,
          address: cand.address
        },
        structured_attributes: {},
        contact_requirements: { email_required: false, phone_required: false, public_contact_required: false }
      },
      missionScope: 'BUSCADOR_INDUSTRIAL'
    };
    
    const certRes = await gateway.certifyProductRelation(dbPool, certCandidate);
    console.log('Certification result:', JSON.stringify(certRes, null, 2));
  }
  process.exit(0);
}

testCertification().catch(err => {
  console.error(err);
  process.exit(1);
});
