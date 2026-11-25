/**
 * ATLAS ADAPTIVE FREQUENCY CONTROLLER (AFC) V1
 * 
 * Regulates ingestion frequency and batch size dynamically based on:
 * - EWMA throughput (NEW/sec, CAND/sec)
 * - PostgreSQL latency percentiles (P95 batch, identity, outbox, commit)
 * - Database wait events (DataFileRead wait rate)
 * - Outbox backlog slope
 * 
 * States:
 *   - NORMAL
 *   - APPROACHING_SATURATION
 *   - SATURATED
 *   - RECOVERY
 */

export class AdaptiveFrequencyController {
  constructor(options = {}) {
    this.candidateBatchSizes = options.candidateBatchSizes || [1500, 1750, 2000, 2250, 2500, 2750, 3000];
    this.currentBatchSize = options.initialBatchSize || 2000;
    this.bestBatchSize = this.currentBatchSize;
    this.bestThroughput = 0;

    // EWMA alpha smoothing factor
    this.alpha = options.alpha || 0.25;

    // Rolling metrics
    this.ewmaNewSec = 0;
    this.ewmaCandSec = 0;
    this.pgBatchP95 = 0;
    this.identityWriteP95 = 0;
    this.outboxWriteP95 = 0;
    this.commitP95 = 0;
    this.dataFileReadWaitRate = 0;
    this.outboxBacklogSlope = 0;

    // State machine
    this.state = 'NORMAL';
    this.controlDirection = 'STABLE'; // 'UP', 'DOWN', 'STABLE'
    this.batchesAtCurrentSize = 0;
    this.minBatchesBeforeTransition = 3; // Hysteresis barrier
    this.recoveryRemainingBatches = 0;
    this.saturationEvents = 0;

    // History for percentile calculations
    this.recentBatches = [];
  }

  updateMetrics(batchMetrics) {
    const {
      newSec,
      candSec,
      batchDurationMs,
      identityWriteMs = 0,
      outboxWriteMs = 0,
      commitMs = 0,
      dataFileReadRatio = 0,
      backlogChangeRate = 0
    } = batchMetrics;

    // Update EWMA
    if (this.ewmaNewSec === 0) {
      this.ewmaNewSec = newSec;
      this.ewmaCandSec = candSec;
      this.dataFileReadWaitRate = dataFileReadRatio;
      this.outboxBacklogSlope = backlogChangeRate;
    } else {
      this.ewmaNewSec = Number((this.alpha * newSec + (1 - this.alpha) * this.ewmaNewSec).toFixed(2));
      this.ewmaCandSec = Number((this.alpha * candSec + (1 - this.alpha) * this.ewmaCandSec).toFixed(2));
      this.dataFileReadWaitRate = Number((this.alpha * dataFileReadRatio + (1 - this.alpha) * this.dataFileReadWaitRate).toFixed(3));
      this.outboxBacklogSlope = Number((this.alpha * backlogChangeRate + (1 - this.alpha) * this.outboxBacklogSlope).toFixed(2));
    }

    this.recentBatches.push({
      batchDurationMs,
      identityWriteMs,
      outboxWriteMs,
      commitMs
    });
    if (this.recentBatches.length > 20) {
      this.recentBatches.shift();
    }

    // Compute rolling P95s
    const batchTimes = this.recentBatches.map(b => b.batchDurationMs).sort((a, b) => a - b);
    const idTimes = this.recentBatches.map(b => b.identityWriteMs).sort((a, b) => a - b);
    const outTimes = this.recentBatches.map(b => b.outboxWriteMs).sort((a, b) => a - b);
    const commitTimes = this.recentBatches.map(b => b.commitMs).sort((a, b) => a - b);

    const p95Idx = Math.floor(batchTimes.length * 0.95);
    this.pgBatchP95 = Number(batchTimes[p95Idx].toFixed(1));
    this.identityWriteP95 = Number(idTimes[p95Idx].toFixed(1));
    this.outboxWriteP95 = Number(outTimes[p95Idx].toFixed(1));
    this.commitP95 = Number(commitTimes[p95Idx].toFixed(1));

    this.batchesAtCurrentSize++;

    // Evaluate state machine
    this.evaluateState();

    // Adjust batch size if enabled and hysteresis satisfied
    return this.evaluateBatchAdjustment();
  }

  evaluateState() {
    if (this.state === 'RECOVERY') {
      this.recoveryRemainingBatches--;
      if (this.recoveryRemainingBatches <= 0) {
        this.state = 'NORMAL';
      }
      return;
    }

    const isHighIoWait = this.dataFileReadWaitRate > 0.40;
    const isLatencySpike = this.pgBatchP95 > 3500;
    const isBacklogExplosion = this.outboxBacklogSlope > 1000;

    if (isHighIoWait || isLatencySpike || isBacklogExplosion) {
      this.state = 'SATURATED';
      this.saturationEvents++;
    } else if (this.dataFileReadWaitRate > 0.25 || this.pgBatchP95 > 2500 || this.outboxBacklogSlope > 400) {
      this.state = 'APPROACHING_SATURATION';
    } else {
      this.state = 'NORMAL';
    }
  }

  evaluateBatchAdjustment() {
    const currentIdx = this.candidateBatchSizes.indexOf(this.currentBatchSize);

    // Track best throughput observed
    if (this.ewmaNewSec > this.bestThroughput && this.state === 'NORMAL') {
      this.bestThroughput = this.ewmaNewSec;
      this.bestBatchSize = this.currentBatchSize;
    }

    if (this.state === 'SATURATED') {
      // Immediate step down to last known best or lowest batch
      const targetBatch = this.bestBatchSize < this.currentBatchSize ? this.bestBatchSize : Math.max(this.candidateBatchSizes[0], this.currentBatchSize - 250);
      if (targetBatch !== this.currentBatchSize) {
        this.currentBatchSize = targetBatch;
        this.batchesAtCurrentSize = 0;
        this.state = 'RECOVERY';
        this.recoveryRemainingBatches = 4;
        this.controlDirection = 'DOWN';
        return { action: 'ADJUST_BATCH', newBatchSize: this.currentBatchSize, reason: 'SATURATION_RECOVERY' };
      }
    }

    // Require at least minBatchesBeforeTransition at current batch size (Hysteresis)
    if (this.batchesAtCurrentSize < this.minBatchesBeforeTransition) {
      return { action: 'MAINTAIN', newBatchSize: this.currentBatchSize };
    }

    // Hill-climb logic
    if (this.state === 'NORMAL') {
      // If throughput is increasing and saturation is quiet, probe upward
      if (currentIdx < this.candidateBatchSizes.length - 1 && this.ewmaNewSec >= this.bestThroughput * 0.97) {
        this.currentBatchSize = this.candidateBatchSizes[currentIdx + 1];
        this.batchesAtCurrentSize = 0;
        this.controlDirection = 'UP';
        return { action: 'ADJUST_BATCH', newBatchSize: this.currentBatchSize, reason: 'HILL_CLIMB_PROBE' };
      }
    } else if (this.state === 'APPROACHING_SATURATION') {
      // Descend toward best batch
      if (this.currentBatchSize > this.bestBatchSize && currentIdx > 0) {
        this.currentBatchSize = this.candidateBatchSizes[currentIdx - 1];
        this.batchesAtCurrentSize = 0;
        this.controlDirection = 'DOWN';
        return { action: 'ADJUST_BATCH', newBatchSize: this.currentBatchSize, reason: 'APPROACHING_SATURATION_DESCEND' };
      }
    }

    this.controlDirection = 'STABLE';
    return { action: 'MAINTAIN', newBatchSize: this.currentBatchSize };
  }

  getStatus() {
    return {
      CURRENT_BATCH: this.currentBatchSize,
      BEST_BATCH: this.bestBatchSize,
      EWMA_NEW_SEC: this.ewmaNewSec,
      EWMA_CAND_SEC: this.ewmaCandSec,
      PG_BATCH_P95: this.pgBatchP95,
      IDENTITY_WRITE_P95: this.identityWriteP95,
      OUTBOX_WRITE_P95: this.outboxWriteP95,
      COMMIT_P95: this.commitP95,
      DATA_FILE_READ_WAIT_RATE: this.dataFileReadWaitRate,
      OUTBOX_BACKLOG_SLOPE: this.outboxBacklogSlope,
      SATURATION_STATE: this.state,
      CONTROL_DIRECTION: this.controlDirection,
      SATURATION_EVENTS: this.saturationEvents
    };
  }
}
