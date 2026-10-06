/**
 * apply_search_outbox_migration.mjs
 * Aplica las dos migraciones del Durable Search Outbox:
 *   1. atlas_search_outbox table + índices
 *   2. commit_canonical_with_search_outbox RPC
 * Verifica que todo esté activo antes de retornar OK.
 */
import fs   from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))        url = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function execSql(sql, label) {
  try {
    const { data, error } = await sb.rpc('exec_sql', { sql });
    if (error) {
      // exec_sql no disponible → intentar via REST directo
      console.warn(`[${label}] exec_sql RPC no disponible. Aplicar manualmente en Supabase SQL Editor.`);
      return { ok: false, err: error.message, manual: true };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, err: String(e), manual: true };
  }
}

function readMigration(filename) {
  return fs.readFileSync(
    path.resolve(`supabase/migrations/${filename}`),
    'utf-8'
  );
}

const SEP = '═'.repeat(60);

console.log(`\n${SEP}`);
console.log('  APPLY SEARCH OUTBOX MIGRATION');
console.log(`${SEP}\n`);

// ── PASO 1: Aplicar tabla ──────────────────────────────────────────────────
console.log('[1/4] Aplicando migración: atlas_search_outbox...');
const tableSql = readMigration('20260915_atlas_search_outbox.sql');
const tableResult = await execSql(tableSql, 'OUTBOX_TABLE');

if (tableResult.manual) {
  console.log('\n⚠️  exec_sql no disponible. Aplicar manualmente en Supabase Dashboard > SQL Editor:');
  console.log('   supabase/migrations/20260915_atlas_search_outbox.sql');
} else {
  console.log('   ✅ Tabla + índices aplicados');
}

// ── PASO 2: Aplicar RPC ───────────────────────────────────────────────────
console.log('\n[2/4] Aplicando migración: commit_canonical_with_search_outbox RPC...');
const rpcSql = readMigration('20260915_commit_canonical_with_outbox_rpc.sql');
const rpcResult = await execSql(rpcSql, 'OUTBOX_RPC');

if (rpcResult.manual) {
  console.log('\n⚠️  Aplicar manualmente:');
  console.log('   supabase/migrations/20260915_commit_canonical_with_outbox_rpc.sql');
} else {
  console.log('   ✅ RPC creada');
}

// ── PASO 3: Verificar tabla ───────────────────────────────────────────────
console.log('\n[3/4] Verificando tabla atlas_search_outbox...');
const { count: outboxCount, error: tableErr } = await sb
  .from('atlas_search_outbox')
  .select('*', { count: 'exact', head: true });

if (tableErr) {
  console.log(`   ❌ Tabla NO encontrada: ${tableErr.message}`);
  console.log('   → Aplicar manualmente 20260915_atlas_search_outbox.sql en Supabase SQL Editor');
} else {
  console.log(`   ✅ atlas_search_outbox existe (${outboxCount ?? 0} rows actuales)`);
}

// ── PASO 4: Verificar RPC ─────────────────────────────────────────────────
console.log('\n[4/4] Verificando RPC commit_canonical_with_search_outbox...');
const { data: rpcTest, error: rpcErr } = await sb.rpc(
  'commit_canonical_with_search_outbox',
  { p_identity_rows: '[]', p_outbox_rows: '[]' }
);

if (rpcErr) {
  console.log(`   ❌ RPC NO encontrada: ${rpcErr.message}`);
  console.log('   → Aplicar manualmente 20260915_commit_canonical_with_outbox_rpc.sql');
} else if (rpcTest?.ok) {
  console.log(`   ✅ RPC activa y operacional (vacío retorna ok=true como esperado)`);
} else {
  console.log(`   ⚠️  RPC retornó: ${JSON.stringify(rpcTest)}`);
}

// ── Resumen ────────────────────────────────────────────────────────────────
const tableOk  = !tableErr;
const rpcOk    = !rpcErr;
const allOk    = tableOk && rpcOk;
const needsManual = tableResult.manual || rpcResult.manual;

console.log(`\n${SEP}`);
console.log(`  RESULTADO`);
console.log(`  atlas_search_outbox table   = ${tableOk ? '✅ OK' : '❌ FALTA'}`);
console.log(`  commit_canonical RPC        = ${rpcOk  ? '✅ OK' : '❌ FALTA'}`);
console.log(`  MIGRATION_APPLIED           = ${allOk  ? 'TRUE ✅' : 'FALSE ❌'}`);

if (needsManual && !allOk) {
  console.log(`\n  ⚠️  ACCIÓN REQUERIDA: Aplicar migraciones manualmente en Supabase Dashboard`);
  console.log(`  URL: ${url}/project/default/sql/new`);
  console.log(`  Archivos a ejecutar en orden:`);
  console.log(`    1. supabase/migrations/20260915_atlas_search_outbox.sql`);
  console.log(`    2. supabase/migrations/20260915_commit_canonical_with_outbox_rpc.sql`);
}

console.log(`${SEP}\n`);

process.exit(allOk ? 0 : 1);
