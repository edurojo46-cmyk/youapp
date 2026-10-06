import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const FACTORY_HB = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const PUBLISHER_HB = path.join(REPORTS_DIR, 'search_publisher_heartbeat.json');
const FACTORY_LOCK = path.join(REPORTS_DIR, 'factory_worker.lock');
const STATE_FILE = path.join(REPORTS_DIR, 'worker_state.json');

async function runRestart() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  EXECUTING CONTROLLED ROLLING RESTART');
  console.log('════════════════════════════════════════════════════════════\n');

  // --- 1. VERIFICAR PUBLISHER ---
  console.log('--- 1. VERIFICANDO PUBLISHER ---');
  let pubHb = JSON.parse(fs.readFileSync(PUBLISHER_HB, 'utf-8'));
  const pubAge = (Date.now() - new Date(pubHb.timestamp).getTime()) / 1000;
  if (pubAge > 30) throw new Error(`Publisher heartbeat age is ${pubAge}s (too old)`);
  if (pubHb.runtime_status !== 'RUNNING') throw new Error('Publisher not running');
  console.log(`✅ Publisher is healthy (PID ${pubHb.pid}, age: ${pubAge.toFixed(1)}s)`);

  // --- 2. CAPTURAR MÉTRICAS BEFORE ---
  let oldHb = JSON.parse(fs.readFileSync(FACTORY_HB, 'utf-8'));
  const oldAge = (Date.now() - new Date(oldHb.timestamp).getTime()) / 1000;
  
  const { data: qStats } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).in('status', ['PENDING', 'RETRY']);
  const outboxDepthBefore = qStats || 0;

  const { count: searchableBefore } = await supabase.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true });

  const BEFORE = {
    PHYSICAL_BEFORE: oldHb.current_physical_people,
    SOURCE_OFFSET_BEFORE: oldHb.last_processed_line,
    SOURCE_TOTAL_ROWS: oldHb.source_rows_consumed + oldHb.source_rows_remaining,
    SEARCHABLE_BEFORE: searchableBefore,
    PHYSICAL_NOT_SEARCHABLE_BEFORE: Math.max(0, oldHb.current_physical_people - searchableBefore),
    OUTBOX_DEPTH_BEFORE: outboxDepthBefore,
    OLD_WORKER_PID: oldHb.pid,
    OLD_WORKER_HEARTBEAT_AGE: oldAge,
    SEARCH_PUBLISHER_PID: pubHb.pid,
    SEARCH_PUBLISHER_HEARTBEAT_AGE: pubAge,
    TIMESTAMP_BEFORE: new Date().toISOString()
  };

  fs.writeFileSync('reports/atlas/people/rolling_restart_snapshot_before.json', JSON.stringify(BEFORE, null, 2));
  console.log('✅ BEFORE metrics captured and saved.\n');

  // --- 3. DETENER FACTORY VIEJA ---
  console.log(`--- 2. DETENIENDO OLD FACTORY (PID ${oldHb.pid}) ---`);
  try {
    process.kill(oldHb.pid, 'SIGTERM');
    console.log('SIGTERM enviado. Esperando salida...');
  } catch (e) {
    console.warn('Worker might be already dead:', e.message);
  }

  // Wait for lock to disappear
  let waitCount = 0;
  while (fs.existsSync(FACTORY_LOCK) && waitCount < 30) {
    await new Promise(r => setTimeout(r, 1000));
    waitCount++;
  }
  if (fs.existsSync(FACTORY_LOCK)) {
    console.error('⚠️ Timeout esperando salida pacífica (o lock quedó abandonado). Usando taskkill...');
    try {
      execSync(`taskkill /F /PID ${oldHb.pid}`);
    } catch (e) {
      console.warn('⚠️ Process was already dead.');
    }
    fs.unlinkSync(FACTORY_LOCK);
  }
  console.log('✅ OLD_FACTORY_STOPPED = TRUE\n');

  // --- 4. VERIFICAR OFFSET ---
  const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  console.log(`--- 3. VERIFICANDO OFFSET ---`);
  console.log(`Offset anterior: ${BEFORE.SOURCE_OFFSET_BEFORE}, Offset guardado: ${savedState.lastProcessedLine}`);
  if (savedState.lastProcessedLine < BEFORE.SOURCE_OFFSET_BEFORE - 5000) {
    throw new Error('OFFSET JUMP DETECTED');
  }
  console.log('✅ SOURCE_OFFSET_RESUME_SAFE = TRUE\n');

  // --- 5. ARRANCAR NUEVA FACTORY ---
  console.log('--- 4. ARRANCANDO NUEVA FACTORY ---');
  const factoryProc = spawn('node', ['--experimental-vm-modules', 'scripts/atlas_people_worker.mjs'], {
    detached: true,
    stdio: 'ignore'
  });
  factoryProc.unref();
  console.log(`✅ Nuevo proceso lanzado (PID ${factoryProc.pid}). Esperando inicialización (10s)...`);

  await new Promise(r => setTimeout(r, 10000));

  let newHb = JSON.parse(fs.readFileSync(FACTORY_HB, 'utf-8'));
  console.log(`✅ NEW_FACTORY_PID: ${newHb.pid}`);
  console.log(`✅ RUNTIME_STATUS: ${newHb.runtime_status}\n`);

  // --- 6. MEDICIÓN A LOS 5 MINUTOS ---
  console.log('--- 5. MEDICIÓN A LOS 5 MINUTOS ---');
  console.log('Esperando 5 minutos de ingesta sostenida...');
  
  // Imprimir progreso
  for (let m = 1; m <= 5; m++) {
    await new Promise(r => setTimeout(r, 60000));
    newHb = JSON.parse(fs.readFileSync(FACTORY_HB, 'utf-8'));
    console.log(`Minuto ${m}: ${newHb.current_physical_people} physical | ${newHb.searchable_entities_per_second} rows/s (1m: ${newHb.unique_people_per_sec_1min}) | Outbox: ${newHb.search_outbox_depth}`);
  }

  // Capturar métricas 5M
  const { count: searchableAfter } = await supabase.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true });
  const outboxDepthAfter = newHb.search_outbox_depth || 0;

  const AFTER = {
    PHYSICAL_AFTER_5M: newHb.current_physical_people,
    SOURCE_OFFSET_AFTER_5M: newHb.last_processed_line,
    SEARCHABLE_AFTER_5M: searchableAfter,
    OUTBOX_DEPTH_AFTER_5M: outboxDepthAfter,
    PHYSICAL_DELTA_5M: newHb.current_physical_people - BEFORE.PHYSICAL_BEFORE,
    SEARCHABLE_DELTA_5M: searchableAfter - BEFORE.SEARCHABLE_BEFORE,
    SUSTAINED_PHYSICAL_ENTITIES_SEC_5M: newHb.unique_people_per_sec_5min || newHb.unique_people_per_sec_15min || 0, // Approx
    SUSTAINED_SEARCHABLE_ENTITIES_SEC_5M: (searchableAfter - BEFORE.SEARCHABLE_BEFORE) / 300,
    OUTBOX_NET_GROWTH_5M: outboxDepthAfter - BEFORE.OUTBOX_DEPTH_BEFORE
  };

  fs.writeFileSync('reports/atlas/people/rolling_restart_5m_report.json', JSON.stringify({ BEFORE, AFTER }, null, 2));

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  REPORTE POST-RESTART (5 MINUTOS)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  OLD_ARCHITECTURE_PEAK = 51.5/s`);
  console.log(`  NEW_ARCHITECTURE_SUSTAINED = ${AFTER.SUSTAINED_SEARCHABLE_ENTITIES_SEC_5M.toFixed(1)}/s (Searchable), ${(AFTER.PHYSICAL_DELTA_5M / 300).toFixed(1)}/s (Physical)`);
  console.log(`  SPEED_IMPROVEMENT = ${((AFTER.SUSTAINED_SEARCHABLE_ENTITIES_SEC_5M / 51.5) * 100 - 100).toFixed(1)}%`);
  console.log('════════════════════════════════════════════════════════════\n');
}

runRestart();
