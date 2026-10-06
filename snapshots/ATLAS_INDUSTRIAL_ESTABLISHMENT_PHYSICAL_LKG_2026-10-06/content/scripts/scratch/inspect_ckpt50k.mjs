import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const ck = await c.query("SELECT * FROM public.atlas_checkpoints WHERE checkpoint_id = 'chk_stage2_50k_ckpt_50000';");
console.log('Checkpoint state:', JSON.stringify(ck.rows[0], null, 2));

await c.end();
