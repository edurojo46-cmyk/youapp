import { dbPool } from '../server/db.ts';
import { AtlasConnectorExecutor } from '../server/services/industrial/connectors/AtlasConnectorExecutor.ts';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

async function testCert() {
  const kmRes = await dbPool.query(`
    SELECT source_id, source_name, canonical_url, source_family, supported_motor_template, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403'
  `);
  
  const kmRow = kmRes.rows[0];
  const capIR = kmRow.field_telemetry?.capability_ir;
  capIR.technical_inspection.resource_links = [
    'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/transporte-y-obras-publicas/estacionamientos-motos/estacionamientos-de-motos-privado.csv'
  ];

  const executor = AtlasConnectorExecutor.getInstance(dbPool);
  const execRes = await executor.execute(capIR, undefined, { maxRows: 5, timeoutMs: 15000 });
  console.log('Entities extracted count:', execRes.entities?.length);
  
  if (execRes.entities && execRes.entities.length > 0) {
    const cand = execRes.entities[0];
    console.log('Candidate name:', cand.name);
    
    const gateway = ConstitutionalCertificationGateway.getInstance();
    const certCandidate = {
      productId: crypto.randomUUID(),
      name: `SERVICIOS_AUTOMOTORES — ${cand.name}`,
      category: 'SERVICIOS_AUTOMOTORES',
      description: `SERVICIOS_AUTOMOTORES — ${cand.name} provisto por ${cand.name}`,
      rawAttributes: {
        company_name: cand.name,
        company_id: crypto.randomUUID(),
        relationship_type: 'SERVICE_PROVIDER',
        role: 'SERVICE_PROVIDER',
        row_unit: 'ESTABLISHMENT',
        entity_type: 'ESTABLISHMENT',
        target_sector: 'SERVICIOS_AUTOMOTORES',
        rubros: 'SERVICIOS_AUTOMOTORES',
        source_id: 'SRC_CKAN_PORTAL_8E56C7A403',
        evidence: {
          certificate_id: `CERT-123-${Date.now()}`,
          source_id: 'SRC_CKAN_PORTAL_8E56C7A403',
          url: cand.source_url || 'https://data.buenosaires.gob.ar/',
          official_registry: 'Buenos Aires Data - Estacionamientos Comerciales',
          cuit: cand.cuit,
          address: cand.address
        },
        structured_attributes: {
          role: 'SERVICE_PROVIDER',
          is_person: false
        },
        contact_requirements: { email_required: false, phone_required: false, public_contact_required: false }
      },
      missionScope: 'BUSCADOR_INDUSTRIAL'
    };
    
    const certRes = await gateway.certifyProductRelation(dbPool, certCandidate);
    console.log('Certification result:', JSON.stringify(certRes, null, 2));
  }
  process.exit(0);
}

testCert().catch(err => {
  console.error(err);
  process.exit(1);
});
