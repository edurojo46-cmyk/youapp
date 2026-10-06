import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

const testUserId = '768efac1-8d4c-4a19-8919-2de323884569'; // User A from last test
const res = await client.query(`
  SELECT 
    s.id as saved_id,
    s.company_id,
    s.product_id,
    COALESCE(p.name, ent.canonical_name) as name,
    ent.canonical_entity_id,
    ent.canonical_name,
    ent.metadata as ent_meta,
    p.attributes_json as prod_attr
  FROM public.atlas_user_saved_relations s
  LEFT JOIN public.atlas_products p ON s.product_id = p.product_id
  LEFT JOIN public.atlas_canonical_entities ent ON s.company_id = ent.canonical_entity_id
  WHERE s.user_id = $1::uuid
  ORDER BY s.saved_at DESC
  LIMIT 20;
`, [testUserId]);

console.log(`Loaded ${res.rows.length} test records for User A.`);

// Check contacts from atlas_contacts
const entityIds = res.rows.map(r => r.company_id || r.canonical_entity_id);
const contactsRes = await client.query(`
  SELECT c.entity_id, c.email, c.recipient_type, e.source_type, e.source_url
  FROM public.atlas_contacts c
  LEFT JOIN public.atlas_contact_evidence e ON c.contact_id = e.contact_id
  WHERE c.entity_id = ANY($1::uuid[]);
`, [entityIds]);

const contactsMap = new Map();
for (const c of contactsRes.rows) {
  if (!contactsMap.has(c.entity_id)) contactsMap.set(c.entity_id, []);
  contactsMap.get(c.entity_id).push(c);
}

// Function to compute Suggested Priority & Reasons
function computeSuggestedPriority(item, contacts) {
  const isConstitutional = Boolean(
    item.prod_attr?.constitutional_authorization?.constitution_decision_id ||
    item.ent_meta?.constitutional_authorization?.constitution_decision_id
  );

  const hasEmail = contacts.some(c => c.recipient_type !== 'PERSON' && !c.email.startsWith('tel:'));
  const hasPhone = contacts.some(c => c.email.startsWith('tel:'));
  const hasWeb = Boolean(item.ent_meta?.website);
  const hasForm = Boolean(item.ent_meta?.contact_form_url);

  const reasons = [];

  // Mission / Product Fit
  const hasMissionFit = Boolean(item.name && item.name.length > 3);
  if (hasMissionFit) {
    reasons.push('✓ Producto y empresa coinciden con el sector agroalimentario buscado');
  }

  // Constitutional Trust
  if (isConstitutional) {
    reasons.push('✓ Empresa constitucionalmente validada y certificada en Atlas');
  }

  // Contactability & Evaluation
  if (hasEmail || hasPhone) {
    if (hasEmail) reasons.push('✓ Correo electrónico institucional público verificado');
    if (hasPhone) reasons.push('✓ Teléfono público verificado');
    reasons.push('✓ Evidencia física disponible en registros oficiales');

    if (isConstitutional && hasMissionFit) {
      return {
        priority: 'HIGH',
        reasons,
        hasRealContact: true,
        hasMissionFit: true,
        hasProvenance: true
      };
    }
  }

  if (hasWeb || hasForm) {
    if (hasWeb) reasons.push('✓ Sitio web oficial indexado y validado');
    if (hasForm) reasons.push('✓ Formulario / mesa de consultas web disponible');
    reasons.push('⚠ Requiere prospección adicional para obtener canal directo');

    return {
      priority: 'MEDIUM',
      reasons,
      hasRealContact: false,
      hasMissionFit: true,
      hasProvenance: true
    };
  }

  // No contacts available
  reasons.push('✓ Registrada en el Catálogo Industrial oficial');
  reasons.push('⚠ Sin canal de contacto público verificado todavía');
  reasons.push('⚠ Requiere investigación manual');

  return {
    priority: 'LOW',
    reasons,
    hasRealContact: false,
    hasMissionFit: true,
    hasProvenance: false
  };
}

let highCount = 0;
let mediumCount = 0;
let lowCount = 0;
let insufficientCount = 0;

for (const r of res.rows) {
  const entityId = r.company_id || r.canonical_entity_id;
  const contacts = contactsMap.get(entityId) || [];
  const evalResult = computeSuggestedPriority(r, contacts);

  if (evalResult.priority === 'HIGH') highCount++;
  else if (evalResult.priority === 'MEDIUM') mediumCount++;
  else if (evalResult.priority === 'LOW') lowCount++;
  else insufficientCount++;

  console.log(`- ${r.canonical_name || r.name}: SUGGESTED_${evalResult.priority}`);
  console.log(`  Reasons: ${evalResult.reasons.join(' | ')}`);
}

console.log('\n--- SUGGESTED PRIORITY COUNTS ---');
console.log(`SUGGESTED_HIGH = ${highCount}`);
console.log(`SUGGESTED_MEDIUM = ${mediumCount}`);
console.log(`SUGGESTED_LOW = ${lowCount}`);
console.log(`SUGGESTED_INSUFFICIENT_DATA = ${insufficientCount}`);

await client.end();
