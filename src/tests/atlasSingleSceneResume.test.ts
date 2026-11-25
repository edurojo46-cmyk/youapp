import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendApprovedSceneToCheckpoint,
  getPendingSceneIndexes,
  type CinematicProductionCheckpoint
} from '../../scripts/director/atlasSceneCheckpoint.ts';

const checkpointPath = path.resolve(
  process.cwd(),
  'server/data/atlas_cinematic_production_checkpoint.json'
);

afterEach(() => vi.restoreAllMocks());

describe('single-scene checkpoint resume', () => {
  it('limits processing to one pending scene and preserves the approved checkpoint entries', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const originalCheckpointText = fs.existsSync(checkpointPath)
      ? fs.readFileSync(checkpointPath, 'utf8')
      : undefined;
    const checkpoint: CinematicProductionCheckpoint = {
      status: 'BLOCKED_QUOTA',
      approvedScenes: Array.from({ length: 6 }, (_, index) => ({
        sceneIndex: index + 1,
        type: 'IMAGE' as const,
        situation: `Previously approved scene ${index + 1}`,
        targetEmotion: 'Awe',
        targetDurationSec: 10,
        assetPath: `scene-${index + 1}.jpg`,
        assetTitle: `Scene ${index + 1}`,
        geminiApproved: true,
        artisticScore: 85
      })),
      nextPendingSceneIndex: 7
    };
    const pendingIndexes = getPendingSceneIndexes(
      (checkpoint.nextPendingSceneIndex || 1) - 1,
      12,
      1
    );
    const processedScenes: number[] = [];

    for (const sceneIndex of pendingIndexes) {
      processedScenes.push(sceneIndex + 1);
    }

    const simulatedScene = {
      sceneIndex: processedScenes[0],
      type: 'IMAGE' as const,
      situation: 'Simulation only',
      targetEmotion: 'Awe',
      targetDurationSec: 10,
      assetPath: 'simulation-only.jpg',
      assetTitle: 'Simulation only',
      geminiApproved: true,
      artisticScore: 90
    };
    const simulatedCheckpoint = appendApprovedSceneToCheckpoint(checkpoint, simulatedScene);

    expect(processedScenes).toHaveLength(1);
    expect(pendingIndexes).toHaveLength(1);
    expect(simulatedCheckpoint.approvedScenes?.slice(0, checkpoint.approvedScenes?.length))
      .toEqual(checkpoint.approvedScenes);
    expect(simulatedCheckpoint.approvedScenes?.at(-1)).toEqual(simulatedScene);
    expect(simulatedCheckpoint.nextPendingSceneIndex).toBe(simulatedScene.sceneIndex + 1);
    expect(fetchSpy).not.toHaveBeenCalled();
    if (originalCheckpointText !== undefined) {
      expect(fs.readFileSync(checkpointPath, 'utf8')).toBe(originalCheckpointText);
    }
  });
});
