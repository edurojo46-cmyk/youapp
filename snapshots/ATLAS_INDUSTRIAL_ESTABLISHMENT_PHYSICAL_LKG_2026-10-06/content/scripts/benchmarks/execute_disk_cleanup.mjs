import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

async function compressFile(src, dest) {
  const read = fs.createReadStream(src);
  const write = fs.createWriteStream(dest);
  const gzip = zlib.createGzip({ level: 9 });
  await pipeline(read, gzip, write);
}

function getDiskStats() {
  const stat = fs.statfsSync('C:\\');
  const freeGB = (stat.bfree * stat.bsize) / (1024 * 1024 * 1024);
  const totalGB = (stat.blocks * stat.bsize) / (1024 * 1024 * 1024);
  return {
    freeGB: parseFloat(freeGB.toFixed(2)),
    totalGB: parseFloat(totalGB.toFixed(2)),
    freePercent: parseFloat(((freeGB / totalGB) * 100).toFixed(2))
  };
}

async function runCleanup() {
  const log = [];
  function record(msg) {
    console.log(msg);
    log.push(msg);
  }

  const beforeDisk = getDiskStats();
  record(`DISK_BEFORE: Free=${beforeDisk.freeGB} GB (${beforeDisk.freePercent}%) Total=${beforeDisk.totalGB} GB`);

  let totalBytesReclaimed = 0;

  // ==========================================
  // FASE 1: ARTEFACTOS OBSOLETOS
  // ==========================================
  record('\n--- INICIANDO FASE 1: ARTEFACTOS OBSOLETOS ---');

  // 1. data.ms
  if (fs.existsSync('data.ms')) {
    const stat = fs.statSync('data.ms');
    // Calculate total dir size
    let dirBytes = 0;
    function walkDir(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walkDir(p);
        else dirBytes += fs.statSync(p).size;
      }
    }
    walkDir('data.ms');
    fs.rmSync('data.ms', { recursive: true, force: true });
    totalBytesReclaimed += dirBytes;
    record(`[FASE 1] ELIMINADO data.ms: ${(dirBytes / (1024 * 1024)).toFixed(2)} MB liberados`);
  } else {
    record('[FASE 1] data.ms ya no existe.');
  }

  // 2. data_delta_motor2.ms
  if (fs.existsSync('data_delta_motor2.ms')) {
    let dirBytes = 0;
    function walkDir(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walkDir(p);
        else dirBytes += fs.statSync(p).size;
      }
    }
    walkDir('data_delta_motor2.ms');
    fs.rmSync('data_delta_motor2.ms', { recursive: true, force: true });
    totalBytesReclaimed += dirBytes;
    record(`[FASE 1] ELIMINADO data_delta_motor2.ms: ${(dirBytes / (1024 * 1024)).toFixed(2)} MB liberados`);
  } else {
    record('[FASE 1] data_delta_motor2.ms ya no existe.');
  }

  // 3. AWSCLIV2.msi
  if (fs.existsSync('AWSCLIV2.msi')) {
    const size = fs.statSync('AWSCLIV2.msi').size;
    fs.unlinkSync('AWSCLIV2.msi');
    totalBytesReclaimed += size;
    record(`[FASE 1] ELIMINADO AWSCLIV2.msi: ${(size / (1024 * 1024)).toFixed(2)} MB liberados`);
  } else {
    record('[FASE 1] AWSCLIV2.msi ya no existe.');
  }

  // 4. Logs Meilisearch obsoletos en reports
  const oldLogs = [
    'reports/atlas/search/meilisearch_server.log',
    'reports/atlas/search/meilisearch_s1m_server.log'
  ];
  for (const logPath of oldLogs) {
    if (fs.existsSync(logPath)) {
      const size = fs.statSync(logPath).size;
      fs.unlinkSync(logPath);
      totalBytesReclaimed += size;
      record(`[FASE 1] ELIMINADO log obsoleto ${logPath}: ${(size / (1024 * 1024)).toFixed(2)} MB liberados`);
    } else {
      record(`[FASE 1] ${logPath} ya no existe.`);
    }
  }

  // ==========================================
  // FASE 2: CACHES Y COMPRESIÓN JSONL
  // ==========================================
  record('\n--- INICIANDO FASE 2: CACHES Y COMPRESIÓN DE JSONL REPRODUCIBLES ---');

  // 5. Purgar cache_gate31d
  if (fs.existsSync('cache_gate31d')) {
    let dirBytes = 0;
    function walkDir(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walkDir(p);
        else dirBytes += fs.statSync(p).size;
      }
    }
    walkDir('cache_gate31d');
    fs.rmSync('cache_gate31d', { recursive: true, force: true });
    totalBytesReclaimed += dirBytes;
    record(`[FASE 2] PURGADO cache_gate31d: ${(dirBytes / (1024 * 1024)).toFixed(2)} MB liberados`);
  } else {
    record('[FASE 2] cache_gate31d ya no existe.');
  }

  // 6. Purgar cache_arca
  if (fs.existsSync('cache_arca')) {
    let dirBytes = 0;
    function walkDir(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walkDir(p);
        else dirBytes += fs.statSync(p).size;
      }
    }
    walkDir('cache_arca');
    fs.rmSync('cache_arca', { recursive: true, force: true });
    totalBytesReclaimed += dirBytes;
    record(`[FASE 2] PURGADO cache_arca: ${(dirBytes / (1024 * 1024)).toFixed(2)} MB liberados`);
  } else {
    record('[FASE 2] cache_arca ya no existe.');
  }

  // 7. Comprimir JSONL reproducibles a .gz
  const jsonlList = [
    'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl',
    'reports/atlas/search/atlas_canonical_people_projection_v1.jsonl',
    'reports/atlas/search/atlas_gate_s_1m_request_sequence.jsonl'
  ];

  for (const jFile of jsonlList) {
    if (fs.existsSync(jFile)) {
      const origSize = fs.statSync(jFile).size;
      const gzPath = jFile + '.gz';
      record(`[FASE 2] Comprimiendo ${jFile} (${(origSize / (1024 * 1024)).toFixed(2)} MB) a .gz...`);
      await compressFile(jFile, gzPath);
      const gzSize = fs.statSync(gzPath).size;
      fs.unlinkSync(jFile); // Eliminar original sin comprimir
      const deltaReclaimed = origSize - gzSize;
      totalBytesReclaimed += deltaReclaimed;
      record(`[FASE 2] COMPRIMIDO: ${gzPath} (${(gzSize / (1024 * 1024)).toFixed(2)} MB). Espacio neto liberado: ${(deltaReclaimed / (1024 * 1024)).toFixed(2)} MB`);
    } else if (fs.existsSync(jFile + '.gz')) {
      record(`[FASE 2] ${jFile} ya está comprimido como .gz.`);
    } else {
      record(`[FASE 2] ${jFile} no encontrado.`);
    }
  }

  // Verification after cleanup
  const afterDisk = getDiskStats();
  record(`\n--- RESULTADO POST-LIMPIEZA ---`);
  record(`DISK_FREE_GB_BEFORE: ${beforeDisk.freeGB} GB`);
  record(`DISK_FREE_GB_AFTER: ${afterDisk.freeGB} GB`);
  record(`DISK_FREE_PERCENT_AFTER: ${afterDisk.freePercent}%`);
  record(`NET_DISK_GAINED_GB: ${(afterDisk.freeGB - beforeDisk.freeGB).toFixed(2)} GB`);
  record(`TOTAL_BYTES_RECLAIMED: ${(totalBytesReclaimed / (1024 * 1024 * 1024)).toFixed(3)} GB`);

  // Write summary
  const summary = {
    TIMESTAMP: new Date().toISOString(),
    DISK_FREE_GB_BEFORE: beforeDisk.freeGB,
    DISK_FREE_PERCENT_BEFORE: beforeDisk.freePercent,
    DISK_FREE_GB_AFTER: afterDisk.freeGB,
    DISK_FREE_PERCENT_AFTER: afterDisk.freePercent,
    NET_DISK_GAINED_GB: parseFloat((afterDisk.freeGB - beforeDisk.freeGB).toFixed(2)),
    TOTAL_BYTES_RECLAIMED_GB: parseFloat((totalBytesReclaimed / (1024 * 1024 * 1024)).toFixed(3)),
    DETAILS: log
  };
  fs.writeFileSync('scratch/disk_cleanup_summary.json', JSON.stringify(summary, null, 2));
}

runCleanup().catch(e => console.error('CLEANUP_FAILED:', e));
