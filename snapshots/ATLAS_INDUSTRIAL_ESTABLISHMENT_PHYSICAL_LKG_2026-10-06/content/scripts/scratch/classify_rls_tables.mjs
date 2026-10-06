import fs from 'fs';
import path from 'path';

const auditData = JSON.parse(fs.readFileSync('reports/atlas/realtime/supabase_rls_security_audit.json', 'utf8'));
const rlsDisabled = auditData.rls_disabled_tables;

function findOccurrences(term, dir) {
  const results = [];
  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          walk(fullPath);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.mjs')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(`'${term}'`) || content.includes(`"${term}"`) || content.includes(` ${term} `) || content.includes(`.${term}`)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return results;
}

const classification = [];

for (const t of rlsDisabled) {
  const srcFiles = findOccurrences(t, 'src');
  const scriptFiles = findOccurrences(t, 'scripts');

  const frontendFiles = srcFiles.filter(f => !f.includes('tests') && !f.includes('test.') && !f.includes('scripts'));
  const testFiles = srcFiles.filter(f => f.includes('tests') || f.includes('test.'));

  let category = 'ATLAS_INTERNAL';
  if (frontendFiles.length > 0) {
    category = 'FRONTEND_REQUIRED_OR_USED';
  } else if (scriptFiles.length > 0 || testFiles.length > 0) {
    category = 'BACKEND_ONLY';
  }

  classification.push({
    table: t,
    category,
    frontend_files_count: frontendFiles.length,
    frontend_files: frontendFiles.map(f => path.relative(process.cwd(), f)),
    scripts_count: scriptFiles.length,
    tests_count: testFiles.length
  });
}

console.log('=== CLASSIFICATION OF 49 RLS-DISABLED TABLES ===');
console.table(classification.map(c => ({
  table: c.table,
  category: c.category,
  fe_count: c.frontend_files_count,
  scripts_count: c.scripts_count
})));

fs.writeFileSync('reports/atlas/realtime/rls_disabled_tables_classification.json', JSON.stringify(classification, null, 2));
