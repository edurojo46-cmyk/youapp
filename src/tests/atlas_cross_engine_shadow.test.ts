import { describe, expect, it, vi } from "vitest";
import { AtlasCrossEngineCoordinator } from "../lib/atlasCrossEngine/AtlasCrossEngineCoordinator";
import type { AtlasCrossEngineAdapter, AtlasCrossEngineRecord } from "../lib/atlasCrossEngine/contracts";

const record = (id: string, ref?: string): AtlasCrossEngineRecord => ({
  recordId: id, entityType: "ORGANIZATION", displayName: "Empresa de prueba",
  attributes: { sector: "industrial" },
  evidence: [{ sourceId: "registry", sourceUrl: "https://example.org/record", observedAt: "2026-10-29T12:00:00.000Z", state: "verified", confidence: 0.98 }],
  externalReferences: ref ? [{ namespace: "cuit", value: ref }] : []
});
const adapter = (engineId: "people" | "industrial" | "social", search: AtlasCrossEngineAdapter["search"]): AtlasCrossEngineAdapter => ({ engineId, search });

describe("Atlas Cross-Engine Intelligence — isolated shadow contract", () => {
  it("fans out and preserves engine ownership", async () => {
    const people = adapter("people", vi.fn().mockResolvedValue([record("p1")]));
    const industrial = adapter("industrial", vi.fn().mockResolvedValue([record("i1")]));
    const report = await new AtlasCrossEngineCoordinator().run({ text: "fabricantes agrícolas" }, [people, industrial]);
    expect(report.records.map(item => item.engineId)).toEqual(["people", "industrial"]);
    expect(report.executionMode).toBe("isolated_shadow");
    expect(report.failures).toHaveLength(0);
  });
  it("isolates an engine failure", async () => {
    const good = adapter("industrial", vi.fn().mockResolvedValue([record("i1")]));
    const bad = adapter("social", vi.fn().mockRejectedValue(new Error("offline")));
    const report = await new AtlasCrossEngineCoordinator().run({ text: "consulta" }, [good, bad]);
    expect(report.records).toHaveLength(1);
    expect(report.failures).toEqual([{ engineId: "social", message: "offline" }]);
  });
  it("rejects records without trusted provenance", async () => {
    const invalid = record("bad");
    invalid.evidence = [{ sourceId: "demo", observedAt: "2026-10-29", state: "synthetic" }];
    const report = await new AtlasCrossEngineCoordinator().run({ text: "consulta" }, [adapter("industrial", vi.fn().mockResolvedValue([invalid]))]);
    expect(report.records).toHaveLength(0);
    expect(report.rejected[0].reason).toBe("missing_or_untrusted_provenance");
  });
  it("emits review candidates without merging identities", async () => {
    const a = adapter("industrial", vi.fn().mockResolvedValue([record("company-1", "30-123")]));
    const b = adapter("social", vi.fn().mockResolvedValue([record("social-1", "30-123")]));
    const report = await new AtlasCrossEngineCoordinator().run({ text: "consulta" }, [a, b]);
    expect(report.records).toHaveLength(2);
    expect(report.candidateLinks[0]).toMatchObject({ reference: "cuit:30-123", engineIds: ["industrial", "social"], status: "candidate_requires_verification" });
  });
  it("supports opt-in engine selection and rejects duplicate adapters", async () => {
    const people = adapter("people", vi.fn().mockResolvedValue([record("p1")]));
    const industrial = adapter("industrial", vi.fn().mockResolvedValue([record("i1")]));
    const report = await new AtlasCrossEngineCoordinator().run({ text: "consulta", engines: ["people"] }, [people, industrial]);
    expect(report.enginesRequested).toEqual(["people"]);
    await expect(new AtlasCrossEngineCoordinator().run({ text: "consulta" }, [people, people])).rejects.toThrow("Only one adapter per engine");
  });
});
