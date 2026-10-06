import { dbPool } from '../server/db.ts';

async function seedLinks() {
  console.log('--- Seeding verified resource links into SSOT for second-use fast path ---');
  
  // 1. SRC_CKAN_PORTAL_8E56C7A403 (Estacionamientos Comerciales)
  await dbPool.query(`
    UPDATE public.atlas_source_knowledge_map
    SET field_telemetry = jsonb_set(
      COALESCE(field_telemetry, '{}'::jsonb),
      '{capability_ir,technical_inspection,resource_links}',
      jsonb_build_array('https://cdn.buenosaires.gob.ar/datosabiertos/datasets/transporte-y-obras-publicas/estacionamientos-motos/estacionamientos-de-motos-privado.csv')
    )
    WHERE source_id = 'SRC_CKAN_PORTAL_8E56C7A403';
  `);

  // 2. SRC_CKAN_PORTAL_BD572121C1 (Playas de Estacionamiento y Garages)
  await dbPool.query(`
    UPDATE public.atlas_source_knowledge_map
    SET field_telemetry = jsonb_set(
      COALESCE(field_telemetry, '{}'::jsonb),
      '{capability_ir,technical_inspection,resource_links}',
      jsonb_build_array('https://cdn.buenosaires.gob.ar/datosabiertos/datasets/transporte-y-obras-publicas/estacionamientos-concesionados-movilidad-sustentable/estacionamientos-concesionados-de-movilidad-sustentable.csv')
    )
    WHERE source_id = 'SRC_CKAN_PORTAL_BD572121C1';
  `);

  console.log('Seeded successfully!');
  process.exit(0);
}

seedLinks().catch(err => {
  console.error(err);
  process.exit(1);
});
