import fetch from 'node-fetch';
import { compareAuthorNames, normalizeNameForComparison } from './AtlasNameComparator';

export interface ConicetWorkMetadata {
  handleId: string;
  title: string | null;
  doi: string | null;
  year: number | null;
  creators: string[];
  affiliationsRaw: Array<{ author: string; affiliation: string; country: string }>;
  publisher: string | null;
}

export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
  sequence?: string;
  ORCID?: string;
  affiliation?: Array<{ name: string }>;
}

export interface CrossrefWork {
  doi: string;
  title: string;
  year: number | null;
  authors: CrossrefAuthor[];
  publisher?: string;
  containerTitle?: string;
}

export interface WorkFirstResolutionResult {
  discovery_id: string;
  display_name: string;
  handle_id: string;
  has_doi: boolean;
  work_resolved: boolean;
  crossref_openalex_work_resolved: boolean;
  work_doi: string | null;
  work_title: string | null;
  work_year: number | null;
  work_match_method: 'EXACT_DOI' | 'WORK_CANDIDATE_MATCH_TITLE_STRONG' | 'CONICET_DIRECT_WORK' | 'NONE';
  work_match_confidence: number;
  authorship_target_found_in_external_work: boolean;
  conicet_direct_dspace_identity_evidence: boolean;
  matched_author: CrossrefAuthor | null;
  author_match_method: 'AUTHORSHIP_EXACT_NAME' | 'AUTHORSHIP_TOKEN_OVERLAP' | 'CONICET_INDIVIDUAL_DC_FILIATION' | 'AMBIGUOUS_MULTIPLE_CANDIDATES' | 'NONE';
  author_match_confidence: number;
  identity_resolved: boolean;
  identity_strength: 'IDENTITY_HIGH_CONFIDENCE_STRONG_ID' | 'IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE' | 'IDENTITY_PARTIAL' | 'UNRESOLVED';
  identity_resolution_method: 'DOI_AND_AUTHORSHIP' | 'WORK_AND_AUTHORSHIP' | 'CONICET_PUBLICATION_FILIATION' | 'UNRESOLVED';
  identity_confidence: 'IDENTITY_RESOLVED_HIGH_CONFIDENCE' | 'IDENTITY_PARTIAL' | 'UNRESOLVED';
  matched_orcid: string | null;
  has_embedded_orcid: boolean;
  is_ambiguous: boolean;
  affiliation_string: string | null;
  territorial_state: 'CURRENT' | 'RECENT' | 'ASSOCIATED_STALE' | 'NON_CABA_CONFIRMED' | 'TERRITORIAL_CONFLICT' | 'UNRESOLVED';
  territorial_resolution_method: 'AFFILIATION_EXPLICIT_CABA' | 'AFFILIATION_EXPLICIT_NON_CABA' | 'MULTI_AFFILIATION_TEMPORAL' | 'CONTEMPORARY_CONTRADICTION_CONFLICT' | 'UNRESOLVED';
  territorial_confidence: number;
  status: 'RESOLVED_CABA' | 'RESOLVED_NON_CABA' | 'UNRESOLVED' | 'RATE_LIMITED' | 'FAILED_RETRYABLE';
  evidence_summary: string;
  api_requests_crossref_single_doi: number;
  api_requests_crossref_list: number;
  api_requests_openalex: number;
  external_data_charge_usd: number;
}

// CABA Institutional / Territorial keywords
const CABA_AFFILIATION_KEYWORDS = [
  'buenos aires', 'caba', 'ciudad autonoma de buenos aires', 'ciudad de buenos aires',
  'universidad de buenos aires', 'uba', 'ciudad universitaria',
  'exactas y naturales', 'fcen', 'facultad de medicina', 'fadu', 'facultad de derecho',
  'facultad de filosofia y letras', 'facultad de psicologia', 'facultad de ciencias economicas',
  'facultad de farmacia y bioquimica', 'facultad de odontologia', 'facultad de agronomia',
  'facultad de ingenieria', 'fiuba', 'hospital de clinicas', 'hospital de pediatr',
  'garrahan', 'hospital italiano', 'hospital roffo', 'fundacion instituto leloir', 'iibba',
  'iafe', 'inquimae', 'iquibicen', 'ibbea', 'iafe - uba', 'instituto de oncologia angel h. roffo',
  'centro cientifico tecnologico conicet - buenos aires', 'cct conicet buenos aires',
  'instituto nacional de antropologia y pensamiento latinoamericano', 'inapl',
  'saavedra 15', 'ciipme', 'centro interdisciplinario de investigaciones en psicologia matematica y experimental',
  'universidad torcuato di tella', 'universidad de san andres', 'uca', 'universidad catolica argentina',
  'itba', 'universidad favaloro', 'instituto universitario cemic', 'cemic'
];

// Explicit NON_CABA Keywords
const NON_CABA_AFFILIATION_KEYWORDS = [
  'la plata', 'unlp', 'cordoba', 'unc', 'rosario', 'unr', 'cuyo', 'uncuyo',
  'mar del plata', 'unmdp', 'bahia blanca', 'uns', 'tucuman', 'unt',
  'nordeste', 'unne', 'comahue', 'puerto madryn', 'cenpat', 'chubut',
  'rio negro', 'mendoza', 'san juan', 'san luis', 'santa fe', 'unl',
  'entre rios', 'uner', 'corrientes', 'misiones', 'unam', 'chaco',
  'salta', 'unsa', 'jujuy', 'unju', 'formosa', 'santiago del estero', 'unse',
  'la pampa', 'unlpam', 'santa cruz', 'unpa', 'tierra del fuego', 'untdf',
  'quilmes', 'unq', 'san martin', 'unsam', 'tres de febrero', 'untref',
  'lanus', 'unla', 'lomas de zamora', 'unlz', 'la matanza', 'unlam',
  'moreno', 'hurlingham', 'unahur', 'jose c. paz', 'unpaz',
  'brasil', 'brazil', 'rusia', 'russia', 'netherlands', 'paises bajos',
  'estados unidos', 'united states', 'usa', 'germany', 'alemania',
  'france', 'francia', 'spain', 'espana', 'chile', 'uruguay', 'mexico', 'colombia',
  'united kingdom', 'uk', 'reino unido', 'canada', 'italy', 'italia', 'belgica', 'belgium'
];

export class ConicetWorkFirstResolver {
  private mailto: string;
  private userAgent: string;
  private crossrefSingleDoiCount = 0;
  private crossrefListCount = 0;
  private openalexRequestCount = 0;
  private maxChargeUsd = 0;

  constructor(mailto: string = 'contact@youapp.com') {
    this.mailto = mailto;
    this.userAgent = `AtlasHarvester/1.0 (mailto:${mailto})`;
  }

  public getStats() {
    return {
      crossrefSingleDoiRequests: this.crossrefSingleDoiCount,
      crossrefListRequests: this.crossrefListCount,
      totalCrossrefRequests: this.crossrefSingleDoiCount + this.crossrefListCount,
      openalexRequests: this.openalexRequestCount,
      externalDataChargeUsd: this.maxChargeUsd
    };
  }

  /**
   * 1. Extracts work metadata directly from CONICET Handle Landing Page & OAI-PMH
   */
  public async extractConicetWorkMetadata(handleUrlOrId: string): Promise<ConicetWorkMetadata | null> {
    try {
      let handleId = handleUrlOrId;
      if (handleUrlOrId.includes('/')) {
        const parts = handleUrlOrId.split('/').filter(Boolean);
        handleId = parts[parts.length - 1];
      }
      if (handleId.includes(':')) {
        handleId = handleId.split(':')[0];
      }

      let title: string | null = null;
      let doi: string | null = null;
      let year: number | null = null;
      const creators: string[] = [];
      const affiliationsRaw: Array<{ author: string; affiliation: string; country: string }> = [];
      let publisher: string | null = null;

      // 1a. Primary: Fetch DSpace Landing Page
      const landingUrl = `https://ri.conicet.gov.ar/handle/11336/${handleId}`;
      try {
        const lRes = await fetch(landingUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        } as any);

        if (lRes.ok) {
          const html = await lRes.text();

          const citTitle = html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_title"/i) ||
                           html.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]+)"/i) ||
                           html.match(/<meta[^>]*name="DC\.title"[^>]*content="([^"]+)"/i);
          if (citTitle) title = citTitle[1].trim();

          const citDoi = html.match(/<meta[^>]*name="citation_doi"[^>]*content="([^"]+)"/i) ||
                         html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_doi"/i) ||
                         html.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
          if (citDoi) doi = citDoi[1] ? citDoi[1].trim() : citDoi[0].trim();

          const citDate = html.match(/<meta[^>]*name="citation_date"[^>]*content="(\d{4})/i) ||
                          html.match(/<meta[^>]*name="DC\.date"[^>]*content="(\d{4})/i);
          if (citDate) year = parseInt(citDate[1], 10);

          const citAuthors = html.match(/<meta[^>]*name="(?:citation_author|DC\.creator)"[^>]*content="([^"]+)"/gi) || [];
          for (const a of citAuthors) {
            const name = a.match(/content="([^"]+)"/i)?.[1];
            if (name && !creators.includes(name)) creators.push(name.trim());
          }

          const descMatches = html.match(/<meta[^>]*name="DC\.description"[^>]*content="Fil:\s*([^"]+)"/gi) || [];
          for (const dm of descMatches) {
            const clean = dm.match(/content="Fil:\s*([^"]+)"/i)?.[1]?.trim();
            if (clean) {
              const parts = clean.split('.');
              const author = parts[0]?.trim() || '';
              const affilAndCountry = parts.slice(1).join('.').trim();
              const subParts = affilAndCountry.split(';');
              const affiliation = subParts[0]?.trim() || '';
              const country = subParts[subParts.length - 1]?.trim() || '';
              affiliationsRaw.push({ author, affiliation: affilAndCountry, country });
            }
          }

          const pubMatch = html.match(/<meta[^>]*name="(?:citation_publisher|DC\.publisher)"[^>]*content="([^"]+)"/i);
          if (pubMatch) publisher = pubMatch[1].trim();
        }
      } catch {}

      // 1b. Complement via OAI-PMH if needed
      if (!title || !doi || affiliationsRaw.length === 0) {
        try {
          const oaiUrl = `https://ri.conicet.gov.ar/oai/request?verb=GetRecord&identifier=oai:ri.conicet.gov.ar:11336/${handleId}&metadataPrefix=oai_dc`;
          const res = await fetch(oaiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
          } as any);

          if (res.ok) {
            const xml = await res.text();
            if (!title) {
              const titleMatch = xml.match(/<dc:title>([^<]+)<\/dc:title>/i);
              if (titleMatch) title = titleMatch[1].trim();
            }

            if (!doi) {
              const doiRelation = xml.match(/<dc:relation>[^<]*?doi\.org\/([^<]+)<\/dc:relation>/i) ||
                                  xml.match(/<dc:relation>[^<]*?altIdentifier\/doi\/([^<]+)<\/dc:relation>/i);
              if (doiRelation) doi = doiRelation[1].trim();
            }

            if (!year) {
              const dateMatch = xml.match(/<dc:date>(\d{4})[^<]*<\/dc:date>/i);
              if (dateMatch) year = parseInt(dateMatch[1], 10);
            }
          }
        } catch {}
      }

      return {
        handleId,
        title,
        doi,
        year,
        creators,
        affiliationsRaw,
        publisher
      };
    } catch {
      return null;
    }
  }

  /**
   * 2. Resolves work and authorships via Crossref Polite Pool
   * Strictly separates DOI Exact Match from Title-only search.
   * Title search enforces:
   * - similarity >= 0.92
   * - year match within +/- 1 year
   * - coauthor overlap when available
   */
  public async resolveCrossrefWork(
    doi: string | null,
    title: string | null,
    year: number | null,
    creators: string[] = []
  ): Promise<{ work: CrossrefWork | null; match_method: 'EXACT_DOI' | 'WORK_CANDIDATE_MATCH_TITLE_STRONG' | 'NONE'; match_confidence: number }> {
    if (!doi && !title) return { work: null, match_method: 'NONE', match_confidence: 0 };

    try {
      // 2a. Exact DOI Lookup (Primary key, up to 10 req/s in polite pool)
      if (doi) {
        const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
        const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}?mailto=${this.mailto}`;
        this.crossrefSingleDoiCount++;
        const res = await fetch(url, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000
        } as any);

        if (res.status === 429) throw new Error('CROSSREF_429');

        if (res.ok) {
          const json: any = await res.json();
          const item = json.message;
          const pubYear = item.issued?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || year;
          return {
            work: {
              doi: item.DOI || cleanDoi,
              title: Array.isArray(item.title) ? item.title[0] : (item.title || ''),
              year: pubYear ? parseInt(pubYear, 10) : null,
              authors: item.author || [],
              publisher: item.publisher,
              containerTitle: Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']
            },
            match_method: 'EXACT_DOI',
            match_confidence: 1.0
          };
        }
      }

      // 2b. High-Discrimination Title Search (List endpoint, lower rate limit, strictly bounded)
      if (title && title.length > 15) {
        const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=3&mailto=${this.mailto}`;
        this.crossrefListCount++;
        const res = await fetch(url, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000
        } as any);

        if (res.status === 429) throw new Error('CROSSREF_429');
        if (!res.ok) return { work: null, match_method: 'NONE', match_confidence: 0 };

        const json: any = await res.json();
        const items = json.message?.items || [];
        for (const item of items) {
          const itemTitle = Array.isArray(item.title) ? item.title[0] : (item.title || '');
          const similarity = this.computeTitleSimilarity(title, itemTitle);

          // Require similarity >= 0.92
          if (similarity >= 0.92) {
            const pubYear = item.issued?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0];
            const itemYearNum = pubYear ? parseInt(pubYear, 10) : null;

            // Check year compatibility (+/- 1 year)
            if (year && itemYearNum && Math.abs(year - itemYearNum) > 1) {
              continue; // Year mismatch, reject work candidate
            }

            // Check coauthor overlap if creators are known
            let coauthorOverlapPass = true;
            if (creators.length > 1 && item.author && item.author.length > 1) {
              const creatorNorms = creators.map(c => this.normalizeName(c));
              const crossrefNorms = item.author.map((a: any) => this.normalizeName(`${a.given || ''} ${a.family || ''}`));
              const overlap = creatorNorms.some(cn => crossrefNorms.some((xn: any) => this.isAuthorNameMatching(cn, xn)));
              if (!overlap) {
                coauthorOverlapPass = false;
              }
            }

            if (coauthorOverlapPass) {
              return {
                work: {
                  doi: item.DOI,
                  title: itemTitle,
                  year: itemYearNum || year,
                  authors: item.author || [],
                  publisher: item.publisher,
                  containerTitle: Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']
                },
                match_method: 'WORK_CANDIDATE_MATCH_TITLE_STRONG',
                match_confidence: similarity
              };
            }
          }
        }
      }
    } catch (e: any) {
      if (e.message === 'CROSSREF_429') throw e;
      return { work: null, match_method: 'NONE', match_confidence: 0 };
    }

    return { work: null, match_method: 'NONE', match_confidence: 0 };
  }

  /**
   * 2c. OpenAlex Work Lookup by DOI (Polite Pool, free tier with rate-limit tracking)
   * Used when Crossref lacks explicit author affiliations.
   */
  public async fetchOpenAlexWork(doi: string): Promise<any> {
    if (!doi) return null;
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
    const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}?mailto=${this.mailto}`;
    this.openalexRequestCount++;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      } as any);

      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return null;
  }

  /**
   * 3. Author Matching within Authorship Graph (Strict Identity Gate)
   * Prevents false identity merges by checking ambiguity across all authors.
   */
  public matchAuthorInAuthorships(targetName: string, authors: CrossrefAuthor[]): { 
    author: CrossrefAuthor | null; 
    method: 'AUTHORSHIP_EXACT_NAME' | 'AUTHORSHIP_TOKEN_OVERLAP' | 'AMBIGUOUS_MULTIPLE_CANDIDATES' | 'NONE'; 
    confidence: number;
    isAmbiguous: boolean;
  } {
    if (!targetName || !authors || authors.length === 0) {
      return { author: null, method: 'NONE', confidence: 0, isAmbiguous: false };
    }

    const matches: Array<{ author: CrossrefAuthor; method: 'AUTHORSHIP_EXACT_NAME' | 'AUTHORSHIP_TOKEN_OVERLAP'; confidence: number }> = [];

    for (const a of authors) {
      const family = a.family || '';
      const given = a.given || '';
      const full = `${given} ${family}`.trim();
      const raw = a.name || '';

      const compFull = compareAuthorNames(targetName, full);
      const compRaw = raw ? compareAuthorNames(targetName, raw) : null;

      if (compFull.matches) {
        matches.push({
          author: a,
          method: compFull.confidence === 1.0 ? 'AUTHORSHIP_EXACT_NAME' : 'AUTHORSHIP_TOKEN_OVERLAP',
          confidence: compFull.confidence
        });
      } else if (compRaw?.matches) {
        matches.push({
          author: a,
          method: compRaw.confidence === 1.0 ? 'AUTHORSHIP_EXACT_NAME' : 'AUTHORSHIP_TOKEN_OVERLAP',
          confidence: compRaw.confidence
        });
      }
    }

    if (matches.length === 1) {
      return { author: matches[0].author, method: matches[0].method, confidence: matches[0].confidence, isAmbiguous: false };
    } else if (matches.length > 1) {
      // Check if all matches share identical ORCID (e.g. repeated listing of same person)
      const orcids = new Set(matches.map(m => m.author.ORCID).filter(Boolean));
      if (orcids.size === 1) {
        return { author: matches[0].author, method: matches[0].method, confidence: matches[0].confidence, isAmbiguous: false };
      }
      // Ambiguous multiple candidate authors in the same work! Reject merge to guarantee FALSE_IDENTITY_MERGE = 0
      return { author: null, method: 'AMBIGUOUS_MULTIPLE_CANDIDATES', confidence: 0, isAmbiguous: true };
    }

    return { author: null, method: 'NONE', confidence: 0, isAmbiguous: false };
  }

  /**
   * 4. Evaluates Territorial Gate based on explicit individual affiliation and temporality
   * Handles multiple simultaneous affiliations without premature NON_CABA classification.
   */
  public evaluateTerritory(
    author: CrossrefAuthor | null,
    conicetAffil: string | null,
    openalexAffil: string | null,
    year: number | null
  ): {
    territorial_state: 'CURRENT' | 'RECENT' | 'ASSOCIATED_STALE' | 'NON_CABA_CONFIRMED' | 'TERRITORIAL_CONFLICT' | 'UNRESOLVED';
    territorial_resolution_method: 'AFFILIATION_EXPLICIT_CABA' | 'AFFILIATION_EXPLICIT_NON_CABA' | 'MULTI_AFFILIATION_TEMPORAL' | 'CONTEMPORARY_CONTRADICTION_CONFLICT' | 'UNRESOLVED';
    territorial_confidence: number;
    status: 'RESOLVED_CABA' | 'RESOLVED_NON_CABA' | 'UNRESOLVED';
    evidence_summary: string;
  } {
    const affilTexts: string[] = [];
    if (author?.affiliation) {
      for (const aff of author.affiliation) {
        if (aff.name) affilTexts.push(aff.name.toLowerCase());
      }
    }
    if (conicetAffil) {
      affilTexts.push(conicetAffil.toLowerCase());
    }
    if (openalexAffil) {
      affilTexts.push(openalexAffil.toLowerCase());
    }

    if (affilTexts.length === 0) {
      return {
        territorial_state: 'UNRESOLVED',
        territorial_resolution_method: 'UNRESOLVED',
        territorial_confidence: 0,
        status: 'UNRESOLVED',
        evidence_summary: 'Sin afiliación institucional explícita para este autor en la obra resuelta.'
      };
    }

    const combinedAffil = affilTexts.join(' | ');

    const hasCaba = CABA_AFFILIATION_KEYWORDS.some(kw => combinedAffil.includes(kw));
    const hasNonCaba = NON_CABA_AFFILIATION_KEYWORDS.some(kw => combinedAffil.includes(kw));

    // Multiple affiliations conflict / temporal analysis
    if (hasCaba && hasNonCaba) {
      // Both CABA and Non-CABA affiliations coexist contemporaneously in this work
      // Strict rule: do NOT force NON_CABA nor CABA on contemporary contradiction
      return {
        territorial_state: 'TERRITORIAL_CONFLICT',
        territorial_resolution_method: 'CONTEMPORARY_CONTRADICTION_CONFLICT',
        territorial_confidence: 0,
        status: 'UNRESOLVED',
        evidence_summary: `Conflicto territorial detectado (afiliaciones contemporáneas mixtas): ${combinedAffil.slice(0, 150)}`
      };
    }

    if (hasNonCaba && !hasCaba) {
      return {
        territorial_state: 'NON_CABA_CONFIRMED',
        territorial_resolution_method: 'AFFILIATION_EXPLICIT_NON_CABA',
        territorial_confidence: 0.95,
        status: 'RESOLVED_NON_CABA',
        evidence_summary: `Filiación individual radicada fuera de CABA confirmada por obra: ${combinedAffil.slice(0, 150)}`
      };
    }

    if (hasCaba) {
      const pubYear = year || 2020;
      if (pubYear >= 2025) {
        return {
          territorial_state: 'CURRENT',
          territorial_resolution_method: 'AFFILIATION_EXPLICIT_CABA',
          territorial_confidence: 0.95,
          status: 'RESOLVED_CABA',
          evidence_summary: `Filiación individual activa CABA 2025-2026 comprobada: ${combinedAffil.slice(0, 150)}`
        };
      } else if (pubYear >= 2023) {
        return {
          territorial_state: 'RECENT',
          territorial_resolution_method: 'AFFILIATION_EXPLICIT_CABA',
          territorial_confidence: 0.90,
          status: 'RESOLVED_CABA',
          evidence_summary: `Filiación individual CABA 2023-2024 comprobada: ${combinedAffil.slice(0, 150)}`
        };
      } else {
        return {
          territorial_state: 'ASSOCIATED_STALE',
          territorial_resolution_method: 'AFFILIATION_EXPLICIT_CABA',
          territorial_confidence: 0.85,
          status: 'RESOLVED_CABA',
          evidence_summary: `Filiación individual CABA previa a 2023 comprobada: ${combinedAffil.slice(0, 150)}`
        };
      }
    }

    return {
      territorial_state: 'UNRESOLVED',
      territorial_resolution_method: 'UNRESOLVED',
      territorial_confidence: 0,
      status: 'UNRESOLVED',
      evidence_summary: `Afiliación presente pero sin keywords determinantes de CABA o Non-CABA: ${combinedAffil.slice(0, 120)}`
    };
  }

  /**
   * Master Work-First Resolution Method for a single CONICET discovery candidate
   */
  public async resolveCandidate(candidate: {
    discovery_id: string;
    display_name: string;
    person_source_url?: string;
    source_record_id?: string;
    organization?: string;
    location_evidence?: string;
  }): Promise<WorkFirstResolutionResult> {
    const handleUrl = candidate.person_source_url || candidate.source_record_id || '';
    const workMeta = await this.extractConicetWorkMetadata(handleUrl);

    let crossrefWork: CrossrefWork | null = null;
    let workMatchMethod: 'EXACT_DOI' | 'WORK_CANDIDATE_MATCH_TITLE_STRONG' | 'CONICET_DIRECT_WORK' | 'NONE' = 'NONE';
    let workMatchConfidence = 0;

    const singleDoiBefore = this.crossrefSingleDoiCount;
    const listBefore = this.crossrefListCount;
    const openalexBefore = this.openalexRequestCount;

    const hasDoi = !!workMeta?.doi;

    if (workMeta) {
      try {
        const resolved = await this.resolveCrossrefWork(workMeta.doi, workMeta.title, workMeta.year, workMeta.creators);
        crossrefWork = resolved.work;
        workMatchMethod = resolved.match_method;
        workMatchConfidence = resolved.match_confidence;
      } catch (err: any) {
        if (err.message === 'CROSSREF_429') {
          return {
            discovery_id: candidate.discovery_id,
            display_name: candidate.display_name,
            handle_id: workMeta.handleId,
            has_doi: hasDoi,
            work_resolved: false,
            work_doi: workMeta.doi,
            work_title: workMeta.title,
            work_year: workMeta.year,
            work_match_method: 'NONE',
            work_match_confidence: 0,
            authorship_target_found: false,
            matched_author: null,
            author_match_method: 'NONE',
            author_match_confidence: 0,
            identity_resolved: false,
            identity_resolution_method: 'UNRESOLVED',
            identity_confidence: 'UNRESOLVED',
            matched_orcid: null,
            has_embedded_orcid: false,
            is_ambiguous: false,
            affiliation_string: null,
            territorial_state: 'UNRESOLVED',
            territorial_resolution_method: 'UNRESOLVED',
            territorial_confidence: 0,
            status: 'RATE_LIMITED',
            evidence_summary: 'Rate limit 429 alcanzado en Crossref. Checkpoint guardado en Postgres.',
            api_requests_crossref_single_doi: this.crossrefSingleDoiCount - singleDoiBefore,
            api_requests_crossref_list: this.crossrefListCount - listBefore,
            api_requests_openalex: 0,
            external_data_charge_usd: 0
          };
        }
      }

      // If Crossref did not resolve work, but CONICET metadata has explicit title/handle
      if (!crossrefWork && workMeta.title) {
        workMatchMethod = 'CONICET_DIRECT_WORK';
        workMatchConfidence = 0.90;
      }
    }

    // Match author inside authorships
    let matchedAuthor: CrossrefAuthor | null = null;
    let authorMatchMethod: 'AUTHORSHIP_EXACT_NAME' | 'AUTHORSHIP_TOKEN_OVERLAP' | 'CONICET_INDIVIDUAL_DC_FILIATION' | 'AMBIGUOUS_MULTIPLE_CANDIDATES' | 'NONE' = 'NONE';
    let authorMatchConfidence = 0;
    let identityResolutionMethod: 'DOI_AND_AUTHORSHIP' | 'WORK_AND_AUTHORSHIP' | 'CONICET_PUBLICATION_FILIATION' | 'UNRESOLVED' = 'UNRESOLVED';
    let identityConfidence: 'IDENTITY_RESOLVED_HIGH_CONFIDENCE' | 'IDENTITY_PARTIAL' | 'UNRESOLVED' = 'UNRESOLVED';
    let matchedOrcid: string | null = null;
    let isAmbiguous = false;
    let authorshipTargetFoundInExternalWork = false;
    let conicetDirectDspaceIdentityEvidence = false;

    // 1. External Authorship Matching (Crossref / OpenAlex)
    if (crossrefWork && crossrefWork.authors.length > 0) {
      const matchRes = this.matchAuthorInAuthorships(candidate.display_name, crossrefWork.authors);
      if (matchRes.isAmbiguous) {
        isAmbiguous = true;
        authorMatchMethod = 'AMBIGUOUS_MULTIPLE_CANDIDATES';
        authorMatchConfidence = 0;
      } else if (matchRes.author) {
        matchedAuthor = matchRes.author;
        authorMatchMethod = matchRes.method;
        authorMatchConfidence = matchRes.confidence;
        authorshipTargetFoundInExternalWork = true;
        identityResolutionMethod = workMatchMethod === 'EXACT_DOI' ? 'DOI_AND_AUTHORSHIP' : 'WORK_AND_AUTHORSHIP';
        identityConfidence = 'IDENTITY_RESOLVED_HIGH_CONFIDENCE';
        if (matchedAuthor.ORCID) {
          matchedOrcid = matchedAuthor.ORCID;
        }
      }
    }

    // 2. Direct DSpace Identity Evidence (When external work did not match author or was not found)
    let conicetAuthorAffil: string | null = null;
    if (workMeta?.affiliationsRaw && !matchedAuthor && !isAmbiguous) {
      const affilMatch = workMeta.affiliationsRaw.find(a => this.isAuthorNameMatching(candidate.display_name, a.author));
      if (affilMatch) {
        conicetAuthorAffil = `${affilMatch.affiliation} ${affilMatch.country}`;
        authorMatchMethod = 'CONICET_INDIVIDUAL_DC_FILIATION';
        authorMatchConfidence = 0.90;
        conicetDirectDspaceIdentityEvidence = true;
        identityResolutionMethod = 'CONICET_PUBLICATION_FILIATION';
        identityConfidence = 'IDENTITY_PARTIAL';
      }
    }

    // Complement affiliation via OpenAlex if author has no affiliation in Crossref or DSpace
    let openalexAffilString: string | null = null;
    const workDoi = crossrefWork?.doi || workMeta?.doi;
    const authorHasNoAffil = (!matchedAuthor?.affiliation || matchedAuthor.affiliation.length === 0) && !conicetAuthorAffil;

    if (workDoi && authorHasNoAffil && !isAmbiguous && (authorshipTargetFoundInExternalWork || conicetDirectDspaceIdentityEvidence)) {
      const oaWork = await this.fetchOpenAlexWork(workDoi);
      if (oaWork && Array.isArray(oaWork.authorships)) {
        for (const oaAuth of oaWork.authorships) {
          const oaName = oaAuth.author?.display_name || '';
          if (this.isAuthorNameMatching(candidate.display_name, oaName)) {
            const instNames = (oaAuth.institutions || []).map((inst: any) => inst.display_name).filter(Boolean);
            const rawAffils = oaAuth.raw_affiliation_strings || [];
            openalexAffilString = [...instNames, ...rawAffils].join('; ');
            if (oaAuth.author?.orcid && !matchedOrcid) {
              matchedOrcid = oaAuth.author.orcid;
            }
            break;
          }
        }
      }
    }

    // Territorial evaluation
    const territoryEval = this.evaluateTerritory(
      matchedAuthor,
      conicetAuthorAffil,
      openalexAffilString,
      crossrefWork?.year || workMeta?.year || null
    );

    const isIdentityResolved = identityConfidence !== 'UNRESOLVED' && !isAmbiguous;
    const hasEmbeddedOrcid = !!matchedOrcid;

    // Multi-tier Identity Strength categorization
    let identityStrength: 'IDENTITY_HIGH_CONFIDENCE_STRONG_ID' | 'IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE' | 'IDENTITY_PARTIAL' | 'UNRESOLVED' = 'UNRESOLVED';
    if (isIdentityResolved) {
      if (hasEmbeddedOrcid) {
        identityStrength = 'IDENTITY_HIGH_CONFIDENCE_STRONG_ID';
      } else if (authorshipTargetFoundInExternalWork && territoryEval.status !== 'UNRESOLVED') {
        identityStrength = 'IDENTITY_HIGH_CONFIDENCE_MULTI_EVIDENCE';
      } else if (conicetDirectDspaceIdentityEvidence) {
        identityStrength = 'IDENTITY_PARTIAL';
      } else {
        identityStrength = 'IDENTITY_PARTIAL';
      }
    }

    const affilCombined = matchedAuthor?.affiliation?.map(a => a.name).join('; ') || 
                          conicetAuthorAffil || 
                          openalexAffilString || 
                          null;

    const crossrefOpenalexWorkResolved = !!crossrefWork;

    return {
      discovery_id: candidate.discovery_id,
      display_name: candidate.display_name,
      handle_id: workMeta?.handleId || 'unknown',
      has_doi: hasDoi,
      work_resolved: crossrefOpenalexWorkResolved || !!workMeta?.title,
      crossref_openalex_work_resolved: crossrefOpenalexWorkResolved,
      work_doi: crossrefWork?.doi || workMeta?.doi || null,
      work_title: crossrefWork?.title || workMeta?.title || null,
      work_year: crossrefWork?.year || workMeta?.year || null,
      work_match_method: workMatchMethod,
      work_match_confidence: workMatchConfidence,
      authorship_target_found_in_external_work: authorshipTargetFoundInExternalWork,
      conicet_direct_dspace_identity_evidence: conicetDirectDspaceIdentityEvidence,
      matched_author: matchedAuthor,
      author_match_method: authorMatchMethod,
      author_match_confidence: authorMatchConfidence,
      identity_resolved: isIdentityResolved,
      identity_strength: identityStrength,
      identity_resolution_method: isIdentityResolved ? identityResolutionMethod : 'UNRESOLVED',
      identity_confidence: isIdentityResolved ? identityConfidence : 'UNRESOLVED',
      matched_orcid: matchedOrcid,
      has_embedded_orcid: hasEmbeddedOrcid,
      is_ambiguous: isAmbiguous,
      affiliation_string: affilCombined,
      territorial_state: isIdentityResolved ? territoryEval.territorial_state : (territoryEval.territorial_state === 'TERRITORIAL_CONFLICT' ? 'TERRITORIAL_CONFLICT' : 'UNRESOLVED'),
      territorial_resolution_method: territoryEval.territorial_resolution_method,
      territorial_confidence: territoryEval.territorial_confidence,
      status: isIdentityResolved ? territoryEval.status : 'UNRESOLVED',
      evidence_summary: territoryEval.evidence_summary,
      api_requests_crossref_single_doi: this.crossrefSingleDoiCount - singleDoiBefore,
      api_requests_crossref_list: this.crossrefListCount - listBefore,
      api_requests_openalex: this.openalexRequestCount - openalexBefore,
      external_data_charge_usd: 0
    };
  }

  public isAuthorNameMatching(targetName: string, candidateAuthorName: string): boolean {
    return compareAuthorNames(targetName, candidateAuthorName).matches;
  }

  public normalizeName(name: string): string {
    return normalizeNameForComparison(name);
  }

  public computeTitleSimilarity(t1: string, t2: string): number {
    const s1 = this.normalizeName(t1);
    const s2 = this.normalizeName(t2);
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.95;

    const words1 = new Set(s1.split(' ').filter(w => w.length > 3));
    const words2 = new Set(s2.split(' ').filter(w => w.length > 3));
    if (words1.size === 0 || words2.size === 0) return 0;

    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    const jaccard = overlap / Math.max(words1.size, words2.size);
    return parseFloat(jaccard.toFixed(2));
  }
}
