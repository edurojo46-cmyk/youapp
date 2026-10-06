import fs from 'fs';
import path from 'path';

function processDirectory(directory: string, isScriptsFolder: boolean) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath, isScriptsFolder);
    } else if (fullPath.endsWith('.ts') && !fullPath.includes('testDbGuard.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Basic check: does it import createClient from supabase?
      if (content.includes('import { createClient') && content.includes('@supabase/supabase-js')) {
        
        // Calculate relative path to testDbGuard.ts
        const guardPath = isScriptsFolder 
          ? '../src/lib/testDbGuard'
          : path.relative(path.dirname(fullPath), path.join(process.cwd(), 'src', 'lib', 'testDbGuard')).replace(/\\/g, '/');
          
        let importPath = guardPath.startsWith('.') ? guardPath : `./${guardPath}`;
        
        // Strategy: Replace `import { createClient }` with `import { createClient, SupabaseClient }` if it doesn't have it (optional, handled by regex)
        // Actually, easiest is to leave the Supabase import alone, remove `createClient` from it, 
        // and add `import { createGuardedTestClient as createClient } from '...';`
        
        // Regex to remove createClient from supabase import
        content = content.replace(/import\s*{\s*([^}]*?)\bcreateClient\b([^}]*?)\s*}\s*from\s*['"]@supabase\/supabase-js['"];?/g, (match, before, after) => {
            const combined = `${before}${after}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '').replace(/,\s*,/g, ',');
            if (combined.length === 0) {
                return `import { createGuardedTestClient as createClient } from '${importPath}';`;
            } else {
                return `import { ${combined} } from '@supabase/supabase-js';\nimport { createGuardedTestClient as createClient } from '${importPath}';`;
            }
        });
        
        // Edge cases with single line import
        content = content.replace(/import\s*createClient\s*from\s*['"]@supabase\/supabase-js['"];?/g, `import { createGuardedTestClient as createClient } from '${importPath}';`);
        
        // In case there are other aliases
        content = content.replace(/import\s*{\s*createClient\s+as\s+([a-zA-Z0-9_]+)\s*}\s*from\s*['"]@supabase\/supabase-js['"];?/g, `import { createGuardedTestClient as $1 } from '${importPath}';`);

        fs.writeFileSync(fullPath, content);
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

console.log('Refactoring tests...');
processDirectory(path.join(process.cwd(), 'src', 'tests'), false);
console.log('Refactoring scripts...');
processDirectory(path.join(process.cwd(), 'scripts'), true);
console.log('Done.');
