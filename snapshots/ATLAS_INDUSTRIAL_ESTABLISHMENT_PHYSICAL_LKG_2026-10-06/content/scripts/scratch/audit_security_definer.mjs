import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== FAST AUDIT: SECURITY DEFINER FUNCTIONS IN PUBLIC SCHEMA ===\n');

  const funcsQuery = `
    SELECT 
      p.proname AS function_name,
      pg_get_userbyid(p.proowner) AS owner,
      p.proconfig AS search_path_config,
      pg_get_function_arguments(p.oid) AS arguments,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can_execute,
      position('EXECUTE ' in pg_get_functiondef(p.oid)) > 0 AS has_dynamic_sql
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
    ORDER BY p.proname;
  `;

  const res = await c.query(funcsQuery);
  console.log(`Found ${res.rows.length} SECURITY DEFINER functions in public.\n`);

  const report = res.rows.map(r => {
    const hasSearchPath = r.search_path_config && r.search_path_config.some(cfg => cfg.startsWith('search_path='));
    return {
      function_name: r.function_name,
      owner: r.owner,
      has_search_path: !!hasSearchPath,
      search_path_config: r.search_path_config,
      anon_execute: r.anon_can_execute,
      auth_execute: r.auth_can_execute,
      service_execute: r.service_can_execute,
      dynamic_sql: r.has_dynamic_sql
    };
  });

  const anonExecutable = report.filter(r => r.anon_execute);
  const withoutSearchPath = report.filter(r => !r.has_search_path);
  const criticalFindings = report.filter(r => r.anon_execute && (!r.has_search_path || r.dynamic_sql));

  console.log(`SECURITY DEFINER Functions Total: ${report.length}`);
  console.log(`Anon Executable: ${anonExecutable.length}`);
  console.log(`Without explicit search_path: ${withoutSearchPath.length}`);
  console.log(`Critical Findings (Anon Executable + No Search Path/Dyn SQL): ${criticalFindings.length}`);

  if (criticalFindings.length > 0) {
    console.log('\nCritical Security Definer Functions:');
    console.table(criticalFindings);
  }

  fs.writeFileSync('reports/atlas/realtime/security_definer_audit.json', JSON.stringify(report, null, 2));
  console.log('Saved to reports/atlas/realtime/security_definer_audit.json');

  await c.end();
}

main().catch(console.error);
