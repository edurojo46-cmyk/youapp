/**
 * apply_rpc_via_management_api.mjs
 * Aplica SQL directamente via Supabase Management REST API.
 * No requiere CLI, no requiere exec_sql RPC, no requiere browser.
 * Usa el project_ref extraído de la URL + service_role_key para autenticarse.
 */
import fs   from 'fs';
import path from 'path';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))        url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
}

// Extraer project_ref de la URL: https://jtnurafmngaxdwlzpvxv.supabase.co → jtnurafmngaxdwlzpvxv
const projectRef = url.replace('https://','').split('.')[0];
const managementEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

console.log(`Project ref: ${projectRef}`);
console.log(`Management API endpoint: ${managementEndpoint}`);

// Leer los archivos SQL de migración
const migration1 = fs.readFileSync('supabase/migrations/20260915_atlas_search_outbox.sql', 'utf-8');
const migration2 = fs.readFileSync('supabase/migrations/20260915_commit_canonical_with_outbox_rpc.sql', 'utf-8');

async function runSql(sql, label) {
  console.log(`\n[${label}] Applying via Management API...`);
  try {
    const resp = await fetch(managementEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql })
    });
    const text = await resp.text();
    if (resp.ok) {
      console.log(`  ✅ ${label}: OK (status ${resp.status})`);
      return { ok: true };
    } else {
      console.log(`  ⚠️  ${label}: status ${resp.status}`);
      console.log(`  Response: ${text.slice(0, 300)}`);
      return { ok: false, status: resp.status, body: text };
    }
  } catch (e) {
    console.log(`  ❌ ${label}: EXCEPTION — ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// También intentamos vía PostgREST SQL endpoint (diferente)
async function runSqlViaRpc(sql, label) {
  const rpcUrl = `${url}/rest/v1/rpc/exec_sql`;
  console.log(`\n[${label}] Trying via PostgREST exec_sql...`);
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql })
    });
    const text = await resp.text();
    if (resp.ok) {
      console.log(`  ✅ ${label}: OK`);
      return { ok: true };
    } else {
      console.log(`  ⚠️  PostgREST: ${resp.status} — ${text.slice(0, 200)}`);
      return { ok: false };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Intentar Management API primero
const r1 = await runSql(migration1, 'OUTBOX_TABLE');
const r2 = await runSql(migration2, 'CANONICAL_RPC');

// Si Management API falla, intentar PostgREST
if (!r1.ok) await runSqlViaRpc(migration1, 'OUTBOX_TABLE_via_PostgREST');
if (!r2.ok) await runSqlViaRpc(migration2, 'CANONICAL_RPC_via_PostgREST');

// Verificar que la RPC existe ahora
console.log('\n[VERIFY] Verificando RPC commit_canonical_with_search_outbox...');
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await sb.rpc('commit_canonical_with_search_outbox', {
  p_identity_rows: '[]',
  p_outbox_rows: '[]'
});

if (!error && data?.ok) {
  console.log('  ✅ RPC VERIFIED — commit_canonical_with_search_outbox activa');
  console.log('  RPC_APPLIED = TRUE');
} else {
  console.log(`  ❌ RPC NOT FOUND: ${error?.message}`);
  console.log('  RPC_APPLIED = FALSE');
  console.log('\n  → ACCIÓN MANUAL REQUERIDA:');
  console.log(`  URL: ${url.replace('https://','https://supabase.com/dashboard/project/')}/sql/new`);
  console.log('  Archivo: supabase/migrations/20260915_commit_canonical_with_outbox_rpc.sql');
}
