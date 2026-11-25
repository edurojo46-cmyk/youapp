/**
 * ATLAS — INDUSTRIAL SOURCE DISCOVERY FABRIC
 * Architecture Types & Contract Definitions
 */

export interface SourceHypothesis {
  classId: string;
  sourceFamily: string;
  sector: string;
  jurisdiction: string;
  description: string;
  hosts: string[];
  paths: string[];
  expectedEmailDensity: number;
  expectedSupplyPerWinner: number;
}

export interface CandidateSource {
  candidateId: string;
  classId: string;
  sourceFamily: string;
  url: string;
  host: string;
  sector: string;
  jurisdiction: string;
  protocol: 'HTTP' | 'HTTPS' | 'CKAN_API' | 'OAI_PMH';
  expectedEmailDensity: number;
  expectedSupply: number;
  generatedAt: string;
  originType?: 'EVIDENCE_DERIVED' | 'COMBINATORIAL_GUESSED';
  isControl?: boolean;
}

export interface CheapProbeResult {
  candidateId: string;
  url: string;
  host: string;
  accessible: boolean;
  httpStatus: number;
  contentType: string;
  latencyMs: number;
  bytesReceived: number;
  hasEmailSignal: boolean;
  hasArgentinaSignal: boolean;
  hasDirectorySignal?: boolean;
  contentSampled?: boolean;
  promising: boolean;
  originType?: 'EVIDENCE_DERIVED' | 'COMBINATORIAL_GUESSED';
  isControl?: boolean;
  failureReason?: string;
}

export interface CanaryResult {
  candidateId: string;
  url: string;
  sourceFamily: string;
  sector: string;
  jurisdiction: string;
  pagesSeen: number;
  pagesWithEmails: number;
  rawEmails: number;
  validEmails: number;
  uniqueEmails: number;
  alreadyExisting: number;
  trueNetNew: number;
  netNewRatio: number;
  decision: 'HIGH_YIELD_WINNER' | 'PRODUCTIVE' | 'LOW_YIELD' | 'KILL_FAST';
  calibratedSupply: number;
  latencyMs: number;
  sampleEmails: string[];
  subpagesExplored?: string[];
  originType?: 'EVIDENCE_DERIVED' | 'COMBINATORIAL_GUESSED';
  isControl?: boolean;
}

export interface FabricMetrics {
  durationSeconds: number;
  actualWallClockSeconds: number;
  benchmarkTimingValid: boolean;
  candidatesGenerated: number;
  candidatesDeduped: number;
  candidatesProbed: number;
  probesStarted: number;
  probesCompletedWithin60s: number;
  probesAbortedAtDeadline: number;
  avgProbeLatencyMs: number;
  p95ProbeLatencyMs: number;
  timeoutRate: number;
  accessibleSources: number;
  contentSampledCount: number;
  promisingCandidates: number;
  depthCanariesStarted: number;
  depthCanariesCompleted: number;
  canariesRun: number;
  avgPagesPerCanary: number;
  p95CanaryLatencyMs: number;
  depthCanaryRecall: number;
  productiveSources: number;
  highYieldWinners: number;
  trueNetNewSampleFound: number;
  calibratedReachableSupply: number;
  distinctHostsProbed: number;
  maxConcurrentPerHost: number;
  globalMaxConcurrency: number;
  candidatesPerSecond: number;
  probesPerSecond: number;
  probesPerMinute: number;
  productiveSourcesPerMinute: number;
  supplyDiscoveredPerMinute: number;
  productiveEcosystemsPerMinute: number;
  supportedSupplyPerMinute: number;
  dnsSuccessRate: number;
  httpAccessibleRate: number;
  contentSampleRate: number;
  evidenceDerivedCandidates: number;
  combinatorialCandidates: number;
  evidenceDerivedProductiveRate: number;
  combinatorialProductiveRate: number;
  controlSourcesTested: number;
  controlSourcesSignalDetected: number;
  probeSignalRecall: number;
  accessibleRate: number;
  signalRate: number;
  canaryToProductiveRate: number;
  productiveSourceRate: number;
  llmCallsTotal: number;
  llmCallsPer100k: number;
  primaryBottleneck: string;
  readyFor100kGate: boolean;
  finalStatus: string;
}




