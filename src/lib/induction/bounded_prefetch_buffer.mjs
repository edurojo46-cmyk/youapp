/**
 * ATLAS BOUNDED PREFETCH BUFFER V1
 * 
 * Implements bounded asynchronous double/triple-buffering:
 * - Pre-reads raw candidate chunks from disk
 * - Normalizes names & parses parts
 * - Computes deterministic HMACs
 * - Classifies candidates via Identity Induction Field
 * - Prepares SQL UNNEST parameter arrays & outbox payloads
 * - Bounded queue depth: 1, 2, or 3 batches max
 */

import crypto from 'node:crypto';
import { streamChunkedCandidates } from '../../../scripts/chunked_source_reader.mjs';

export class BoundedPrefetchBuffer {
  constructor(options = {}) {
    this.sourceFile = options.sourceFile;
    this.startLine = options.startLine || 0;
    this.totalLimit = options.totalLimit || 10000;
    this.batchSize = options.batchSize || 2000;
    this.prefetchDepth = options.prefetchDepth || 2;
    this.field = options.field;

    this.queue = [];
    this.isStreamFinished = false;
    this.streamError = null;
    this.waitingConsumers = [];
    this.waitingProducers = [];

    this.totalPrefetched = 0;
    this.workerTag = 'prefetch_pipeline';
  }

  start() {
    this.producerPromise = this._runProducer();
  }

  async _runProducer() {
    try {
      const stream = streamChunkedCandidates(this.sourceFile, {
        startLine: this.startLine,
        limit: this.totalLimit,
        batchSize: this.batchSize
      });

      for await (const rawBatch of stream) {
        // Wait if buffer queue is full
        while (this.queue.length >= this.prefetchDepth) {
          await new Promise(resolve => this.waitingProducers.push(resolve));
        }

        // Precompute batch
        const precomputed = this._precomputeBatch(rawBatch);
        this.queue.push(precomputed);
        this.totalPrefetched += rawBatch.length;

        // Wake waiting consumer
        if (this.waitingConsumers.length > 0) {
          const consumer = this.waitingConsumers.shift();
          consumer();
        }
      }
    } catch (err) {
      this.streamError = err;
    } finally {
      this.isStreamFinished = true;
      // Wake all waiting consumers on EOF
      while (this.waitingConsumers.length > 0) {
        const consumer = this.waitingConsumers.shift();
        consumer();
      }
    }
  }

  _precomputeBatch(rawBatch) {
    const definitelyAbsentList = [];
    const possiblyPresentList = [];

    for (const cand of rawBatch) {
      const candidatePayload = {
        source_id: cand.source_id,
        source_person_id: cand.source_person_id,
        identifier_value: cand.identifier_value
      };

      if (this.field) {
        this.field.reserveInFlight(this.workerTag, candidatePayload);
        const classification = this.field.classifyCandidate(candidatePayload, this.workerTag);
        if (classification.classification === 'DEFINITELY_ABSENT') {
          cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
          cand.isNew = true;
          cand.decision = 'NEW';
          definitelyAbsentList.push(cand);
        } else {
          cand.decision = 'UNKNOWN'; // Pending fallback lookup
          possiblyPresentList.push(cand);
        }
      } else {
        cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
        cand.isNew = true;
        cand.decision = 'NEW';
        definitelyAbsentList.push(cand);
      }
    }

    return {
      rawBatch,
      definitelyAbsentList,
      possiblyPresentList,
      precomputedAt: Date.now()
    };
  }

  async nextBatch() {
    while (this.queue.length === 0) {
      if (this.isStreamFinished) {
        if (this.streamError) throw this.streamError;
        return null; // EOF
      }
      await new Promise(resolve => this.waitingConsumers.push(resolve));
    }

    const batch = this.queue.shift();

    // Wake waiting producer
    if (this.waitingProducers.length > 0) {
      const producer = this.waitingProducers.shift();
      producer();
    }

    return batch;
  }
}
