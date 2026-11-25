/**
 * Atlas Cross-Engine Intelligence V1 — isolated shadow coordinator.
 * Opt-in only: no production imports, writes, routing changes, or identity merges.
 */
import type { AtlasCrossEngineAdapter, AtlasCrossEngineCandidateLink, AtlasCrossEngineEvidence, AtlasCrossEngineId, AtlasCrossEngineQuery, AtlasCrossEngineRecord, AtlasCrossEngineReport } from "./contracts";

function validEvidence(items: AtlasCrossEngineEvidence[]): boolean {
  return items.some(item =>
    !!item.sourceId?.trim() &&
    Number.isFinite(Date.parse(item.observedAt)) &&
    (item.state === "verified" || item.state === "observed") &&
    (item.confidence === undefined || (Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1))
  );
}
function validateRecord(record: AtlasCrossEngineRecord): string | null {
  if (!record || typeof record !== "object") return "record_not_object";
  if (!record.recordId?.trim()) return "missing_record_id";
  if (!record.entityType?.trim()) return "missing_entity_type";
  if (!record.displayName?.trim()) return "missing_display_name";
  if (!record.attributes || typeof record.attributes !== "object" || Array.isArray(record.attributes)) return "invalid_attributes";
  if (!Array.isArray(record.evidence) || !validEvidence(record.evidence)) return "missing_or_untrusted_provenance";
  return null;
}
function buildCandidateLinks(records: AtlasCrossEngineReport["records"]): AtlasCrossEngineCandidateLink[] {
  const refs = new Map<string, Array<{ engineId: AtlasCrossEngineId; recordId: string }>>();
  for (const item of records) for (const ref of item.record.externalReferences ?? []) {
    if (!ref.namespace?.trim() || !ref.value?.trim()) continue;
    const key = ref.namespace.trim().toLowerCase() + ":" + ref.value.trim().toLowerCase();
    refs.set(key, [...(refs.get(key) ?? []), { engineId: item.engineId, recordId: item.record.recordId }]);
  }
  const links: AtlasCrossEngineCandidateLink[] = [];
  for (const [reference, group] of refs) {
    const engineIds = [...new Set(group.map(item => item.engineId))];
    if (engineIds.length < 2) continue;
    links.push({ reference, engineIds, recordIds: [...new Set(group.map(item => item.recordId))], status: "candidate_requires_verification" });
  }
  return links;
}

export class AtlasCrossEngineCoordinator {
  public async run(query: AtlasCrossEngineQuery, adapters: AtlasCrossEngineAdapter[]): Promise<AtlasCrossEngineReport> {
    if (!query.text?.trim()) throw new Error("Cross-engine query text is required.");
    const selected = query.engines?.length ? adapters.filter(a => query.engines!.includes(a.engineId)) : adapters;
    const seen = new Set<AtlasCrossEngineId>();
    for (const adapter of selected) {
      if (seen.has(adapter.engineId)) throw new Error("Only one adapter per engine is allowed: " + adapter.engineId);
      seen.add(adapter.engineId);
    }
    const enginesRequested = selected.map(a => a.engineId);
    const settled = await Promise.allSettled(selected.map(a => a.search({ ...query, engines: undefined })));
    const records: AtlasCrossEngineReport["records"] = [];
    const failures: AtlasCrossEngineReport["failures"] = [];
    const rejected: AtlasCrossEngineReport["rejected"] = [];
    const enginesSucceeded: AtlasCrossEngineId[] = [];
    settled.forEach((result, index) => {
      const engineId = selected[index].engineId;
      if (result.status === "rejected") {
        failures.push({ engineId, message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
        return;
      }
      enginesSucceeded.push(engineId);
      if (!Array.isArray(result.value)) {
        failures.push({ engineId, message: "Adapter returned a non-array result." });
        return;
      }
      const limit = Math.max(1, Math.min(100, query.limitPerEngine ?? 20));
      for (const record of result.value.slice(0, limit)) {
        const reason = validateRecord(record);
        if (reason) rejected.push({ engineId, recordId: record?.recordId ?? "unknown", reason });
        else records.push({ engineId, record });
      }
    });
    return { query: query.text, records, failures, rejected, candidateLinks: buildCandidateLinks(records), enginesRequested, enginesSucceeded, executionMode: "isolated_shadow" };
  }
}
