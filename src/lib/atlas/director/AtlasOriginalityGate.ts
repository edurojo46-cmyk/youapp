import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface OriginalityAuditResult {
  videoId: string;
  title: string;
  renderPass: boolean;
  originalContentVerified: boolean;
  rootCause?: string;
  metrics: {
    totalVisualAssets: number;
    recycledVisualAssetsCount: number;
    visualRecycleRatio: number;
    scriptSimilarityScore: number;
    historicalPointerMatchesCount: number;
    missingOriginalBackups: boolean;
  };
  details: {
    oldScriptsReused: string[];
    oldImagesReused: string[];
    oldVideoContentReused: string[];
    legitimateReusedTools: string[];
  };
  verdict: 'PASS' | 'FAIL';
  failureReason?: string;
}

export class AtlasOriginalityGate {
  private static instance: AtlasOriginalityGate | null = null;

  public static getInstance(): AtlasOriginalityGate {
    if (!AtlasOriginalityGate.instance) {
      AtlasOriginalityGate.instance = new AtlasOriginalityGate();
    }
    return AtlasOriginalityGate.instance;
  }

  /**
   * Computes sha256 for a given buffer or file
   */
  public computeSha256(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  /**
   * Audits assets and plan BEFORE rendering begins to block recycled productions.
   */
  public auditPreRenderOriginality(params: {
    videoId: string;
    title: string;
    targetMp4Path: string;
    imagePaths: string[];
    scriptBlocks: string[];
    musicPath?: string;
  }): {
    passed: boolean;
    visualRecycleRatio: number;
    recycledImageCount: number;
    scriptSimilarityScore: number;
    overwritingExistingPointer: boolean;
    recycledMotifs: string[];
    recycledImages: string[];
    reasons: string[];
  } {
    const reasons: string[] = [];
    const recycledImages: string[] = [];

    // 1. Check images
    for (const img of params.imagePaths) {
      if (!fs.existsSync(img)) {
        reasons.push(`Image does not exist: ${img}`);
        continue;
      }
      const st = fs.statSync(img);
      const isHistorical = st.birthtime < new Date('2026-10-25T17:00:00.000Z');
      const isStockAtlas2Min = img.includes('atlas_2min');
      if (isHistorical || isStockAtlas2Min) {
        recycledImages.push(path.basename(img));
      }
    }

    const totalImgs = params.imagePaths.length;
    const visualRecycleRatio = totalImgs > 0 ? parseFloat((recycledImages.length / totalImgs).toFixed(2)) : 0;
    if (visualRecycleRatio > 0.0) {
      reasons.push(`Pre-render gate rejected: ${recycledImages.length}/${totalImgs} images are recycled from old stock.`);
    }

    // 2. Check catalog pointer collision
    let overwritingExistingPointer = false;
    const pointersPath = path.resolve('server/data/atlas_video_pointers.json');
    if (fs.existsSync(pointersPath)) {
      const pData = JSON.parse(fs.readFileSync(pointersPath, 'utf8'));
      const pointers = Object.values(pData.pointers || {}) as any[];
      const fileName = path.basename(params.targetMp4Path);
      const collision = pointers.find(p => p.originalName === fileName || p.id === params.videoId);
      if (collision) {
        overwritingExistingPointer = true;
        reasons.push(`Target MP4 or ID collides with existing pointer '${collision.id}' (${fileName}). A brand new identifier and path are required.`);
      }
    }

    // 3. Check script semantic overlap against all prior productions
    const recycledMotifs: string[] = [];
    const fullScript = params.scriptBlocks.join(' ').toLowerCase();
    const priorMotifs = [
      { name: 'Hábitos y Sinapsis', terms: ['surcos neuronales', 'fuerza de voluntad', 'mielinizar', 'límbico'] },
      { name: 'Olla Popular y Solidaridad', terms: ['olla popular', 'huerta comunitaria', 'reparto solidario', 'tejido barrial'] },
      { name: 'Doble Rendija y Entrelazamiento', terms: ['corazón de la materia', 'paradoja cuántica', 'entrelazamiento', 'onda-partícula'] },
      { name: 'Estoicismo y Quietud', terms: ['corriendo tras el próximo minuto', 'culpa del pasado', 'séneca', 'quietud interior'] },
      { name: 'Interés Compuesto y Pánico Bursátil', terms: ['gratificación instantánea', 'interés compuesto', 'volatilidad', 'semilla de autonomía'] },
      { name: 'El Relojero', terms: ['anselmo', 'relojero', 'engranaje', 'tourbillon', 'balancín', 'puerto'] }
    ];

    for (const m of priorMotifs) {
      const matchScore = m.terms.filter(t => fullScript.includes(t)).length;
      if (matchScore >= 2) {
        recycledMotifs.push(`${m.name}: ${matchScore}/${m.terms.length} matching terms`);
      }
    }

    const scriptSimilarityScore = recycledMotifs.length > 0 ? 0.75 : 0.0;
    if (scriptSimilarityScore > 0) {
      reasons.push(`Pre-render gate rejected: script semantically overlaps with prior stories: ${recycledMotifs.join(', ')}`);
    }

    // 4. Music Check
    if (params.musicPath) {
      const musicBase = path.basename(params.musicPath).toLowerCase();
      const forbiddenAutoReused = ['gymnopedie_no_1.mp3', 'virtutes_instrumenti.mp3', 'airship_serenity.mp3'];
      if (forbiddenAutoReused.includes(musicBase)) {
        reasons.push(`Music ${musicBase} was automatically reused from prior rejected productions.`);
      }
    }

    const passed = reasons.length === 0;

    return {
      passed,
      visualRecycleRatio,
      recycledImageCount: recycledImages.length,
      scriptSimilarityScore,
      overwritingExistingPointer,
      recycledMotifs,
      recycledImages,
      reasons
    };
  }

  /**
   * Audits a video production against catalog and historic asset libraries to prevent
   * false ORIGINAL_NEW certification of recycled content.
   */
  public auditProductionOriginality(params: {
    videoId: string;
    title: string;
    mp4Path: string;
    imagePaths: string[];
    scriptBlocks: string[];
    allowedVisualRecycleThreshold?: number; // e.g. 0.2 (max 20%)
  }): OriginalityAuditResult {
    const threshold = params.allowedVisualRecycleThreshold ?? 0.15; // Strict: max 15% recycled
    const mp4Exists = fs.existsSync(params.mp4Path);
    let renderPass = false;

    if (mp4Exists) {
      const stat = fs.statSync(params.mp4Path);
      renderPass = stat.size > 1024 * 1024; // Basic sanity
    }

    // 1. Audit Image Asset Lineage
    const oldImagesReused: string[] = [];
    for (const img of params.imagePaths) {
      if (!fs.existsSync(img)) continue;
      const st = fs.statSync(img);
      const isHistoricalPre25Oct = st.birthtime < new Date('2026-10-25T17:00:00.000Z');
      const isInAtlas2MinStock = img.includes('atlas_2min');
      if (isHistoricalPre25Oct || isInAtlas2MinStock) {
        oldImagesReused.push(path.basename(img) + ` (${st.birthtime.toISOString().slice(0, 10)})`);
      }
    }

    const totalVisualAssets = params.imagePaths.length;
    const recycledVisualAssetsCount = oldImagesReused.length;
    const visualRecycleRatio = totalVisualAssets > 0 ? parseFloat((recycledVisualAssetsCount / totalVisualAssets).toFixed(2)) : 0;

    // 2. Audit Video Pointer History in Catalog
    const pointersPath = path.resolve('server/data/atlas_video_pointers.json');
    let historicalPointerMatchesCount = 0;
    const oldVideoContentReused: string[] = [];

    if (fs.existsSync(pointersPath)) {
      const pData = JSON.parse(fs.readFileSync(pointersPath, 'utf8'));
      const pointers = Object.values(pData.pointers || {}) as any[];
      const fileName = path.basename(params.mp4Path);
      const matching = pointers.filter(p => p.originalName === fileName);
      historicalPointerMatchesCount = matching.length;
      if (matching.length > 1) {
        matching.forEach(m => {
          oldVideoContentReused.push(`Pointer ${m.id} (${m.lastVerifiedAt}) - ${m.sizeBytes} bytes`);
        });
      }
    }

    // 3. Audit Script Semantic Re-use
    const oldScriptsReused: string[] = [];
    const fullScript = params.scriptBlocks.join(' ').toLowerCase();

    // Known prior scripts motifs from October 23-25 runs
    const priorMotifs = [
      { name: 'Hábitos y Sinapsis (regenerate_5_story_videos_piper)', terms: ['surcos neuronales', 'fuerza de voluntad', 'mielinizar', 'límbico'] },
      { name: 'Olla Popular y Solidaridad (regenerate_5_story_videos_piper)', terms: ['olla popular', 'huerta comunitaria', 'reparto solidario', 'tejido barrial'] },
      { name: 'Doble Rendija y Entrelazamiento (build_4_topics_direct)', terms: ['corazón de la materia', 'paradoja cuántica', 'entrelazamiento', 'onda-partícula'] },
      { name: 'Estoicismo y Quietud (build_4_topics_direct)', terms: ['corriendo tras el próximo minuto', 'culpa del pasado', 'séneca', 'quietud interior'] },
      { name: 'Interés Compuesto y Pánico Bursátil (build_4_topics_direct)', terms: ['gratificación instantánea', 'interés compuesto', 'volatilidad', 'semilla de autonomía'] },
      { name: 'El Relojero (relojero_complete_120s)', terms: ['anselmo', 'relojero', 'engranaje', 'tourbillon', 'balancín', 'puerto'] }
    ];

    let matchedMotifCount = 0;
    for (const m of priorMotifs) {
      const matchScore = m.terms.filter(t => fullScript.includes(t)).length;
      if (matchScore >= 2) {
        matchedMotifCount++;
        oldScriptsReused.push(`${m.name}: ${matchScore}/${m.terms.length} matching key motifs`);
      }
    }

    const scriptSimilarityScore = parseFloat((matchedMotifCount > 0 ? 0.75 : 0.0).toFixed(2));

    // 4. Determine Originality
    const hasVisualRecycle = visualRecycleRatio > threshold;
    const hasVideoRecycle = historicalPointerMatchesCount > 1;
    const hasScriptRecycle = oldScriptsReused.length > 0;

    const originalContentVerified = !hasVisualRecycle && !hasVideoRecycle && !hasScriptRecycle;

    // 5. Root Cause Analysis
    let rootCause = '';
    if (hasVisualRecycle) {
      rootCause += `100% of images (${recycledVisualAssetsCount}/${totalVisualAssets}) were sourced from pre-existing stock folders (atlas_2min) created on October 23-25 without generating new storyboard visual frames. `;
    }
    if (hasVideoRecycle) {
      rootCause += `The MP4 file ${path.basename(params.mp4Path)} was overwritten over an existing catalog pointer without retaining separate version provenance. `;
    }
    if (hasScriptRecycle) {
      rootCause += `Narrative text recycled core motifs from earlier scripts without creating completely distinct story arcs. `;
    }
    if (!rootCause) {
      rootCause = 'No recycling detected; content is novel.';
    }

    const failureReason = originalContentVerified
      ? undefined
      : `REJECTED_RECYCLED_CONTENT: visualRecycleRatio=${visualRecycleRatio} (max allowed ${threshold}), scriptRecycled=${hasScriptRecycle}, historicalMatches=${historicalPointerMatchesCount}`;

    return {
      videoId: params.videoId,
      title: params.title,
      renderPass,
      originalContentVerified,
      rootCause: originalContentVerified ? undefined : rootCause.trim(),
      metrics: {
        totalVisualAssets,
        recycledVisualAssetsCount,
        visualRecycleRatio,
        scriptSimilarityScore,
        historicalPointerMatchesCount,
        missingOriginalBackups: historicalPointerMatchesCount > 1 && !fs.existsSync(params.mp4Path + '.bak')
      },
      details: {
        oldScriptsReused,
        oldImagesReused,
        oldVideoContentReused,
        legitimateReusedTools: [
          'Piper Neural TTS Engine (es_ES-davefx-medium)',
          'FFmpeg ultrafast transcode pipeline',
          'AtlasTimelineSpeechMixer compositing math',
          'AtlasStorageHousekeeper disk safety monitor'
        ]
      },
      verdict: originalContentVerified && renderPass ? 'PASS' : 'FAIL',
      failureReason
    };
  }
}
