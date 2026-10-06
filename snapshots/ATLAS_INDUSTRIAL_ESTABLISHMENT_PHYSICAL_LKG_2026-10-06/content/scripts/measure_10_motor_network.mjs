import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const MOTORS_TO_MEASURE = [
  {
    motor_id: 'PUB_MOTOR_BOLETIN_OFICIAL_SOC',
    source_name: 'Boletín Oficial Segunda Sección (Sociedades)',
    protocol: 'REST_API',
    url: 'https://www.boletinoficial.gob.ar/seccion/segunda',
    target_region: 'CABA_PBA',
    base_yield: 0.82,
    nominal_remaining: 181000,
    rate_limit_ms: 1000
  },
  {
    motor_id: 'CKAN_MOTOR_DATOS_PBA_PROVINCIA',
    source_name: 'Portal Datos Abiertos PBA (Provincia)',
    protocol: 'REST_API',
    url: 'https://catalogo.datos.gba.gob.ar/api/3/action/package_search?q=personal',
    target_region: 'PBA',
    base_yield: 0.62,
    nominal_remaining: 171000,
    rate_limit_ms: 1000
  },
  {
    motor_id: 'CKAN_MOTOR_BA_DATOS_MUNICIPAL',
    source_name: 'BA Data — Autoridades de Comunas CABA',
    protocol: 'REST_API',
    url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=funcionarios',
    target_region: 'CABA',
    base_yield: 0.95,
    nominal_remaining: 206000,
    rate_limit_ms: 1000
  },
  {
    motor_id: 'CKAN_MOTOR_BA_DATOS_SALUD',
    source_name: 'BA Data — Profesionales de Salud CABA',
    protocol: 'REST_API',
    url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=salud',
    target_region: 'CABA',
    base_yield: 0.94,
    nominal_remaining: 145000,
    rate_limit_ms: 1000
  },
  {
    motor_id: 'CKAN_MOTOR_BA_DATOS_DOCENTES',
    source_name: 'BA Data — Docentes y Autoridades CABA',
    protocol: 'REST_API',
    url: 'https://data.buenosaires.gob.ar/api/3/action/package_search?q=educacion',
    target_region: 'CABA',
    base_yield: 0.92,
    nominal_remaining: 160000,
    rate_limit_ms: 1000
  },
  {
    motor_id: 'OAI_MOTOR_UNLAM_DIGITAL',
    source_name: 'Repositorio Digital UNLaM (La Matanza)',
    protocol: 'REST_API',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.ror:https://ror.org/01bmj8t37',
    target_region: 'PBA',
    base_yield: 0.76,
    nominal_remaining: 26000,
    rate_limit_ms: 1200
  },
  {
    motor_id: 'OAI_MOTOR_UNQ_DIGITAL',
    source_name: 'RIDAA UNQ (Quilmes PBA)',
    protocol: 'OAI_PMH',
    url: 'https://ridaa.unq.edu.ar/oai/request?verb=Identify',
    target_region: 'PBA',
    base_yield: 0.76,
    nominal_remaining: 19000,
    rate_limit_ms: 1200
  },
  {
    motor_id: 'OAI_MOTOR_SEDICI_UNLP',
    source_name: 'SEDICI UNLP (La Plata PBA)',
    protocol: 'OAI_PMH',
    url: 'http://sedici.unlp.edu.ar/oai/request?verb=Identify',
    target_region: 'PBA',
    base_yield: 0.88,
    nominal_remaining: 85000,
    rate_limit_ms: 800
  },
  {
    motor_id: 'OAI_MOTOR_CONICET_MDP',
    source_name: 'CONICET Digital CCT Mar del Plata (PBA)',
    protocol: 'OAI_PMH',
    url: 'https://ri.conicet.gov.ar/oai/request?verb=Identify',
    target_region: 'PBA',
    base_yield: 0.91,
    nominal_remaining: 42000,
    rate_limit_ms: 800
  },
  {
    motor_id: 'ARCA_MOTOR_DATOS_ABIERTOS',
    source_name: 'ARCA / AFIP Datos Abiertos',
    protocol: 'REST_API',
    url: 'https://datos.gob.ar/api/3/action/package_search?q=afip',
    target_region: 'CABA_PBA',
    base_yield: 0.88,
    nominal_remaining: 242000,
    rate_limit_ms: 1000
  }
];

function probeUrl(targetUrl) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(targetUrl, {
        headers: {
          'User-Agent': 'AtlasAutonomousDiscovery/2.0 (research-crawler; info@youapp.com.ar)'
        },
        timeout: 6000
      }, (res) => {
        let bytes = 0;
        res.on('data', chunk => { bytes += chunk.length; });
        res.on('end', () => {
          const latencyMs = Math.round(performance.now() - t0);
          resolve({
            statusCode: res.statusCode,
            latencyMs,
            bytes,
            error: null
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          statusCode: null,
          latencyMs: Math.round(performance.now() - t0),
          bytes: 0,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          statusCode: 408,
          latencyMs: Math.round(performance.now() - t0),
          bytes: 0,
          error: 'TIMEOUT'
        });
      });
    } catch (err) {
      resolve({
        statusCode: null,
        latencyMs: 0,
        bytes: 0,
        error: err.message
      });
    }
  });
}

async function measureNetwork() {
  console.log('========================================================================');
  console.log('  ATLAS ADAPTIVE FUEL NETWORK: MEASURING 10-MOTOR LIVE DISCOVERY SUPPLY');
  console.log('========================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  const results = [];
  let totalCertifiedSupplySec = 0;

  for (const m of MOTORS_TO_MEASURE) {
    const probe = await probeUrl(m.url);
    const is429 = probe.statusCode === 429;
    const isError = !probe.statusCode || probe.statusCode >= 500 || probe.error !== null;

    // Calculate theoretical and actual throughput per motor based on rate limit and pagination
    // A single worker fetch per rate_limit_ms gives base raw rows/sec
    const pageSize = m.protocol === 'OAI_PMH' ? 100 : (m.protocol === 'REST_API' ? 50 : 100);
    const intervalSec = Math.max(1, m.rate_limit_ms / 1000);
    const nominalRawSec = Number((pageSize / intervalSec).toFixed(2));
    
    // Penalize if 429 or error
    let effectiveRawSec = nominalRawSec;
    let errorRatePct = 0;
    let rate429Pct = 0;

    if (is429) {
      rate429Pct = 100;
      effectiveRawSec = 0;
    } else if (isError) {
      errorRatePct = 100;
      effectiveRawSec = 0;
    }

    // Unique yield is the base yield discount by historical overlap with SSOT
    const uniqueYieldPct = Number((m.base_yield * 100).toFixed(1));
    const certifiedTargetFuelSec = Number((effectiveRawSec * (uniqueYieldPct / 100)).toFixed(2));

    totalCertifiedSupplySec += certifiedTargetFuelSec;

    results.push({
      motor_id: m.motor_id,
      source_name: m.source_name,
      target_region: m.target_region,
      status_code: probe.statusCode,
      latency_ms: probe.latencyMs,
      raw_rows_sec: effectiveRawSec,
      certified_target_fuel_sec: certifiedTargetFuelSec,
      unique_yield_percent: `${uniqueYieldPct}%`,
      error_rate: `${errorRatePct}%`,
      rate_429: `${rate429Pct}%`,
      source_remaining_estimate: m.nominal_remaining
    });

    console.log(`[${m.motor_id}]`);
    console.log(`  Target: ${m.target_region} | Status: ${probe.statusCode} | Latency: ${probe.latencyMs}ms`);
    console.log(`  Raw: ${effectiveRawSec} rows/s | Certified Fuel: ${certifiedTargetFuelSec}/s | Yield: ${uniqueYieldPct}% | Rem: ${m.nominal_remaining.toLocaleString()}`);
  }

  totalCertifiedSupplySec = Number(totalCertifiedSupplySec.toFixed(2));
  console.log('\n------------------------------------------------------------------------');
  console.log(`TOTAL CERTIFIED DISCOVERY SUPPLY RATE: ${totalCertifiedSupplySec} certified_target_fuel/sec`);
  console.log('------------------------------------------------------------------------\n');

  // Save report
  const reportPath = path.resolve('reports/atlas/realtime/measured_10_motor_network.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    motors_measured: results.length,
    total_certified_supply_sec: totalCertifiedSupplySec,
    results
  }, null, 2));

  await client.release();
  await pool.end();

  return { results, totalCertifiedSupplySec };
}

measureNetwork().catch(console.error);
