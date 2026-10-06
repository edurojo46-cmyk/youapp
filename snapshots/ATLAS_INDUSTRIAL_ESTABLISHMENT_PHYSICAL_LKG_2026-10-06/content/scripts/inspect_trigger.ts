import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'fn_enforce_constitutional_authorization';
  `);
  console.log(res.rows[0]?.prosrc);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
