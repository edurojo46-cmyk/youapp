/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasSourceFactory.ts
 * Path: src/lib/atlas/source-factory/AtlasSourceFactory.ts
 * 
 * Main Orchestrator for transforming DISCOVERED_NOT_EXECUTABLE into PROBED_EXECUTABLE_ROUTE.
 * Flow:
 * PENTA DISCOVERS SOURCE -> INSPECT -> CLASSIFY FORMAT -> GENERATE ADAPTER SPEC ->
 * SAFE PROBE -> PARSE SAMPLE -> CAPABILITY DISCOVERY -> MISSION/RESULT ADMISSION EVALUATION ->
 * REGISTER ROUTE IN GENOME -> TESLA CAN EXECUTE.
 * 
 * Strict Invariants:
 * - NO arbitrary TS/JS code generation.
 * - Reuses certified generic adapters.
 * - Does not invent historical performance (starts with attempts = 1, observed yield from probe).
 * - Separates supported_geo_levels from actual_geo_coverage.
 */

import { AtlasSourceInspector, type SourceInspectionResult } from './AtlasSourceInspector.ts';
import { AtlasAdapterSpecCompiler, type DeclarativeAdapterSpec } from './AtlasAdapterSpecCompiler.ts';
import { AtlasGeneratedAdapterValidator } from './AtlasGeneratedAdapterValidator.ts';
import { AtlasSafeProbeRunner, type SafeProbeResult } from './AtlasSafeProbeRunner.ts';
import { AtlasSourceFactoryRegistry, type DiscoveredSourceCandidate, type FactoryState } from './AtlasSourceFactoryRegistry.ts';
import { AtlasSourceGenomeRepository } from '../sources/AtlasSourceGenomeRepository.ts';
import type { AtlasSource, AtlasSourceRoute } from '../sources/AtlasSourceGenome.ts';
import type { AtlasSourceCapability } from '../sources/AtlasSourceCapability.ts';
import type { DiscoveredFormat } from './AtlasFormatDetector.ts';

export interface FactoryExecutionResult {
  source_id: string;
  route_id?: string;
  final_status: FactoryState;
  discovered_format: DiscoveredFormat;
  existing_adapter_reused: boolean;
  adapter_spec_created: boolean;
  probe_raw_rows: number;
  probe_parsed_rows: number;
  probe_admitted_rows: number;
  probe_gate_passed_rows: number;
  safe_probe_rows: number;
  parsed_rows: number;
  admitted_rows: number;
  certified_rows: number;
  route_registered: boolean;
  discovered_capabilities?: AtlasSourceCapability;
  failure_reason?: string;
  inspection?: SourceInspectionResult;
  adapter_spec?: DeclarativeAdapterSpec;
  probe_result?: SafeProbeResult;
}

export class AtlasSourceFactory {
  private static instance: AtlasSourceFactory;
  private registry: AtlasSourceFactoryRegistry;
  private genomeRepo: AtlasSourceGenomeRepository;

  public constructor(genomeRepo?: AtlasSourceGenomeRepository) {
    this.registry = AtlasSourceFactoryRegistry.getInstance();
    this.genomeRepo = genomeRepo || AtlasSourceGenomeRepository.getInstance();
  }

  public static getInstance(genomeRepo?: AtlasSourceGenomeRepository): AtlasSourceFactory {
    if (!AtlasSourceFactory.instance) {
      AtlasSourceFactory.instance = new AtlasSourceFactory(genomeRepo);
    }
    return AtlasSourceFactory.instance;
  }

  /**
   * Transforms an uninspected or non-executable source candidate into a certified executable route.
   */
  public async inspectAndPromote(
    candidate: DiscoveredSourceCandidate,
    missionSpec?: any
  ): Promise<FactoryExecutionResult> {
    const source_id = candidate.source_id;
    this.registry.registerCandidate(candidate);

    // 1. INSPECT
    this.registry.updateState(source_id, 'INSPECTING');
    const inspection = await AtlasSourceInspector.inspect(source_id, candidate.location, missionSpec);

    if (!inspection.source_exists_physically) {
      this.registry.updateState(source_id, 'PROBE_FAILED', inspection.error || 'Physical source does not exist');
      return {
        source_id,
        final_status: 'PROBE_FAILED',
        discovered_format: inspection.format_info.format,
        existing_adapter_reused: false,
        adapter_spec_created: false,
        probe_raw_rows: 0,
        probe_parsed_rows: 0,
        probe_admitted_rows: 0,
        probe_gate_passed_rows: 0,
        safe_probe_rows: 0,
        parsed_rows: 0,
        admitted_rows: 0,
        certified_rows: 0,
        route_registered: false,
        failure_reason: inspection.error || 'SOURCE_EXISTS_PHYSICALLY = FALSE'
      };
    }

    this.registry.updateState(source_id, 'INSPECTED');

    // 2. CLASSIFY FORMAT & GENERATE ADAPTER SPEC
    const adapterSpec = AtlasAdapterSpecCompiler.compile(inspection);

    if (adapterSpec.needs_new_adapter) {
      const reason = adapterSpec.compilation_notes.join('; ') || 'Format or schema incompatible with existing adapters';
      this.registry.updateState(source_id, 'NEEDS_NEW_ADAPTER', reason);
      return {
        source_id,
        final_status: 'NEEDS_NEW_ADAPTER',
        discovered_format: adapterSpec.format,
        existing_adapter_reused: false,
        adapter_spec_created: false,
        probe_raw_rows: 0,
        probe_parsed_rows: 0,
        probe_admitted_rows: 0,
        probe_gate_passed_rows: 0,
        safe_probe_rows: 0,
        parsed_rows: 0,
        admitted_rows: 0,
        certified_rows: 0,
        route_registered: false,
        failure_reason: reason,
        inspection,
        adapter_spec: adapterSpec
      };
    }

    this.registry.updateState(source_id, 'ADAPTER_SPEC_CREATED');

    // 3. VALIDATE ADAPTER SPEC
    const validation = AtlasGeneratedAdapterValidator.validate(adapterSpec);
    if (!validation.valid) {
      const reason = validation.errors.join('; ');
      this.registry.updateState(source_id, 'PROBE_FAILED', reason);
      return {
        source_id,
        final_status: 'PROBE_FAILED',
        discovered_format: adapterSpec.format,
        existing_adapter_reused: adapterSpec.reused_existing_adapter,
        adapter_spec_created: true,
        probe_raw_rows: 0,
        probe_parsed_rows: 0,
        probe_admitted_rows: 0,
        probe_gate_passed_rows: 0,
        safe_probe_rows: 0,
        parsed_rows: 0,
        admitted_rows: 0,
        certified_rows: 0,
        route_registered: false,
        failure_reason: reason,
        inspection,
        adapter_spec: adapterSpec
      };
    }

    // 4. SAFE PROBE
    this.registry.updateState(source_id, 'PROBE_PENDING');
    const probe = await AtlasSafeProbeRunner.executeProbe(source_id, candidate.location, adapterSpec, {
      domain: candidate.domain,
      location: candidate.location,
      geo_province: missionSpec?.geo_province
    });

    if (!probe.probe_passed) {
      const reason = probe.failure_reason || 'Safe probe failed admission criteria';
      this.registry.updateState(source_id, 'PROBE_FAILED', reason);
      return {
        source_id,
        final_status: 'PROBE_FAILED',
        discovered_format: adapterSpec.format,
        existing_adapter_reused: adapterSpec.reused_existing_adapter,
        adapter_spec_created: true,
        probe_raw_rows: probe.probe_raw_rows,
        probe_parsed_rows: probe.probe_parsed_rows,
        probe_admitted_rows: probe.probe_admitted_rows,
        probe_gate_passed_rows: probe.probe_gate_passed_rows,
        safe_probe_rows: probe.raw_rows,
        parsed_rows: probe.parsed_rows,
        admitted_rows: probe.admitted_rows,
        certified_rows: 0,
        route_registered: false,
        failure_reason: reason,
        inspection,
        adapter_spec: adapterSpec,
        probe_result: probe
      };
    }

    this.registry.updateState(source_id, 'PROBE_PASSED');

    // 5. PROMOTE TO EXECUTABLE & REGISTER IN GENOME
    const route_id = `ROUTE_${source_id}_AUTO`;
    const observedYield = Math.round((probe.admitted_rows / Math.max(1, probe.raw_rows)) * 100) / 100;

    const sourceRecord: AtlasSource = {
      source_id,
      source_family: candidate.source_family || 'AUTO_PROVISIONED_SOURCE',
      domain: candidate.domain,
      access_method: adapterSpec.format === 'REST_JSON_API' || adapterSpec.format === 'CKAN' ? 'API_POLL' : 'FILE_OR_STREAM',
      format: adapterSpec.format,
      entity_types: probe.discovered_capabilities.supported_entity_types,
      geo_coverage: probe.discovered_capabilities.actual_geo_coverage,
      attributes: probe.observed_attributes,
      supports_person: probe.discovered_capabilities.supports_person,
      supports_company: probe.discovered_capabilities.supports_company,
      supports_email: probe.discovered_capabilities.supports_email,
      supports_phone: probe.discovered_capabilities.supports_phone,
      supports_linkedin: probe.discovered_capabilities.supports_linkedin,
      supports_geo_levels: probe.discovered_capabilities.supported_geo_levels,
      quality_score: 0.88,
      quality_nature: 'SEEDED',
      yield_history: [observedYield],
      yield_nature: 'OBSERVED',
      success_rate: 1.0,
      success_rate_nature: 'OBSERVED',
      latency: probe.latency_ms,
      latency_nature: 'OBSERVED',
      cost_class: 'FREE',
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      last_probe: probe.probed_at,
      last_success: probe.probed_at,
      status: 'ACTIVE',
      physical_origin: candidate.location,
      source_exists_physically: true
    };

    const routeRecord: AtlasSourceRoute = {
      route_id,
      source_id,
      endpoint: candidate.location,
      adapter_id: adapterSpec.adapter_id,
      capabilities: probe.discovered_capabilities,
      executable: true,
      last_probe: probe.probed_at,
      yield: observedYield,
      yield_nature: 'OBSERVED',
      attempts: 1,
      errors: [],
      cost_class: 'FREE',
      latency: probe.latency_ms,
      quality_score: 0.88,
      physical_origin: candidate.location,
      source_exists_physically: true
    };

    await this.genomeRepo.registerSource(sourceRecord);
    await this.genomeRepo.registerRoute(routeRecord);

    await this.genomeRepo.recordObservation({
      source_id,
      route_id,
      success: true,
      raw_rows: probe.probe_raw_rows,
      admitted_rows: probe.probe_admitted_rows,
      certified_rows: 0, // Probe does NOT claim certified rows without canonical persistence
      latency_ms: probe.latency_ms,
      error_class: null
    });

    this.registry.updateState(source_id, 'EXECUTABLE');

    return {
      source_id,
      route_id,
      final_status: 'EXECUTABLE',
      discovered_format: adapterSpec.format,
      existing_adapter_reused: adapterSpec.reused_existing_adapter,
      adapter_spec_created: true,
      probe_raw_rows: probe.probe_raw_rows,
      probe_parsed_rows: probe.probe_parsed_rows,
      probe_admitted_rows: probe.probe_admitted_rows,
      probe_gate_passed_rows: probe.probe_gate_passed_rows,
      safe_probe_rows: probe.raw_rows,
      parsed_rows: probe.parsed_rows,
      admitted_rows: probe.admitted_rows,
      certified_rows: 0, // Strict invariant: Certified rows requires canonical persistence
      route_registered: true,
      discovered_capabilities: probe.discovered_capabilities,
      inspection,
      adapter_spec: adapterSpec,
      probe_result: probe
    };
  }
}
