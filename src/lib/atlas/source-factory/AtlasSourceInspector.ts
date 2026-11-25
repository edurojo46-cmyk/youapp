/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasSourceInspector.ts
 * Path: src/lib/atlas/source-factory/AtlasSourceInspector.ts
 * 
 * Physical Source Inspection & Verification Engine.
 * Verifies physical existence on disk or over HTTP, detects encoding,
 * fetches bounded sample (up to 64KB), and classifies structure.
 */

import fs from 'fs';
import path from 'path';
import { AtlasFormatDetector, type DiscoveredFormatInfo } from './AtlasFormatDetector.ts';

export interface SourceInspectionResult {
  source_id: string;
  location: string;
  source_exists_physically: boolean;
  http_status?: number;
  content_type?: string;
  content_length?: number;
  encoding: string;
  format_info: DiscoveredFormatInfo;
  rate_limit_hints?: {
    requests_per_minute?: number;
    delay_ms?: number;
  };
  sample_size_bytes: number;
  inspected_at: string;
  error?: string;
}

export class AtlasSourceInspector {
  /**
   * Inspects a candidate source physically and returns verified technical metadata.
   */
  public static async inspect(
    source_id: string,
    location: string,
    mission_spec?: any
  ): Promise<SourceInspectionResult> {
    const inspected_at = new Date().toISOString();

    // 1. Local File Inspection
    if (location.startsWith('file://') || !location.startsWith('http://') && !location.startsWith('https://')) {
      const cleanPath = location.replace(/^file:\/\//, '');
      const resolvedPath = path.resolve(cleanPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          source_id,
          location,
          source_exists_physically: false,
          encoding: 'UNKNOWN',
          format_info: {
            format: 'UNKNOWN',
            encoding: 'UNKNOWN',
            confidence: 0
          },
          sample_size_bytes: 0,
          inspected_at,
          error: `Physical file does not exist at path: ${resolvedPath}`
        };
      }

      try {
        const stats = fs.statSync(resolvedPath);
        // Bounded read: first 65536 bytes (64KB)
        const fd = fs.openSync(resolvedPath, 'r');
        const buffer = Buffer.alloc(Math.min(65536, stats.size));
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        // Detect encoding
        let encoding = 'UTF-8';
        const sampleStr = buffer.toString('utf8');
        // Basic heuristic for Latin1 if replacement characters detected
        if (sampleStr.includes('\ufffd')) {
          encoding = 'latin1';
        }

        const formatInfo = AtlasFormatDetector.detect(buffer, {
          url: location,
          contentType: location.endsWith('.csv') ? 'text/csv' : location.endsWith('.json') ? 'application/json' : undefined
        });

        return {
          source_id,
          location,
          source_exists_physically: true,
          content_length: stats.size,
          encoding,
          format_info: formatInfo,
          sample_size_bytes: buffer.length,
          inspected_at
        };
      } catch (err: any) {
        return {
          source_id,
          location,
          source_exists_physically: false,
          encoding: 'UNKNOWN',
          format_info: { format: 'UNKNOWN', encoding: 'UNKNOWN', confidence: 0 },
          sample_size_bytes: 0,
          inspected_at,
          error: `Error reading local source: ${err.message}`
        };
      }
    }

    // 2. Remote HTTP / HTTPS Inspection
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(location, {
        method: 'GET',
        headers: {
          'User-Agent': 'AtlasSourceFactory/1.0 (Public Data Inspection; +https://atlas.intelligence)',
          'Accept': 'application/json, text/csv, text/html, application/xml, text/plain;q=0.9, */*;q=0.8',
          'Range': 'bytes=0-65535' // Try range request to avoid mass download
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const http_status = response.status;
      if (http_status >= 400) {
        return {
          source_id,
          location,
          source_exists_physically: false,
          http_status,
          encoding: 'UNKNOWN',
          format_info: { format: 'UNKNOWN', encoding: 'UNKNOWN', confidence: 0 },
          sample_size_bytes: 0,
          inspected_at,
          error: `HTTP status ${http_status}: Endpoint unreachable or unauthorized`
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

      // Extract Rate-limit hints
      let rate_limit_hints: { requests_per_minute?: number; delay_ms?: number } | undefined;
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const retryAfter = response.headers.get('retry-after');
      if (rateLimitRemaining || retryAfter) {
        rate_limit_hints = {
          requests_per_minute: rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : undefined,
          delay_ms: retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
        };
      }

      // Read sample body (up to 64KB)
      const rawText = await response.text();
      const sampleText = rawText.slice(0, 65536);

      const formatInfo = AtlasFormatDetector.detect(sampleText, {
        url: location,
        contentType,
        headers: Object.fromEntries(response.headers.entries())
      });

      return {
        source_id,
        location,
        source_exists_physically: true,
        http_status,
        content_type: contentType,
        content_length: contentLength || sampleText.length,
        encoding: 'UTF-8',
        format_info: formatInfo,
        rate_limit_hints,
        sample_size_bytes: Buffer.byteLength(sampleText, 'utf8'),
        inspected_at
      };
    } catch (err: any) {
      return {
        source_id,
        location,
        source_exists_physically: false,
        encoding: 'UNKNOWN',
        format_info: { format: 'UNKNOWN', encoding: 'UNKNOWN', confidence: 0 },
        sample_size_bytes: 0,
        inspected_at,
        error: `Network/probe exception: ${err.message}`
      };
    }
  }
}
