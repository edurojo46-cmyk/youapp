import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AtlasVideoPointer {
  id: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  storageStatus: 'LOCAL' | 'VAULT' | 'DEDUPLICATED' | 'ONLINE_ONLY';
  physicalPath: string;
  webUrl: string;
  vaultPath?: string;
  canonicalId?: string;
  verified: boolean;
  metadata?: {
    duration?: number;
    resolution?: string;
    codec?: string;
    niche?: string;
    createdAt?: string;
  };
  lastVerifiedAt: string;
}

export interface VideoPointerRegistryStore {
  version: string;
  updatedAt: string;
  totalPointers: number;
  totalVaultBytes: number;
  pointers: Record<string, AtlasVideoPointer>;
}

export class AtlasVideoPointerResolver {
  private static instance: AtlasVideoPointerResolver;
  private readonly dataDir: string;
  private readonly registryFilePath: string;
  private registry: VideoPointerRegistryStore;

  private constructor() {
    this.dataDir = path.resolve(process.cwd(), 'server/data');
    this.registryFilePath = path.join(this.dataDir, 'atlas_video_pointers.json');
    this.registry = this.loadRegistry();
  }

  public static getInstance(): AtlasVideoPointerResolver {
    if (!AtlasVideoPointerResolver.instance) {
      AtlasVideoPointerResolver.instance = new AtlasVideoPointerResolver();
    }
    return AtlasVideoPointerResolver.instance;
  }

  private loadRegistry(): VideoPointerRegistryStore {
    try {
      if (fs.existsSync(this.registryFilePath)) {
        const raw = fs.readFileSync(this.registryFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e: any) {
      console.warn('[AtlasVideoPointerResolver] Failed to read registry:', e.message);
    }

    return {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      totalPointers: 0,
      totalVaultBytes: 0,
      pointers: {}
    };
  }

  private saveRegistry(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.registry.updatedAt = new Date().toISOString();
      this.registry.totalPointers = Object.keys(this.registry.pointers).length;
      this.registry.totalVaultBytes = Object.values(this.registry.pointers).reduce((acc, p) => {
        return acc + (p.storageStatus === 'VAULT' ? p.sizeBytes : 0);
      }, 0);

      fs.writeFileSync(this.registryFilePath, JSON.stringify(this.registry, null, 2), 'utf8');
    } catch (e: any) {
      console.error('[AtlasVideoPointerResolver] Failed to save registry:', e.message);
    }
  }

  public computeSha256(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024 * 1024); // 1MB chunks
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    return hash.digest('hex');
  }

  public registerPointer(params: {
    originalName: string;
    physicalPath: string;
    webUrl: string;
    storageStatus?: 'LOCAL' | 'VAULT' | 'DEDUPLICATED' | 'ONLINE_ONLY';
    vaultPath?: string;
    metadata?: any;
  }): AtlasVideoPointer {
    const absolutePath = path.resolve(params.physicalPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Cannot register video pointer: physical file does not exist at ${absolutePath}`);
    }

    const stat = fs.statSync(absolutePath);
    const sha256 = this.computeSha256(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg'
    };

    const id = `VPTR_${path.basename(params.originalName, ext)}_${sha256.slice(0, 10)}`;

    const pointer: AtlasVideoPointer = {
      id,
      originalName: params.originalName,
      sha256,
      sizeBytes: stat.size,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      storageStatus: params.storageStatus || 'LOCAL',
      physicalPath: absolutePath,
      webUrl: params.webUrl,
      vaultPath: params.vaultPath ? path.resolve(params.vaultPath) : undefined,
      verified: true,
      metadata: params.metadata,
      lastVerifiedAt: new Date().toISOString()
    };

    this.registry.pointers[id] = pointer;
    this.saveRegistry();
    return pointer;
  }

  public resolveByWebUrl(webUrl: string): { found: boolean; physicalPath?: string; pointer?: AtlasVideoPointer; mimeType?: string } {
    const cleanUrl = webUrl.split('?')[0];
    const filename = path.basename(cleanUrl);

    // 1. Direct match on webUrl or originalName
    for (const pointer of Object.values(this.registry.pointers)) {
      if (pointer.webUrl === cleanUrl || pointer.originalName === filename || path.basename(pointer.physicalPath) === filename) {
        // Check primary physicalPath
        if (fs.existsSync(pointer.physicalPath)) {
          return {
            found: true,
            physicalPath: pointer.physicalPath,
            pointer,
            mimeType: pointer.mimeType
          };
        }
        // Check fallback vaultPath
        if (pointer.vaultPath && fs.existsSync(pointer.vaultPath)) {
          return {
            found: true,
            physicalPath: pointer.vaultPath,
            pointer,
            mimeType: pointer.mimeType
          };
        }
      }
    }

    return { found: false };
  }

  public verifyIntegrity(pointerId: string): { verified: boolean; expectedSha: string; actualSha?: string; error?: string } {
    const pointer = this.registry.pointers[pointerId];
    if (!pointer) {
      return { verified: false, expectedSha: '', error: 'Pointer not found' };
    }

    const targetPath = fs.existsSync(pointer.physicalPath)
      ? pointer.physicalPath
      : (pointer.vaultPath && fs.existsSync(pointer.vaultPath) ? pointer.vaultPath : null);

    if (!targetPath) {
      return { verified: false, expectedSha: pointer.sha256, error: 'Target physical file not found on disk' };
    }

    const actualSha = this.computeSha256(targetPath);
    const matches = actualSha.toLowerCase() === pointer.sha256.toLowerCase();
    pointer.verified = matches;
    pointer.lastVerifiedAt = new Date().toISOString();
    this.saveRegistry();

    return { verified: matches, expectedSha: pointer.sha256, actualSha };
  }

  public getAllPointers(): AtlasVideoPointer[] {
    return Object.values(this.registry.pointers);
  }

  public getRegistrySummary(): VideoPointerRegistryStore {
    return { ...this.registry };
  }
}
