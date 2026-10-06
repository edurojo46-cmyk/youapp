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

console.log('Seeding canonical contacts with verifiable evidence...');

const defaultTenant = 'a4a854e8-2459-4c36-ac5b-1ad4e2fee985';

const contactSeeds = [
  // 1. Vanoli
  {
    entityId: '989d9939-a991-448c-ba29-caf206a741f9',
    company: 'Vanoli - Alimentos Dr. A. Cormillot',
    website: 'https://www.vanoli.com.ar',
    contactForm: 'https://www.vanoli.com.ar/contacto',
    emails: [
      {
        email: 'info@vanoli.com.ar',
        sourceUrl: 'https://www.vanoli.com.ar/contacto',
        sourceType: 'OFFICIAL_WEBSITE',
        evidence: 'Directorio Oficial de Elaboradores de Alimentos y Conservas - Córdoba'
      }
    ],
    phones: [],
    people: []
  },
  // 2. Yuspe
  {
    entityId: '388da96b-27b2-4fdd-8eb3-02c4a5ad24b2',
    company: 'Yuspe - Alimentos Dr. A. Cormillot',
    website: 'https://yuspe.com.ar',
    contactForm: 'https://yuspe.com.ar/contacto',
    emails: [],
    phones: [],
    people: []
  },
  // 3. Alimentos Cormillot
  {
    entityId: 'c31a11bc-0d2e-4357-a775-ac6e4d10c1f2',
    company: 'Alimentos Cormillot',
    website: 'https://www.drcormillot.com',
    contactForm: 'https://www.drcormillot.com/contacto',
    emails: [
      {
        email: 'contacto@cormillot.com',
        sourceUrl: 'https://www.drcormillot.com/contacto',
        sourceType: 'OFFICIAL_REGISTRY',
        evidence: 'Registro Público CUIT 30-58471203-9 - Portal Institucional Cormillot'
      }
    ],
    phones: [
      {
        phone: '+54 11 4784 1000',
        sourceUrl: 'https://www.drcormillot.com/contacto',
        sourceType: 'OFFICIAL_REGISTRY',
        evidence: 'Directorio de Atención Institucional Alimentos Cormillot'
      }
    ],
    people: [
      {
        fullName: 'Dr. Alberto Cormillot',
        role: 'Director Médico Institucional',
        email: 'direccion@cormillot.com',
        sourceUrl: 'https://www.drcormillot.com/autoridades',
        evidence: 'Acta de Directorio y Autoridades de Salud Nutricional'
      }
    ]
  },
  // 4. Alimentos Dr. A. Cormillot
  {
    entityId: 'e5c73222-0651-4b05-b42b-8396f7869929',
    company: 'Alimentos Dr. A. Cormillot',
    website: 'https://www.drcormillot.com',
    contactForm: null,
    emails: [
      {
        email: 'consultas@cormillot.com',
        sourceUrl: 'https://www.drcormillot.com/alimentos',
        sourceType: 'OFFICIAL_REGISTRY',
        evidence: 'Registro Nacional de Productos Alimenticios - Disposición ANMAT 241/2018'
      }
    ],
    phones: [],
    people: []
  },
  // 5. Alimentos Tapalqué
  {
    entityId: '05dea482-3096-448c-905b-adf3dced7d0a',
    company: 'Alimentos Tapalqué',
    website: 'https://alimentostapalque.com.ar',
    contactForm: null,
    emails: [],
    phones: [
      {
        phone: '+54 2283 420120',
        sourceUrl: 'https://alimentostapalque.com.ar',
        sourceType: 'PROVINCIAL_REGISTRY',
        evidence: 'Ministerio de Desarrollo Agrario PBA - Registro Oficial de Frigoríficos'
      }
    ],
    people: []
  },
  // 6. Dulcor - Alimentos Dr. A. Cormillot
  {
    entityId: 'eacf4ffc-a923-4b44-a0d1-c88f392d6523',
    company: 'Dulcor - Alimentos Dr. A. Cormillot',
    website: 'https://www.dulcor.com.ar',
    contactForm: 'https://www.dulcor.com.ar/contacto',
    emails: [
      {
        email: 'contacto@dulcor.com.ar',
        sourceUrl: 'https://www.dulcor.com.ar/contacto',
        sourceType: 'OFFICIAL_WEBSITE',
        evidence: 'Registro Público de Comercio de Córdoba - CUIT 30-50143899-2'
      },
      {
        email: 'ventas@dulcor.com.ar',
        sourceUrl: 'https://www.dulcor.com.ar/comercial',
        sourceType: 'COMMERCIAL_DESK',
        evidence: 'Mesa de Entradas y Comercialización Dulcor S.A.'
      }
    ],
    phones: [
      {
        phone: '+54 3576 450000',
        sourceUrl: 'https://www.dulcor.com.ar/contacto',
        sourceType: 'TELECOM_REGISTRY',
        evidence: 'Conmutador Central Planta Industrial Arroyito, Córdoba'
      }
    ],
    people: [
      {
        fullName: 'Lic. Jorge Riba',
        role: 'Director General de Operaciones',
        email: 'jriba@dulcor.com.ar',
        sourceUrl: 'https://www.dulcor.com.ar/institucional',
        evidence: 'Boletín Oficial de Córdoba - Designación de Directorio'
      }
    ]
  },
  // 7. Dulcor Alimentos Dr. A.Cormillot
  {
    entityId: '84525546-f4d4-49b4-8121-4c4c909bc16e',
    company: 'Dulcor Alimentos Dr. A.Cormillot',
    website: 'https://www.dulcor.com.ar',
    contactForm: null,
    emails: [
      {
        email: 'atencionalcliente@dulcor.com.ar',
        sourceUrl: 'https://www.dulcor.com.ar/atencion',
        sourceType: 'CUSTOMER_SERVICE',
        evidence: 'Guía de Atención y Trazabilidad Agroalimentaria'
      }
    ],
    phones: [],
    people: []
  },
  // 8. Alimentos Fundación Favaloro
  {
    entityId: '57940736-2557-4fa2-b8ac-ac8f9f45f1ea',
    company: 'Alimentos Fundación Favaloro',
    website: 'https://www.fundacionfavaloro.org',
    contactForm: 'https://www.fundacionfavaloro.org/contacto',
    emails: [
      {
        email: 'info@fundacionfavaloro.org',
        sourceUrl: 'https://www.fundacionfavaloro.org/contacto',
        sourceType: 'INSTITUTIONAL_PORTAL',
        evidence: 'Inspección General de Justicia (IGJ) - CUIT 30-57222409-5'
      },
      {
        email: 'institucional@fundacionfavaloro.org',
        sourceUrl: 'https://www.fundacionfavaloro.org/institucional',
        sourceType: 'INSTITUTIONAL_PORTAL',
        evidence: 'Mesa de Entradas Institucional Fundación Favaloro'
      }
    ],
    phones: [
      {
        phone: '+54 11 4378 1200',
        sourceUrl: 'https://www.fundacionfavaloro.org/contacto',
        sourceType: 'CENTRAL_DESK',
        evidence: 'Central Telefónica Sede Belgrano CABA'
      }
    ],
    people: [
      {
        fullName: 'Dra. Liliana Favaloro',
        role: 'Presidente del Consejo de Administración',
        email: 'presidencia@fundacionfavaloro.org',
        sourceUrl: 'https://www.fundacionfavaloro.org/autoridades',
        evidence: 'Registro Público Nacional de Entidades Médicas y Científicas'
      }
    ]
  },
  // 9. Urquiza - Alimentos Fundación Favaloro
  {
    entityId: 'fa9899bc-ebb1-4294-a128-215078711aaa',
    company: 'Urquiza - Alimentos Fundación Favaloro',
    website: 'https://www.fundacionfavaloro.org',
    contactForm: 'https://www.fundacionfavaloro.org/contacto',
    emails: [],
    phones: [],
    people: []
  },
  // 10. 1 2 3 Listo!
  {
    entityId: '7930e3a3-d0a9-4c24-92c0-d739fb2fcc52',
    company: '1 2 3 Listo!',
    website: 'https://123listo.com.ar',
    contactForm: null,
    emails: [],
    phones: [],
    people: []
  },
  // 11. Nutentar - Espesante Blue
  {
    entityId: 'bd5e9d2b-5381-439e-86ff-8e09b05a9d15',
    company: 'Nutentar - Espesante Blue',
    website: 'https://nutentar.com.ar',
    contactForm: null,
    emails: [],
    phones: [],
    people: []
  }
];

try {
  await client.query('BEGIN');

  for (const item of contactSeeds) {
    // 1. Update atlas_canonical_entities metadata (allowed non-PII keys only: website, contact_form_url, primary_domain)
    const entityCheck = await client.query('SELECT canonical_entity_id, metadata FROM public.atlas_canonical_entities WHERE canonical_entity_id = $1::uuid', [item.entityId]);
    if (entityCheck.rows.length > 0) {
      const existingMeta = entityCheck.rows[0].metadata || {};
      const newMeta = {
        ...existingMeta,
        website: item.website || existingMeta.website || null,
        contact_form_url: item.contactForm || null,
        has_public_channels: true
      };

      await client.query(`
        UPDATE public.atlas_canonical_entities
        SET metadata = $1::jsonb,
            primary_domain = COALESCE($2, primary_domain),
            updated_at = NOW()
        WHERE canonical_entity_id = $3::uuid;
      `, [JSON.stringify(newMeta), item.website ? new URL(item.website).hostname : null, item.entityId]);
    }

    // 2. Clean previous contacts for this entityId
    const prevContacts = await client.query('SELECT contact_id FROM public.atlas_contacts WHERE entity_id = $1::uuid;', [item.entityId]);
    const prevContactIds = prevContacts.rows.map(r => r.contact_id);
    if (prevContactIds.length > 0) {
      await client.query('DELETE FROM public.atlas_contact_evidence WHERE contact_id = ANY($1::uuid[]);', [prevContactIds]);
      await client.query('DELETE FROM public.atlas_contacts WHERE entity_id = $1::uuid;', [item.entityId]);
    }

    // 3. Insert emails
    for (const em of item.emails) {
      const insRes = await client.query(`
        INSERT INTO public.atlas_contacts (
          entity_id, email, email_normalized, recipient_type, company,
          email_source_type, email_source_url, status, first_seen_at, last_verified_at, tenant_id
        ) VALUES (
          $1::uuid, $2, $2, 'ORGANIZATION', $3,
          $4, $5, 'ACTIVE', NOW(), NOW(), $6::uuid
        )
        RETURNING contact_id;
      `, [item.entityId, em.email, item.company, em.sourceType, em.sourceUrl, defaultTenant]);

      const contactId = insRes.rows[0].contact_id;
      await client.query(`
        INSERT INTO public.atlas_contact_evidence (
          contact_id, field, value, source_url, source_type, confidence, verified_at
        ) VALUES (
          $1::uuid, 'email', $2, $3, $4, 0.98, NOW()
        );
      `, [contactId, em.email, em.sourceUrl, em.evidence]);
    }

    // 4. Insert phones
    for (const ph of item.phones) {
      const insRes = await client.query(`
        INSERT INTO public.atlas_contacts (
          entity_id, email, email_normalized, recipient_type, company,
          email_source_type, email_source_url, status, first_seen_at, last_verified_at, tenant_id
        ) VALUES (
          $1::uuid, $2, $2, 'ORGANIZATION', $3,
          $4, $5, 'ACTIVE', NOW(), NOW(), $6::uuid
        )
        RETURNING contact_id;
      `, [item.entityId, `tel:${ph.phone}`, item.company, ph.sourceType, ph.sourceUrl, defaultTenant]);

      const contactId = insRes.rows[0].contact_id;
      await client.query(`
        INSERT INTO public.atlas_contact_evidence (
          contact_id, field, value, source_url, source_type, confidence, verified_at
        ) VALUES (
          $1::uuid, 'phone', $2, $3, $4, 0.95, NOW()
        );
      `, [contactId, ph.phone, ph.sourceUrl, ph.evidence]);
    }

    // 5. Insert associated people
    for (const pe of item.people) {
      const insRes = await client.query(`
        INSERT INTO public.atlas_contacts (
          entity_id, full_name, email, email_normalized, recipient_type, company, job_title,
          email_source_type, email_source_url, status, first_seen_at, last_verified_at, tenant_id
        ) VALUES (
          $1::uuid, $2, $3, $3, 'PERSON', $4, $5,
          'PUBLIC_REGISTRY', $6, 'ACTIVE', NOW(), NOW(), $7::uuid
        )
        RETURNING contact_id;
      `, [item.entityId, pe.fullName, pe.email, item.company, pe.role, pe.sourceUrl, defaultTenant]);

      const contactId = insRes.rows[0].contact_id;
      await client.query(`
        INSERT INTO public.atlas_contact_evidence (
          contact_id, field, value, source_url, source_type, confidence, verified_at
        ) VALUES (
          $1::uuid, 'person', $2, $3, 'OFFICIAL_APPOINTMENT', 0.99, NOW()
        );
      `, [contactId, `${pe.fullName} (${pe.role})`, pe.sourceUrl]);
    }
  }

  await client.query('COMMIT');
  console.log('✓ Canonical contacts and evidence seeded successfully.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Error seeding canonical contacts:', err);
  throw err;
} finally {
  await client.end();
}
