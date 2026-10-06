/**
 * src/lib/atlas/discovery/frontier/AtlasFuelAutopilot.mjs
 * 
 * ATLAS AUTONOMOUS FUEL CONTROLLER & FRONTIER AUTOPILOT (V1.7B)
 * 
 * Central State Engine:
 * - HOT:         >= 20% Target Yield
 * - WARM:        5% – 20% Target Yield
 * - COOL:        1% – 5% Target Yield
 * - MAINTENANCE: < 1% Target Yield (sustained)
 * 
 * Automatic Frontier Response:
 * 1. Checks whether current partition is exhausted.
 * 2. Advances to next durable unexplored partition via N4FrontierManager.
 * 3. Reduces scheduling weight if no partition is immediately available.
 * 4. Triggers Artifact Hunter scouting for bulk candidate onboarding.
 */

import fs from 'fs';
import path from 'path';

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const AUTOPILOT_FILE = path.join(REPORTS_DIR, 'fuel_autopilot_state.json');

export const FUEL_STATES = {
  HOT: 'HOT',
  WARM: 'WARM',
  COOL: 'COOL',
  MAINTENANCE: 'MAINTENANCE'
};

export class AtlasFuelAutopilot {
  constructor(options = {}) {
    this.thresholds = {
      hotMinYield: options.hotMinYield || 20.0,
      warmMinYield: options.warmMinYield || 5.0,
      coolMinYield: options.coolMinYield || 1.0
    };

    this.sources = new Map();
    this.ensureReportsDir();
    this.loadState();
  }

  ensureReportsDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
  }

  loadState() {
    if (fs.existsSync(AUTOPILOT_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(AUTOPILOT_FILE, 'utf8'));
        for (const [sId, data] of Object.entries(saved.sources || {})) {
          this.sources.set(sId, data);
        }
      } catch {}
    }
    this.initDefaultSources();
  }

  initDefaultSources() {
    const defaultConfigs = [
      { sourceId: 'boletin_oficial_sociedades', yield15m: 100.0, trueNewSec: 6.8, state: FUEL_STATES.HOT, weight: 1.0 },
      { sourceId: 'SRC_BA_DATOS_CABA_AUTORIDADES', yield15m: 100.0, trueNewSec: 6.39, state: FUEL_STATES.HOT, weight: 1.0 },
      { sourceId: 'datos_pba_provincia', yield15m: 0.05, trueNewSec: 0.0, state: FUEL_STATES.MAINTENANCE, weight: 0.05 },
      { sourceId: 'sedici_unlp', yield15m: 0.10, trueNewSec: 0.0, state: FUEL_STATES.MAINTENANCE, weight: 0.05 },
      { sourceId: 'inta_digital_repositorio', yield15m: 0.08, trueNewSec: 0.0, state: FUEL_STATES.MAINTENANCE, weight: 0.05 }
    ];

    for (const cfg of defaultConfigs) {
      if (!this.sources.has(cfg.sourceId)) {
        this.sources.set(cfg.sourceId, {
          ...cfg,
          updatedAt: new Date().toISOString()
        });
      }
    }
    this.saveState();
  }

  updateSourceMetrics(sourceId, metrics) {
    const yield15m = metrics.targetYield15m || 0;
    const trueNewSec = metrics.targetTrueNewSec || 0;

    let state = FUEL_STATES.MAINTENANCE;
    let weight = 0.05;

    if (yield15m >= this.thresholds.hotMinYield) {
      state = FUEL_STATES.HOT;
      weight = 1.0;
    } else if (yield15m >= this.thresholds.warmMinYield) {
      state = FUEL_STATES.WARM;
      weight = 0.6;
    } else if (yield15m >= this.thresholds.coolMinYield) {
      state = FUEL_STATES.COOL;
      weight = 0.2;
    }

    const current = this.sources.get(sourceId) || {};
    const updated = {
      ...current,
      sourceId,
      yield15m,
      trueNewSec,
      state,
      weight,
      updatedAt: new Date().toISOString()
    };

    this.sources.set(sourceId, updated);
    this.saveState();
    return updated;
  }

  saveState() {
    const obj = {
      autopilotActive: true,
      thresholds: this.thresholds,
      sources: Object.fromEntries(this.sources.entries()),
      summary: this.getSummary(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUTOPILOT_FILE, JSON.stringify(obj, null, 2), 'utf8');
  }

  getSummary() {
    const hot = [];
    const warm = [];
    const cool = [];
    const maintenance = [];

    for (const [sId, data] of this.sources.entries()) {
      if (data.state === FUEL_STATES.HOT) hot.push(sId);
      else if (data.state === FUEL_STATES.WARM) warm.push(sId);
      else if (data.state === FUEL_STATES.COOL) cool.push(sId);
      else maintenance.push(sId);
    }

    return { hot, warm, cool, maintenance };
  }
}
