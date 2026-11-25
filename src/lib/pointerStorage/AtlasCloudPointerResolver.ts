import fs from 'node:fs';
import crypto from 'node:crypto';

export interface PointerStorageClient {
  from(bucket: string): {
    download(objectPath: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
}
export interface PointerResolveOptions { expectedSha256?: string; }

export class AtlasCloudPointerResolver {
  private readonly cache = new Map<string, Buffer>();
  private readonly storage: PointerStorageClient;
  private readonly maxCachedObjects: number;
  constructor(storage: PointerStorageClient, maxCachedObjects = 16) {
    if (!Number.isInteger(maxCachedObjects) || maxCachedObjects < 1) throw new Error('maxCachedObjects must be a positive integer');
    this.storage = storage;
    this.maxCachedObjects = maxCachedObjects;
  }
  private sha256(buffer: Buffer): string { return crypto.createHash('sha256').update(buffer).digest('hex'); }
  private remember(key: string, buffer: Buffer): void {
    if (this.cache.has(key)) this.cache.delete(key);
    while (this.cache.size >= this.maxCachedObjects) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(key, Buffer.from(buffer));
  }
  public async resolveBuffer(location: string, options: PointerResolveOptions = {}): Promise<Buffer> {
    if (!location) throw new Error('Pointer location is empty');
    const cached = this.cache.get(location);
    if (cached) {
      const copy = Buffer.from(cached);
      if (options.expectedSha256 && this.sha256(copy) !== options.expectedSha256.toLowerCase()) {
        this.cache.delete(location);
        throw new Error('SHA-256 mismatch for cached pointer object');
      }
      this.cache.delete(location); this.cache.set(location, cached);
      return copy;
    }
    let result: Buffer;
    if (location.startsWith('supabase://')) {
      const target = location.slice('supabase://'.length);
      const slash = target.indexOf('/');
      if (slash <= 0 || slash === target.length - 1) throw new Error('Invalid Supabase pointer URI; expected supabase://bucket/object-path');
      const bucket = target.slice(0, slash), objectPath = target.slice(slash + 1);
      const { data, error } = await this.storage.from(bucket).download(objectPath);
      if (error || !data) throw new Error('Supabase pointer download failed: ' + (error?.message || 'empty response'));
      result = Buffer.from(await data.arrayBuffer());
    } else {
      result = fs.readFileSync(location);
    }
    if (options.expectedSha256 && this.sha256(result) !== options.expectedSha256.toLowerCase()) throw new Error('SHA-256 mismatch for pointer object');
    this.remember(location, result);
    return Buffer.from(result);
  }
  public invalidate(location?: string): void { if (location) this.cache.delete(location); else this.cache.clear(); }
  public getCacheStats(): { entries: number; maxEntries: number } { return { entries: this.cache.size, maxEntries: this.maxCachedObjects }; }
}
