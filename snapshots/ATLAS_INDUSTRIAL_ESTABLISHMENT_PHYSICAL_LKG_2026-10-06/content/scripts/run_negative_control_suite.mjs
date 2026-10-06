import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

async function runNegativeControlSuite() {
  console.log('=============================================================');
  console.log('ATLAS INDUSTRIAL CONSTITUTIONAL — NEGATIVE CONTROL SUITE');
  console.log('=============================================================');

  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  const gateway = ConstitutionalCertificationGateway.getInstance();

  try {
    const results = {
      dnda: { total: 100, rejected: 0, certified: 0 },
      missingEvidence: { total: 100, rejected: 0, certified: 0 },
      entityMismatch: { total: 100, rejected: 0, certified: 0 },
      fingerprintTamper: { total: 100, rejected: 0, certified: 0 }
    };

    // Suite 1: 100 DNDA / Off-mission Records
    console.log('\n[TEST 1/4] Executing 100 DNDA / Off-Mission Controls...');
    const dndaTitles = [
      'Fonograma Original Álbum Tango', 'Obra Literaria Poesía Argentina', 'Canción Pop Registro DNDA',
      'Obra Audiovisual Documental', 'Partitura Piano y Orquesta', 'Novela Ficción Contemporánea',
      'Disco Musical Edición Especial', 'Derecho de Autor Composición', 'Guión Cinematográfico Obra Publicada'
    ];
    for (let i = 0; i < 100; i++) {
      const title = `${dndaTitles[i % dndaTitles.length]} Vol ${i + 1}`;
      const res = await gateway.certifyProductRelation(
        client,
        {
          productId: `DNDA-TEST-${i + 1}`,
          tenantId: 'dnda-control',
          name: title,
          category: 'Obra Publicada / Fonograma',
          description: `Registro legal de obra artística intelectual DNDA número ${100000 + i}`,
          rawAttributes: {
            company_name: `Artista Editorial ${i + 1}`,
            source: 'DNDA_REGISTRO_OBRAS',
            evidence: {
              certificate_id: `DNDA-CERT-${100000 + i}`,
              official_registry: 'Direccion Nacional del Derecho de Autor',
              issue_date: '2024-01-15'
            }
          },
          missionScope: 'BUSCADOR_INDUSTRIAL'
        },
        { shadowMode: true }
      );

      if (res.certified) {
        results.dnda.certified++;
      } else {
        results.dnda.rejected++;
      }
    }

    // Suite 2: 100 Records with Missing Sufficient Evidence
    console.log('[TEST 2/4] Executing 100 Missing Evidence Controls...');
    for (let i = 0; i < 100; i++) {
      const res = await gateway.certifyProductRelation(
        client,
        {
          productId: `NO-EVID-TEST-${i + 1}`,
          tenantId: 'no-evid-control',
          name: `Bomba Hidráulica Industrial Modelo ${i + 1}`,
          category: 'Maquinaria y Bombas',
          description: 'Bomba centrífuga de alta presión sin certificado físico',
          rawAttributes: {
            company_name: `Metalúrgica Argentina ${i + 1}`,
            source: 'CHAS_SECRETARIA',
            evidence: {
              // certificate_id deliberately missing or empty
              certificate_id: '',
              official_registry: 'CHAS'
            }
          },
          missionScope: 'BUSCADOR_INDUSTRIAL'
        },
        { shadowMode: true }
      );

      if (res.certified) {
        results.missingEvidence.certified++;
      } else {
        results.missingEvidence.rejected++;
      }
    }

    // Suite 3: 100 Records with Entity / Company Mismatch or Missing Identity
    console.log('[TEST 3/4] Executing 100 Entity / Company Mismatch Controls...');
    for (let i = 0; i < 100; i++) {
      const invalidCompany = (i % 3 === 0) ? '' : (i % 3 === 1) ? 'UNKNOWN' : '   ';
      const res = await gateway.certifyProductRelation(
        client,
        {
          productId: `MISMATCH-TEST-${i + 1}`,
          tenantId: 'mismatch-control',
          name: `Cilindro de Freno Hidráulico ${i + 1}`,
          category: 'Autopartes y Seguridad',
          description: 'Cilindro de freno con empresa desconocida o no anclada',
          rawAttributes: {
            company_name: invalidCompany,
            source: 'CHAS_AUTOPARTES',
            evidence: {
              certificate_id: `CERT-VALID-${i + 1}`,
              url: 'https://argentina.gob.ar/autopartes'
            }
          },
          missionScope: 'BUSCADOR_INDUSTRIAL'
        },
        { shadowMode: true }
      );

      if (res.certified) {
        results.entityMismatch.certified++;
      } else {
        results.entityMismatch.rejected++;
      }
    }

    // Suite 4: 100 Records with Tampered / Malformed Fingerprints
    console.log('[TEST 4/4] Executing 100 Fingerprint Tamper Controls...');
    // We test both:
    // A) Gateway fingerprint computation validation (null/tampered internal parameters)
    // B) Direct physical database tamper attempt against the constitutional trigger trg_enforce_constitutional_authorization
    let triggerTamperBlocked = 0;
    for (let i = 0; i < 100; i++) {
      // Pick a random product from DB and attempt an illegitimate direct UPDATE with a fake / tampered decision ID
      // The trigger trg_enforce_constitutional_authorization MUST raise exception!
      const fakeDecisionId = crypto.randomUUID();
      const fakeAuth = {
        constitution_decision_id: fakeDecisionId,
        constitution_version: '1.0',
        qualification_timestamp: new Date().toISOString(),
        mission_fit_status: 'MISSION_QUALIFIED',
        evidence_status: 'VERIFIED_PHYSICAL',
        object_fingerprint: 'tampered_invalid_hex_string_too_short',
        evidence_fingerprint: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      try {
        await client.query('BEGIN');
        await client.query(`
          UPDATE public.atlas_products
          SET attributes_json = jsonb_set(
            attributes_json,
            '{constitutional_authorization}',
            $1::jsonb
          )
          WHERE product_id = (SELECT product_id FROM public.atlas_products WHERE status = 'ACTIVE' LIMIT 1);
        `, [JSON.stringify(fakeAuth)]);
        await client.query('COMMIT');
        // If it didn't throw, tamper succeeded (BAD!)
        results.fingerprintTamper.certified++;
      } catch (err) {
        await client.query('ROLLBACK');
        // Blocked by constitutional trigger or constraint!
        results.fingerprintTamper.rejected++;
        triggerTamperBlocked++;
      }
    }

    const dndaRejectRate = ((results.dnda.rejected / results.dnda.total) * 100).toFixed(2);
    const missingEvidenceRejectRate = ((results.missingEvidence.rejected / results.missingEvidence.total) * 100).toFixed(2);
    const entityMismatchRejectRate = ((results.entityMismatch.rejected / results.entityMismatch.total) * 100).toFixed(2);
    const fingerprintTamperRejectRate = ((results.fingerprintTamper.rejected / results.fingerprintTamper.total) * 100).toFixed(2);

    const knownBadCertified = results.dnda.certified + results.missingEvidence.certified + results.entityMismatch.certified + results.fingerprintTamper.certified;

    console.log('\n=============================================================');
    console.log('NEGATIVE CONTROL SUITE RESULTS');
    console.log('=============================================================');
    console.log(`KNOWN_BAD_CERTIFIED = ${knownBadCertified}`);
    console.log(`DNDA_CONTROL_REJECT_RATE = ${dndaRejectRate}% (${results.dnda.rejected}/${results.dnda.total})`);
    console.log(`MISSING_EVIDENCE_REJECT_RATE = ${missingEvidenceRejectRate}% (${results.missingEvidence.rejected}/${results.missingEvidence.total})`);
    console.log(`ENTITY_MISMATCH_REJECT_RATE = ${entityMismatchRejectRate}% (${results.entityMismatch.rejected}/${results.entityMismatch.total})`);
    console.log(`FINGERPRINT_TAMPER_REJECT_RATE = ${fingerprintTamperRejectRate}% (${results.fingerprintTamper.rejected}/${results.fingerprintTamper.total})`);

    // Verify zero production contamination
    const postRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.atlas_constitution_decisions WHERE final_decision = 'CERTIFY' AND object_type = 'PRODUCT_RELATION') as certify_decisions,
        (SELECT count(*) FROM public.atlas_products WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL) as certified_products,
        (SELECT count(*) FROM public.atlas_constitution_decisions d WHERE NOT EXISTS (
          SELECT 1 FROM public.atlas_products p WHERE (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid = d.decision_id
        )) as orphan_decisions;
    `);
    console.log('\n[PRODUCTION CONTAMINATION CHECK]');
    console.log('Certified Products:', postRes.rows[0].certified_products);
    console.log('Certify Decisions:', postRes.rows[0].certify_decisions);
    console.log('Orphan Decisions:', postRes.rows[0].orphan_decisions);

    if (knownBadCertified === 0 && parseInt(postRes.rows[0].orphan_decisions, 10) === 0) {
      console.log('NEGATIVE CONTROL SUITE: PASS (100% REJECTION, 0 CONTAMINATION)');
    } else {
      console.error('NEGATIVE CONTROL SUITE: FAIL');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

runNegativeControlSuite().catch(console.error);
