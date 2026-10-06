import fs from 'fs';
import path from 'path';

export class SourceStrategyMemory {
  constructor(storagePath = 'scratch/source_strategy_memory.json') {
    this.storagePath = path.resolve(storagePath);
    this.memory = {}; // key: `${sourceOrResourceId}::${targetType}` -> PerformanceStats
    this.lessons = []; // Historical synthesized lessons
    this.load();
  }

  load() {
    if (fs.existsSync(this.storagePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.memory = raw.memory || {};
        this.lessons = raw.lessons || [];
        console.log(`[SourceStrategyMemory] Loaded ${Object.keys(this.memory).length} target-specific records and ${this.lessons.length} lessons.`);
      } catch (err) {
        console.warn('[SourceStrategyMemory] Fresh initialization:', err.message);
      }
    }
  }

  save() {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const payload = {
      version: '2.0.0',
      savedAt: new Date().toISOString(),
      recordCount: Object.keys(this.memory).length,
      memory: this.memory,
      lessons: this.lessons
    };
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  getKey(id, targetType) {
    return `${id}::${targetType}`;
  }

  recordObservation(id, targetType, stats) {
    const key = this.getKey(id, targetType);
    let record = this.memory[key];

    if (!record) {
      record = {
        id,
        targetType,
        probes: 0,
        validResults: 0,
        netNewResults: 0,
        duplicateRate: 0,
        invalidRate: 0,
        yieldPerSecond: 0,
        yieldPerMb: 0,
        argentinaConfidence: stats.argentinaConfidence ?? 1.0,
        expansionValue: stats.expansionValue ?? 1.0,
        saturationLevel: 0,
        status: 'UNKNOWN', // PRODUCTIVE, LOW_YIELD, ZERO_YIELD, EXHAUSTED
        lastUpdated: new Date().toISOString()
      };
      this.memory[key] = record;
    }

    record.probes += (stats.probes || 1);
    record.validResults += (stats.validResults || 0);
    record.netNewResults += (stats.netNewResults || 0);
    record.lastUpdated = new Date().toISOString();

    if (stats.validResults > 0) {
      record.duplicateRate = stats.duplicates ? parseFloat((stats.duplicates / (stats.validResults + stats.duplicates)).toFixed(4)) : record.duplicateRate;
      record.status = record.netNewResults > 500 ? 'PRODUCTIVE' : (record.netNewResults > 0 ? 'LOW_YIELD' : 'ZERO_YIELD');
    } else {
      record.status = 'ZERO_YIELD';
    }

    if (stats.yieldPerSecond) record.yieldPerSecond = stats.yieldPerSecond;
    if (stats.isExhausted) record.status = 'EXHAUSTED';

    return record;
  }

  getStats(id, targetType) {
    return this.memory[this.getKey(id, targetType)] || null;
  }

  isZeroYield(id, targetType) {
    const s = this.getStats(id, targetType);
    return s && s.status === 'ZERO_YIELD';
  }

  isExhausted(id, targetType) {
    const s = this.getStats(id, targetType);
    return s && s.status === 'EXHAUSTED';
  }

  addLesson(lessonText, category = 'GENERAL') {
    const entry = {
      lessonText,
      category,
      recordedAt: new Date().toISOString()
    };
    this.lessons.push(entry);
    console.log(`[SourceStrategyLesson] ${lessonText}`);
  }

  getLessons(category = null) {
    if (!category) return this.lessons;
    return this.lessons.filter(l => l.category === category);
  }
}
