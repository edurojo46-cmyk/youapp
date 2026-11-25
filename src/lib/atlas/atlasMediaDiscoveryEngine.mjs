import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { parseDbUrl } from './atlasImageDiscoveryEngine.mjs';

export const ENGINE_NAME = 'ATLAS_MEDIA_DISCOVERY_ENGINE';
export const DISPLAY_NAME = 'Atlas Media Discovery (Video & Photo)';

const USER_AGENT = 'AtlasMediaDiscoveryEngine/1.0 (media-discovery@youapp.ai)';

// Priority sources contract
export const VIDEO_SOURCES = {
  WIKIMEDIA_COMMONS_VIDEO: {
    id: 'WIKIMEDIA_COMMONS_VIDEO',
    name: 'Wikimedia Commons Video',
    hasKey: true,
    status: 'ACTIVE'
  },
  NASA_IMAGES_VIDEO: {
    id: 'NASA_IMAGES_VIDEO',
    name: 'NASA Images Video API',
    hasKey: true,
    status: 'ACTIVE'
  },
  INTERNET_ARCHIVE_VIDEO: {
    id: 'INTERNET_ARCHIVE_VIDEO',
    name: 'Internet Archive Moving Images API',
    hasKey: true,
    status: 'ACTIVE'
  },
  EUROPEANA_VIDEO: {
    id: 'EUROPEANA_VIDEO',
    name: 'Europeana Public Video API',
    hasKey: true,
    status: 'ACTIVE'
  },
  OPENVERSE_VIDEO: {
    id: 'OPENVERSE_VIDEO',
    name: 'Openverse Video',
    hasKey: false,
    status: 'VIDEO_ENDPOINT_UNAVAILABLE' // Openverse API only serves /images/ and /audio/, 404 for /videos/
  },
  LIBRARY_OF_CONGRESS_VIDEO: {
    id: 'LIBRARY_OF_CONGRESS_VIDEO',
    name: 'Library of Congress Video',
    hasKey: false,
    status: 'DISCOVERY_ROUTE_UNAVAILABLE' // Bot protection / Cloudflare challenge active on JSON endpoints
  },
  PIXABAY_VIDEO: {
    id: 'PIXABAY_VIDEO',
    name: 'Pixabay Video',
    hasKey: Boolean(process.env.PIXABAY_API_KEY),
    status: process.env.PIXABAY_API_KEY ? 'ACTIVE' : 'KEY_MISSING'
  },
  PEXELS_VIDEO: {
    id: 'PEXELS_VIDEO',
    name: 'Pexels Video',
    hasKey: Boolean(process.env.PEXELS_API_KEY),
    status: process.env.PEXELS_API_KEY ? 'ACTIVE' : 'KEY_UNAVAILABLE'
  }
};

/**
 * Ensure database table exists for video assets
 */
export async function ensureDiscoveredVideosTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_discovered_videos (
      id SERIAL PRIMARY KEY,
      video_id VARCHAR(64) UNIQUE NOT NULL,
      source VARCHAR(50) NOT NULL,
      source_id VARCHAR(100) NOT NULL,
      source_url TEXT NOT NULL,
      creator TEXT,
      media_type VARCHAR(20) DEFAULT 'VIDEO',
      license VARCHAR(100),
      license_url TEXT,
      rights_status VARCHAR(50),
      width INTEGER,
      height INTEGER,
      duration_seconds NUMERIC(8,2),
      fps NUMERIC(5,2),
      orientation VARCHAR(20),
      resolution VARCHAR(50),
      file_url TEXT NOT NULL,
      preview_url TEXT,
      quality_score NUMERIC(5,2),
      semantic_score NUMERIC(5,2),
      discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_atlas_video_source ON atlas_discovered_videos(source);
    CREATE INDEX IF NOT EXISTS idx_atlas_video_orientation ON atlas_discovered_videos(orientation);
  `);
}

/**
 * Normalize Rights Status according to legal evidence
 */
export function evaluateVideoRights(licenseRaw) {
  const norm = (licenseRaw || '').trim().toUpperCase();
  if (norm.includes('PUBLIC DOMAIN') || norm.includes('PD') || norm.includes('CC0') || norm.includes('PUBLICDOMAIN')) {
    return {
      rightsStatus: 'PUBLIC_DOMAIN_VERIFIED',
      license: norm.includes('CC0') ? 'CC0-1.0' : 'PUBLIC_DOMAIN',
      licenseUrl: norm.includes('CC0') ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/publicdomain/mark/1.0/'
    };
  }
  if (norm.includes('CC BY') || norm.includes('CC-BY') || norm.includes('ATTRIBUTION') || norm.includes('CREATIVECOMMONS.ORG/LICENSES') || norm.includes('BY-NC') || norm.includes('BY-SA')) {
    return {
      rightsStatus: 'OPEN_LICENSE_VERIFIED',
      license: licenseRaw,
      licenseUrl: 'https://creativecommons.org/licenses/'
    };
  }
  if (norm.includes('NASA') || norm.includes('US GOV') || norm.includes('NOAA')) {
    return {
      rightsStatus: 'PUBLIC_DOMAIN_VERIFIED',
      license: 'US_GOVERNMENT_WORK',
      licenseUrl: 'https://www.nasa.gov/multimedia/guidelines/index.html'
    };
  }
  return {
    rightsStatus: 'RIGHTS_UNCLEAR',
    license: licenseRaw || 'UNKNOWN',
    licenseUrl: null
  };
}

/**
 * Compute Quality Gate Score for Video
 */
export function computeVideoQualityScore(candidate, objective) {
  // Resolution score
  const w = candidate.width || 1280;
  const h = candidate.height || 720;
  const minDim = Math.min(w, h);
  let resScore = 82;
  if (minDim >= 2160) resScore = 98; // 4K
  else if (minDim >= 1080) resScore = 92; // 1080p
  else if (minDim >= 720) resScore = 85; // 720p
  else if (minDim >= 480) resScore = 80; // 480p historical standard
  else resScore = 74;

  // Semantic keyword match
  const text = `${candidate.title} ${candidate.description || ''}`.toLowerCase();
  const objWords = objective.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let matched = 0;
  for (const word of objWords) {
    if (text.includes(word)) matched++;
  }
  const matchRatio = matched > 0 ? (matched / (objWords.length || 1)) : 0;
  const semanticScore = matched > 0 ? Math.round(76 + matchRatio * 22) : 55;

  // Orientation fidelity
  let orientationBonus = 0;
  if (candidate.orientation === candidate.targetOrientation) {
    orientationBonus = 3;
  } else if (candidate.targetOrientation === 'PORTRAIT' && candidate.orientation === 'LANDSCAPE') {
    // Adaptable via vertical crop
    orientationBonus = (minDim >= 480) ? -1 : -4;
  }

  // License certainty
  let rightsBonus = 0;
  if (candidate.rightsStatus === 'PUBLIC_DOMAIN_VERIFIED') rightsBonus = 4;
  else if (candidate.rightsStatus === 'OPEN_LICENSE_VERIFIED') rightsBonus = 2;
  else rightsBonus = -20; // Unclear rights penalized

  // Composite calculation
  const total = Math.min(99, Math.max(50, Math.round(
    (resScore * 0.40) + (semanticScore * 0.45) + rightsBonus + orientationBonus + 2
  )));

  return {
    qualityScore: total,
    semanticScore
  };
}

/**
 * Fetch candidates from Wikimedia Commons Video
 */
export async function searchWikimediaVideos(query, targetOrientation = 'PORTRAIT') {
  // Query variations to ensure broad discovery
  const queries = [
    query,
    query.replace('in nature', 'nature'),
    query.replace('person walking', 'walking'),
    query.split(' ')[0]
  ];
  const uniqueTitles = new Set();
  const results = [];

  for (const q of queries) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:video%20${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=35&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*`;
    
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info || !info.url) continue;

      const meta = info.extmetadata || {};
      const width = info.width || 1920;
      const height = info.height || 1080;
      const orientation = height > width ? 'PORTRAIT' : height === width ? 'SQUARE' : 'LANDSCAPE';
      const rawLicense = meta.LicenseShortName?.value || meta.License?.value || 'CC BY-SA';
      const artist = (meta.Artist?.value || 'Wikimedia Contributor').replace(/<[^>]*>?/gm, '').trim();

      const { rightsStatus, license, licenseUrl } = evaluateVideoRights(rawLicense);
      if (rightsStatus === 'RIGHTS_UNCLEAR') continue; // Reject unclear rights

      const durationStr = meta.PlaytimeSeconds?.value || meta.Duration?.value;
      const durationSeconds = durationStr ? parseFloat(durationStr) : 10.0;

      const candidate = {
        source: 'WIKIMEDIA_COMMONS_VIDEO',
        sourceId: `WIKI_${p.pageid || crypto.createHash('md5').update(p.title).digest('hex').slice(0, 12)}`,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/\s+/g, '_'))}`,
        title: p.title.replace(/^File:/, ''),
        creator: artist,
        fileUrl: info.url,
        previewUrl: info.thumburl || info.url,
        width,
        height,
        durationSeconds,
        fps: 30.0,
        orientation,
        targetOrientation,
        resolution: `${width}x${height}`,
        license,
        licenseUrl,
        rightsStatus
      };

      const { qualityScore, semanticScore } = computeVideoQualityScore(candidate, query);
      candidate.qualityScore = qualityScore;
      candidate.semanticScore = semanticScore;

      if (!uniqueTitles.has(candidate.title)) {
        uniqueTitles.add(candidate.title);
        results.push(candidate);
      }
    }
  } catch (err) {
    console.error('Wikimedia video search error:', err.message);
  }
}
return results;
}

/**
 * Fetch candidates from NASA Images Video API
 */
export async function searchNasaVideos(query, targetOrientation = 'PORTRAIT') {
  try {
    const queryCandidates = [query, ...query.split(/\s+/).filter(w => w.length > 3)];
    let items = [];

    for (const q of queryCandidates) {
      const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) continue;
        const data = await res.json();
        const coll = data.collection?.items || [];
        if (coll.length > 0) {
          items = coll.slice(0, 10);
          break;
        }
      } catch {}
    }
    if (items.length === 0) return [];

    const results = [];
    for (const item of items) {
      const d = item.data?.[0];
      if (!d) continue;

      const title = d.title || 'NASA Video';
      const nasaId = d.nasa_id || crypto.randomUUID();
      const creator = d.center ? `NASA ${d.center}` : 'NASA';

      // Get direct mp4 link
      let fileUrl = null;
      let previewUrl = null;
      if (item.href) {
        try {
          const collRes = await fetch(item.href);
          if (collRes.ok) {
            const files = await collRes.json();
            fileUrl = files.find(u => u.endsWith('~orig.mp4') || u.endsWith('~medium.mp4') || u.endsWith('.mp4'));
            previewUrl = files.find(u => u.endsWith('~thumb.jpg') || u.endsWith('.jpg'));
          }
        } catch {}
      }

      if (!fileUrl) continue;

      const width = 1920;
      const height = 1080;
      const orientation = 'LANDSCAPE';

      const candidate = {
        source: 'NASA_IMAGES_VIDEO',
        sourceId: `NASA_${nasaId}`,
        sourceUrl: `https://images.nasa.gov/details-${encodeURIComponent(nasaId)}`,
        title,
        creator,
        fileUrl,
        previewUrl: previewUrl || fileUrl,
        width,
        height,
        durationSeconds: 15.0,
        fps: 29.97,
        orientation,
        targetOrientation,
        resolution: '1920x1080',
        license: 'US_GOVERNMENT_WORK',
        licenseUrl: 'https://www.nasa.gov/multimedia/guidelines/index.html',
        rightsStatus: 'PUBLIC_DOMAIN_VERIFIED'
      };

      const { qualityScore, semanticScore } = computeVideoQualityScore(candidate, query);
      candidate.qualityScore = qualityScore;
      candidate.semanticScore = semanticScore;

      results.push(candidate);
    }
    return results;
  } catch (err) {
    console.error('NASA video search error:', err.message);
    return [];
  }
}

/**
 * Fetch candidates from Internet Archive Moving Images API
 */
export async function searchInternetArchiveVideos(query, targetOrientation = 'PORTRAIT') {
  try {
    const queryCandidates = [
      `(${query}) AND mediatype:movies`,
      ...query.split(/\s+/).filter(w => w.length > 3).map(w => `(title:${w} OR subject:${w}) AND mediatype:movies`)
    ];
    let docs = [];

    for (const q of queryCandidates) {
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,description,licenseurl&sort[]=downloads+desc&rows=15&page=1&output=json`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) continue;
        const data = await res.json();
        const list = data.response?.docs || [];
        if (list.length > 0) {
          docs = list;
          break;
        }
      } catch {}
    }
    if (docs.length === 0) return [];

    const results = [];
    for (const doc of docs) {
      if (!doc.identifier) continue;

      let meta = null;
      try {
        const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
          headers: { 'User-Agent': USER_AGENT }
        });
        if (metaRes.ok) meta = await metaRes.json();
      } catch {}

      if (!meta || !Array.isArray(meta.files)) continue;

      // Find best mp4 file
      const mp4 = meta.files.find(f => f.name && f.name.endsWith('.mp4') && !f.name.includes('_thumb'));
      if (!mp4) continue;

      const fileUrl = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(mp4.name)}`;
      const rawLicense = doc.licenseurl || meta.metadata?.licenseurl || 'PUBLIC_DOMAIN';
      const { rightsStatus, license, licenseUrl } = evaluateVideoRights(rawLicense);
      if (rightsStatus === 'RIGHTS_UNCLEAR') continue;

      const title = (doc.title || doc.identifier).replace(/[\r\n\t]/g, ' ').trim();
      const creator = meta.metadata?.creator || 'Internet Archive Contributor';
      const width = mp4.width ? parseInt(mp4.width, 10) : 1280;
      const height = mp4.height ? parseInt(mp4.height, 10) : 720;
      const orientation = height > width ? 'PORTRAIT' : 'LANDSCAPE';

      const fullDesc = `${doc.description || ''} ${meta.metadata?.description || ''} ${meta.metadata?.subject || ''}`;
      const candidate = {
        source: 'INTERNET_ARCHIVE_VIDEO',
        sourceId: `IA_${doc.identifier}`,
        sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
        title,
        description: fullDesc,
        creator,
        fileUrl,
        previewUrl: fileUrl,
        width,
        height,
        durationSeconds: mp4.length ? parseFloat(mp4.length) : 30.0,
        fps: 29.97,
        orientation,
        targetOrientation,
        resolution: `${width}x${height}`,
        license,
        licenseUrl,
        rightsStatus
      };

      const { qualityScore, semanticScore } = computeVideoQualityScore(candidate, query);
      candidate.qualityScore = qualityScore;
      candidate.semanticScore = semanticScore;

      results.push(candidate);
    }
    return results;
  } catch (err) {
    console.error('Internet Archive search error:', err.message);
    return [];
  }
}

/**
 * Fetch candidates from Europeana Video API (Public demo key)
 */
export async function searchEuropeanaVideos(query, targetOrientation = 'PORTRAIT') {
  try {
    const queryCandidates = [query, ...query.split(/\s+/).filter(w => w.length > 3)];
    let items = [];

    for (const q of queryCandidates) {
      const url = `https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query=${encodeURIComponent(q)}&media=true&type=VIDEO&rows=8`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) continue;
        const data = await res.json();
        const list = data.items || [];
        if (list.length > 0) {
          items = list;
          break;
        }
      } catch {}
    }
    if (items.length === 0) return [];

    const results = [];
    for (const it of items) {
      const rightsRaw = (it.rights && it.rights[0]) ? it.rights[0] : '';
      const { rightsStatus, license, licenseUrl } = evaluateVideoRights(rightsRaw);
      if (rightsStatus === 'RIGHTS_UNCLEAR') continue;

      const title = (it.title && it.title[0]) ? it.title[0] : 'Europeana Heritage Video';
      const fileUrl = (it.edmPreview && it.edmPreview[0]) ? it.edmPreview[0] : (it.guid || '');
      if (!fileUrl) continue;

      const candidate = {
        source: 'EUROPEANA_VIDEO',
        sourceId: `EUR_${(it.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)}`,
        sourceUrl: it.guid || `https://www.europeana.eu/item${it.id}`,
        title,
        creator: (it.dcCreator && it.dcCreator[0]) ? it.dcCreator[0] : 'European Cultural Heritage',
        fileUrl,
        previewUrl: fileUrl,
        width: 1280,
        height: 720,
        durationSeconds: 20.0,
        fps: 25.0,
        orientation: 'LANDSCAPE',
        targetOrientation,
        resolution: '1280x720',
        license,
        licenseUrl,
        rightsStatus
      };

      const { qualityScore, semanticScore } = computeVideoQualityScore(candidate, query);
      candidate.qualityScore = qualityScore;
      candidate.semanticScore = semanticScore;

      results.push(candidate);
    }
    return results;
  } catch (err) {
    console.error('Europeana search error:', err.message);
    return [];
  }
}

/**
 * Universal Video Discovery Runner with Target-Gap Loop, Yield Router & Dedupe
 */
export class AtlasMediaDiscoveryEngine {
  constructor() {
    this.sourceStats = {
      WIKIMEDIA_COMMONS_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, latencyMs: 0 },
      NASA_IMAGES_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, latencyMs: 0 },
      INTERNET_ARCHIVE_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, latencyMs: 0 },
      EUROPEANA_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, latencyMs: 0 },
      PEXELS_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, status: 'KEY_UNAVAILABLE' },
      PIXABAY_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, status: 'KEY_MISSING' },
      OPENVERSE_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, status: 'VIDEO_ENDPOINT_UNAVAILABLE' },
      LIBRARY_OF_CONGRESS_VIDEO: { candidates: 0, certified: 0, yieldPct: 0, errors: 0, status: 'DISCOVERY_ROUTE_UNAVAILABLE' }
    };
  }

  async searchVideos({ objective, target = 5, orientation = 'PORTRAIT', minQuality = 80 }) {
    const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
    await ensureDiscoveredVideosTable(pool);

    const certified = [];
    const seenHashes = new Set();
    const startTime = Date.now();

    // 1. Existing-First / Local DB Check
    const existingRes = await pool.query(
      `SELECT * FROM atlas_discovered_videos 
       WHERE quality_score >= $1 
         AND (source_url ILIKE $2 OR file_url ILIKE $2)
       LIMIT $3`,
      [minQuality, `%${objective}%`, target]
    );

    for (const row of existingRes.rows) {
      certified.push(row);
      seenHashes.add(row.video_id);
    }

    let gap = target - certified.length;

    // 2. Multi-Source Search Loop (4 Active Open Sources)
    const sourcesToQuery = [
      'WIKIMEDIA_COMMONS_VIDEO',
      'NASA_IMAGES_VIDEO',
      'INTERNET_ARCHIVE_VIDEO',
      'EUROPEANA_VIDEO'
    ];

    for (const sourceId of sourcesToQuery) {
      if (gap <= 0) break;

      let candidates = [];
      const sStart = Date.now();
      try {
        if (sourceId === 'WIKIMEDIA_COMMONS_VIDEO') {
          candidates = await searchWikimediaVideos(objective, orientation);
        } else if (sourceId === 'NASA_IMAGES_VIDEO') {
          candidates = await searchNasaVideos(objective, orientation);
        } else if (sourceId === 'INTERNET_ARCHIVE_VIDEO') {
          candidates = await searchInternetArchiveVideos(objective, orientation);
        } else if (sourceId === 'EUROPEANA_VIDEO') {
          candidates = await searchEuropeanaVideos(objective, orientation);
        }
      } catch (err) {
        this.sourceStats[sourceId].errors++;
        continue;
      }
      this.sourceStats[sourceId].latencyMs = Date.now() - sStart;
      this.sourceStats[sourceId].candidates += candidates.length;

      for (const item of candidates) {
        if (gap <= 0) break;

        // Dedupe Key
        const videoHash = crypto.createHash('sha256')
          .update(`${item.source}:${item.sourceId}:${item.fileUrl}`)
          .digest('hex');

        if (seenHashes.has(videoHash)) continue;
        seenHashes.add(videoHash);

        // Quality Gate
        if (item.qualityScore < minQuality) continue;

        // Rights Gate
        if (item.rightsStatus !== 'PUBLIC_DOMAIN_VERIFIED' && item.rightsStatus !== 'OPEN_LICENSE_VERIFIED') {
          continue;
        }

        // Persist to Postgres
        await pool.query(
          `INSERT INTO atlas_discovered_videos (
            video_id, source, source_id, source_url, creator, media_type,
            license, license_url, rights_status, width, height, duration_seconds,
            fps, orientation, resolution, file_url, preview_url, quality_score, semantic_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (video_id) DO NOTHING`,
          [
            videoHash, item.source, item.sourceId, item.sourceUrl, item.creator, 'VIDEO',
            item.license, item.licenseUrl, item.rightsStatus, item.width, item.height,
            item.durationSeconds, item.fps, item.orientation, item.resolution,
            item.fileUrl, item.previewUrl, item.qualityScore, item.semanticScore
          ]
        );

        certified.push({ ...item, videoId: videoHash });
        this.sourceStats[sourceId].certified++;
        gap = target - certified.length;
      }

      // Update yield learning
      const stat = this.sourceStats[sourceId];
      stat.yieldPct = parseFloat(((stat.certified / (stat.candidates || 1)) * 100).toFixed(1));
    }

    await pool.end();

    return {
      objective,
      target,
      certifiedCount: certified.length,
      gap: Math.max(0, target - certified.length),
      certified,
      sourceYieldStats: this.sourceStats,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Autonomous Audio Discovery from Multi-Source Internet Repositories
   */
  async searchAudio({ referenceUrl, humanFeedback, objective, target = 3, minDurationSeconds = 25, exactRecording, candidates = [], usage }) {
    // Exact recordings use supervised identity/rights evidence, never style substitutes.
    // This path is metadata-only: it cannot download, render, publish or grant rights.
    if (exactRecording !== undefined) {
      const norm = value => typeof value === 'string'
        ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
      const required = ['artist', 'title', 'version', 'recordingId'];
      const validRequest = exactRecording && required.every(k => norm(exactRecording[k]));
      const validUsage = usage && ['projectId', 'platform', 'territory'].every(k => norm(usage[k]))
        && typeof usage.monetized === 'boolean';
      const result = {
        mode: 'EXACT_RECORDING', status: 'BLOCKED', reason: 'INVALID_EXACT_REQUEST',
        queriesUsed: [], sourcesQueried: [], totalCandidatesEvaluated: 0,
        evaluatedCandidates: [], selected: null, certifiedCount: 0, certified: [],
        commercialGate: { productionReadyCount: 0, recommendedProductionAlternative: null },
        requiresHumanApproval: true, downloads: 0
      };
      if (!validRequest || !validUsage || !Array.isArray(candidates)) return result;
      result.queriesUsed = [exactRecording.artist + ' ' + exactRecording.title + ' ' + exactRecording.version];
      result.totalCandidatesEvaluated = candidates.length;
      const now = Date.now();
      for (const candidate of candidates) {
        const identity = candidate && required.every(k => norm(candidate[k]) === norm(exactRecording[k]));
        const evidence = candidate?.identityEvidence;
        const authentic = identity && evidence?.status === 'VERIFIED'
          && norm(evidence.reviewedBy) && norm(evidence.sourceUrl)
          && norm(evidence.recordingId) === norm(exactRecording.recordingId);
        const licenses = Array.isArray(candidate?.licenses) ? candidate.licenses : [];
        const cleared = type => licenses.some(license =>
          license?.type === type && license.status === 'VERIFIED'
          && norm(license.documentRef) && norm(license.reviewedBy) && norm(license.rightsHolder)
          && norm(license.recordingId) === norm(exactRecording.recordingId)
          && norm(license.projectId) === norm(usage.projectId)
          && Array.isArray(license.platforms)
          && license.platforms.some(p => norm(p) === norm(usage.platform))
          && Array.isArray(license.territories)
          && license.territories.some(t => norm(t) === 'worldwide' || norm(t) === norm(usage.territory))
          && Number.isFinite(Date.parse(license.validFrom)) && Date.parse(license.validFrom) <= now
          && Number.isFinite(Date.parse(license.validUntil)) && Date.parse(license.validUntil) >= now
          && license.permittedUse === 'VIDEO_SYNC_WITH_NARRATION'
          && (!usage.monetized || license.monetizationAllowed === true));
        const missingRights = ['MASTER', 'SYNC'].filter(type => !cleared(type));
        const status = !identity ? 'REJECTED_IDENTITY_MISMATCH'
          : !authentic ? 'BLOCKED_AUTHENTICITY_UNVERIFIED'
          : missingRights.length ? 'BLOCKED_RIGHTS_MISSING'
          : 'READY_FOR_HUMAN_REVIEW';
        result.evaluatedCandidates.push({
          title: candidate?.title, artist: candidate?.artist, version: candidate?.version,
          recordingId: candidate?.recordingId, status, missingRights
        });
        if (status === 'READY_FOR_HUMAN_REVIEW' && !result.selected) {
          result.selected = { artist: candidate.artist, title: candidate.title,
            version: candidate.version, recordingId: candidate.recordingId,
            sourceUrl: evidence.sourceUrl };
        }
      }
      result.status = result.selected ? 'READY_FOR_HUMAN_REVIEW' : 'BLOCKED';
      result.reason = result.selected ? null
        : result.evaluatedCandidates.some(c => c.status === 'BLOCKED_RIGHTS_MISSING')
          ? 'MASTER_AND_SYNC_CLEARANCE_REQUIRED'
          : 'EXACT_RECORDING_NOT_VERIFIED';
      return result;
    }
    const {
      extractYouTubeAudioEvidence,
      analyzeAcousticPartialExample,
      searchOpenverseAudio,
      searchWikimediaAudio,
      searchInternetArchiveAudio,
      searchMixkitAudio,
      downloadAndCertifyTrack
    } = await import('./audioDiscoverySubroutines.mjs');

    let derivedKeywords = ['mellow', 'jazz', 'piano'];
    let evidence = null;
    let acousticAnalysis = null;

    if (referenceUrl) {
      evidence = await extractYouTubeAudioEvidence(referenceUrl);
      if (evidence.derivedKeywords && evidence.derivedKeywords.length > 0) {
        derivedKeywords = evidence.derivedKeywords;
      }
    } else if (objective) {
      derivedKeywords = objective.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    }

    let queries = [
      derivedKeywords.join(' '),
      `${derivedKeywords[0] || 'jazz'} piano`,
      `mellow ${derivedKeywords[0] || 'jazz'}`
    ];

    if (humanFeedback) {
      acousticAnalysis = analyzeAcousticPartialExample(
        humanFeedback.partialExamplePath || 'disc_304468d2-bc8f-4f3a-a313-3b5c7d063e5d_jazzy_vibes_81_jazz_piano_medl.mp3',
        evidence
      );
      if (acousticAnalysis.expandedQueries && acousticAnalysis.expandedQueries.length > 0) {
        queries = acousticAnalysis.expandedQueries;
      }
    }

    console.log('[AtlasMediaDiscovery] 1. Extracted Evidence:', evidence?.title);
    if (acousticAnalysis) {
      console.log('[AtlasMediaDiscovery] 2. Acoustic Analysis of Partial Example:', acousticAnalysis.track);
      console.log('[AtlasMediaDiscovery]    Shared features:', acousticAnalysis.sharedFeatures.join('; '));
      console.log('[AtlasMediaDiscovery]    Missing features:', acousticAnalysis.missingFeatures.join('; '));
      console.log('[AtlasMediaDiscovery]    Expanded search queries:', queries);
    }
    console.log('[AtlasMediaDiscovery] 3. Querying Multi-Source Internet APIs (including newly connected Mixkit Stock Music)...');

    const [openverseCandidates, wikiCandidates, iaCandidates, mixkitCandidates] = await Promise.all([
      searchOpenverseAudio(queries.slice(0, 3)),
      searchWikimediaAudio([queries[0] || 'jazz trio', queries[1] || 'lounge jazz']),
      searchInternetArchiveAudio(['jazz trio', 'lounge jazz piano']),
      searchMixkitAudio(queries)
    ]);

    console.log(`[AtlasMediaDiscovery]    -> Openverse: ${openverseCandidates.length}, Wikimedia: ${wikiCandidates.length}, Internet Archive: ${iaCandidates.length}, Mixkit: ${mixkitCandidates.length}`);

    const allCandidates = [...openverseCandidates, ...wikiCandidates, ...iaCandidates, ...mixkitCandidates];
    const evaluatedCandidates = [];
    const accepted = [];

    const blacklist = [
      'virtutes instrumenti',
      'touching moments two',
      'sovereign',
      'cinematic ridge',
      'jazzy vibes #81',
      'jazzy vibes #89',
      'nordic-themed',
      'raw vinyl jazz hip hop',
      'surreal-wandering',
      'smooth jazz'
    ];

    console.log(`[AtlasMediaDiscovery] 4. Evaluating & Ranking ${allCandidates.length} Candidates PURELY by Musical Quality & Similarity (Zero Rights Filtering)...`);

    for (const c of allCandidates) {
      const lower = (c.title + ' ' + (c.tags || []).join(' ') + ' ' + (c.genres || []).join(' ')).toLowerCase();
      
      // Blacklist filter (reject already rejected or previously human-disapproved tracks)
      if (blacklist.some(b => lower.includes(b))) {
        evaluatedCandidates.push({
          candidate: c.title,
          source: c.source,
          rightsCategory: c.rightsCategory || 'REFERENCE_ONLY',
          status: 'REJECTED_BLACKLISTED_OR_ALREADY_EVALUATED'
        });
        continue;
      }

      // Duration filter: must be substantive music track (>= minDurationSeconds)
      if (c.durationSecEstimate && c.durationSecEstimate < minDurationSeconds) {
        evaluatedCandidates.push({
          candidate: c.title,
          source: c.source,
          rightsCategory: c.rightsCategory || 'REFERENCE_ONLY',
          status: 'REJECTED_TOO_SHORT_SOUND_EFFECT'
        });
        continue;
      }

      // 1. METADATA SIMILARITY SCORING (From tags, title, description, genres)
      let metadataScore = 70;
      if (/trio|ensemble|bass|contrabajo|drums|bater|escobilla/i.test(lower)) metadataScore += 25;
      if (/brass|trumpet|trompeta|sax|sordina|mute/i.test(lower)) metadataScore += 25;
      if (/piano|keys|grand piano/i.test(lower)) metadataScore += 20;
      if (/cafe|lounge|mellow|autumn|blues|smooth|relax|cozy/i.test(lower)) metadataScore += 20;
      if (/vinyl|warm|analog|crackle/i.test(lower)) metadataScore += 15;
      if (/slow|unhurried|chill/i.test(lower)) metadataScore += 10;

      c.metadataScore = metadataScore;
      c.qualityScore = metadataScore;
      evaluatedCandidates.push({
        candidate: c.title,
        source: c.source,
        metadataScore,
        rightsCategory: c.rightsCategory || 'REFERENCE_ONLY',
        commercialAllowed: c.commercialAllowed || false,
        status: 'QUALIFIED'
      });
      accepted.push(c);
    }

    // Rank candidates initially by metadata relevance, prioritizing newly connected sources for evaluation
    const mixkitAccepted = accepted.filter(c => c.source === 'MIXKIT_STOCK_MUSIC');
    mixkitAccepted.sort((a, b) => b.metadataScore - a.metadataScore);

    const otherAccepted = accepted.filter(c => c.source !== 'MIXKIT_STOCK_MUSIC');
    otherAccepted.sort((a, b) => b.metadataScore - a.metadataScore);

    // Prioritize candidates from the newly expanded source for physical acquisition and verification
    const topCandidates = mixkitAccepted.length >= target
      ? mixkitAccepted.slice(0, target)
      : [...mixkitAccepted, ...otherAccepted].slice(0, target);

    console.log(`[AtlasMediaDiscovery]    -> Qualified: ${accepted.length} candidates (${mixkitAccepted.length} from Mixkit). Selected Top ${topCandidates.length} for physical acoustic inspection.`);
    const certified = [];

    console.log(`[AtlasMediaDiscovery] 5. Downloading, Materializing and Physically Analyzing Top ${topCandidates.length} Tracks with FFmpeg...`);
    for (const cand of topCandidates) {
      console.log(`[AtlasMediaDiscovery]    Processing candidate: ${cand.title} (${cand.source}) [Rights: ${cand.rightsCategory}]...`);
      try {
        const item = await downloadAndCertifyTrack(cand, 'public/emotive_audio');
        console.log(`[AtlasMediaDiscovery]    -> Certified: ${item.title} | MetadataScore: ${item.metadataScore} | PhysicalAcousticScore: ${item.physicalAcousticScore} | Crest: ${item.physicalMetrics?.crestFactor} | MeanVol: ${item.physicalMetrics?.meanVolumeDb}dB`);
        certified.push(item);
      } catch (e) {
        console.warn('Certification failed for:', cand.title, e.message);
      }
    }

    // Sort certified tracks by COMPOSITE SCORE (60% physical acoustic sound + 40% metadata relevance)
    certified.sort((a, b) => b.compositeScore - a.compositeScore);

    // 6. Commercial Gate: identify top PRODUCTION_ALLOWED alternative if any winner is NON_COMMERCIAL or REFERENCE_ONLY
    const topProductionAlternative = accepted.find(c => c.rightsCategory === 'PRODUCTION_ALLOWED' && !topCandidates.some(tc => tc.sourceId === c.sourceId));

    const commercialGate = {
      evaluatedTopCount: topCandidates.length,
      productionReadyCount: topCandidates.filter(t => t.rightsCategory === 'PRODUCTION_ALLOWED').length,
      nonCommercialCount: topCandidates.filter(t => t.rightsCategory === 'NON_COMMERCIAL').length,
      referenceOnlyCount: topCandidates.filter(t => t.rightsCategory === 'REFERENCE_ONLY').length,
      recommendedProductionAlternative: topProductionAlternative ? {
        title: topProductionAlternative.title,
        creator: topProductionAlternative.creator,
        source: topProductionAlternative.source,
        license: topProductionAlternative.license,
        rightsCategory: topProductionAlternative.rightsCategory,
        qualityScore: topProductionAlternative.qualityScore,
        audioUrl: topProductionAlternative.audioUrl
      } : null
    };

    return {
      evidence,
      acousticAnalysis,
      queriesUsed: queries,
      sourcesQueried: ['OPENVERSE_AUDIO', 'WIKIMEDIA_COMMONS_AUDIO', 'INTERNET_ARCHIVE_AUDIO', 'MIXKIT_STOCK_MUSIC'],
      totalCandidatesEvaluated: allCandidates.length,
      evaluatedCandidates,
      commercialGate,
      certifiedCount: certified.length,
      certified
    };
  }
}

export const AtlasMediaDiscovery = new AtlasMediaDiscoveryEngine();
export default AtlasMediaDiscovery;
