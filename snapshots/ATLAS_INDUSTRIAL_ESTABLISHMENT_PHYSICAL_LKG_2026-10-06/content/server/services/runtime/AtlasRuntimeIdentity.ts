import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface RuntimeStatusResponse {
  PROCESS_PID: number;
  PROCESS_STARTED_AT: string;
  RUNTIME_BUILD_ID: string;
  RUNTIME_CODE_VERSION: string;
  RUNTIME_LOADED_AT: string;
  ENVIRONMENT: string;
  PORT: number;
  STATUS: 'HEALTHY' | 'STALE' | 'DEGRADED';
}

export class AtlasRuntimeIdentity {
  private static instance: AtlasRuntimeIdentity;
  public readonly processPid: number;
  public readonly startedAt: string;
  public readonly loadedAt: string;
  public readonly buildId: string;
  public readonly codeVersion: string = '1.0.0';

  private constructor() {
    this.processPid = process.pid;
    this.startedAt = new Date().toISOString();
    this.loadedAt = new Date().toISOString();
    this.buildId = AtlasRuntimeIdentity.computeDeterministicBuildId();
  }

  public static getInstance(): AtlasRuntimeIdentity {
    if (!AtlasRuntimeIdentity.instance) {
      AtlasRuntimeIdentity.instance = new AtlasRuntimeIdentity();
    }
    return AtlasRuntimeIdentity.instance;
  }

  public static computeDeterministicBuildId(): string {
    const hasher = crypto.createHash('sha256');

    // 1. Git Commit Hash (short)
    try {
      const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 1500 }).trim();
      hasher.update(`commit:${commit};`);
    } catch {
      hasher.update('commit:unknown;');
    }

    // 2. Critical Runtime Core Files Fingerprint
    const coreFiles = [
      'server.ts',
      'server/services/industrial/IndustrialDiscoveryService.ts',
      'server/services/industrial/AtlasSourceUnderstandingEngine.ts',
      'server/services/industrial/connectors/AtlasConnectorExecutor.ts',
      'server/services/industrial/AtlasAISourceRadar.ts',
      'server/services/industrial/AtlasSourceProbeGate.ts'
    ];

    for (const relPath of coreFiles) {
      const absPath = path.resolve(process.cwd(), relPath);
      try {
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          const head = fs.readFileSync(absPath, { encoding: 'utf-8' }).slice(0, 1024);
          hasher.update(`${relPath}:${stat.size}:${stat.mtimeMs}:${head};`);
        }
      } catch {
        // Continue
      }
    }

    return `BLD_${hasher.digest('hex').slice(0, 16).toUpperCase()}`;
  }

  public getStatus(port: number): RuntimeStatusResponse {
    return {
      PROCESS_PID: this.processPid,
      PROCESS_STARTED_AT: this.startedAt,
      RUNTIME_BUILD_ID: this.buildId,
      RUNTIME_CODE_VERSION: this.codeVersion,
      RUNTIME_LOADED_AT: this.loadedAt,
      ENVIRONMENT: process.env.NODE_ENV || 'development',
      PORT: port,
      STATUS: 'HEALTHY'
    };
  }
}
