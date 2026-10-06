/**
 * ATLAS — PREEXISTING EMAIL AUTHORITY & T0 SNAPSHOT
 * Guarantees True-Net-New qualification against historical Atlas universe
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class PreexistingEmailAuthority {
  private openingHashes: Set<string> = new Set();
  public openingCount: number = 0;
  public snapshotHash: string = '';
  public frozenAt: string = '';

  constructor() {}

  /**
   * Initializes or loads the T0 Preexisting Email Authority snapshot
   */
  public async loadOrInitializeT0(rootDir: string = process.cwd()): Promise<{ count: number; snapshotHash: string }> {
    const authBinPath = path.resolve(rootDir, 'scratch/global_preexisting_public_email_authority.bin');
    const authJsonPath = path.resolve(rootDir, 'scratch/global_preexisting_public_email_authority.json');

    this.openingHashes.clear();

    if (fs.existsSync(authBinPath)) {
      const buf = fs.readFileSync(authBinPath);
      // Read 8-byte SHA-256 prefixes
      for (let i = 0; i < buf.length; i += 8) {
        this.openingHashes.add(buf.subarray(i, i + 8).toString('hex'));
      }
      this.openingCount = this.openingHashes.size;

      if (fs.existsSync(authJsonPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(authJsonPath, 'utf8'));
          this.frozenAt = meta.frozen_at || new Date().toISOString();
        } catch {}
      }
    } else {
      this.openingCount = 0;
      this.frozenAt = new Date().toISOString();
    }

    // Compute cryptographic snapshot hash of the authority
    const h = crypto.createHash('sha256');
    h.update(`COUNT:${this.openingCount}\n`);
    for (const prefix of this.openingHashes) {
      h.update(`${prefix}\n`);
    }
    this.snapshotHash = h.digest('hex');

    console.log(`[PreexistingAuthority] Loaded T0 Authority: ${this.openingCount.toLocaleString()} opening emails (Hash: ${this.snapshotHash.slice(0, 16)}...)`);
    return {
      count: this.openingCount,
      snapshotHash: this.snapshotHash
    };
  }

  /**
   * Checks if a normalized email existed in T0 authority
   */
  public isPreexisting(normalizedEmail: string): boolean {
    if (this.openingHashes.size === 0) return false;
    const prefix = crypto
      .createHash('sha256')
      .update(normalizedEmail)
      .digest()
      .subarray(0, 8)
      .toString('hex');
    return this.openingHashes.has(prefix);
  }
}
