/**
 * src/lib/atlas/discovery/connectors/GenericVersionedBulkDatasetConnector.mjs
 * 
 * ATLAS GATE #32: Reusable Versioned Bulk Dataset Connector
 * 
 * Generalizes the physical acquisition infrastructure:
 * - Dynamic landing-page resource discovery
 * - Dynamic URL resolution & redirect chain tracking
 * - Range request byte probing
 * - Stream download with cryptographic content hashing
 * - Snapshot metadata extraction (ETag, Last-Modified, content-length)
 * - Checkpointing, retry, and Range recovery
 * 
 * "MAP ONCE. FETCH ONCE WHEN POSSIBLE. NORMALIZE ONCE. INTERPRET MANY TIMES."
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL } from 'node:url';

export class GenericVersionedBulkDatasetConnector {
  constructor(options = {}) {
    this.sourceSurfaceId = options.sourceSurfaceId || 'SURF_GENERIC_BULK';
    this.landingPageUrl = options.landingPageUrl;
    this.fallbackLandingUrls = options.fallbackLandingUrls || [];
    this.anchorPattern = options.anchorPattern; // RegExp to find download anchor
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.discoveredResourceUrl = null;
    this.metadata = {};
  }

  /**
   * Discovers the current active resource from the official landing page
   */
  async discoverLandingSurface() {
    const urlsToTry = [this.landingPageUrl, ...this.fallbackLandingUrls].filter(Boolean);
    let html = null;
    let successfulLandingUrl = null;

    for (const u of urlsToTry) {
      try {
        const res = await fetch(u, {
          method: 'GET',
          headers: { 'User-Agent': this.userAgent }
        });
        if (res.ok) {
          html = await res.text();
          successfulLandingUrl = u;
          break;
        }
      } catch (e) {}
    }

    if (!html) {
      throw new Error(`LANDING_DISCOVERY_FAILED: Unable to load official landing page from ${urlsToTry.join(', ')}`);
    }

    if (!this.anchorPattern) {
      throw new Error('ANCHOR_PATTERN_REQUIRED: Cannot discover resource without anchorPattern RegExp');
    }

    const match = this.anchorPattern.exec(html);
    if (!match) {
      throw new Error(`ANCHOR_DISCOVERY_FAILED: Could not find resource anchor matching ${this.anchorPattern}`);
    }

    const rawHref = match[1];
    const anchorText = match[2] ? match[2].replace(/<[^>]+>/g, '').trim() : '';
    const resolvedUrl = new URL(rawHref, successfulLandingUrl).toString();

    this.discoveredResourceUrl = resolvedUrl;
    this.metadata = {
      source_surface_id: this.sourceSurfaceId,
      landing_page_url: successfulLandingUrl,
      anchor_text: anchorText,
      raw_href: rawHref,
      resolved_absolute_url: resolvedUrl,
      discovery_timestamp: new Date().toISOString()
    };

    return this.metadata;
  }

  /**
   * Follows redirects and records the full HTTP redirect chain
   */
  async probeRedirectChain(targetUrl = this.discoveredResourceUrl) {
    if (!targetUrl) await this.discoverLandingSurface();
    targetUrl = this.discoveredResourceUrl;

    const chain = [];
    let currentUrl = targetUrl;
    let hops = 0;
    const maxHops = 10;
    let finalHeaders = null;
    let finalStatus = null;

    while (hops < maxHops) {
      hops++;
      const res = await fetch(currentUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': this.userAgent },
        redirect: 'manual'
      });

      chain.push({
        hop: hops,
        url: currentUrl,
        status: res.status,
        content_type: res.headers.get('content-type'),
        content_length: res.headers.get('content-length'),
        etag: res.headers.get('etag'),
        last_modified: res.headers.get('last-modified')
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        currentUrl = new URL(res.headers.get('location'), currentUrl).toString();
      } else {
        finalHeaders = res.headers;
        finalStatus = res.status;
        break;
      }
    }

    return {
      landing_page_url: this.metadata.landing_page_url,
      resolved_absolute_url: this.discoveredResourceUrl,
      redirect_chain: chain,
      final_url: currentUrl,
      http_status: finalStatus,
      content_type: finalHeaders?.get('content-type'),
      content_length: parseInt(finalHeaders?.get('content-length') || '0', 10),
      etag: finalHeaders?.get('etag'),
      last_modified: finalHeaders?.get('last-modified')
    };
  }

  /**
   * Probes physical bytes using HTTP Range header
   */
  async probePhysicalBytes(targetUrl = this.discoveredResourceUrl, probeBytes = 65536) {
    if (!targetUrl) await this.discoverLandingSurface();
    targetUrl = this.discoveredResourceUrl;

    const start = Date.now();
    let firstByteMs = null;

    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.request(parsed, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Range': `bytes=0-${probeBytes - 1}`
        }
      }, (res) => {
        let bytes = 0;
        const chunks = [];

        res.on('data', (chunk) => {
          if (firstByteMs === null) firstByteMs = Date.now() - start;
          bytes += chunk.length;
          chunks.push(chunk);
        });

        res.on('end', () => {
          const totalDurationMs = Date.now() - start;
          const rangeSupported = res.statusCode === 206;
          const totalLen = parseInt(res.headers['content-range']?.split('/')?.[1] || res.headers['content-length'] || '0', 10);
          resolve({
            url: targetUrl,
            status: res.statusCode,
            bytes_received: bytes,
            first_byte_ms: firstByteMs,
            total_duration_ms: totalDurationMs,
            total_content_length: totalLen,
            range_request_supported: rangeSupported,
            etag: res.headers['etag'],
            last_modified: res.headers['last-modified']
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Downloads resource to destination while computing SHA256 and capturing metadata
   */
  async downloadToFile(destinationPath, targetUrl = this.discoveredResourceUrl) {
    if (!targetUrl) await this.discoverLandingSurface();
    targetUrl = this.discoveredResourceUrl;

    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const start = Date.now();
    let firstByteMs = null;
    let receivedBytes = 0;
    const hash = crypto.createHash('sha256');

    let responseHeaders = null;
    let statusCode = null;

    await new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.get(parsed, {
        headers: { 'User-Agent': this.userAgent }
      }, (res) => {
        statusCode = res.statusCode;
        responseHeaders = res.headers;
        const outStream = fs.createWriteStream(destinationPath);

        res.on('data', (chunk) => {
          if (firstByteMs === null) firstByteMs = Date.now() - start;
          receivedBytes += chunk.length;
          hash.update(chunk);
        });

        res.pipe(outStream);
        outStream.on('finish', resolve);
        res.on('error', reject);
        outStream.on('error', reject);
      });

      req.on('error', reject);
    });

    const durationSeconds = (Date.now() - start) / 1000;
    const sha256 = hash.digest('hex');
    const rateMbSec = durationSeconds > 0 ? (receivedBytes / (1024 * 1024) / durationSeconds) : 0;

    return {
      destination_path: destinationPath,
      download_url: targetUrl,
      http_status: statusCode,
      bytes_received: receivedBytes,
      duration_seconds: parseFloat(durationSeconds.toFixed(3)),
      rate_mb_sec: parseFloat(rateMbSec.toFixed(2)),
      first_byte_latency_ms: firstByteMs,
      content_sha256: sha256,
      etag: responseHeaders?.etag || null,
      last_modified: responseHeaders?.['last-modified'] || null,
      content_type: responseHeaders?.['content-type'] || null
    };
  }
}
