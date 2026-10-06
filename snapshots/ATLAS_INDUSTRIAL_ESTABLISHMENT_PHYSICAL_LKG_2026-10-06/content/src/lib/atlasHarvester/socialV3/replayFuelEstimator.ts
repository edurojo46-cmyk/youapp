/**
 * replayFuelEstimator.ts — Estimador de Combustible y Profundidad del Buffer de Replay de Jetstream
 */

export interface ReplayFuelReport {
  headCursorUs: number;
  headTimestamp: string;
  retentionFloorCursorUs: number;
  retentionFloorTimestamp: string;
  historicalDepthAvailableHours: number;
  currentCursorUs: number;
  remainingHistoricalHours: number;
  averageEventsPerHour: number;
  estimatedEventsRemaining: number;
  rollingYields: {
    last100k: number;
    last500k: number;
    last1m: number;
  };
  conservativeYieldPerMillion: number;
  conservativeNetNewRemainingFuel: number;
  canSupportGoal200kAlone: boolean;
  projectedAtlasTotalFromReplay: number;
}

export class ReplayFuelEstimator {
  private endpoint: string;

  constructor(endpoint = 'wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post') {
    this.endpoint = endpoint;
  }

  async estimateFuel(
    currentCursorUs: number,
    rollingStats: { last100k: number; last500k: number; last1m: number },
    currentAtlasSize: number
  ): Promise<ReplayFuelReport> {
    const headCursorUs = Date.now() * 1000;
    const headTimestamp = new Date().toISOString();

    // Sondear el límite inferior (retention floor) probando cursores retrospectivos
    let retentionFloorHours = 24;
    for (const testHours of [72, 48, 42, 36, 30, 24]) {
      const probeUs = (Date.now() - testHours * 3600 * 1000) * 1000;
      const ok = await this.probeCursorAvailability(probeUs);
      if (ok) {
        retentionFloorHours = testHours;
        break;
      }
    }

    const retentionFloorCursorUs = (Date.now() - retentionFloorHours * 3600 * 1000) * 1000;
    const retentionFloorTimestamp = new Date(Date.now() - retentionFloorHours * 3600 * 1000).toISOString();
    const historicalDepthAvailableHours = retentionFloorHours;

    // Calcular horas restantes desde el cursor actual hasta el piso
    const remainingTimeUs = Math.max(0, currentCursorUs - retentionFloorCursorUs);
    const remainingHistoricalHours = +(remainingTimeUs / (3600 * 1000 * 1000)).toFixed(1);

    const averageEventsPerHour = 145000; // ~145k eventos de posts por hora observados
    const estimatedEventsRemaining = Math.round(remainingHistoricalHours * averageEventsPerHour);

    // Yield conservador (90% de la media de 1M)
    const baseYield = rollingStats.last1m > 0 ? rollingStats.last1m : (rollingStats.last100k || 13000);
    const conservativeYieldPerMillion = Math.round(baseYield * 0.85);

    const conservativeNetNewRemainingFuel = Math.round((estimatedEventsRemaining / 1000000) * conservativeYieldPerMillion);
    const projectedAtlasTotalFromReplay = currentAtlasSize + conservativeNetNewRemainingFuel;
    const canSupportGoal200kAlone = projectedAtlasTotalFromReplay >= 200000;

    return {
      headCursorUs,
      headTimestamp,
      retentionFloorCursorUs,
      retentionFloorTimestamp,
      historicalDepthAvailableHours,
      currentCursorUs,
      remainingHistoricalHours,
      averageEventsPerHour,
      estimatedEventsRemaining,
      rollingYields: rollingStats,
      conservativeYieldPerMillion,
      conservativeNetNewRemainingFuel,
      canSupportGoal200kAlone,
      projectedAtlasTotalFromReplay
    };
  }

  private async probeCursorAvailability(cursorUs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = `${this.endpoint}&cursor=${cursorUs}`;
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 3000);

      ws.onmessage = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });
  }
}
