import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const TARGET_NEW_RELATIONS = 45000;
const BATCH_SIZE = 1000;
const chasPath = path.resolve('scratch/physical_sources/chas_autopartes_seguridad.csv');

async function scaleIndustrialV2() {
  console.log('========================================================================');
  console.log('🚀 ATLAS INDUSTRIAL CATALOG — AUTONOMOUS SCALE V2');
  console.log(`TARGET NEW CERTIFIED RELATIONS: ${TARGET_NEW_RELATIONS.toLocaleString()}`);
  console.log('UNIVERSE: SECRETARIA DE INDUSTRIA - CHAS (Autopartes y Seguridad)');
  console.log('========================================================================\n');

  if (!fs.existsSync(chasPath)) {
    throw new Error(`CHAS source file not found at ${chasPath}`);
  }

  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  const tStart = Date.now();

  // 1. Check Baseline
  const baseRes = await client.query(`
    SELECT 
      count(*) as certified_relations,
      count(distinct name) as unique_products,
      count(distinct attributes_json->>'company_name') as unique_entities
    FROM public.atlas_products 
    WHERE status = 'ACTIVE';
  `);
  const baseline = {
    certifiedRelations: parseInt(baseRes.rows[0].certified_relations, 10),
    uniqueProducts: parseInt(baseRes.rows[0].unique_products, 10),
    uniqueEntities: parseInt(baseRes.rows[0].unique_entities, 10)
  };

  console.log('BASELINE CERTIFIED STATE:');
  console.log(`  CERTIFIED_RELATIONS = ${baseline.certifiedRelations.toLocaleString()}`);
  console.log(`  UNIQUE_PRODUCTS = ${baseline.uniqueProducts.toLocaleString()}`);
  console.log(`  UNIQUE_ENTITIES = ${baseline.uniqueEntities.toLocaleString()}`);
  console.log('--------------------------------------------------\n');

  // 2. Fetch existing entities from atlas_canonical_entities
  console.log('>>> [Step 1] Loading existing canonical entities from DB...');
  const existingEntitiesRes = await client.query(`
    SELECT canonical_entity_id, canonical_name, metadata->>'cuit' as cuit
    FROM public.atlas_canonical_entities
    WHERE entity_type = 'COMPANY';
  `);

  const companyNameToId = new Map();
  const companyCuitToId = new Map();

  for (const row of existingEntitiesRes.rows) {
    if (row.canonical_name) companyNameToId.set(row.canonical_name.trim().toLowerCase(), row.canonical_entity_id);
    if (row.cuit) companyCuitToId.set(row.cuit.replace(/\D/g, ''), row.canonical_entity_id);
  }
  console.log(`Loaded ${existingEntitiesRes.rows.length} existing COMPANY canonical entities.`);

  // 3. Scan CHAS and resolve/create canonical entities
  console.log('\n>>> [Step 2] Resolving & Provisioning Canonical Entities from CHAS...');
  const rlEntities = readline.createInterface({ input: fs.createReadStream(chasPath, 'utf8') });
  let header = null;
  const newEntitiesToInsert = [];
  const seenCompaniesInFile = new Set();

  for await (const line of rlEntities) {
    if (!line.trim()) continue;
    if (!header) { header = line; continue; }
    const cols = line.split(';');
    if (cols.length < 12) continue;

    const empresa = cols[0].trim();
    const cuit = cols[1].trim();
    if (!empresa || seenCompaniesInFile.has(empresa.toLowerCase())) continue;
    seenCompaniesInFile.add(empresa.toLowerCase());

    const cleanCuit = cuit.replace(/\D/g, '');
    const existingId = companyNameToId.get(empresa.toLowerCase()) || (cleanCuit ? companyCuitToId.get(cleanCuit) : null);

    if (!existingId) {
      const newEntityId = crypto.randomUUID();
      companyNameToId.set(empresa.toLowerCase(), newEntityId);
      if (cleanCuit) companyCuitToId.set(cleanCuit, newEntityId);

      newEntitiesToInsert.push({
        canonical_entity_id: newEntityId,
        tenant_id: '00000000-0000-0000-0000-000000000001',
        entity_type: 'COMPANY',
        canonical_name: empresa,
        normalized_name: empresa.toLowerCase(),
        primary_domain: 'produccion.gob.ar',
        status: 'ACTIVE',
        metadata: {
          cuit: cuit,
          source: 'SECRETARIA_DE_INDUSTRIA_CHAS',
          industry: 'Autopartes y Seguridad Industrial',
          category: 'Industria Metalmecánica y Automotriz',
          country: 'Argentina'
        }
      });
    }
  }

  if (newEntitiesToInsert.push.length > 0) {
    console.log(`Inserting ${newEntitiesToInsert.length} new canonical companies into public.atlas_canonical_entities...`);
    // Insert in batches of 200
    for (let i = 0; i < newEntitiesToInsert.length; i += 200) {
      const chunk = newEntitiesToInsert.slice(i, i + 200);
      const values = [];
      const params = [];
      let pIdx = 1;
      for (const ent of chunk) {
        values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(ent.canonical_entity_id, ent.tenant_id, ent.entity_type, ent.canonical_name, ent.normalized_name, ent.primary_domain, ent.status, JSON.stringify(ent.metadata));
      }
      await client.query(`
        INSERT INTO public.atlas_canonical_entities (canonical_entity_id, tenant_id, entity_type, canonical_name, normalized_name, primary_domain, status, metadata)
        VALUES ${values.join(', ')}
        ON CONFLICT (canonical_entity_id) DO NOTHING;
      `, params);
    }
    console.log(`Provisioned ${newEntitiesToInsert.length} new canonical entities successfully.`);
  }

  // 4. Ingest Product Relations with 100% evidence into atlas_products
  console.log('\n>>> [Step 3] Harvesting & Ingesting Certified Product Relations...');
  const rlProducts = readline.createInterface({ input: fs.createReadStream(chasPath, 'utf8') });
  header = null;

  let totalProcessed = 0;
  let batchRows = [];
  const tBatchStart = Date.now();

  for await (const line of rlProducts) {
    if (!line.trim()) continue;
    if (!header) { header = line; continue; }
    const cols = line.split(';');
    if (cols.length < 12) continue;

    const [empresa, cuit, expte, tipo, cert, producto, ncm, marca, modelo, origen, part_number, chas, fecha, desc] = cols.map(c => (c || '').trim());
    if (!empresa || !producto || !chas) continue;

    const cleanCuit = cuit.replace(/\D/g, '');
    const companyId = companyNameToId.get(empresa.toLowerCase()) || (cleanCuit ? companyCuitToId.get(cleanCuit) : null);
    if (!companyId) continue;

    const specificProductName = `${marca} ${modelo} (${producto})`.trim();
    const description = `${desc || producto} - Certificado CHAS: ${chas} (Expte: ${expte}, NCM: ${ncm})`.trim();

    const attributesJson = {
      company_id: companyId,
      company_name: empresa,
      cuit: cuit,
      relationship_type: 'UNKNOWN', // Non-negotiable quality rule: Never infer MANUFACTURER
      category: producto,
      province: 'No especificada',
      city: 'No especificada',
      source: 'SECRETARIA_DE_INDUSTRIA_CHAS',
      evidence: {
        url: 'https://cdn.produccion.gob.ar/cdn-secind/datos-abiertos-chas/chas-emitidos-a-diciembre-2024.csv',
        certificate_id: chas,
        expediente: expte,
        ncm: ncm,
        part_number: part_number,
        cuit: cuit,
        matched_text: `${producto} ${marca} ${modelo} (CHAS: ${chas})`,
        issue_date: fecha,
        origin: origen
      },
      last_verified_at: new Date().toISOString()
    };

    batchRows.push({
      product_id: crypto.randomUUID(),
      tenant_id: companyId,
      name: specificProductName,
      category: producto,
      description: description,
      status: 'ACTIVE',
      attributes_json: JSON.stringify(attributesJson)
    });

    if (batchRows.length >= BATCH_SIZE) {
      await insertProductBatch(client, batchRows);
      totalProcessed += batchRows.length;
      batchRows = [];

      if (totalProcessed % 5000 === 0) {
        const rate = (totalProcessed / ((Date.now() - tBatchStart) / 1000)).toFixed(1);
        console.log(`  -> Ingested ${totalProcessed.toLocaleString()} / ${TARGET_NEW_RELATIONS.toLocaleString()} certified relations (${rate} rel/sec)...`);
      }

      if (totalProcessed >= TARGET_NEW_RELATIONS) {
        break;
      }
    }
  }

  if (batchRows.length > 0 && totalProcessed < TARGET_NEW_RELATIONS) {
    await insertProductBatch(client, batchRows);
    totalProcessed += batchRows.length;
  }

  const durationSec = ((Date.now() - tBatchStart) / 1000).toFixed(2);
  const certifiedNetNewPerSecond = (totalProcessed / Math.max(0.1, durationSec)).toFixed(1);

  console.log(`\nIngestion completed: ${totalProcessed.toLocaleString()} new certified relations added in ${durationSec}s (${certifiedNetNewPerSecond} rel/sec).`);

  // 5. Final Recalculation & Integrity Verification
  console.log('\n>>> [Step 4] Final Recalculation & Certification Audit...');
  const postRes = await client.query(`
    SELECT 
      count(*) as total_relations,
      count(*) FILTER (WHERE status = 'ACTIVE') as certified_relations,
      count(*) FILTER (WHERE status = 'REJECTED') as rejected_relations,
      count(*) FILTER (WHERE status = 'ACTIVE' AND (attributes_json->'evidence' IS NOT NULL AND attributes_json->'evidence' != 'null'::jsonb)) as certified_with_evidence,
      count(*) FILTER (WHERE status = 'ACTIVE' AND (attributes_json->'evidence' IS NULL OR attributes_json->'evidence' = 'null'::jsonb)) as certified_without_evidence,
      count(distinct name) FILTER (WHERE status = 'ACTIVE') as unique_products,
      count(distinct attributes_json->>'company_name') FILTER (WHERE status = 'ACTIVE') as unique_entities
    FROM public.atlas_products;
  `);

  const r = postRes.rows[0];
  const certifiedRelations = parseInt(r.certified_relations, 10);
  const rejectedRelations = parseInt(r.rejected_relations, 10);
  const certifiedWithEvidence = parseInt(r.certified_with_evidence, 10);
  const certifiedWithoutEvidence = parseInt(r.certified_without_evidence, 10);
  const uniqueProducts = parseInt(r.unique_products, 10);
  const uniqueEntities = parseInt(r.unique_entities, 10);

  const newRelationsDelta = certifiedRelations - baseline.certifiedRelations;
  const newProductsDelta = uniqueProducts - baseline.uniqueProducts;
  const newEntitiesDelta = uniqueEntities - baseline.uniqueEntities;

  const evidenceCoverage = ((certifiedWithEvidence / certifiedRelations) * 100).toFixed(2) + '%';
  const certifiedOrphans = certifiedWithoutEvidence;

  console.log('FINAL AUDIT METRICS:');
  console.log(`  CERTIFIED_RELATIONS = ${certifiedRelations.toLocaleString()}`);
  console.log(`  UNIQUE_PRODUCTS = ${uniqueProducts.toLocaleString()}`);
  console.log(`  UNIQUE_ENTITIES = ${uniqueEntities.toLocaleString()}`);
  console.log(`  NEW_RELATIONS_DELTA = +${newRelationsDelta.toLocaleString()}`);
  console.log(`  NEW_PRODUCTS_DELTA = +${newProductsDelta.toLocaleString()}`);
  console.log(`  NEW_ENTITIES_DELTA = +${newEntitiesDelta.toLocaleString()}`);
  console.log(`  EVIDENCE_COVERAGE = ${evidenceCoverage}`);
  console.log(`  CERTIFIED_ORPHANS = ${certifiedOrphans}`);
  console.log(`  REJECTED_RELATIONS = ${rejectedRelations}`);
  console.log(`  CERTIFIED_NET_NEW_PER_SECOND = ${certifiedNetNewPerSecond}`);

  await client.end();

  return {
    certifiedRelations,
    uniqueProducts,
    uniqueEntities,
    newRelationsDelta,
    newProductsDelta,
    newEntitiesDelta,
    evidenceCoverage,
    certifiedOrphans,
    rejectedRelations,
    certifiedNetNewPerSecond
  };
}

async function insertProductBatch(client, rows) {
  const values = [];
  const params = [];
  let pIdx = 1;

  for (const row of rows) {
    values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
    params.push(row.product_id, row.tenant_id, row.name, row.category, row.description, row.status, row.attributes_json);
  }

  await client.query(`
    INSERT INTO public.atlas_products (product_id, tenant_id, name, category, description, status, attributes_json)
    VALUES ${values.join(', ')}
    ON CONFLICT (product_id) DO NOTHING;
  `, params);
}

if (process.argv[1] && process.argv[1].endsWith('scale_industrial_v2_autonomous.mjs')) {
  scaleIndustrialV2().then(res => {
    console.log('\n[V2 Scale Complete]');
  }).catch(err => {
    console.error('Fatal error scaling V2:', err);
    process.exit(1);
  });
}
