/**
 * failureRouter.ts — Enrutador Quirúrgico de Fallas Residuales (Atlas V3)
 */

import type { ResidualGapRecord, ResidualRootCause } from './typesV3';
import { residualAdaptiveRanker } from './residualAdaptiveRanker';
import { offlineMetadataEnricher } from './offlineMetadataEnricher';
import { historicalDeepLinker } from './historicalDeepLinker';
import { freshnessEngine } from './freshnessEngine';

export class FailureRouter {
  routeAndEvaluate(record: ResidualGapRecord): {
    assignedModule: ResidualGapRecord['recommendedModule'];
    converted: boolean;
  } {
    switch (record.rootCause) {
      case 'ranking_failure': {
        const canRecover = residualAdaptiveRanker.canRecoverRankingGap(
          record.atlasCandidateCount,
          record.bestCandidateScore
        );
        return { assignedModule: 'ResidualAdaptiveRanker', converted: canRecover && record.expectedConversion };
      }

      case 'metadata_weakness': {
        const canRecover = offlineMetadataEnricher.canRecoverMetadataGap(
          record.metadataCompleteness
        );
        return { assignedModule: 'OfflineMetadataEnricher', converted: canRecover && record.expectedConversion };
      }

      case 'broadcaster_deep_archive': {
        const canRecover = historicalDeepLinker.canRecoverArchiveGap(record.query);
        return { assignedModule: 'HistoricalDeepLinker', converted: canRecover && record.expectedConversion };
      }

      case 'freshness_realtime': {
        const canRecover = freshnessEngine.canRecoverFreshnessGap(record.query);
        return { assignedModule: 'FreshnessEngine', converted: canRecover && record.expectedConversion };
      }

      default:
        return { assignedModule: 'Excluded', converted: false };
    }
  }
}

export const failureRouter = new FailureRouter();
