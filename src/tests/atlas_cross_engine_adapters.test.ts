import { describe, expect, it, vi } from "vitest";
import { AtlasPeopleSearchV2 } from "../lib/search/AtlasPeopleSearchV2";
import {
  createPeopleSearchAdapter, createIndustrialSearchAdapter, createSocialDiscoveryAdapter
} from "../lib/atlasCrossEngine/adapters";
import type { AtlasIndustrialSearchFabric } from "../lib/fabric/AtlasIndustrialSearchFabric";
import type { SocialPublicDiscoveryEngine } from "../lib/atlasSocialDiscovery/SocialPublicDiscoveryEngine";

describe("Atlas cross-engine adapters (isolated)", () => {
  it("maps people results only with explicit source provenance", async () => {
    vi.spyOn(AtlasPeopleSearchV2, "search").mockResolvedValueOnce({
      results: [{
        id: "p-1", atlas_person_id: "p-1", display_name: "Ana Test", profession: "Ingeniera",
        role: "Directora", organization: "Acme", geography: "Córdoba", location_relation_type: "",
        source_id: "registry-1", sources: ["registry-1"], evidence_badges: [], source_url: "https://example.org/p/1",
        evidence_state: "VERIFIED" as any, public_email: null, public_phone: null, social_profiles: [],
        last_seen_at: "2026-10-30T10:00:00.000Z", created_at: null
      } as any],
      has_more: false, page: 1, page_size: 20, db_query_ms: 1, api_total_ms: 1, evidence_state: "CURRENT"
    });
    const adapter = createPeopleSearchAdapter();
    const rows = await adapter.search({ text: "Ana", limitPerEngine: 10 });
    expect(rows[0]).toMatchObject({ recordId: "p-1", displayName: "Ana Test" });
    expect(rows[0].evidence[0]).toMatchObject({ sourceId: "registry-1", state: "observed" });
  });

  it("does not invent industrial evidence when the entity has no source fields", async () => {
    const fabric = {
      listRegisteredDomains: () => ["COMPANIES"],
      search: () => ({ results: [{ entity: {
        entity_id: "c-1", domain_id: "COMPANIES", entity_type: "COMPANY",
        canonical_status: "CANONICAL", attributes: { name: "Acme" },
        completeness_score: 80, completeness_tier: "MEDIUM",
        created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-30T00:00:00.000Z"
      } }] })
    } as unknown as AtlasIndustrialSearchFabric;
    const rows = await createIndustrialSearchAdapter(fabric).search({ text: "Acme" });
    expect(rows[0].evidence[0].state).toBe("unknown");
  });

  it("uses only the social discovery and resolution stages, not persistence", async () => {
    const engine = {
      discoverCandidates: vi.fn().mockResolvedValue([{
        platform: "GitHub", candidateId: "acme", publicProfileUrl: "https://github.com/acme",
        claimedJurisdiction: "Argentina"
      }]),
      resolveEntities: vi.fn().mockResolvedValue([{
        candidate: {
          platform: "GitHub", candidateId: "acme", publicProfileUrl: "https://github.com/acme",
          claimedJurisdiction: "Argentina"
        },
        entityName: "Acme", entityType: "ORGANIZATION", externalWebsites: ["https://acme.example"]
      }])
    } as unknown as SocialPublicDiscoveryEngine;
    const rows = await createSocialDiscoveryAdapter(engine).search({ text: "Acme", limitPerEngine: 5 });
    expect(rows[0]).toMatchObject({ recordId: "GitHub:acme", displayName: "Acme" });
    expect(rows[0].evidence[0]).toMatchObject({ sourceId: "unmapped_provenance", state: "unknown" });
    expect(engine.discoverCandidates).toHaveBeenCalledTimes(1);
    expect(engine.resolveEntities).toHaveBeenCalledTimes(1);
  });
});
