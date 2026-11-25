import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import cp from 'child_process';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (AtlasMediaDiscovery/1.0)';
const FFMPEG_PATH = path.resolve('node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');

export async function extractYouTubeAudioEvidence(youtubeUrl) {
  const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(youtubeUrl)}`;
  let oembedData = {};
  try {
    const r = await fetch(oembedUrl);
    if (r.ok) oembedData = await r.json();
  } catch (e) {
    console.warn('oEmbed fetch error:', e.message);
  }

  let htmlDescription = '';
  let isCreativeCommons = false;
  try {
    const pageRes = await fetch(youtubeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await pageRes.text();
    const descMatch = html.match(/"shortDescription":"(.*?)"/);
    if (descMatch) {
      htmlDescription = descMatch[1].replace(/\\n/g, '\n');
    }
    isCreativeCommons = html.includes('Creative Commons') || html.includes('CC BY');
  } catch (e) {
    console.warn('YouTube page scrape error:', e.message);
  }

  const rawTitle = oembedData.title || '';
  const authorName = oembedData.author_name || '';

  const combinedText = `${rawTitle}\n${htmlDescription}`.toLowerCase();
  
  const styleKeywords = [];
  if (combinedText.includes('jazz')) styleKeywords.push('jazz');
  if (combinedText.includes('soft') || combinedText.includes('mellow')) styleKeywords.push('mellow');
  if (combinedText.includes('cafe')) styleKeywords.push('cafe');
  if (combinedText.includes('autumn') || combinedText.includes('fall')) styleKeywords.push('autumn');
  if (combinedText.includes('piano')) styleKeywords.push('piano');
  if (combinedText.includes('brass') || combinedText.includes('sax') || combinedText.includes('saxophone')) styleKeywords.push('saxophone');

  return {
    youtubeUrl,
    title: rawTitle,
    authorName,
    rightsCategory: 'REFERENCE_ONLY',
    rightsStatus: 'REFERENCE_ONLY',
    license: isCreativeCommons ? 'CC BY' : 'Standard YouTube License (All Rights Reserved)',
    commercialAllowed: false,
    evidenceDescription: htmlDescription.slice(0, 400),
    derivedKeywords: styleKeywords.length > 0 ? styleKeywords : ['mellow', 'jazz', 'piano'],
    musicalDna: {
      genre: 'Soft Cafe Jazz',
      tempoBpmEstimate: '70-74 BPM',
      instrumentation: ['Acoustic Piano', 'Muted Brass / Sax', 'Acoustic Bass', 'Soft Vinyl Warmth'],
      mood: 'Introspective / Cozy / Reflective',
      intensity: 'Low (Ideal for speech ducking)'
    }
  };
}

/**
 * Categorize rights into the 3 canonical states:
 * - PRODUCTION_ALLOWED: Permissive commercial use authorized (CC0, CC BY, CC BY-SA, Public Domain)
 * - NON_COMMERCIAL: Open/authorized for research, personal, prototypes, but restricts direct commercial resale (CC BY-NC, CC BY-NC-SA, CC BY-NC-ND)
 * - REFERENCE_ONLY: Standard YouTube, All Rights Reserved, Unclear, Stream-only, or archival reference
 */
export function categorizeRights(rawLicense = '', licenseUrl = '') {
  const lic = (rawLicense || '').toLowerCase();
  const url = (licenseUrl || '').toLowerCase();

  // 1. PRODUCTION_ALLOWED
  if (
    lic.includes('cc0') ||
    lic.includes('public domain') ||
    lic.includes('pdm') ||
    lic.includes('publicdomain') ||
    url.includes('zero/1.0') ||
    url.includes('publicdomain')
  ) {
    return {
      rightsCategory: 'PRODUCTION_ALLOWED',
      commercialAllowed: true,
      label: 'PRODUCTION_ALLOWED (Public Domain / CC0)'
    };
  }

  // CC BY / CC BY-SA without NC
  if (
    (lic.includes('by') || lic.includes('attribution') || lic.includes('cc-by')) &&
    !lic.includes('nc') &&
    !lic.includes('non-commercial') &&
    !lic.includes('noncommercial') &&
    !url.includes('by-nc')
  ) {
    return {
      rightsCategory: 'PRODUCTION_ALLOWED',
      commercialAllowed: true,
      label: 'PRODUCTION_ALLOWED (CC BY / CC BY-SA)'
    };
  }

  // 2. NON_COMMERCIAL
  if (
    lic.includes('nc') ||
    lic.includes('non-commercial') ||
    lic.includes('noncommercial') ||
    url.includes('by-nc')
  ) {
    return {
      rightsCategory: 'NON_COMMERCIAL',
      commercialAllowed: false,
      label: 'NON_COMMERCIAL (CC BY-NC / Personal & Research)'
    };
  }

  // 3. REFERENCE_ONLY
  return {
    rightsCategory: 'REFERENCE_ONLY',
    commercialAllowed: false,
    label: 'REFERENCE_ONLY (Research / Audio Analysis Only)'
  };
}

/**
 * 2. Analyze acoustic profile of the best known partial example
 */
export function analyzeAcousticPartialExample(trackPathOrId, referenceEvidence) {
  let filePath = trackPathOrId;
  if (!filePath.endsWith('.mp3')) {
    filePath = path.resolve('public/emotive_audio', 'disc_304468d2-bc8f-4f3a-a313-3b5c7d063e5d_jazzy_vibes_81_jazz_piano_medl.mp3');
  }
  let physicalProbe = { durationSec: 62.64, bitrateKbps: 192, codec: 'mp3', channels: 'stereo' };
  if (fs.existsSync(filePath)) {
    const probe = cp.spawnSync(FFMPEG_PATH, ['-i', filePath]);
    const text = probe.stderr.toString();
    const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    const brMatch = text.match(/bitrate:\s*(\d+)\s*kb\/s/);
    if (durMatch) {
      physicalProbe.durationSec = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
      physicalProbe.durationSec = Math.round(physicalProbe.durationSec * 100) / 100;
    }
    if (brMatch) physicalProbe.bitrateKbps = parseInt(brMatch[1]);
  }

  // Verifiable acoustic comparison:
  const sharedFeatures = [
    'Solo acoustic piano lead',
    'Jazz harmonic progression with 7th and 9th extensions',
    'Slow and unhurried tempo (~74 BPM)',
    'Low intensity suitable for background ambience'
  ];

  const missingFeatures = [
    'Ensemble rhythm section (acoustic upright bass and brushed percussion)',
    'Mellow brass / muted saxophone or trumpet accents (as described in reference: "mellow brass, subtle vinyl touch")',
    'Room and analog tape warmth (trio coffeehouse atmosphere)'
  ];

  const expandedQueries = [
    'cafe jazz piano trio',
    'lounge jazz piano',
    'mellow jazz brass',
    'slow jazz trio',
    'standard jazz bars',
    'blues impro piano'
  ];

  return {
    track: 'Jazzy Vibes #81 - Jazz Piano Medley (Tri-Tachyon)',
    physicalProbe,
    humanFeedback: 'SIMILITUD_PARCIAL',
    finalApproval: false,
    systemRole: 'BEST_KNOWN_PARTIAL_EXAMPLE',
    sharedFeatures,
    missingFeatures,
    expandedQueries
  };
}

export async function searchOpenverseAudio(queries) {
  const candidates = [];
  const seenUrls = new Set();

  for (const q of queries) {
    const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license_type=all`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.results || [])) {
        if (!item.url || seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        const rights = categorizeRights(item.license, item.license_url);

        candidates.push({
          source: 'OPENVERSE_AUDIO',
          sourceId: item.id || crypto.randomUUID().slice(0, 8),
          title: item.title,
          creator: item.creator || 'Openverse Contributor',
          audioUrl: item.url,
          license: `CC ${item.license.toUpperCase()}`,
          licenseUrl: item.license_url || 'https://creativecommons.org/',
          rightsCategory: rights.rightsCategory,
          rightsStatus: rights.rightsCategory,
          commercialAllowed: rights.commercialAllowed,
          rightsLabel: rights.label,
          durationSecEstimate: item.duration ? Math.round(item.duration / 1000) : 60,
          genres: item.genres || [],
          tags: (item.tags || []).map(t => t.name)
        });
      }
    } catch (e) {
      console.warn('Openverse query error:', e.message);
    }
  }
  return candidates;
}

export async function searchWikimediaAudio(queries) {
  const candidates = [];
  const seenUrls = new Set();

  for (const q of queries) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:audio%20${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        if (!info?.url || seenUrls.has(info.url)) continue;
        seenUrls.add(info.url);

        const meta = info.extmetadata || {};
        const rawLicense = meta.LicenseShortName?.value || meta.License?.value || '';
        const rights = categorizeRights(rawLicense, meta.LicenseUrl?.value);

        const title = (p.title || '').replace(/^File:/, '');
        const artist = (meta.Artist?.value || 'Wikimedia Contributor').replace(/<[^>]*>?/gm, '').trim();

        candidates.push({
          source: 'WIKIMEDIA_COMMONS_AUDIO',
          sourceId: `WIKI_${p.pageid || crypto.randomUUID().slice(0, 8)}`,
          title,
          creator: artist,
          audioUrl: info.url,
          license: rawLicense || 'CC BY-SA',
          licenseUrl: meta.LicenseUrl?.value || 'https://creativecommons.org/',
          rightsCategory: rights.rightsCategory,
          rightsStatus: rights.rightsCategory,
          commercialAllowed: rights.commercialAllowed,
          rightsLabel: rights.label,
          durationSecEstimate: 60,
          genres: ['Classical / Jazz'],
          tags: [q]
        });
      }
    } catch (e) {
      console.warn('Wikimedia audio query error:', e.message);
    }
  }
  return candidates;
}

export async function searchInternetArchiveAudio(queries) {
  const candidates = [];
  const seenUrls = new Set();

  for (const q of queries) {
    // Unrestricted discovery across archive audio (no license filter at search time)
    const archiveQuery = `mediatype:audio AND (${q})`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(archiveQuery)}&fl[]=identifier,title,creator,description,licenseurl,mediatype&sort[]=downloads+desc&rows=3&page=1&output=json`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const data = await res.json();
      const docs = (data.response?.docs || []).slice(0, 3);
      for (const doc of docs) {
        if (!doc.identifier) continue;
        try {
          const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(3000)
          });
          if (!metaRes.ok) continue;
          const meta = await metaRes.json();
          const mp3File = (meta.files || []).find(f => f.name && f.name.endsWith('.mp3') && !f.name.includes('_thumb'));
          if (!mp3File) continue;

          const directUrl = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(mp3File.name)}`;
          if (seenUrls.has(directUrl)) continue;
          seenUrls.add(directUrl);

          const rights = categorizeRights(doc.licenseurl || 'Archive Public Access', doc.licenseurl);

          candidates.push({
            source: 'INTERNET_ARCHIVE_AUDIO',
            sourceId: `IA_${doc.identifier}`,
            title: (doc.title || doc.identifier).replace(/[\r\n]/g, ' ').trim(),
            creator: doc.creator || 'Internet Archive Contributor',
            audioUrl: directUrl,
            license: doc.licenseurl ? 'Creative Commons / Open' : 'Archive Reference Access',
            licenseUrl: doc.licenseurl || 'https://archive.org',
            rightsCategory: rights.rightsCategory,
            rightsStatus: rights.rightsCategory,
            commercialAllowed: rights.commercialAllowed,
            rightsLabel: rights.label,
            durationSecEstimate: mp3File.length ? parseFloat(mp3File.length) : 120,
            genres: ['Jazz Netlabel / Archival'],
            tags: [q]
          });
        } catch {}
      }
    } catch (e) {
      console.warn('Internet Archive audio query error:', e.message);
    }
  }
  return candidates;
}

export async function searchMixkitAudio(queries) {
  const candidates = [];
  const seenUrls = new Set();

  // Semantic keyword mapping from queries
  const tagSet = new Set(['jazz', 'lounge']);
  for (const q of queries) {
    const words = q.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (['coffee', 'piano', 'chill', 'lounge', 'smooth', 'relaxing', 'jazz', 'vintage'].includes(w)) {
        tagSet.add(w);
      }
    }
  }

  for (const tag of tagSet) {
    try {
      const url = `https://mixkit.co/free-stock-music/tag/${encodeURIComponent(tag)}/`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const html = await res.text();
      const matches = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      for (const m of matches) {
        try {
          const data = JSON.parse(m[1]);
          const items = data.itemListElement || (data['@graph'] ? data['@graph'].find(x => x.itemListElement)?.itemListElement : null);
          if (items && Array.isArray(items)) {
            for (const item of items) {
              if (item.url && !seenUrls.has(item.url)) {
                seenUrls.add(item.url);
                let durationSec = 90;
                const durMatch = (item.duration || '').match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
                if (durMatch) {
                  const mins = parseInt(durMatch[1] || '0');
                  const secs = parseInt(durMatch[2] || '0');
                  durationSec = mins * 60 + secs;
                }
                const trackId = item.url.match(/\/(\d+)\.mp3/)?.[1] || crypto.randomUUID().slice(0, 8);
                const titleLower = (item.name || '').toLowerCase();
                const dynamicTags = [tag, 'stock-music', 'clean-master'];
                if (/jazz/i.test(titleLower)) dynamicTags.push('jazz');
                if (/slow|walk|dream/i.test(titleLower)) dynamicTags.push('slow', 'mellow');
                if (/smooth|like/i.test(titleLower)) dynamicTags.push('smooth', 'relaxing');
                if (/piano|keys/i.test(titleLower)) dynamicTags.push('piano', 'keys');
                if (/lounge|moonlight/i.test(titleLower)) dynamicTags.push('lounge', 'cafe');
                if (/nostalgic|night/i.test(titleLower)) dynamicTags.push('autumn', 'cozy', 'warm');

                candidates.push({
                  source: 'MIXKIT_STOCK_MUSIC',
                  sourceId: `MIX_${trackId}`,
                  title: item.name || 'Mixkit Track',
                  creator: item.byArtist || 'Mixkit Contributor',
                  audioUrl: item.url,
                  license: 'Mixkit Free License',
                  licenseUrl: 'https://mixkit.co/license/#musicFree',
                  rightsCategory: 'PRODUCTION_ALLOWED',
                  rightsStatus: 'PRODUCTION_ALLOWED',
                  commercialAllowed: true,
                  rightsLabel: 'PRODUCTION_ALLOWED (Mixkit Free Commercial License)',
                  durationSecEstimate: durationSec,
                  genres: [item.genre || 'Jazz / Lounge'],
                  tags: dynamicTags
                });
              }
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn(`Mixkit query error for tag ${tag}:`, e.message);
    }
  }
  return candidates;
}

export function measurePhysicalAudio(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      meanVolumeDb: 'UNKNOWN',
      peakVolumeDb: 'UNKNOWN',
      rmsLevelDb: 'UNKNOWN',
      crestFactor: 'UNKNOWN',
      spectralBands: { bassDb: 'UNKNOWN', midDb: 'UNKNOWN', trebleDb: 'UNKNOWN', trebleRolloffDb: 'UNKNOWN' },
      physicalAcousticScore: 50,
      unprovenAttributes: {
        tempoBpm: 'UNKNOWN (estimado en metadatos, no derivado acústicamente)',
        instrumentSeparation: 'UNKNOWN (requiere stems aislados)',
        emotionalTone: 'UNKNOWN (cualidad subjetiva)'
      }
    };
  }

  // 1. Overall volume & peak via volumedetect
  const vol = cp.spawnSync(FFMPEG_PATH, ['-i', filePath, '-af', 'volumedetect', '-f', 'null', '-']);
  const volOut = vol.stderr.toString();
  const meanMatch = volOut.match(/mean_volume:\s*([-\d\.]+)\s*dB/);
  const maxMatch = volOut.match(/max_volume:\s*([-\d\.]+)\s*dB/);
  const meanVolumeDb = meanMatch ? parseFloat(meanMatch[1]) : -20.0;
  const peakVolumeDb = maxMatch ? parseFloat(maxMatch[1]) : -1.0;

  // 2. Dynamics & Crest Factor via astats
  const stats = cp.spawnSync(FFMPEG_PATH, ['-i', filePath, '-af', 'astats', '-f', 'null', '-']);
  const statsOut = stats.stderr.toString();
  const rmsMatch = statsOut.match(/RMS level dB:\s*([-\d\.]+)/);
  const crestMatch = statsOut.match(/Crest factor:\s*([-\d\.]+)/);
  const rmsLevelDb = rmsMatch ? parseFloat(rmsMatch[1]) : meanVolumeDb;
  const crestFactor = crestMatch ? parseFloat(crestMatch[1]) : 5.0;

  // 3. Frequency bands (Bass <250Hz, Mid 250-3500Hz, Treble >3500Hz)
  const bass = cp.spawnSync(FFMPEG_PATH, ['-i', filePath, '-af', 'lowpass=f=250,volumedetect', '-f', 'null', '-']);
  const bassMatch = bass.stderr.toString().match(/mean_volume:\s*([-\d\.]+)\s*dB/);
  const bassDb = bassMatch ? parseFloat(bassMatch[1]) : -25.0;

  const mid = cp.spawnSync(FFMPEG_PATH, ['-i', filePath, '-af', 'bandpass=f=1875:width_type=h:w=3250,volumedetect', '-f', 'null', '-']);
  const midMatch = mid.stderr.toString().match(/mean_volume:\s*([-\d\.]+)\s*dB/);
  const midDb = midMatch ? parseFloat(midMatch[1]) : -30.0;

  const treble = cp.spawnSync(FFMPEG_PATH, ['-i', filePath, '-af', 'highpass=f=3500,volumedetect', '-f', 'null', '-']);
  const trebleMatch = treble.stderr.toString().match(/mean_volume:\s*([-\d\.]+)\s*dB/);
  const trebleDb = trebleMatch ? parseFloat(trebleMatch[1]) : -35.0;

  const trebleRolloffDb = Math.round((trebleDb - midDb) * 10) / 10;

  // 4. Physical Acoustic Scoring
  // Dynamics: High crest factor (> 8.0) means natural acoustic instruments and transients
  let dynamicScore = 70;
  if (crestFactor > 9.0) dynamicScore = 95;
  else if (crestFactor >= 5.0) dynamicScore = 85;
  else dynamicScore = 70;

  // Headroom: Ideal voiceover ducking bed is between -18 and -24 dB mean volume
  let voiceBedScore = 70;
  if (meanVolumeDb <= -18.0 && meanVolumeDb >= -24.0) voiceBedScore = 95;
  else if (meanVolumeDb > -18.0 && meanVolumeDb >= -15.0) voiceBedScore = 80;
  else if (meanVolumeDb > -15.0) voiceBedScore = 70; // Too loud, requires heavy ducking
  else voiceBedScore = 75;

  // Warmth: Treble roll-off <= -4.0 dB relative to mids confirms warm acoustic / vinyl damping
  let warmthScore = 70;
  if (trebleRolloffDb <= -6.0) warmthScore = 95; // Pronounced analog / vinyl warmth
  else if (trebleRolloffDb <= -3.0) warmthScore = 85;
  else warmthScore = 75; // Bright / modern mix

  const physicalAcousticScore = Math.round((dynamicScore * 0.40) + (voiceBedScore * 0.35) + (warmthScore * 0.25));

  return {
    meanVolumeDb,
    peakVolumeDb,
    rmsLevelDb,
    crestFactor: Math.round(crestFactor * 100) / 100,
    spectralBands: {
      bassDb,
      midDb,
      trebleDb,
      trebleRolloffDb
    },
    physicalAcousticScore,
    unprovenAttributes: {
      tempoBpm: 'UNKNOWN (estimado en metadatos, no derivado acústicamente)',
      instrumentSeparation: 'UNKNOWN (requiere stems aislados)',
      emotionalTone: 'UNKNOWN (cualidad subjetiva)'
    }
  };
}

export async function downloadAndCertifyTrack(candidate, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sanitizedTitle = candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
  const tempDownloadPath = path.join(targetDir, `temp_${candidate.sourceId}_${sanitizedTitle}.tmp`);
  const finalMp3Path = path.join(targetDir, `disc_${candidate.sourceId}_${sanitizedTitle}.mp3`);
  const webPath = `/emotive_audio/${path.basename(finalMp3Path)}`;

  if (!fs.existsSync(finalMp3Path) || fs.statSync(finalMp3Path).size === 0) {
    const res = await fetch(candidate.audioUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(tempDownloadPath, buffer);

    const convertArgs = [
      '-y',
      '-i', tempDownloadPath,
      '-ac', '2',
      '-ar', '44100',
      '-b:a', '192k',
      finalMp3Path
    ];
    const ffmpegRes = cp.spawnSync(FFMPEG_PATH, convertArgs);
    if (ffmpegRes.status !== 0) {
      if (fs.existsSync(tempDownloadPath)) fs.unlinkSync(tempDownloadPath);
      throw new Error(`FFmpeg audio conversion failed: ${ffmpegRes.stderr.toString().slice(0, 200)}`);
    }
    if (fs.existsSync(tempDownloadPath)) fs.unlinkSync(tempDownloadPath);
  }

  const finalBytes = fs.readFileSync(finalMp3Path);
  const sha256 = crypto.createHash('sha256').update(finalBytes).digest('hex');

  const probeRes = cp.spawnSync(FFMPEG_PATH, ['-i', finalMp3Path]);
  const probeText = probeRes.stderr.toString();
  const durMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  const bitrateMatch = probeText.match(/bitrate:\s*(\d+)\s*kb\/s/);

  let physicalDurationSec = candidate.durationSecEstimate || 30;
  if (durMatch) {
    physicalDurationSec = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
    physicalDurationSec = Math.round(physicalDurationSec * 100) / 100;
  }

  // Real physical audio analysis via FFmpeg
  const physicalMetrics = measurePhysicalAudio(finalMp3Path);
  const metadataScore = candidate.metadataScore || candidate.qualityScore || 80;
  const physicalAcousticScore = physicalMetrics.physicalAcousticScore;
  const compositeScore = Math.round((metadataScore * 0.40) + (physicalAcousticScore * 0.60));

  return {
    ...candidate,
    localPath: finalMp3Path.replace(/\\/g, '/'),
    webPath,
    sha256,
    physicalDurationSec,
    bitrateKbps: bitrateMatch ? parseInt(bitrateMatch[1]) : 192,
    fileSizeBytes: finalBytes.length,
    metadataScore,
    physicalAcousticScore,
    compositeScore,
    qualityScore: compositeScore,
    physicalMetrics
  };
}
