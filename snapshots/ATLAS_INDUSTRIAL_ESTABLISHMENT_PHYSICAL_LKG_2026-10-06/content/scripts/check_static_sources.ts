import { dbPool } from '../server/db.ts';

async function run() {
  const ids = [
    'SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS',
    'SRC_IDECOR_STOCK_VETERINARIA',
    'SRC_CAFABYT_FABRICANTES_BULONES',
    'SRC_SIPRO_MUEBLES_FABRICANTES',
    'SRC_BA_GASTRO_ESTABLECIMIENTOS',
    'SRC_GCBA_PRENSA_PERIODISTAS',
    'SRC_BA_ALOJAMIENTOS_PUBLIC_EMAIL',
    'SRC_OSM_PUBLIC_ESTABLISHMENTS'
  ];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const res = await dbPool.query(
    `SELECT source_id, source_name, source_family, current_status FROM public.atlas_source_knowledge_map WHERE source_id IN (${placeholders})`,
    ids
  );
  console.log('MATCHED STATIC SOURCES IN DB:', res.rows);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
