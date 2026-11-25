import { AtlasPeopleSearchV2 } from "../search/AtlasPeopleSearchV2";
import type { AtlasPeopleSearchParams, PersonSearchResultItem } from "../search/AtlasPeopleSearchV2";
import type { AtlasIndustrialSearchFabric } from "../fabric/AtlasIndustrialSearchFabric";
import type { AtlasEntity } from "../fabric/contracts/AtlasEntity";
import type { SocialPublicDiscoveryEngine } from "../atlasSocialDiscovery/SocialPublicDiscoveryEngine";
import type { ResolvedSocialEntity } from "../atlasSocialDiscovery/SocialPublicDiscoveryEngine";
import type { AtlasCrossEngineAdapter, AtlasCrossEngineEvidence, AtlasCrossEngineQuery, AtlasCrossEngineRecord } from "./contracts";

const validDate = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
};
const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function evidence(sourceId: unknown, sourceUrl: unknown, observedAt: unknown, confidence?: unknown): AtlasCrossEngineEvidence[] {
  const id = nonEmpty(sourceId);
  const url = nonEmpty(sourceUrl);
  const date = validDate(observedAt);
  if (!id || !url || !date) return [{ sourceId: "unmapped_provenance", observedAt: new Date(0).toISOString(), state: "unknown" }];
  const score = typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : undefined;
  return [{ sourceId: id, sourceUrl: url, observedAt: date, state: "observed", ...(score === undefined ? {} : { confidence: score }) }];
}

function personRecord(person: PersonSearchResultItem): AtlasCrossEngineRecord {
  const refs = Array.isArray(person.social_profiles)
    ? person.social_profiles.flatMap((profile: any) => {
        const namespace = nonEmpty(profile?.platform || profile?.network);
        const value = nonEmpty(profile?.url || profile?.profile_url || profile?.username);
        return namespace && value ? [{ namespace: namespace.toLowerCase(), value }] : [];
      })
    : [];
  return {
    recordId: person.atlas_person_id || person.id,
    entityType: "PERSON",
    displayName: person.display_name,
    attributes: {
      profession: person.profession, role: person.role, organization: person.organization,
      geography: person.geography, evidenceState: person.evidence_state,
      sourceIds: person.sources, evidenceBadges: person.evidence_badges,
      publicWebsite: person.public_website || null, socialProfiles: person.social_profiles || []
    },
    evidence: evidence(person.source_id, person.source_url, person.last_seen_at || person.created_at),
    externalReferences: refs
  };
}

export function createPeopleSearchAdapter(): AtlasCrossEngineAdapter {
  return {
    engineId: "people",
    async search(query: AtlasCrossEngineQuery) {
      const params: AtlasPeopleSearchParams = {
        query: query.text, geography: query.geography, page: 1,
        limit: Math.min(100, Math.max(1, query.limitPerEngine ?? 20))
      };
      const response = await AtlasPeopleSearchV2.search(params);
      return response.results.map(personRecord);
    }
  };
}

function industrialRecord(entity: AtlasEntity): AtlasCrossEngineRecord {
  const attrs = entity.attributes || {};
  const references = ["cuit", "cuit_normalized", "tax_id", "website", "domain", "linkedin_url"]
    .flatMap(key => {
      const value = nonEmpty(attrs[key]);
      return value ? [{ namespace: key, value }] : [];
    });
  return {
    recordId: entity.entity_id,
    entityType: entity.entity_type,
    displayName: nonEmpty(attrs.name || attrs.legal_name || attrs.title || attrs.full_name) || entity.entity_id,
    attributes: { ...attrs, domainId: entity.domain_id, canonicalStatus: entity.canonical_status },
    evidence: evidence(attrs.source_id, attrs.source_url, attrs.observed_at || attrs.updated_at, attrs.confidence),
    externalReferences: references
  };
}

export function createIndustrialSearchAdapter(fabric: AtlasIndustrialSearchFabric): AtlasCrossEngineAdapter {
  return {
    engineId: "industrial",
    async search(query: AtlasCrossEngineQuery) {
      const limit = Math.min(100, Math.max(1, query.limitPerEngine ?? 20));
      const domains = fabric.listRegisteredDomains();
      const responses = domains.map(domain_id => fabric.search({
        domain_id, query: query.text, page: 1, page_size: limit
      }));
      return responses.flatMap(response => response.results.map(item => industrialRecord(item.entity))).slice(0, limit);
    }
  };
}

function socialRecord(entity: ResolvedSocialEntity): AtlasCrossEngineRecord {
  const candidate = entity.candidate;
  return {
    recordId: `${candidate.platform}:${candidate.candidateId}`,
    entityType: entity.entityType,
    displayName: entity.entityName,
    attributes: {
      platform: candidate.platform, profileUrl: candidate.publicProfileUrl,
      claimedJurisdiction: candidate.claimedJurisdiction || null,
      externalWebsites: entity.externalWebsites, publicBio: entity.publicBio || null
    },
    evidence: evidence(
      `public-social-profile:${candidate.platform.toLowerCase()}`,
      candidate.publicProfileUrl,
      candidate.rawMetadata?.observed_at || candidate.rawMetadata?.observedAt,
      candidate.rawMetadata?.confidence
    ),
    externalReferences: [{ namespace: candidate.platform.toLowerCase(), value: candidate.publicProfileUrl }]
  };
}

export function createSocialDiscoveryAdapter(engine: SocialPublicDiscoveryEngine): AtlasCrossEngineAdapter {
  return {
    engineId: "social",
    async search(query: AtlasCrossEngineQuery) {
      const limit = Math.min(60, Math.max(1, query.limitPerEngine ?? 20));
      const candidates = await engine.discoverCandidates(limit);
      const resolved = await engine.resolveEntities(candidates.slice(0, limit));
      const terms = query.text.toLocaleLowerCase().split(/\s+/).filter(term => term.length > 1);
      const geography = query.geography?.toLocaleLowerCase();
      const relevant = resolved.filter(entity => {
        const searchable = [entity.entityName, entity.publicBio, entity.candidate.publicProfileUrl, ...entity.externalWebsites]
          .filter(Boolean).join(" ").toLocaleLowerCase();
        const matchesText = terms.length === 0 || terms.some(term => searchable.includes(term));
        const claimed = entity.candidate.claimedJurisdiction?.toLocaleLowerCase() || "";
        const matchesGeography = !geography || claimed.includes(geography);
        return matchesText && matchesGeography;
      });
      return relevant.map(socialRecord).slice(0, limit);
    }
  };
}
