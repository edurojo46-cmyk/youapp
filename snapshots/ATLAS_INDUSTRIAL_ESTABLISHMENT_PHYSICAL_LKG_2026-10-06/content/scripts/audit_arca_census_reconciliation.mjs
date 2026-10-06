import fs from 'fs';
import path from 'path';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

async function auditArcaCensus() {
  console.log(`Starting fast census re-audit of ${SOURCE_FILE}...`);
  const t0 = performance.now();
  
  const fd = fs.openSync(SOURCE_FILE, 'r');
  const stat = fs.statSync(SOURCE_FILE);
  const totalBytes = stat.size;
  
  const CHUNK_SIZE = 1024 * 1024; // 1MB buffer
  const buf = Buffer.alloc(CHUNK_SIZE);
  
  let totalRaw = 0;
  let prefix20 = 0;
  let prefix23 = 0;
  let prefix24 = 0;
  let prefix27 = 0;
  let prefix30 = 0;
  let prefix33 = 0;
  let prefix34 = 0;
  let otherPrefix = 0;
  
  let leftover = '';
  let bytesRead = 0;
  
  while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, null)) > 0) {
    const chunk = leftover + buf.toString('latin1', 0, bytesRead);
    let start = 0;
    let newlineIdx;
    
    while ((newlineIdx = chunk.indexOf('\n', start)) !== -1) {
      const line = chunk.substring(start, newlineIdx).trimEnd();
      start = newlineIdx + 1;
      
      if (line.length === 0) continue;
      totalRaw++;
      
      const p = line.substring(0, 2);
      if (p === '20') prefix20++;
      else if (p === '23') prefix23++;
      else if (p === '24') prefix24++;
      else if (p === '27') prefix27++;
      else if (p === '30') prefix30++;
      else if (p === '33') prefix33++;
      else if (p === '34') prefix34++;
      else otherPrefix++;
    }
    
    leftover = chunk.substring(start);
  }
  
  if (leftover.trim().length > 0) {
    totalRaw++;
    const p = leftover.substring(0, 2);
    if (p === '20') prefix20++;
    else if (p === '23') prefix23++;
    else if (p === '24') prefix24++;
    else if (p === '27') prefix27++;
    else if (p === '30') prefix30++;
    else if (p === '33') prefix33++;
    else if (p === '34') prefix34++;
    else otherPrefix++;
  }
  
  fs.closeSync(fd);
  const t1 = performance.now();
  
  // Natural person prefixes per frozen Atlas identity rules: 20, 23, 24, 27
  const naturalPersonCount = prefix20 + prefix23 + prefix24 + prefix27;
  // Legal entities: 30, 33, 34
  const legalEntityCount = prefix30 + prefix33 + prefix34;
  const unknownCount = otherPrefix;
  
  const result = {
    source_artifact: SOURCE_FILE,
    source_bytes: totalBytes,
    elapsed_ms: Math.round(t1 - t0),
    TOTAL_RAW: totalRaw,
    PREFIX_20_COUNT: prefix20,
    PREFIX_23_COUNT: prefix23,
    PREFIX_24_COUNT: prefix24,
    PREFIX_27_COUNT: prefix27,
    PREFIX_30_COUNT: prefix30,
    PREFIX_33_COUNT: prefix33,
    PREFIX_34_COUNT: prefix34,
    OTHER_PREFIX_COUNT: otherPrefix,
    NATURAL_PERSON_COUNT: naturalPersonCount,
    LEGAL_ENTITY_COUNT: legalEntityCount,
    UNKNOWN_COUNT: unknownCount
  };
  
  console.log('--- ARCA CENSUS RE-AUDIT RESULTS ---');
  console.log(JSON.stringify(result, null, 2));
  
  // Save artifact
  const outDir = 'reports/atlas/discovery';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'atlas_stage3q_r6_arca_census_reconciliation_v1.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Saved census report to ${outPath}`);
}

auditArcaCensus().catch(console.error);
