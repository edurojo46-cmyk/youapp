/**
 * ATLAS — IMAGE DISCOVERY ENGINE V1
 * Canonical Name: ATLAS_IMAGE_DISCOVERY_ENGINE
 * Visible Name: Atlas Image Discovery
 *
 * Universal Image Discovery & Acquisition Pipeline:
 * SEARCH OBJECTIVE
 *   -> INTELLIGENT FRONTIER EXPANSION
 *   -> SOURCE ROUTER (Adaptive Source Yield Router)
 *   -> LICENSE GATE (Permissive / Commercial Verification)
 *   -> MEDIA GATE (MIME & Resolution Filtering)
 *   -> SEMANTIC VISUAL GATE (CLIP Zero-Shot Objective Alignment)
 *   -> QUALITY GATE (Aesthetic, Composition, Lighting, Technical & Watermark Assessment)
 *   -> DEDUPE (SHA-256 & Source ID Ledger)
 *   -> TARGET-GAP LOOP (Autonomous Gap Closing)
 *   -> PERSIST (Database Storage)
 *   -> READBACK (Verification)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
let pipelineModule = null;
let RawImage = null;

export const ENGINE_NAME = 'ATLAS_IMAGE_DISCOVERY_ENGINE';
export const DISPLAY_NAME = 'Atlas Image Discovery';

export function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

export function getWikimediaThumbUrl(rawUrl, width = 500) {
  const cleanUrl = rawUrl.split('?')[0];
  if (cleanUrl.includes('/commons/thumb/')) {
    return cleanUrl.replace('upload.wikimedia.org', 'thumb.wikimedia.org');
  }
  const match = cleanUrl.match(/\/commons\/(.+)$/);
  if (!match) return rawUrl;
  const relativePath = match[1];
  const filename = relativePath.split('/').pop();
  if (filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff') || filename.toLowerCase().endsWith('.png')) {
    return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${relativePath}/${width}px-${filename}.jpg`;
  }
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${relativePath}/${width}px-${filename}`;
}

const API_UA = 'AtlasImageDiscoveryEngine/1.0 (discovery@youapp.ai)';
const CACHE_DIR = path.resolve(process.cwd(), '.cache/image_discovery_thumbs');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Global Singleton for CLIP Pipeline
let clipPipelinePromise = null;
export async function getClipPipeline() {
  if (!clipPipelinePromise) {
    try {
      const x = await import('@xenova/transformers');
      pipelineModule = x.pipeline;
      RawImage = x.RawImage;
      clipPipelinePromise = pipelineModule('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    } catch {
      return null;
    }
  }
  return clipPipelinePromise;
}

// Universal Aesthetic / Quality Gate Labels (100% Generalized - No Hardcoded Nature)
export const AESTHETIC_LABELS = [
  'breathtaking award-winning professional photography',
  'dramatic professional photography with perfect balanced composition',
  'epic dramatic scene at golden hour with exquisite lighting',
  'beautiful scenic photograph with rich vibrant colors and clear contrast',
  'sharp high-resolution photo with fine crisp details',
  'cinematic award-winning photography',
  'awe-inspiring breathtaking emotional scene',
  'ordinary snapshot',
  'poor composition and bad angle',
  'flat boring lighting',
  'washed out dull colors',
  'blurry photo or low quality image',
  'casual amateur tourist snapshot',
  'photo with watermark, text overlay, or border frame'
];

// Profile-specific definitions
export const PROFILE_REGISTRY = {
  NATURE_PREMIUM: {
    name: 'NATURE_PREMIUM',
    displayName: 'Certified Premium Nature',
    minQualityDefault: 80,
    negativeTerms: [
      'map', 'diagram', 'chart', 'portrait', 'building', 'street', 'city',
      'church', 'statue', 'museum', 'grave', 'house', 'hotel', 'car', 'bus',
      'train', 'aircraft', 'ship', 'boat', 'flag', 'logo', 'icon', 'drawing',
      'sketch', 'painting', 'illustration', 'document', 'text', 'stamp', 'coin'
    ],
    semanticGateLabels: [
      'a real authentic color photograph of wild nature, mountains, ocean, forest, or scenic landscape',
      'an oil painting, watercolor artwork, or framed canvas painting',
      'a digital illustration, anime, CGI render, or vector drawing',
      'a document, map, chart, newspaper page, or manuscript',
      'an indoor room, architecture interior, or domestic furniture',
      'a man-made city street, skyscraper facade, or urban road',
      'an extreme close-up of a person face, selfie, portrait, or human clothing',
      'a vehicle, automobile, airplane, industrial machine, or train'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => {
      const lower = (objective || '').toLowerCase().trim();
      const routes = [];
      if (lower && lower !== 'general') {
        const queryTerm = lower.includes('cascada') ? 'waterfall' : lower;
        routes.push({ id: 'R_NAT_OBJ_QI', name: `QI ${objective}`, query: `incategory:Quality_images ${queryTerm}`, baseYield: 36 });
        routes.push({ id: 'R_NAT_OBJ_PLURAL', name: `QI Plural ${objective}`, query: `incategory:Quality_images "${queryTerm}s"`, baseYield: 34 });
        routes.push({ id: 'R_NAT_OBJ_SCENIC', name: `QI Landscape ${objective}`, query: `incategory:Quality_images "${queryTerm}" landscape`, baseYield: 32 });
        routes.push({ id: 'R_NAT_OBJ_CASCADE', name: 'QI Cascades', query: 'incategory:Quality_images cascade', baseYield: 30 });
      }
      return [
        ...routes,
        { id: 'R_NAT_WF', name: 'QI Waterfalls Iceland', query: 'incategory:Quality_images "waterfall" Iceland', baseYield: 25 },
        { id: 'R_NAT_GL', name: 'QI Glaciers Iceland', query: 'incategory:Quality_images glacier Iceland', baseYield: 22 },
        { id: 'R_NAT_FJ', name: 'QI Fjords Norway', query: 'incategory:Quality_images fjord Norway', baseYield: 22 },
        { id: 'R_NAT_NP', name: 'QI Banff National Park', query: 'incategory:Quality_images "Banff National Park"', baseYield: 30 },
        { id: 'R_NAT_YOS', name: 'QI Yosemite', query: 'incategory:Quality_images "Yosemite National Park"', baseYield: 32 },
        { id: 'R_NAT_AND', name: 'QI Andes Mountains', query: 'incategory:Quality_images Andes landscape', baseYield: 28 },
        { id: 'R_NAT_PAT', name: 'QI Patagonia Landscape', query: 'incategory:Quality_images Patagonia landscape', baseYield: 28 },
        { id: 'R_NAT_DOLO', name: 'QI Dolomites', query: 'incategory:Quality_images Dolomites', baseYield: 20 },
        { id: 'R_NAT_LOF', name: 'QI Lofoten Islands', query: 'incategory:Quality_images Lofoten landscape', baseYield: 30 }
      ];
    }
  },
  ARCHITECTURE: {
    name: 'ARCHITECTURE',
    displayName: 'Historical & Classical Architecture',
    minQualityDefault: 80,
    negativeTerms: [
      'map', 'diagram', 'chart', 'blueprint', 'drawing', 'sketch', 'painting',
      'illustration', 'document', 'text', 'stamp', 'coin', 'car', 'bus', 'train',
      'airplane', 'selfie', 'portrait', 'close-up face'
    ],
    semanticGateLabels: [
      'a real authentic color photograph of historic architecture, castles, cathedrals, temples, ancient monuments, or classical heritage buildings',
      'an oil painting, watercolor artwork, or architectural drawing',
      'a 3D digital architectural render or CGI design',
      'an architectural blueprint, floor plan, or historical map',
      'a wild untamed natural wilderness with no buildings or structures',
      'an extreme close-up portrait of a person face',
      'a vehicle, automobile, or modern traffic scene',
      'an ordinary domestic living room or modern office cubicle'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_ARCH_CASTLE', name: 'QI Castles Europe', query: 'incategory:Quality_images "castle" exterior', baseYield: 26 },
      { id: 'R_ARCH_CATH', name: 'QI Historical Cathedrals', query: 'incategory:Quality_images "cathedral" exterior', baseYield: 28 },
      { id: 'R_ARCH_PALACE', name: 'QI Historic Palaces', query: 'incategory:Quality_images "palace" facade', baseYield: 25 },
      { id: 'R_ARCH_TEMPLE', name: 'QI Ancient Temples', query: 'incategory:Quality_images "ancient temple"', baseYield: 24 },
      { id: 'R_ARCH_GOTH', name: 'QI Gothic Architecture', query: 'incategory:Quality_images "Gothic architecture"', baseYield: 26 },
      { id: 'R_ARCH_ROMAN', name: 'QI Roman Monuments', query: 'incategory:Quality_images "Roman architecture" monument', baseYield: 24 },
      { id: 'R_ARCH_HERIT', name: 'QI World Heritage Architecture', query: 'incategory:Quality_images "World Heritage Site" architecture', baseYield: 27 },
      { id: 'R_ARCH_BAROQ', name: 'QI Baroque Architecture', query: 'incategory:Quality_images "Baroque architecture"', baseYield: 25 }
    ]
  },
  GENERAL_IMAGE: {
    name: 'GENERAL_IMAGE',
    displayName: 'General Objective Image',
    minQualityDefault: 50,
    negativeTerms: [
      'map', 'diagram', 'chart', 'drawing', 'sketch', 'painting',
      'illustration', 'document', 'text', 'stamp', 'coin', 'icon', 'logo'
    ],
    semanticGateLabels: [
      'a real authentic color photograph of the target subject with high clarity and detail',
      'an oil painting, watercolor artwork, or framed canvas',
      'a digital illustration, anime, CGI render, or vector drawing',
      'a document, map, chart, newspaper page, or manuscript',
      'an abstract pattern, texture, or blank background',
      'a blurry photo or unrecognizable distorted object'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => {
      const lower = objective.toLowerCase();
      // Specialized expansion for classic cars / automobiles
      if (lower.includes('auto') || lower.includes('car') || lower.includes('coche') || lower.includes('vehic')) {
        return [
          { id: 'R_CAR_01', name: 'QI Classic Cars', query: 'incategory:Quality_images "classic car"', baseYield: 28 },
          { id: 'R_CAR_02', name: 'QI Vintage Cars', query: 'incategory:Quality_images "vintage car"', baseYield: 26 },
          { id: 'R_CAR_03', name: 'QI Antique Automobiles', query: 'incategory:Quality_images "antique automobile"', baseYield: 25 },
          { id: 'R_CAR_04', name: 'QI Historic Automobiles', query: 'incategory:Quality_images "historic automobile"', baseYield: 24 },
          { id: 'R_CAR_05', name: 'QI Classic Roadsters', query: 'incategory:Quality_images "roadster" classic', baseYield: 24 },
          { id: 'R_CAR_06', name: 'QI Oldtimer Cars', query: 'incategory:Quality_images "oldtimer" car', baseYield: 27 },
          { id: 'R_CAR_07', name: 'QI Veteran Cars', query: 'incategory:Quality_images "veteran car"', baseYield: 22 },
          { id: 'R_CAR_08', name: 'QI Automobiles Quality', query: 'incategory:Quality_images "automobile"', baseYield: 25 },
          { id: 'R_CAR_09', name: 'QI Classic Sports Cars', query: 'incategory:Quality_images "sports car"', baseYield: 26 },
          { id: 'R_CAR_10', name: 'QI Classic Vehicles', query: 'incategory:Quality_images "classic vehicle"', baseYield: 25 }
        ];
      }
      return [
        { id: 'R_GEN_01', name: `QI ${objective}`, query: `incategory:Quality_images "${objective}"`, baseYield: 22 },
        { id: 'R_GEN_02', name: `FP ${objective}`, query: `incategory:Featured_pictures "${objective}"`, baseYield: 25 },
        { id: 'R_GEN_03', name: `QI Photo ${objective}`, query: `incategory:Quality_images ${objective} photography`, baseYield: 20 },
        { id: 'R_GEN_04', name: `QI HighRes ${objective}`, query: `incategory:Quality_images ${objective}`, baseYield: 20 }
      ];
    }
  },
  TRAVEL: {
    name: 'TRAVEL',
    displayName: 'Travel & Global Destinations',
    minQualityDefault: 80,
    negativeTerms: ['map', 'diagram', 'chart', 'document', 'text', 'logo'],
    semanticGateLabels: [
      'a real authentic color travel photograph of scenic places, cultural landmarks, and world destinations',
      'a painted canvas or artistic drawing',
      'a digital illustration or vector map',
      'a printed travel brochure, map, or document',
      'an extreme close-up of a receipt or ticket',
      'a blurry or distorted tourist photo'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_TRV_01', name: `QI Travel ${objective}`, query: `incategory:Quality_images "${objective}" travel`, baseYield: 24 },
      { id: 'R_TRV_02', name: `QI Landscape ${objective}`, query: `incategory:Quality_images "${objective}" landscape`, baseYield: 25 }
    ]
  },
  PEOPLE: {
    name: 'PEOPLE',
    displayName: 'People & Human Culture',
    minQualityDefault: 80,
    negativeTerms: ['map', 'diagram', 'chart', 'painting', 'drawing', 'illustration', 'statue', 'mannequin'],
    semanticGateLabels: [
      'a real authentic color photograph of real people, authentic portraits, artisans, or human cultural activities',
      'an oil painting, drawing, or artistic portrait sculpture',
      'a digital cartoon illustration or anime character',
      'a store mannequin, wax figure, or statue',
      'a document, map, or chart'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_PPL_01', name: `QI People ${objective}`, query: `incategory:Quality_images "${objective}" portrait`, baseYield: 22 }
    ]
  },
  PRODUCT: {
    name: 'PRODUCT',
    displayName: 'Product & Industrial Design',
    minQualityDefault: 80,
    negativeTerms: ['drawing', 'blueprint', 'patent', 'document', 'sketch'],
    semanticGateLabels: [
      'a real professional commercial product photograph with studio lighting and clean composition',
      'a patent drawing or technical blueprint',
      'a digital 3D model without textures or cartoon rendering',
      'a blurry amateur snapshot'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_PRD_01', name: `QI Product ${objective}`, query: `incategory:Quality_images "${objective}" product`, baseYield: 22 }
    ]
  },
  HISTORICAL: {
    name: 'HISTORICAL',
    displayName: 'Historical Heritage',
    minQualityDefault: 80,
    negativeTerms: ['map', 'diagram', 'chart', 'drawing', 'sketch', 'illustration'],
    semanticGateLabels: [
      'a real authentic photograph of historical artifacts, ancient monuments, archaeological heritage, or preserved relics',
      'a modern fantasy digital illustration or painting',
      'a modern urban shopping mall or highway',
      'a blank textured document'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_HST_01', name: `QI Historical ${objective}`, query: `incategory:Quality_images "${objective}" historical`, baseYield: 24 }
    ]
  },
  CUSTOM: {
    name: 'CUSTOM',
    displayName: 'Custom User Profile',
    minQualityDefault: 80,
    negativeTerms: ['map', 'diagram', 'chart', 'drawing', 'sketch', 'document'],
    semanticGateLabels: [
      'a real authentic color photograph of high quality',
      'a painting, drawing, or illustration',
      'a document or chart',
      'a blurry low quality photo'
    ],
    targetLabelIndex: 0,
    generateRoutes: (objective) => [
      { id: 'R_CST_01', name: `QI ${objective}`, query: `incategory:Quality_images "${objective}"`, baseYield: 20 }
    ]
  }
};

// Specialized semantic gate labels for automobiles when in GENERAL_IMAGE
const AUTOMOBILE_GATE_LABELS = [
  'a real authentic color photograph of classic automobiles, vintage cars, antique motorcars, or retro vehicles',
  'an oil painting, drawing, or comic book illustration',
  'a plastic children toy car or miniature model',
  'an automotive technical blueprint, maintenance manual, or document',
  'an ordinary indoor domestic room or household furniture',
  'an extreme close-up of a person face, selfie, or portrait',
  'a wild natural forest or mountain with no automobiles in sight'
];

/**
 * License Gate: Evaluates open licenses for safe commercial/permissive reuse.
 */
export function evaluateLicense(licenseRaw, usageTermsRaw) {
  const lic = (licenseRaw || '').toLowerCase().trim();
  const terms = (usageTermsRaw || '').toLowerCase().trim();

  if (!lic && !terms) return { allowed: false, licenseName: 'UNKNOWN', attributionRequired: true };

  if (
    lic.includes('cc0') ||
    lic.includes('zero') ||
    lic.includes('public domain') ||
    lic.includes('pdm') ||
    lic.includes('pd') ||
    terms.includes('public domain') ||
    terms.includes('no rights reserved')
  ) {
    return { allowed: true, licenseName: 'CC0 / Public Domain', attributionRequired: false };
  }

  if (
    (lic.includes('cc by') || lic.includes('cc-by') || lic.includes('cc_by')) &&
    !lic.includes('-nc') &&
    !lic.includes('non-commercial') &&
    !lic.includes('-nd')
  ) {
    const isSa = lic.includes('sa') || terms.includes('share alike') || terms.includes('share-alike');
    return { allowed: true, licenseName: isSa ? 'CC BY-SA' : 'CC BY', attributionRequired: true };
  }

  if (lic.includes('gfdl') || lic.includes('gnu free') || lic.includes('fal')) {
    return { allowed: true, licenseName: 'GFDL / Free Art', attributionRequired: true };
  }

  if (terms.includes('attribution') && !terms.includes('noncommercial') && !terms.includes('no derivatives')) {
    return { allowed: true, licenseName: 'CC BY Compatible', attributionRequired: true };
  }

  return { allowed: false, licenseName: licenseRaw || 'RESTRICTED', attributionRequired: true };
}

export function computeHash(source, sourceId, url) {
  return crypto.createHash('sha256').update(`${source}:${sourceId}:${url}`).digest('hex');
}

/**
 * Quality Gate: Computes aesthetic, composition, lighting, technical & resolution scores.
 */
export function computeAestheticScores(clipOutputs, width, height) {
  const map = {};
  for (const o of clipOutputs) {
    map[o.label] = o.score;
  }

  const sAesthetic = map['breathtaking award-winning professional photography'] || 0;
  const sComp = map['dramatic professional photography with perfect balanced composition'] || 0;
  const sLight = map['epic dramatic scene at golden hour with exquisite lighting'] || 0;
  const sColor = map['beautiful scenic photograph with rich vibrant colors and clear contrast'] || 0;
  const sSharp = map['sharp high-resolution photo with fine crisp details'] || 0;
  const sCinema = map['cinematic award-winning photography'] || 0;
  const sEmotion = map['awe-inspiring breathtaking emotional scene'] || 0;

  const nSnapshot = map['ordinary snapshot'] || 0;
  const nPoorComp = map['poor composition and bad angle'] || 0;
  const nFlatLight = map['flat boring lighting'] || 0;
  const nDullColor = map['washed out dull colors'] || 0;
  const nBlurry = map['blurry photo or low quality image'] || 0;
  const nTourist = map['casual amateur tourist snapshot'] || 0;
  const nWatermark = map['photo with watermark, text overlay, or border frame'] || 0;

  const posSum = sAesthetic + sComp + sLight + sColor + sSharp + sCinema + sEmotion;
  const negSum = nSnapshot + nPoorComp + nFlatLight + nDullColor + nBlurry + nTourist + nWatermark;
  const posRatio = posSum / Math.max(0.001, posSum + negSum);

  const aestheticScore = sAesthetic / Math.max(0.001, sAesthetic + nSnapshot);
  const compositionScore = sComp / Math.max(0.001, sComp + nPoorComp);
  const lightScore = sLight / Math.max(0.001, sLight + nFlatLight);
  const colorScore = sColor / Math.max(0.001, sColor + nDullColor);
  const sharpnessScore = sSharp / Math.max(0.001, sSharp + nBlurry);
  const cinematicScore = sCinema / Math.max(0.001, sCinema + nTourist);
  const emotionalImpactScore = sEmotion / Math.max(0.001, sEmotion + nSnapshot);

  const longEdge = Math.max(width || 0, height || 0);
  let resScore = 0.40;
  if (longEdge >= 3840) resScore = 1.0;
  else if (longEdge >= 2400) resScore = 0.85 + 0.15 * ((longEdge - 2400) / 1440);
  else if (longEdge >= 1920) resScore = 0.70 + 0.15 * ((longEdge - 1920) / 480);
  else if (longEdge >= 1280) resScore = 0.55 + 0.15 * ((longEdge - 1280) / 640);

  const watermarkPenalty = Math.min(0.5, nWatermark * 2.5);
  const technicalQualityScore = Math.max(0.1, Math.min(1.0, resScore - watermarkPenalty));

  const topPositiveScore = Math.max(aestheticScore, compositionScore, lightScore, colorScore, sharpnessScore, cinematicScore, emotionalImpactScore);
  const subScoreAvg = (aestheticScore + compositionScore + lightScore + colorScore + sharpnessScore + cinematicScore + emotionalImpactScore) / 7;
  const blendedSubScore = (topPositiveScore * 0.40) + (subScoreAvg * 0.60);
  const rawQuality = (posRatio * 0.40) + (blendedSubScore * 0.35) + (technicalQualityScore * 0.25);
  const atlasVisualQualityScore = Math.round(Math.min(100, Math.max(0, rawQuality * 100)));

  return {
    aestheticScore: parseFloat(aestheticScore.toFixed(3)),
    compositionScore: parseFloat(compositionScore.toFixed(3)),
    lightScore: parseFloat(lightScore.toFixed(3)),
    colorScore: parseFloat(colorScore.toFixed(3)),
    sharpnessScore: parseFloat(sharpnessScore.toFixed(3)),
    cinematicScore: parseFloat(cinematicScore.toFixed(3)),
    emotionalImpactScore: parseFloat(emotionalImpactScore.toFixed(3)),
    technicalQualityScore: parseFloat(technicalQualityScore.toFixed(3)),
    atlasVisualQualityScore
  };
}

async function fetchToDiskCache(url, sha) {
  const cachePath = path.join(CACHE_DIR, `${sha}.jpg`);
  if (fs.existsSync(cachePath)) {
    try {
      const stat = fs.statSync(cachePath);
      if (stat.size > 500) return cachePath;
    } catch {}
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': API_UA,
        'Referer': 'https://commons.wikimedia.org/'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 500) return null;

    fs.writeFileSync(cachePath, buf);
    return cachePath;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Ensures the persistent table for discovered images exists.
 */
export async function ensureDiscoveredImagesTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_discovered_images (
      id SERIAL PRIMARY KEY,
      asset_id VARCHAR(64) NOT NULL,
      collection_id VARCHAR(100) NOT NULL,
      objective TEXT NOT NULL,
      profile VARCHAR(50) NOT NULL,
      source VARCHAR(50) NOT NULL,
      source_id VARCHAR(100) NOT NULL,
      source_url TEXT NOT NULL,
      media_url TEXT NOT NULL,
      thumb_url TEXT,
      title TEXT,
      creator TEXT,
      license VARCHAR(100),
      license_url TEXT,
      attribution_required BOOLEAN DEFAULT TRUE,
      width INTEGER,
      height INTEGER,
      aspect_ratio VARCHAR(20),
      sha256 VARCHAR(64) UNIQUE NOT NULL,
      visual_quality_score REAL NOT NULL,
      aesthetic_score REAL,
      composition_score REAL,
      light_score REAL,
      color_score REAL,
      sharpness_score REAL,
      cinematic_score REAL,
      emotional_impact_score REAL,
      technical_quality_score REAL,
      scores JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovered_images_collection ON atlas_discovered_images(collection_id);
    CREATE INDEX IF NOT EXISTS idx_discovered_images_profile ON atlas_discovered_images(profile);
    CREATE INDEX IF NOT EXISTS idx_discovered_images_sha ON atlas_discovered_images(sha256);
  `);
}

/**
 * Universal Atlas Image Discovery Engine
 */
export class AtlasImageDiscoveryEngine {
  constructor() {
    this.name = ENGINE_NAME;
    this.displayName = DISPLAY_NAME;
  }

  /**
   * Universal search and acquisition method.
   *
   * Input contract:
   * - objective / SEARCH_OBJECTIVE: string
   * - target / TARGET_COUNT: number
   * - profile / PROFILE: string (NATURE_PREMIUM, ARCHITECTURE, GENERAL_IMAGE, etc.)
   * - quality / MIN_QUALITY: number (e.g. 80)
   * - licensePolicy / LICENSE_POLICY: string (default: COMMERCIAL_PERMISSIVE)
   * - outputCollection / OUTPUT_COLLECTION: string
   */
  async search(options = {}, onProgress = null) {
    const progressCb = onProgress || options.onProgress;
    const objective = options.objective || options.SEARCH_OBJECTIVE || 'general';
    const target = options.target || options.TARGET_COUNT || 10;
    const profileKey = (options.profile || options.PROFILE || 'GENERAL_IMAGE').toUpperCase();
    const profileDef = PROFILE_REGISTRY[profileKey] || PROFILE_REGISTRY.GENERAL_IMAGE;
    const minQuality = options.quality ?? options.MIN_QUALITY ?? profileDef.minQualityDefault ?? 80;
    const outputCollection = options.outputCollection || options.OUTPUT_COLLECTION || `COLLECTION_${profileKey}_${Date.now()}`;

    if (typeof progressCb === 'function') {
      try { progressCb({ certified: 0, target, status: 'searching', gap: target }); } catch {}
    }

    console.log(`\n===========================================================`);
    console.log(`[${ENGINE_NAME}] INITIATING MISSION`);
    console.log(`OBJECTIVE="${objective}" | PROFILE=${profileDef.name} | TARGET=${target} | MIN_QUALITY=${minQuality}`);
    console.log(`OUTPUT_COLLECTION=${outputCollection}`);
    console.log(`===========================================================`);

    const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
    await ensureDiscoveredImagesTable(pool);

    // Load deduplication index from DB (both nature assets and discovered images)
    const existingHashes = new Set();
    const existingSourceIds = new Set();

    try {
      const natRes = await pool.query('SELECT sha256, source_id FROM atlas_nature_assets');
      for (const r of natRes.rows) {
        if (r.sha256) existingHashes.add(r.sha256);
        if (r.source_id) existingSourceIds.add(r.source_id);
      }
    } catch {}

    try {
      const discRes = await pool.query('SELECT sha256, source_id FROM atlas_discovered_images WHERE collection_id = $1', [outputCollection]);
      for (const r of discRes.rows) {
        if (r.sha256) existingHashes.add(r.sha256);
        if (r.source_id) existingSourceIds.add(r.source_id);
      }
    } catch {}

    console.log(`[DEDUPE_INDEX] Loaded ${existingHashes.size} known SHA256s & ${existingSourceIds.size} source IDs.`);

    // 1. INTELLIGENT FRONTIER EXPANSION: Generate candidate routes for the objective
    const rawRoutes = profileDef.generateRoutes(objective);
    const routeState = {};
    for (const r of rawRoutes) {
      routeState[r.id] = {
        ...r,
        offset: 0,
        continueToken: null,
        rawTested: 0,
        accepted: 0,
        q90PlusCount: 0,
        duplicateCount: 0,
        currentYield: r.baseYield,
        paused: false,
        priority: r.baseYield >= 20.0 ? 'HIGH' : (r.baseYield >= 10.0 ? 'MEDIUM' : 'PAUSE_TEMPORARY')
      };
    }
    console.log(`[FRONTIER_EXPANSION] Initialized ${Object.keys(routeState).length} candidate routes for "${objective}".`);

    // 2. INITIALIZE CLIP MODEL & EMBEDDINGS
    const p = await getClipPipeline();

    // Semantic gate labels: choose profile labels or specialized labels
    let semanticLabels = profileDef.semanticGateLabels;
    const lowerObj = objective.toLowerCase();
    if (profileDef.name === 'GENERAL_IMAGE' && (lowerObj.includes('auto') || lowerObj.includes('car') || lowerObj.includes('coche'))) {
      semanticLabels = AUTOMOBILE_GATE_LABELS;
    }

    const template = 'This is a photo of {}';
    const semanticTexts = semanticLabels.map(x => template.replace('{}', x));
    const aestheticTexts = AESTHETIC_LABELS.map(x => template.replace('{}', x));

    const dummyImg = new RawImage(new Uint8Array(224 * 224 * 3), 224, 224, 3);
    const { pixel_values: dummyPixels } = await p.processor([dummyImg]);

    const semTokens = p.tokenizer(semanticTexts, { padding: true, truncation: true });
    const semOut = await p.model({ ...semTokens, pixel_values: dummyPixels });
    const SEMANTIC_TEXT_EMBEDS = Float32Array.from(semOut.text_embeds.data);

    const aesTokens = p.tokenizer(aestheticTexts, { padding: true, truncation: true });
    const aesOut = await p.model({ ...aesTokens, pixel_values: dummyPixels });
    const AESTHETIC_TEXT_EMBEDS = Float32Array.from(aesOut.text_embeds.data);

    const singlePassTokens = p.tokenizer(['photo'], { padding: true, truncation: true });

    // 3. TARGET-GAP LOOP WITH SOURCE YIELD ROUTER
    const missionAccepted = [];
    let loopIteration = 0;
    const startTime = Date.now();
    let nextAssetNum = 1;

    try {
      const maxRes = await pool.query(`SELECT COALESCE(MAX(SUBSTRING(asset_id, 5)::int), 0) as max_id FROM atlas_discovered_images WHERE asset_id ~ '^IMG_[0-9]+$';`);
      nextAssetNum = (maxRes.rows[0]?.max_id || 0) + 1;
    } catch {}

    while (missionAccepted.length < target) {
      loopIteration++;
      if (loopIteration > 80) {
        console.log(`[TARGET_GAP] Max loop iterations (80) reached. Delivering certified items (${missionAccepted.length}/${target}).`);
        break;
      }

      const routesList = Object.values(routeState);
      const activeList = routesList.filter(r => !r.paused && !r.exhausted);

      // If too few active routes, unpause with baseline yield
      if (activeList.length === 0) {
        const unexhausted = routesList.filter(r => !r.exhausted);
        if (unexhausted.length === 0) {
          console.log(`[SOURCE_EXHAUSTION] All routes exhausted for objective "${objective}". Delivering certified items (${missionAccepted.length}/${target}).`);
          break;
        }
        for (const r of unexhausted) {
          r.paused = false;
          r.currentYield = Math.max(10, r.baseYield);
          r.priority = 'MEDIUM';
        }
      }

      const highRoutes = routesList.filter(r => !r.paused && !r.exhausted && r.currentYield >= 20.0);
      const medRoutes = routesList.filter(r => !r.paused && !r.exhausted && r.currentYield >= 10.0 && r.currentYield < 20.0);
      const pausedRoutes = routesList.filter(r => !r.exhausted && (r.paused || r.currentYield < 8.0));

      // SOURCE YIELD ROUTER SELECTION: 70% HIGH, 25% MEDIUM, 5% PROBE
      let selectedRoute;
      const roll = Math.random();
      if (roll < 0.70 && highRoutes.length > 0) {
        selectedRoute = highRoutes[Math.floor(Math.random() * highRoutes.length)];
      } else if (roll < 0.95 && medRoutes.length > 0) {
        selectedRoute = medRoutes[Math.floor(Math.random() * medRoutes.length)];
      } else if (pausedRoutes.length > 0) {
        selectedRoute = pausedRoutes[Math.floor(Math.random() * pausedRoutes.length)];
      } else {
        const available = routesList.filter(r => !r.exhausted);
        if (available.length === 0) break;
        selectedRoute = available[Math.floor(Math.random() * available.length)];
      }

      // Fetch batch from source API (Wikimedia Commons generator search)
      const limit = 25;
      let url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(selectedRoute.query)}&gsrnamespace=6&gsrlimit=${limit}&gsroffset=${selectedRoute.offset}&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json`;
      if (selectedRoute.continueToken) {
        url += `&continue=${encodeURIComponent(selectedRoute.continueToken)}`;
      }

      let pages = [];
      try {
        const res = await fetch(url, { headers: { 'User-Agent': API_UA } });
        if (res.ok) {
          const data = await res.json();
          pages = Object.values(data.query?.pages || {});
          if (data.continue) {
            selectedRoute.continueToken = data.continue.continue;
            selectedRoute.offset = data.continue.gsroffset || (selectedRoute.offset + limit);
          } else {
            selectedRoute.offset += limit;
          }
        }
      } catch (err) {
        console.warn(`[SOURCE_ROUTER] Route ${selectedRoute.id} network error: ${err.message}`);
      }

      if (pages.length === 0) {
        selectedRoute.exhausted = true;
        selectedRoute.paused = true;
        continue;
      }

      let batchRaw = 0;
      let batchDup = 0;
      let batchAccepted = 0;
      let batch90Plus = 0;
      const eligible = [];

      for (const page of pages) {
        batchRaw++;
        const pageidStr = String(page.pageid);
        if (existingSourceIds.has(pageidStr)) {
          batchDup++;
          continue;
        }

        const info = page.imageinfo?.[0];
        if (!info || !info.url) continue;

        // MEDIA GATE: Check MIME type
        const mime = (info.mime || '').toLowerCase();
        if (!mime.startsWith('image/') || mime.includes('djvu') || mime.includes('pdf')) continue;

        // MEDIA GATE: Text / keyword filtering
        const title = page.title || '';
        const lowerTitle = title.toLowerCase();
        if (profileDef.negativeTerms.some(t => lowerTitle.includes(t))) continue;

        // MEDIA GATE: Minimum Resolution Check
        const width = info.width || 0;
        const height = info.height || 0;
        if (width < 1280 && height < 1280) continue;

        // LICENSE GATE: Verification of permissive / commercial rights
        const meta = info.extmetadata || {};
        const licenseRaw = meta.LicenseShortName?.value || meta.License?.value || '';
        const usageTerms = meta.UsageTerms?.value || '';
        const licEval = evaluateLicense(licenseRaw, usageTerms);
        if (!licEval.allowed) continue;

        // DEDUPE: SHA-256 computation
        const sha = computeHash('WIKIMEDIA_COMMONS', pageidStr, info.url);
        if (existingHashes.has(sha)) {
          batchDup++;
          continue;
        }

        existingSourceIds.add(pageidStr);
        existingHashes.add(sha);

        eligible.push({
          pageid: page.pageid,
          title: title.replace(/^File:/i, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(),
          rawTitle: title,
          url: info.url,
          sha,
          width,
          height,
          license: licEval.licenseName,
          licenseUrl: meta.LicenseUrl?.value || null,
          artist: (meta.Artist?.value || meta.Credit?.value || 'Wikimedia Commons').replace(/<[^>]*>/g, '').trim().slice(0, 100),
          attributionRequired: licEval.attributionRequired
        });
      }

      if (eligible.length > 0) {
        const filePromises = eligible.map(c => fetchToDiskCache(getWikimediaThumbUrl(c.url, 500), c.sha));
        const filePaths = await Promise.all(filePromises);

        const rawImages = [];
        const validCands = [];
        for (let i = 0; i < eligible.length; i++) {
          if (filePaths[i]) {
            try {
              const buf = fs.readFileSync(filePaths[i]);
              const raw = await RawImage.fromBlob(new Blob([buf]));
              rawImages.push(raw);
              validCands.push(eligible[i]);
            } catch {}
          }
        }

        if (rawImages.length > 0) {
          const { pixel_values } = await p.processor(rawImages);
          const out = await p.model({ ...singlePassTokens, pixel_values });
          const embedsData = out.image_embeds.data;

          for (let k = 0; k < rawImages.length; k++) {
            if (missionAccepted.length >= target) break;

            const emb = embedsData.subarray(k * 512, (k + 1) * 512);

            // SEMANTIC VISUAL GATE: Compare against objective labels
            const semLogits = [];
            for (let n = 0; n < semanticLabels.length; n++) {
              let dot = 0;
              for (let d = 0; d < 512; d++) dot += emb[d] * SEMANTIC_TEXT_EMBEDS[n * 512 + d];
              semLogits.push(dot * 100.0);
            }
            const maxS = Math.max(...semLogits);
            const expsS = semLogits.map(l => Math.exp(l - maxS));
            const sumS = expsS.reduce((a, b) => a + b, 0);
            const probsS = expsS.map(e => e / sumS);

            let topSemScore = 0, topSemIdx = 0;
            for (let n = 0; n < probsS.length; n++) {
              if (probsS[n] > topSemScore) { topSemScore = probsS[n]; topSemIdx = n; }
            }

            // Semantic gate criteria: target label index must be top and score >= 0.20
            if (topSemIdx !== profileDef.targetLabelIndex || topSemScore < 0.20) continue;

            // QUALITY GATE: Aesthetic evaluation
            const aesLogits = [];
            for (let a = 0; a < AESTHETIC_LABELS.length; a++) {
              let dot = 0;
              for (let d = 0; d < 512; d++) dot += emb[d] * AESTHETIC_TEXT_EMBEDS[a * 512 + d];
              aesLogits.push(dot * 100.0);
            }
            const maxA = Math.max(...aesLogits);
            const expsA = aesLogits.map(l => Math.exp(l - maxA));
            const sumA = expsA.reduce((a, b) => a + b, 0);
            const probsA = expsA.map(e => e / sumA);

            const aestheticOutputs = AESTHETIC_LABELS.map((label, idx) => ({ label, score: probsA[idx] }));
            const scores = computeAestheticScores(aestheticOutputs, validCands[k].width, validCands[k].height);

            // Quality threshold check
            if (scores.atlasVisualQualityScore < minQuality) continue;

            batchAccepted++;
            if (scores.atlasVisualQualityScore >= 90) batch90Plus++;

            const assetId = `IMG_${String(nextAssetNum++).padStart(5, '0')}`;
            const cand = validCands[k];
            const item = {
              assetId,
              collectionId: outputCollection,
              objective,
              profile: profileDef.name,
              source: 'WIKIMEDIA_COMMONS',
              sourceId: String(cand.pageid),
              sourceUrl: `https://commons.wikimedia.org/?curid=${cand.pageid}`,
              mediaUrl: cand.url,
              thumbUrl: getWikimediaThumbUrl(cand.url, 500),
              title: cand.title,
              creator: cand.artist,
              license: cand.license,
              licenseUrl: cand.licenseUrl,
              attributionRequired: cand.attributionRequired,
              width: cand.width,
              height: cand.height,
              aspectRatio: cand.width > cand.height ? '16:9' : '9:16',
              sha256: cand.sha,
              visualQualityScore: scores.atlasVisualQualityScore,
              scores
            };

            // PERSIST: Insert into atlas_discovered_images
            await pool.query(`
              INSERT INTO atlas_discovered_images (
                asset_id, collection_id, objective, profile, source, source_id, source_url,
                media_url, thumb_url, title, creator, license, license_url, attribution_required,
                width, height, aspect_ratio, sha256, visual_quality_score,
                aesthetic_score, composition_score, light_score, color_score,
                sharpness_score, cinematic_score, emotional_impact_score, technical_quality_score,
                scores
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19,
                $20, $21, $22, $23,
                $24, $25, $26, $27,
                $28
              ) ON CONFLICT (sha256) DO NOTHING;
            `, [
              item.assetId, item.collectionId, item.objective, item.profile, item.source, item.sourceId, item.sourceUrl,
              item.mediaUrl, item.thumbUrl, item.title, item.creator, item.license, item.licenseUrl, item.attributionRequired,
              item.width, item.height, item.aspectRatio, item.sha256, item.visualQualityScore,
              scores.aestheticScore, scores.compositionScore, scores.lightScore, scores.colorScore,
              scores.sharpnessScore, scores.cinematicScore, scores.emotionalImpactScore, scores.technicalQualityScore,
              JSON.stringify(scores)
            ]);

            missionAccepted.push(item);
            if (typeof progressCb === 'function') {
              try {
                progressCb({
                  certified: missionAccepted.length,
                  target,
                  gap: Math.max(0, target - missionAccepted.length),
                  status: 'searching',
                  latestItem: item
                });
              } catch {}
            }
          }
        }
      }

      // SOURCE YIELD ROUTER LEARNING UPDATE
      selectedRoute.rawTested += batchRaw;
      selectedRoute.accepted += batchAccepted;
      selectedRoute.q90PlusCount += batch90Plus;
      selectedRoute.duplicateCount += batchDup;

      const yieldPct = parseFloat(((selectedRoute.accepted / (selectedRoute.rawTested || 1)) * 100).toFixed(1));
      selectedRoute.currentYield = yieldPct;

      if (yieldPct >= 20.0) {
        selectedRoute.priority = 'HIGH';
        selectedRoute.paused = false;
      } else if (yieldPct >= 10.0) {
        selectedRoute.priority = 'MEDIUM';
        selectedRoute.paused = false;
      } else if (yieldPct < 8.0 && selectedRoute.rawTested >= 25) {
        selectedRoute.priority = 'PAUSE_TEMPORARY';
        selectedRoute.paused = true;
      }

      const gap = Math.max(0, target - missionAccepted.length);
      console.log(`[ROUTER_CHECKPOINT] OBJECTIVE="${objective}" | ACCEPTED=${missionAccepted.length}/${target} | GAP=${gap} | Route: ${selectedRoute.name} (${selectedRoute.currentYield}%) | Active=${activeList.length}`);

      if (typeof progressCb === 'function') {
        try {
          progressCb({
            certified: missionAccepted.length,
            target,
            gap,
            status: 'checkpoint',
            route: selectedRoute.name,
            yield: selectedRoute.currentYield
          });
        } catch {}
      }
    }

    // 4. READBACK: Verify persistence
    const readbackRes = await pool.query(
      'SELECT asset_id, collection_id, objective, profile, title, visual_quality_score, license FROM atlas_discovered_images WHERE collection_id = $1 ORDER BY id ASC',
      [outputCollection]
    );

    await pool.end();

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgScore = missionAccepted.length > 0 
      ? parseFloat((missionAccepted.reduce((a, b) => a + b.visualQualityScore, 0) / missionAccepted.length).toFixed(1))
      : 0;

    console.log(`\n--- MISSION COMPLETED in ${durationSec}s ---`);
    console.log(`COLLECTION: ${outputCollection}`);
    console.log(`TOTAL_ACCEPTED: ${missionAccepted.length}`);
    console.log(`AVERAGE_QUALITY_SCORE: ${avgScore}`);
    if (typeof progressCb === 'function') {
      try {
        progressCb({
          certified: missionAccepted.length,
          target,
          gap: Math.max(0, target - missionAccepted.length),
          status: 'done',
          outputCollection,
          acceptedCount: missionAccepted.length
        });
      } catch {}
    }

    return {
      engineName: ENGINE_NAME,
      displayName: DISPLAY_NAME,
      objective,
      profile: profileDef.name,
      target,
      acceptedCount: missionAccepted.length,
      averageQualityScore: avgScore,
      outputCollection,
      readbackVerifiedCount: readbackRes.rows.length,
      discoveredAssets: missionAccepted,
      routesState: routeState
    };
  }

  /**
   * Readback helper to fetch any previously persisted collection.
   */
  async readback(collectionId) {
    const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
    const res = await pool.query(
      'SELECT * FROM atlas_discovered_images WHERE collection_id = $1 ORDER BY id ASC',
      [collectionId]
    );
    await pool.end();
    return res.rows;
  }
}

// Canonical singleton export
export const AtlasImageDiscovery = new AtlasImageDiscoveryEngine();
export default AtlasImageDiscovery;
