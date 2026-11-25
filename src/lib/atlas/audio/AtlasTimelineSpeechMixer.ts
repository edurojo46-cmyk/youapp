import fs from 'fs';
import path from 'path';

export function composeTimelineWav({
  totalDurationSec = 120,
  targetSampleRate = 44100,
  tracks = []
}) {
  const totalSamples = Math.floor(totalDurationSec * targetSampleRate);
  // Stereo 16-bit: 2 channels * 2 bytes = 4 bytes per sample frame
  const leftChannel = new Float32Array(totalSamples);
  const rightChannel = new Float32Array(totalSamples);

  for (const track of tracks) {
    if (!fs.existsSync(track.filePath)) {
      throw new Error(`Track file not found: ${track.filePath}`);
    }
    const buf = fs.readFileSync(track.filePath);
    // Parse standard WAV header
    const numChannels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    
    // Find 'data' chunk
    let dataOffset = 12;
    while (dataOffset < buf.length - 8) {
      const chunkId = buf.toString('ascii', dataOffset, dataOffset + 4);
      const chunkSize = buf.readUInt32LE(dataOffset + 4);
      if (chunkId === 'data') {
        dataOffset += 8;
        break;
      }
      dataOffset += 8 + chunkSize;
    }

    const volume = track.volume || 1.0;
    const startSample = Math.floor((track.startSec || 0) * targetSampleRate);
    const numInputSamples = Math.floor((buf.length - dataOffset) / (numChannels * (bitsPerSample / 8)));

    for (let i = 0; i < numInputSamples; i++) {
      let rawSampleL = 0;
      let rawSampleR = 0;

      if (bitsPerSample === 16) {
        const byteIdx = dataOffset + i * numChannels * 2;
        if (byteIdx + 2 > buf.length) break;
        rawSampleL = buf.readInt16LE(byteIdx) / 32768.0;
        if (numChannels === 1) {
          rawSampleR = rawSampleL;
        } else {
          rawSampleR = buf.readInt16LE(byteIdx + 2) / 32768.0;
        }
      }

      // Resample to targetSampleRate if needed (e.g. 22050 -> 44100)
      const ratio = targetSampleRate / sampleRate;
      const targetBaseIdx = startSample + Math.floor(i * ratio);
      const targetSteps = Math.round(ratio);

      for (let s = 0; s < targetSteps; s++) {
        const outIdx = targetBaseIdx + s;
        if (outIdx >= 0 && outIdx < totalSamples) {
          leftChannel[outIdx] += rawSampleL * volume;
          rightChannel[outIdx] += rawSampleR * volume;
        }
      }
    }
  }

  // Convert float arrays to 16-bit PCM WAV buffer
  const dataSize = totalSamples * 4;
  const outBuf = Buffer.alloc(44 + dataSize);

  outBuf.write('RIFF', 0);
  outBuf.writeUInt32LE(36 + dataSize, 4);
  outBuf.write('WAVE', 8);
  outBuf.write('fmt ', 12);
  outBuf.writeUInt32LE(16, 16);
  outBuf.writeUInt16LE(1, 20); // PCM
  outBuf.writeUInt16LE(2, 22); // Stereo
  outBuf.writeUInt32LE(targetSampleRate, 24);
  outBuf.writeUInt32LE(targetSampleRate * 4, 28);
  outBuf.writeUInt16LE(4, 32); // Block align
  outBuf.writeUInt16LE(16, 34); // Bits per sample
  outBuf.write('data', 36);
  outBuf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1.0, Math.min(1.0, leftChannel[i]));
    const r = Math.max(-1.0, Math.min(1.0, rightChannel[i]));
    outBuf.writeInt16LE(Math.floor(l * 32767), 44 + i * 4);
    outBuf.writeInt16LE(Math.floor(r * 32767), 44 + i * 4 + 2);
  }

  return outBuf;
}

export function getWavDurationSec(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Track file not found: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  let dataOffset = 12;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const dataBytes = buf.length - dataOffset;
  const bytesPerSampleFrame = numChannels * (bitsPerSample / 8);
  return dataBytes / (sampleRate * bytesPerSampleFrame);
}

export interface SpeechTrackInfo {
  filePath: string;
  startSec: number;
  durationSec?: number;
  label?: string;
  volume?: number;
  isDramaticPauseFollower?: boolean;
}

export interface VisualSceneInfo {
  name: string;
  startSec: number;
  durationSec: number;
  endSec?: number;
}

export interface PacingAuditReport {
  totalTimelineDurationSec: number;
  totalSpokenDurationSec: number;
  voiceCoveragePercent: number;
  pauses: Array<{
    fromTrack: string;
    toTrack: string;
    gapStartSec: number;
    gapEndSec: number;
    durationSec: number;
    status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCESSIVE';
  }>;
  excessivePausesCount: number;
  maxPauseSec: number;
  minPauseSec: number;
  avgPauseSec: number;
  sceneSyncAudits: Array<{
    sceneName: string;
    sceneStartSec: number;
    accompaniedSpeechLabel: string;
    speechStartSec: number;
    speechEndSec: number;
    leadOrDelaySec: number;
    syncStatus: 'PERFECT_SYNC' | 'ACCEPTABLE_SYNC' | 'LAG_EXCESSIVE';
  }>;
  sceneSyncPass: boolean;
  overallStatus: 'PASS' | 'FAIL';
}

export function auditTimelinePacing({
  totalDurationSec = 120,
  tracks = [] as SpeechTrackInfo[],
  visualScenes = [] as VisualSceneInfo[],
  maxAllowedPauseSec = 3.0
}): PacingAuditReport {
  // Sort tracks by startSec
  const sortedTracks = tracks
    .map(t => ({
      ...t,
      durationSec: t.durationSec ?? getWavDurationSec(t.filePath)
    }))
    .sort((a, b) => a.startSec - b.startSec);

  let totalSpokenDurationSec = 0;
  for (const t of sortedTracks) {
    totalSpokenDurationSec += t.durationSec;
  }

  const pauses: PacingAuditReport['pauses'] = [];
  let maxPauseSec = 0;
  let minPauseSec = 999;
  let totalPauseTime = 0;

  for (let i = 0; i < sortedTracks.length - 1; i++) {
    const cur = sortedTracks[i];
    const nxt = sortedTracks[i + 1];
    const curEnd = cur.startSec + cur.durationSec;
    const gap = Math.max(0, nxt.startSec - curEnd);

    let status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCESSIVE' = 'OPTIMAL';
    if (gap > maxAllowedPauseSec && !cur.isDramaticPauseFollower) {
      status = 'EXCESSIVE';
    } else if (gap > 2.0) {
      status = 'ACCEPTABLE';
    }

    pauses.push({
      fromTrack: cur.label || path.basename(cur.filePath),
      toTrack: nxt.label || path.basename(nxt.filePath),
      gapStartSec: parseFloat(curEnd.toFixed(2)),
      gapEndSec: parseFloat(nxt.startSec.toFixed(2)),
      durationSec: parseFloat(gap.toFixed(2)),
      status
    });

    if (gap > maxPauseSec) maxPauseSec = gap;
    if (gap < minPauseSec) minPauseSec = gap;
    totalPauseTime += gap;
  }

  const excessivePausesCount = pauses.filter(p => p.status === 'EXCESSIVE').length;
  const avgPauseSec = pauses.length > 0 ? totalPauseTime / pauses.length : 0;

  // Scene sync check
  const sceneSyncAudits: PacingAuditReport['sceneSyncAudits'] = [];
  let sceneSyncPass = true;

  for (const scene of visualScenes) {
    const sceneStart = scene.startSec;
    const sceneEnd = scene.endSec || (sceneStart + scene.durationSec);

    // Find speech track that covers or starts shortly after scene cut
    let matchedTrack: (typeof sortedTracks)[0] | null = null;
    let minDiff = 999;

    for (const t of sortedTracks) {
      const tEnd = t.startSec + t.durationSec;
      // Either speech was already ongoing when scene cut happened, or starts within 2.5s of cut
      if (t.startSec <= sceneStart + 0.1 && tEnd >= sceneStart) {
        matchedTrack = t;
        minDiff = 0;
        break;
      } else if (t.startSec >= sceneStart && (t.startSec - sceneStart) < minDiff) {
        matchedTrack = t;
        minDiff = t.startSec - sceneStart;
      }
    }

    if (matchedTrack && minDiff <= 2.0) {
      const tEnd = matchedTrack.startSec + matchedTrack.durationSec;
      sceneSyncAudits.push({
        sceneName: scene.name,
        sceneStartSec: sceneStart,
        accompaniedSpeechLabel: matchedTrack.label || path.basename(matchedTrack.filePath),
        speechStartSec: parseFloat(matchedTrack.startSec.toFixed(2)),
        speechEndSec: parseFloat(tEnd.toFixed(2)),
        leadOrDelaySec: parseFloat(minDiff.toFixed(2)),
        syncStatus: minDiff <= 1.0 ? 'PERFECT_SYNC' : 'ACCEPTABLE_SYNC'
      });
    } else {
      sceneSyncPass = false;
      sceneSyncAudits.push({
        sceneName: scene.name,
        sceneStartSec: sceneStart,
        accompaniedSpeechLabel: matchedTrack?.label || 'NONE',
        speechStartSec: matchedTrack?.startSec || 0,
        speechEndSec: (matchedTrack?.startSec || 0) + (matchedTrack?.durationSec || 0),
        leadOrDelaySec: parseFloat(minDiff.toFixed(2)),
        syncStatus: 'LAG_EXCESSIVE'
      });
    }
  }

  const voiceCoveragePercent = (totalSpokenDurationSec / totalDurationSec) * 100;
  const overallStatus = excessivePausesCount === 0 && sceneSyncPass ? 'PASS' : 'FAIL';

  return {
    totalTimelineDurationSec: totalDurationSec,
    totalSpokenDurationSec: parseFloat(totalSpokenDurationSec.toFixed(2)),
    voiceCoveragePercent: parseFloat(voiceCoveragePercent.toFixed(1)),
    pauses,
    excessivePausesCount,
    maxPauseSec: parseFloat(maxPauseSec.toFixed(2)),
    minPauseSec: pauses.length > 0 ? parseFloat(minPauseSec.toFixed(2)) : 0,
    avgPauseSec: parseFloat(avgPauseSec.toFixed(2)),
    sceneSyncAudits,
    sceneSyncPass,
    overallStatus
  };
}
