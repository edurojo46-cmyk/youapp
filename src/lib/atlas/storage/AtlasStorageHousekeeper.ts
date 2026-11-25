import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface StoragePolicyConfig {
  maxVisualDiscoveryCacheMb: number;
  maxDirectorTempMb: number;
  autoPurgeOlderThanHours: number;
}

export const DEFAULT_STORAGE_POLICY: StoragePolicyConfig = {
  maxVisualDiscoveryCacheMb: 150,
  maxDirectorTempMb: 150,
  autoPurgeOlderThanHours: 24
};

export class AtlasStorageHousekeeper {
  private static instance: AtlasStorageHousekeeper;
  private readonly config: StoragePolicyConfig;

  private constructor(config?: Partial<StoragePolicyConfig>) {
    this.config = { ...DEFAULT_STORAGE_POLICY, ...config };
  }

  public static getInstance(): AtlasStorageHousekeeper {
    if (!AtlasStorageHousekeeper.instance) {
      AtlasStorageHousekeeper.instance = new AtlasStorageHousekeeper();
    }
    return AtlasStorageHousekeeper.instance;
  }

  public enforceDirectoryQuota(dirPath: string, maxMb: number): { filesPruned: number; bytesPruned: number } {
    if (!fs.existsSync(dirPath)) return { filesPruned: 0, bytesPruned: 0 };

    try {
      const files: { name: string; fullPath: string; size: number; mtime: number }[] = [];
      let totalBytes = 0;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile()) {
          const fullPath = path.join(dirPath, ent.name);
          const stat = fs.statSync(fullPath);
          files.push({ name: ent.name, fullPath, size: stat.size, mtime: stat.mtimeMs });
          totalBytes += stat.size;
        }
      }

      const maxBytes = maxMb * 1024 * 1024;
      if (totalBytes <= maxBytes) {
        return { filesPruned: 0, bytesPruned: 0 };
      }

      // Sort oldest first
      files.sort((a, b) => a.mtime - b.mtime);

      let bytesPruned = 0;
      let filesPruned = 0;

      for (const f of files) {
        if (totalBytes - bytesPruned <= maxBytes) break;
        try {
          fs.unlinkSync(f.fullPath);
          bytesPruned += f.size;
          filesPruned++;
        } catch (e) {}
      }

      return { filesPruned, bytesPruned };
    } catch (e) {
      return { filesPruned: 0, bytesPruned: 0 };
    }
  }

  public getDiskFreeSpaceBytes(): number {
    try {
      // 1. Native Node.js statfsSync if available
      if (typeof (fs as any).statfsSync === 'function') {
        const stats = (fs as any).statfsSync('C:\\');
        if (stats && stats.bavail && stats.bsize) {
          return stats.bavail * stats.bsize;
        }
      }
    } catch (e) {}

    try {
      // 2. PowerShell query fallback
      const out = execSync('powershell -NoProfile -Command "(Get-Volume -DriveLetter C).SizeRemaining"', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      const parsed = parseInt(out, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    } catch (e) {}

    return 0;
  }

  public verifyRenderSafety(minFreeGb = 3.0): {
    allowed: boolean;
    currentFreeBytes: number;
    currentFreeGb: number;
    minRequiredGb: number;
    status: 'PERMITTED' | 'BLOCKED';
    message: string;
  } {
    const currentFreeBytes = this.getDiskFreeSpaceBytes();
    const currentFreeGb = currentFreeBytes / (1024 * 1024 * 1024);
    const minRequiredBytes = minFreeGb * 1024 * 1024 * 1024;

    const allowed = currentFreeBytes >= minRequiredBytes;
    const status = allowed ? 'PERMITTED' : 'BLOCKED';
    const message = allowed
      ? `Render permitted: ${currentFreeGb.toFixed(2)} GB free on C: (threshold: ${minFreeGb.toFixed(1)} GB)`
      : `Render BLOCKED: Only ${currentFreeGb.toFixed(2)} GB free on C: (minimum required: ${minFreeGb.toFixed(1)} GB). Storage protection active.`;

    return {
      allowed,
      currentFreeBytes,
      currentFreeGb,
      minRequiredGb: minFreeGb,
      status,
      message
    };
  }

  public assertSufficientDiskSpace(minFreeGb = 3.0): void {
    const verification = this.verifyRenderSafety(minFreeGb);
    if (!verification.allowed) {
      throw new Error(`DISK_PROTECTION_GATE_BLOCKED: ${verification.message}`);
    }
  }

  public runAutoHousekeeping(): { visualCachePruned: any; directorTempPruned: any } {
    const visualCache = path.resolve(process.cwd(), 'public/cache/visual_discovery');
    const dirTemp = path.resolve(process.cwd(), 'public/director_temp');

    const vResult = this.enforceDirectoryQuota(visualCache, this.config.maxVisualDiscoveryCacheMb);
    const dResult = this.enforceDirectoryQuota(dirTemp, this.config.maxDirectorTempMb);

    return {
      visualCachePruned: vResult,
      directorTempPruned: dResult
    };
  }
}
