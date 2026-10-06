/**
 * ATLAS — INDUSTRIAL EMAIL SEARCH INDEX
 * High-performance inverted token index ensuring immediate searchability of verified records
 */

import type { PublicEmailContact } from './types.ts';

export class IndustrialEmailSearchIndex {
  private emailToDocId: Map<string, number> = new Map();
  private docIdToRecord: Map<number, PublicEmailContact> = new Map();
  private tokenIndex: Map<string, number[]> = new Map();
  private nextDocId: number = 0;

  /**
   * Tokenizes text for inverted index lookup
   */
  public tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 2);
  }

  /**
   * Indexes a verified public email contact
   */
  public indexRecord(record: PublicEmailContact): boolean {
    if (this.emailToDocId.has(record.email_normalized)) {
      return false; // already indexed
    }

    const docId = this.nextDocId++;
    this.emailToDocId.set(record.email_normalized, docId);
    this.docIdToRecord.set(docId, record);

    const searchableBlob = `${record.email_normalized} ${record.associated_entity} ${record.contact_type} ${record.public_context} ${record.argentina_relation_type}`;
    const tokens = new Set(this.tokenize(searchableBlob));

    for (const t of tokens) {
      let list = this.tokenIndex.get(t);
      if (!list) {
        list = [];
        this.tokenIndex.set(t, list);
      }
      list.push(docId);
    }

    return true;
  }

  /**
   * Verifies if an email is indexed and retrievable
   */
  public isSearchable(email: string): boolean {
    return this.emailToDocId.has(email.toLowerCase().trim());
  }

  /**
   * Retrieves record by normalized email
   */
  public getByEmail(email: string): PublicEmailContact | undefined {
    const docId = this.emailToDocId.get(email.toLowerCase().trim());
    if (docId === undefined) return undefined;
    return this.docIdToRecord.get(docId);
  }

  /**
   * Searches records matching keyword query
   */
  public search(query: string, limit: number = 20): PublicEmailContact[] {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return [];

    const hitDocIds = new Set<number>();
    for (const t of tokens) {
      const docs = this.tokenIndex.get(t);
      if (docs) {
        for (const id of docs) {
          hitDocIds.add(id);
          if (hitDocIds.size >= limit * 2) break;
        }
      }
    }

    const results: PublicEmailContact[] = [];
    for (const id of hitDocIds) {
      const rec = this.docIdToRecord.get(id);
      if (rec) results.push(rec);
      if (results.length >= limit) break;
    }

    return results;
  }

  public size(): number {
    return this.emailToDocId.size;
  }
}
