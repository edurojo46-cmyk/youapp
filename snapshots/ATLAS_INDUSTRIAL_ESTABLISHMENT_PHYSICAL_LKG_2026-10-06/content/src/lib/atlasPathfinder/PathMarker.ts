/**
 * ATLAS — AI PATHFINDER V1
 * Module: PathMarker (Section 10)
 * 
 * Maintains navigational clarity at every decision point:
 * WHERE AM I?
 * WHAT HAVE I ALREADY SOLVED?
 * WHAT IS STILL MISSING?
 * WHAT PATH AM I FOLLOWING?
 * WHY AM I FOLLOWING IT?
 * WHAT WOULD MAKE ME ABANDON IT?
 * WHAT IS THE NEXT ACTION?
 */

import type {
  PathMarkerState,
  PathPlan,
  CompletenessMap,
  PathfinderAction
} from './types.ts';

export class PathMarker {
  public static mark(
    stepName: string,
    currentPath: PathPlan,
    solvedGoals: string[],
    completenessMap: CompletenessMap,
    nextAction: PathfinderAction
  ): PathMarkerState {
    const missingItems: string[] = [];
    if (completenessMap.hasDiscoveryGap) missingItems.push('Target record quantity not yet achieved');
    if (completenessMap.hasEnrichmentGap) missingItems.push(`Incomplete required fields: [${completenessMap.weakestFields.join(', ')}]`);
    if (completenessMap.hasEvidenceGap) missingItems.push('Physical observation evidence threshold below 70%');
    if (completenessMap.hasCoverageGap) missingItems.push('Geographical / domain coverage gaps detected');

    const state: PathMarkerState = {
      whereAmI: stepName,
      whatHaveIAlreadySolved: [...solvedGoals],
      whatIsStillMissing: missingItems.length > 0 ? missingItems : ['None (Database satisfies mission objective)'],
      whatPathAmIFollowing: `${currentPath.name} (${currentPath.pathId})`,
      whyAmIFollowingIt: `Selected with path value ${currentPath.calculatedPathScore}, expected quality ${(currentPath.expectedQuality * 100).toFixed(0)}%, addressing ${completenessMap.recommendedMode}.`,
      whatWouldMakeMeAbandonIt: `Yield rate < 20% over 2 consecutive waves, high duplicate saturation, or zero verified evidence yield.`,
      whatIsTheNextAction: nextAction
    };

    return state;
  }
}
