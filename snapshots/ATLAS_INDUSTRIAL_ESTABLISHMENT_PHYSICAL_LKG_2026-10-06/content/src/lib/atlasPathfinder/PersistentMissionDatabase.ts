/**
 * ATLAS — AI PATHFINDER V2
 * Module: PersistentMissionDatabase (Sections 5, 9, 20, 21)
 * 
 * Persistent, verifiable, qualifyable, and reusable mission database entity.
 * Supports distinct states: ENTITY_VERIFIED vs MISSION_QUALIFIED.
 */

import fs from 'fs';
import path from 'path';
import type {
  MissionDatabaseSchema,
  DatabaseRecord
} from './types.ts';

export class PersistentMissionDatabase {
  public readonly databaseId: string;
  public readonly missionId: string;
  public readonly schema: MissionDatabaseSchema;
  private records: Map<string, DatabaseRecord> = new Map();
  private canonicalIndex: Map<string, string> = new Map(); // canonicalRelationId -> recordId
  public createdAt: string;
  public lastUpdatedAt: string;

  constructor(missionId: string, schema: MissionDatabaseSchema, databaseId?: string) {
    this.missionId = missionId;
    this.schema = schema;
    this.databaseId = databaseId || `DB_${schema.targetEntityType}_${Date.now().toString(36).toUpperCase()}`;
    this.createdAt = new Date().toISOString();
    this.lastUpdatedAt = this.createdAt;
  }

  /**
   * Adds or updates a record. Retains relationship to canonical authority and lifecycle state.
   */
  public upsertRecord(record: DatabaseRecord): boolean {
    const key = record.canonicalRelationId || record.recordId;
    const existingId = this.canonicalIndex.get(key) || (this.records.has(record.recordId) ? record.recordId : null);

    if (existingId) {
      // Merge and enrich existing record
      const existing = this.records.get(existingId)!;
      existing.data = { ...existing.data, ...record.data };
      existing.evidenceBadges = Array.from(new Set([...existing.evidenceBadges, ...(record.evidenceBadges || [])]));
      if (record.verificationStatus === 'VERIFIED') existing.verificationStatus = 'VERIFIED';
      if (record.lifecycleState) existing.lifecycleState = record.lifecycleState;
      if (record.mandatoryCriteriaMatrix) existing.mandatoryCriteriaMatrix = { ...existing.mandatoryCriteriaMatrix, ...record.mandatoryCriteriaMatrix };
      if (record.relationshipData) existing.relationshipData = [...(existing.relationshipData || []), ...record.relationshipData];
      existing.provenance = record.provenance || existing.provenance;
      this.lastUpdatedAt = new Date().toISOString();
      return false; // updated
    } else {
      this.records.set(record.recordId, record);
      this.canonicalIndex.set(key, record.recordId);
      this.lastUpdatedAt = new Date().toISOString();
      return true; // inserted
    }
  }

  public getRecord(recordId: string): DatabaseRecord | undefined {
    return this.records.get(recordId);
  }

  public getRecordByCanonicalId(canonicalRelationId: string): DatabaseRecord | undefined {
    const recordId = this.canonicalIndex.get(canonicalRelationId);
    if (!recordId) return undefined;
    return this.records.get(recordId);
  }

  public getAllRecords(): DatabaseRecord[] {
    return Array.from(this.records.values());
  }

  public getVerifiedRecords(): DatabaseRecord[] {
    return this.getAllRecords().filter(r => r.verificationStatus === 'VERIFIED');
  }

  public getQualifiedRecords(): DatabaseRecord[] {
    return this.getAllRecords().filter(r => r.lifecycleState === 'MISSION_QUALIFIED');
  }

  public getCandidates(): DatabaseRecord[] {
    return this.getAllRecords().filter(r => r.lifecycleState === 'MISSION_CANDIDATE');
  }

  public getRejectedRecords(): DatabaseRecord[] {
    return this.getAllRecords().filter(r => r.lifecycleState === 'MISSION_REJECTED');
  }

  public size(): number {
    return this.records.size;
  }

  /**
   * Filter records using arbitrary predicate
   */
  public filter(predicate: (r: DatabaseRecord) => boolean): DatabaseRecord[] {
    return this.getAllRecords().filter(predicate);
  }

  /**
   * Section 21: Database Evolution — Enrich incomplete fields
   */
  public enrichRecords(field: string, enricher: (record: DatabaseRecord) => any): number {
    let enrichedCount = 0;
    for (const r of this.records.values()) {
      if (!r.data[field] || r.data[field] === '—') {
        const enrichedVal = enricher(r);
        if (enrichedVal !== undefined && enrichedVal !== null) {
          r.data[field] = enrichedVal;
          enrichedCount++;
        }
      }
    }
    if (enrichedCount > 0) this.lastUpdatedAt = new Date().toISOString();
    return enrichedCount;
  }

  /**
   * Persists database artifact to disk
   */
  public saveToDisk(storageDir: string = 'reports/atlas/pathfinder/databases'): string {
    const fullDir = path.resolve(storageDir);
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    const filePath = path.join(fullDir, `${this.databaseId}.json`);
    const payload = {
      databaseId: this.databaseId,
      missionId: this.missionId,
      createdAt: this.createdAt,
      lastUpdatedAt: this.lastUpdatedAt,
      schema: this.schema,
      stats: {
        totalRecords: this.size(),
        verifiedRecords: this.getVerifiedRecords().length,
        qualifiedRecords: this.getQualifiedRecords().length,
        candidateRecords: this.getCandidates().length,
        rejectedRecords: this.getRejectedRecords().length
      },
      records: this.getAllRecords()
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  }

  /**
   * Loads a previously persisted mission database from disk for cross-mission reuse
   */
  public static loadFromDisk(filePath: string): PersistentMissionDatabase | null {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const db = new PersistentMissionDatabase(data.missionId, data.schema, data.databaseId);
      db.createdAt = data.createdAt;
      db.lastUpdatedAt = data.lastUpdatedAt;
      if (Array.isArray(data.records)) {
        for (const r of data.records) {
          db.upsertRecord(r);
        }
      }
      return db;
    } catch {
      return null;
    }
  }
}
