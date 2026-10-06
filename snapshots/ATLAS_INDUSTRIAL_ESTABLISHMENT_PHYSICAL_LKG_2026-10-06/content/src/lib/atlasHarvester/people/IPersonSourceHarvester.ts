import { ExternalPersonObservation } from '../../../lib/search/IExternalPersonSourceAdapter';

export interface HarvesterMetrics {
  rowsSeen: number;
  rowsInserted: number;
  rowsSkipped: number;
  rowsChanged: number;
  errorCount: number;
}

export interface IPersonSourceHarvester {
  /**
   * The canonical identifier for this source (e.g., 'ORGANIZATION_TECHCORP', 'ORCID_UBA').
   */
  getSourceId(): string;

  /**
   * Discovers the current version or manifest of the source to determine if harvesting is needed.
   */
  discoverSourceVersion(): Promise<string>;

  /**
   * Fetches raw data from the source.
   */
  fetch(): Promise<any>;

  /**
   * Parses the raw data into an intermediate representation.
   */
  parse(rawData: any): Promise<any[]>;

  /**
   * Normalizes the parsed data into strict ExternalPersonObservation objects.
   */
  normalize(parsedData: any[]): Promise<ExternalPersonObservation[]>;

  /**
   * Emits the normalized observations to the database (atlas_person_observations).
   */
  emitObservations(observations: ExternalPersonObservation[]): Promise<void>;

  /**
   * Checkpoints progress (useful for paginated APIs or large sites).
   */
  checkpoint(state: any): Promise<void>;

  /**
   * Returns metrics for the current run.
   */
  reportMetrics(): HarvesterMetrics;
  
  /**
   * Orchestrates the entire harvest run using the certified infrastructure.
   */
  run(): Promise<void>;
}
