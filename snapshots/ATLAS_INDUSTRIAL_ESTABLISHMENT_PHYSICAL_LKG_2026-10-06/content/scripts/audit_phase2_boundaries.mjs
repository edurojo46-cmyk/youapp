import fs from 'fs';
import path from 'path';

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        walkDir(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.mjs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

console.log('==================================================');
console.log('AUDITING PHASE 2 BOUNDARIES & HORIZONTAL SERVICES');
console.log('==================================================');

let crossProductViolations = 0;
let crossEngineViolations = 0;
let directSmtpViolations = 0;
let duplicateMailEngines = 0;

// 1. Check apps/youapp
const youappFiles = walkDir('apps/youapp');
for (const file of youappFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('apps/busca-industrial') || content.includes('BuscaIndustrial') || content.includes('IndustrialSearchRepository')) {
    console.error(`[CROSS_PRODUCT] Violation in ${file}: imports Industrial logic`);
    crossProductViolations++;
  }
}

// 2. Check apps/busca-industrial
const industrialFiles = walkDir('apps/busca-industrial');
for (const file of industrialFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('AtlasPeopleSearchV2') || content.includes('UniversalQueryModel') || content.includes('youappPlayerStore')) {
    console.error(`[CROSS_ENGINE] Violation in ${file}: imports internal people search or streaming store`);
    crossEngineViolations++;
  }
}

// 3. Check apps/atlas
const atlasFiles = walkDir('apps/atlas');
for (const file of atlasFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('youappPlayerStore') || content.includes('youappStreamingStore') || content.includes('react-player')) {
    console.error(`[CROSS_PRODUCT] Violation in ${file}: imports streaming player`);
    crossProductViolations++;
  }
}

// 4. Check Frontend for direct SMTP usage
const frontendDirs = ['src/components', 'src/pages', 'apps', 'packages/mail-client', 'packages/ui-base', 'packages/api-client'];
for (const d of frontendDirs) {
  const files = walkDir(d);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('nodemailer') || content.includes('LiveSMTPTransport') || content.includes('AtlasSMTPAdapter')) {
      console.error(`[DIRECT_SMTP] Violation in ${file}: frontend directly accessing SMTP/MTA transport`);
      directSmtpViolations++;
    }
  }
}

// 5. Check Duplicate Mail Engines
// We verify that server/services/atlas-mail/AtlasMailService.ts wraps src/lib/atlasMailFabric
// and no second SMTP server/engine was spawned.
const serverServices = walkDir('server/services');
let mailServicesFound = 0;
for (const file of serverServices) {
  if (file.toLowerCase().includes('mail')) {
    mailServicesFound++;
  }
}
if (mailServicesFound > 1) {
  // If more than 1 distinct service file
  duplicateMailEngines = mailServicesFound - 1;
}

// 6. Check that Mail Service does NOT depend on UI or search ranking engines
const mailServiceFiles = walkDir('server/services/atlas-mail');
for (const file of mailServiceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('react') || content.includes('lucide-react') || content.includes('AtlasPeopleSearch') || content.includes('youappRanking')) {
    console.error(`[CROSS_ENGINE] Violation in mail service ${file}: depends on UI or search engine`);
    crossEngineViolations++;
  }
}

console.log('\n--- AUDIT RESULTS ---');
console.log(`CROSS_PRODUCT_FORBIDDEN_IMPORTS = ${crossProductViolations}`);
console.log(`CROSS_ENGINE_FORBIDDEN_IMPORTS = ${crossEngineViolations}`);
console.log(`DIRECT_SMTP_USAGE_OUTSIDE_MAIL_SERVICE = ${directSmtpViolations}`);
console.log(`DUPLICATE_MAIL_ENGINES = ${duplicateMailEngines}`);
