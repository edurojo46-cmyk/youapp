import 'dotenv/config';
import fs from 'fs';
import { AtlasMultiSourceWheelStream } from '../src/lib/atlas/discovery/AtlasMultiSourceWheelStream.mjs';
import { MOTOR_STATES } from '../src/lib/atlas/discovery/motorRegistry.mjs';

async function runCanaries() {
  const stream = new AtlasMultiSourceWheelStream();

  const candidatesToCanary = [
    {
      motor_id: 'COLPROBA_MOTOR_DIRECTORIO_PBA',
      name: 'Colegio de Abogados de la Provincia de Buenos Aires (ColProBA)',
      target_region: 'PBA',
      available_supply: 24000,
      novelty_frontier: 'cursor 1250 -> 5000'
    },
    {
      motor_id: 'ARCA_MOTOR_DATOS_ABIERTOS',
      name: 'ARCA — Portal Público de Datos Abiertos (AFIP)',
      target_region: 'CABA_PBA',
      available_supply: 32000,
      novelty_frontier: 'shard_arca_01 @ 1k'
    },
    {
      motor_id: 'OAI_MOTOR_UNLAM_DIGITAL',
      name: 'UNLaM Digital — Universidad Nacional de La Matanza',
      target_region: 'PBA',
      available_supply: 26000,
      novelty_frontier: 'openalex_unlam page 1'
    },
    {
      motor_id: 'OAI_MOTOR_UNQ_DIGITAL',
      name: 'RIDAA Repositorio Institucional UNQ',
      target_region: 'PBA',
      available_supply: 19000,
      novelty_frontier: 'ridaa_unq oai_dc'
    },
    {
      motor_id: 'CKAN_MOTOR_BA_DATOS_MUNICIPAL',
      name: 'Buenos Aires Data — Autoridades y Funcionarios de Comunas CABA',
      target_region: 'CABA',
      available_supply: 15000,
      novelty_frontier: 'ckan_ba_comunas @ 0'
    },
    {
      motor_id: 'CKAN_MOTOR_BA_DATOS_DOCENTES',
      name: 'Buenos Aires Data — Docentes y Autoridades Educativas CABA',
      target_region: 'CABA',
      available_supply: 18000,
      novelty_frontier: 'ckan_ba_docentes @ 0'
    },
    {
      motor_id: 'OAI_MOTOR_CONICET_LAPLATA',
      name: 'CONICET Digital — CCT La Plata Regional Center',
      target_region: 'PBA',
      available_supply: 38000,
      novelty_frontier: 'com_11336_169 @ 10100'
    },
    {
      motor_id: 'OAI_MOTOR_INTA_DIGITAL',
      name: 'INTA Digital — Repositorio Agropecuario (Castelar PBA)',
      target_region: 'PBA',
      available_supply: 35000,
      novelty_frontier: 'inta_oai @ 15900'
    }
  ];

  console.log(`Executing fresh canary measurements on ${candidatesToCanary.length} candidates...`);

  const results = [];

  for (const cand of candidatesToCanary) {
    const motor = stream.motors.get(cand.motor_id);
    if (!motor) {
      console.warn(`Motor not found in registry: ${cand.motor_id}`);
      continue;
    }

    const prevState = motor.state;
    motor.state = MOTOR_STATES.ACTIVE;
    stream.activeMotorIds.add(cand.motor_id);

    const t0 = performance.now();
    let fetched = [];
    let error = null;
    let rateLimitRisk = 'LOW';

    try {
      fetched = await stream.fetchFromMotor(cand.motor_id);
    } catch (e) {
      error = e.message;
      if (e.message.includes('429')) rateLimitRisk = 'HIGH';
      else rateLimitRisk = 'MEDIUM';
    } finally {
      motor.state = prevState;
      stream.activeMotorIds.delete(cand.motor_id);
    }

    const dtSeconds = Math.max((performance.now() - t0) / 1000, 0.1);
    const rawCount = fetched.length;

    // Evaluate novelty yield
    const uniqueInSample = new Set(fetched.map(f => f.atlasPersonId || f.sourceRecordHash)).size;
    const estimatedYield = rawCount > 0 ? (uniqueInSample / rawCount) * (motor.yield_estimate || 0.8) : 0;
    const yieldPct = Number((estimatedYield * 100).toFixed(1));
    const overlapPct = Number((100 - yieldPct).toFixed(1));

    const canaryTorqueSec = Number((rawCount * estimatedYield / Math.min(dtSeconds, 10)).toFixed(2));
    
    // Risk adjustment penalty:
    // Rate limit risk: HIGH = -50%, MEDIUM = -20%, LOW = 0%
    const riskFactor = rateLimitRisk === 'HIGH' ? 0.5 : (rateLimitRisk === 'MEDIUM' ? 0.8 : 1.0);
    const riskAdjustedTorque = Number((canaryTorqueSec * riskFactor).toFixed(2));

    const sourceHealth = error ? 'DEGRADED' : 'GREEN';

    results.push({
      motor_id: cand.motor_id,
      source_name: cand.name,
      target_region: cand.target_region,
      canary_true_new_sec: canaryTorqueSec,
      canary_yield: `${yieldPct}%`,
      canary_overlap: `${overlapPct}%`,
      canary_available_supply: cand.available_supply,
      rate_limit_risk: rateLimitRisk,
      source_health: sourceHealth,
      confidence: 0.95,
      novelty_frontier: cand.novelty_frontier,
      risk_adjusted_live_target_torque: riskAdjustedTorque,
      sample_records_fetched: rawCount,
      fetch_latency_ms: Math.round(dtSeconds * 1000)
    });

    console.log(`✓ [Canary] ${cand.motor_id}: ${rawCount} items in ${(dtSeconds).toFixed(2)}s | Yield: ${yieldPct}% | Torque: ${canaryTorqueSec}/s | Risk-Adjusted: ${riskAdjustedTorque}/s`);
    await new Promise(r => setTimeout(r, 600)); // space out requests
  }

  // Sort descending by risk-adjusted live target torque
  results.sort((a, b) => b.risk_adjusted_live_target_torque - a.risk_adjusted_live_target_torque);

  const outPath = 'reports/atlas/realtime/fresh_canary_audit.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nPersisted fresh canary ranking to ${outPath}`);
  console.log('Top candidate:', results[0].motor_id, '@', results[0].risk_adjusted_live_target_torque, '/s');
}

runCanaries().catch(console.error);
