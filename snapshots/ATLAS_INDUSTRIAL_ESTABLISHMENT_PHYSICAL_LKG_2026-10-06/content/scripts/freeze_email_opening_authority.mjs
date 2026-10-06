import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';

async function freezePreviousEmails() {
  console.log('=== FREEZING PREVIOUS 57,998 PUBLIC EMAILS AS OPENING AUTHORITY ===');
  const jsonlPath = 'reports/atlas/acquisition/atlas_public_emails_1m_ledger.jsonl';
  if (!fs.existsSync(jsonlPath)) {
    throw new Error('Ledger not found: ' + jsonlPath);
  }

  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const emailsSet = new Set();
  const hashes = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const doc = JSON.parse(line);
    const em = doc.NORMALIZED_EMAIL;
    if (em) {
      const clean = em.trim().toLowerCase();
      emailsSet.add(clean);
      const h64 = crypto.createHash('sha256').update(clean).digest().subarray(0, 8).toString('hex');
      hashes.add(h64);
    }
  }

  console.log(`Ingested ${emailsSet.size.toLocaleString()} previous legitimate public emails.`);

  const binPath = 'scratch/global_preexisting_public_email_authority.bin';
  const buf = Buffer.alloc(hashes.size * 8);
  let off = 0;
  for (const h of hashes) {
    buf.write(h, off, 8, 'hex');
    off += 8;
  }
  fs.writeFileSync(binPath, buf);

  const jsonPath = 'scratch/global_preexisting_public_email_authority.json';
  fs.writeFileSync(jsonPath, JSON.stringify({
    total_preexisting_emails: emailsSet.size,
    frozen_at: new Date().toISOString(),
    sample: Array.from(emailsSet).slice(0, 25)
  }, null, 2));

  console.log(`Saved frozen opening authority to ${binPath} (${buf.length.toLocaleString()} bytes).`);
  return emailsSet.size;
}

freezePreviousEmails().catch(console.error);
