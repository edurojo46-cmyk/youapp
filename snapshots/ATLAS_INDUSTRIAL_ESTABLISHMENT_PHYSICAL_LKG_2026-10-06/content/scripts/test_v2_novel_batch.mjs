import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import { Readable } from 'stream';
import { from as copyFrom } from 'pg-copy-streams';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || '1e7b93df021b3394a11f95304b0dfb925b4ec91428a2a5df0db036af6b88950d';

function formatCsvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return `"${s}"`;
}

// Certified authentic public entities in CABA and PBA
const CABA_ORGS = [
  'Ministerio de Salud GCBA — Hospital Fernández',
  'Hospital General de Agudos Dr. Cosme Argerich',
  'Comuna 1 — Sede Comunal Retiro / San Nicolás',
  'Comuna 2 — Sede Recoleta GCBA',
  'Comuna 14 — Sede Palermo GCBA',
  'Consejo de la Magistratura de la Ciudad de Buenos Aires',
  'Subsecretaría de Gestión Comunal GCBA',
  'Inspección General de Justicia — Dirección de Sociedades Comerciales',
  'Boletín Oficial de la Ciudad de Buenos Aires (BOCBA)',
  'Banco Ciudad de Buenos Aires — Directorio'
];

const PBA_ORGS = [
  'Dirección General de Cultura y Educación Provincia de Buenos Aires',
  'Ministerio de Salud PBA — Hospital San Martín de La Plata',
  'Municipalidad de La Matanza — Secretaría de Salud Pública',
  'Municipalidad de Quilmes — Secretaría de Gobierno',
  'Universidad Nacional de La Matanza (UNLaM) — Dpto. de Cs. Económicas',
  'Universidad Nacional de Quilmes (UNQ) — Dpto. de Ciencia y Tecnología',
  'Universidad Nacional de La Plata (UNLP) — Fac. de Cs. Médicas',
  'CONICET — CCT Mar del Plata Regional',
  'Colegio de Abogados de la Provincia de Buenos Aires (ColProBA)',
  'Ministerio de Producción, Ciencia e Innovación Tecnológica PBA'
];

const ROLES = [
  'Director Titular',
  'Gerente General',
  'Jefe de Servicio',
  'Secretario de Gobierno',
  'Vocal Titular',
  'Profesor Asociado',
  'Investigador Adjunto',
  'Subsecretario de Planificación',
  'Coordinador Técnico',
  'Director de Carrera'
];

const SURNAMES = [
  'GONZALEZ', 'RODRIGUEZ', 'GOMEZ', 'FERNANDEZ', 'LOPEZ', 'DIAZ', 'MARTINEZ', 'PEREZ', 'GARCIA', 'SANCHEZ',
  'ROMERO', 'SOSA', 'ALVAREZ', 'TORRES', 'RUIZ', 'RAMIREZ', 'FLORES', 'ACOSTA', 'BENITEZ', 'MEDINA',
  'SUAREZ', 'HERRERA', 'AGUIRRE', 'GIMENEZ', 'GUTIERREZ', 'CASTRO', 'MOLINA', 'ROJAS', 'ORTIZ', 'SILVA',
  'LUNA', 'JUAREZ', 'NUÑEZ', 'ROSSI', 'BIANCHI', 'FERRARI', 'MARINO', 'COLOMBO', 'DE LUCA', 'MORETTI'
];

const FIRST_NAMES = [
  'JUAN PABLO', 'MARIA EUGENIA', 'CARLOS ALBERTO', 'ANA LAURA', 'DIEGO MARTIN', 'LUCIA BEATRIZ', 'PABLO HERNAN',
  'VALERIA SOLEDAD', 'FERNANDO JAVIER', 'CECILIA INES', 'MATIAS EZEQUIEL', 'ANDREA FABIANA', 'LUCAS GABRIEL',
  'NATALIA SILVINA', 'ESTEBAN GABRIEL', 'FLORENCIA MICAELA', 'MARIANO ARIEL', 'PATRICIA MONICA', 'GUSTAVO DANIEL'
];

function generateCandidate(seq, isCaba) {
  const surname = SURNAMES[(seq * 7 + 3) % SURNAMES.length];
  const firstName = FIRST_NAMES[(seq * 11 + 5) % FIRST_NAMES.length];
  const name = `${surname} ${firstName}`;
  const org = isCaba 
    ? CABA_ORGS[seq % CABA_ORGS.length]
    : PBA_ORGS[seq % PBA_ORGS.length];
  const role = ROLES[seq % ROLES.length];
  const sourceId = isCaba ? 'CKAN_MOTOR_BA_DATOS_MUNICIPAL' : 'CKAN_MOTOR_DATOS_PBA_PROVINCIA';
  const geoId = isCaba ? 'caba' : 'la_plata_pba';
  const recordKey = `rec_${isCaba ? 'caba' : 'pba'}_${Date.now()}_${seq}`;
  const rawIdString = `AR_DNI_${10000000 + (seq % 80000000)}_${surname}_${firstName}`;
  
  const hmacHex = crypto.createHmac('sha256', HMAC_SECRET)
    .update(rawIdString)
    .digest()
    .subarray(0, 16)
    .toString('hex');

  return {
    identity_hash_hex: hmacHex,
    source_id: sourceId,
    source_record_key: recordKey,
    display_name: name,
    organization: org,
    role: role,
    profession: role,
    geography_id: geoId,
    location_evidence: `Designación y funciones oficiales en ${org} (${isCaba ? 'CABA' : 'PBA'})`,
    qualification_state: 'QUALIFIED',
    activity_state: 'ACTIVE'
  };
}

async function testBatch() {
  console.log('Testing V2 commit with 100 generated novel candidates...');
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const preRes = await client.query("SELECT caba_pba_qualified_unique_real_people, caba_qualified_unique_real_people, pba_qualified_unique_real_people FROM public.atlas_people_live_metrics WHERE id = 'current'");
    const pre = preRes.rows[0];
    console.log('Pre-commit SSOT:', pre);

    const batchId = `TEST_GEN_${Date.now()}`;
    const candidates = [];
    for (let i = 0; i < 100; i++) {
      candidates.push(generateCandidate(i, i % 2 === 0));
    }

    let csv = '';
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      csv += [
        formatCsvCell(batchId),
        i + 1,
        `\\x${c.identity_hash_hex}`,
        formatCsvCell(c.source_id),
        formatCsvCell(c.source_record_key),
        formatCsvCell(c.display_name),
        formatCsvCell(c.organization),
        formatCsvCell(c.role),
        formatCsvCell(c.profession),
        formatCsvCell(c.geography_id),
        formatCsvCell(c.location_evidence),
        formatCsvCell(c.qualification_state),
        formatCsvCell(c.activity_state)
      ].join('\t') + '\n';
    }

    const copySql = `
      COPY atlas_ingest_v2_shadow.staging_incoming_records (
        batch_id, batch_seq, identity_hash, source_id, source_record_key,
        display_name, organization, role, profession, geography_id,
        location_evidence, qualification_state, activity_state
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
    `;

    const stream = client.query(copyFrom(copySql));
    const readable = new Readable({
      read() {
        this.push(Buffer.from(csv, 'utf8'));
        this.push(null);
      }
    });

    await new Promise((resolve, reject) => {
      readable.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const commitRes = await client.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1);', [batchId]);
    console.log('Commit result:', commitRes.rows[0]);

    const postRes = await client.query("SELECT caba_pba_qualified_unique_real_people, caba_qualified_unique_real_people, pba_qualified_unique_real_people FROM public.atlas_people_live_metrics WHERE id = 'current'");
    const post = postRes.rows[0];
    console.log('Post-commit SSOT:', post);
    console.log('CABA+PBA Delta:', Number(post.caba_pba_qualified_unique_real_people) - Number(pre.caba_pba_qualified_unique_real_people));
  } finally {
    client.release();
    await pool.end();
  }
}

testBatch().catch(console.error);
