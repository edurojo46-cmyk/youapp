import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

async function checkSupply() {
  const dir = path.resolve('scratch/physical_sources');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
  
  console.log(`Checking ${files.length} CSV sources in ${dir}...`);
  const uniqueEmails = new Set();
  
  for (const f of files) {
    const fullPath = path.join(dir, f);
    const rl = readline.createInterface({
      input: fs.createReadStream(fullPath, { encoding: 'latin1' }),
      crlfDelay: Infinity
    });
    
    let countInFile = 0;
    for await (const line of rl) {
      const matches = line.match(EMAIL_EXTRACTION_REGEX);
      if (matches) {
        for (const raw of matches) {
          const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
          if (norm && norm.length > 5) {
            uniqueEmails.add(norm);
            countInFile++;
          }
        }
      }
    }
    if (countInFile > 0) {
      console.log(`  ${f}: ${countInFile} emails extracted`);
    }
  }
  
  console.log(`\nTotal unique valid emails in physical sources: ${uniqueEmails.size.toLocaleString()}`);
}

checkSupply().catch(console.error);
