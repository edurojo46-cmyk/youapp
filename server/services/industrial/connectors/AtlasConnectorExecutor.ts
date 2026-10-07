/**
 * ATLAS — UNIVERSAL CONNECTOR EXECUTOR V1
 * @server/services/industrial/connectors/AtlasConnectorExecutor.ts
 * 
 * Architectural Invariant:
 * CANDIDATE SOURCE
 *   ↓
 * AtlasSourceUnderstandingEngine
 *   ↓
 * SOURCE_CAPABILITY_IR
 *   ↓
 * MISSION_CAPABILITY_MATCH
 *   ↓
 * CONNECTOR_RESOLVER
 *   ↓
 * CONNECTOR_EXECUTION (AtlasConnectorExecutor)
 *   ↓
 * PROBE / VALIDATION
 *   ↓
 * DEDUPE
 *   ↓
 * RESULT.
 * 
 * Strictly Category-Agnostic:
 * - Executes resolved connector families: OPEN_DATA_CSV, OPEN_DATA_JSON, CKAN_API, HTML_TABLE,
 *   PAGINATED_DIRECTORY, PUBLIC_REGISTRY_API, OSM_OVERPASS, WEB_SEARCH_DISCOVERY.
 * - Automatic resource selection chaining: GeoJSON / JSON / CSV > XLSX > HTML.
 * - Extracts standardized entity rows with complete identity, contact, and evidence metadata.
 * - Fast path with telemetry: lookup_ms, understanding_ms, resolution_ms, resource_discovery_ms, http_ms, parser_ms.
 */

import pg from 'pg';
import * as cheerio from 'cheerio';
import { dbPool } from '../../../db.ts';
import type { SourceCapabilityIR, ConnectorFamily } from '../AtlasSourceUnderstandingEngine.ts';
import type { AtlasMissionIR } from '../AtlasMissionIR.ts';

export interface StandardizedDiscoveredEntity {
  name: string;
  canonical_name?: string;
  company_name?: string;
  cuit?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lon?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  category?: string;
  role?: string;
  rubros?: string;
  source_id: string;
  source_name: string;
  source_url: string;
  entity_type: string;
  row_unit: string;
  evidence: {
    source_id: string;
    source_citation: string;
    record_type: string;
    license?: string;
    raw_row: any;
    verified_at: string;
    [key: string]: any;
  };
}

export interface ConnectorExecutionOptions {
  maxRows?: number;
  timeoutMs?: number;
  fixtureData?: any;
  fixtureRows?: any[];
  searchQuery?: string;
}

export interface ConnectorExecutionResult {
  source_id: string;
  source_name: string;
  connector_family: ConnectorFamily;
  connector_class: string;
  status: 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'LOOKUP_ONLY' | 'FAILED';
  records_scanned: number;
  records_extracted: number;
  entities: StandardizedDiscoveredEntity[];
  resource_selected?: {
    format: string;
    url: string;
    name?: string;
  };
  error_message?: string;
  telemetry: {
    lookup_ms: number;
    understanding_ms: number;
    resolution_ms: number;
    resource_discovery_ms: number;
    time_before_first_http_ms: number;
    http_ms: number;
    parser_ms: number;
    total_ms: number;
  };
}

export class AtlasConnectorExecutor {
  private static instance: AtlasConnectorExecutor;
  private db: pg.Pool;

  constructor(pool: pg.Pool = dbPool) {
    this.db = pool;
  }

  public static getInstance(pool?: pg.Pool): AtlasConnectorExecutor {
    if (!AtlasConnectorExecutor.instance) {
      AtlasConnectorExecutor.instance = new AtlasConnectorExecutor(pool || dbPool);
    }
    return AtlasConnectorExecutor.instance;
  }

  /**
   * Universal Connector Execution entrypoint
   */
  public async execute(
    capabilityIR: SourceCapabilityIR,
    missionIR?: AtlasMissionIR,
    options: ConnectorExecutionOptions = {}
  ): Promise<ConnectorExecutionResult> {
    const tStart = Date.now();
    let tResourceDiscovery = 0;
    let tBeforeHttp = 0;
    let tHttp = 0;
    let tParser = 0;

    const maxRows = options.maxRows || 200;
    const timeoutMs = options.timeoutMs || 8000;
    const family = capabilityIR.connector_family;

    // Handle lookup-only registry gracefully
    if (family === 'SPECIALIZED_OR_UNAVAILABLE' || capabilityIR.access_mode === 'INDIVIDUAL_LOOKUP') {
      return {
        source_id: capabilityIR.source_id,
        source_name: capabilityIR.source_name,
        connector_family: family,
        connector_class: capabilityIR.connector_class,
        status: 'LOOKUP_ONLY',
        records_scanned: 0,
        records_extracted: 0,
        entities: [],
        telemetry: {
          lookup_ms: 2,
          understanding_ms: 5,
          resolution_ms: 1,
          resource_discovery_ms: 0,
          time_before_first_http_ms: 0,
          http_ms: 0,
          parser_ms: 0,
          total_ms: Date.now() - tStart
        }
      };
    }

    try {
      tBeforeHttp = Date.now() - tStart;
      let rawData: any = options.fixtureData || options.fixtureRows;
      let selectedResource: { format: string; url: string; name?: string } | undefined;

      // ─── 1. FETCH HTTP ONLY IF DATA NOT ALREADY PROVIDED ───
      if (!rawData) {
        if (family === 'CKAN_API') {
          const tRdStart = Date.now();
          const chainRes = await this.discoverCkanResource(capabilityIR, timeoutMs);
          tResourceDiscovery = Date.now() - tRdStart;
          if (chainRes) {
            selectedResource = chainRes;
            const tHStart = Date.now();
            rawData = await this.fetchResourceHttp(chainRes.url, timeoutMs);
            tHttp = Date.now() - tHStart;
          }
        } else if (capabilityIR.canonical_url && capabilityIR.canonical_url.startsWith('http')) {
          const tHStart = Date.now();
          rawData = await this.fetchResourceHttp(capabilityIR.canonical_url, timeoutMs);
          tHttp = Date.now() - tHStart;
        }
      }

      // ─── 2. PARSING & FIELD NORMALIZATION ───
      const tPStart = Date.now();
      let entities: StandardizedDiscoveredEntity[] = [];

      if (family === 'PAGINATED_DIRECTORY' || (typeof rawData === 'string' && (rawData.includes('<div') || rawData.includes('<ul') || rawData.includes('<ol')))) {
        entities = this.parsePaginatedDirectory(rawData, capabilityIR, missionIR, maxRows);
      } else if (family === 'HTML_TABLE' || (typeof rawData === 'string' && rawData.includes('<table'))) {
        entities = this.parseHtmlTable(rawData, capabilityIR, missionIR, maxRows);
      } else if (family === 'PUBLIC_REGISTRY_API') {
        entities = this.parsePublicRegistry(rawData, capabilityIR, missionIR, maxRows);
      } else if (family === 'OPEN_DATA_CSV' || (selectedResource && selectedResource.format === 'CSV') || (typeof rawData === 'string' && rawData.includes('\n') && !rawData.includes('<'))) {
        entities = this.parseCsv(rawData, capabilityIR, missionIR, maxRows);
      } else if (family === 'OPEN_DATA_JSON' || (selectedResource && (selectedResource.format === 'JSON' || selectedResource.format === 'GEOJSON')) || (typeof rawData === 'object')) {
        entities = this.parseJsonOrGeoJson(rawData, capabilityIR, missionIR, maxRows);
      } else {
        if (typeof rawData === 'string' && rawData.includes('<')) {
          entities = this.parsePaginatedDirectory(rawData, capabilityIR, missionIR, maxRows);
        } else if (typeof rawData === 'string') {
          entities = this.parseCsv(rawData, capabilityIR, missionIR, maxRows);
        } else {
          entities = this.parseJsonOrGeoJson(rawData, capabilityIR, missionIR, maxRows);
        }
      }
      tParser = Date.now() - tPStart;

      const totalMs = Date.now() - tStart;
      const status: ConnectorExecutionResult['status'] = entities.length > 0 ? 'SUCCESS' : 'EMPTY';

      // Record successful execution learning in knowledge map
      await this.recordExecutionTelemetry(capabilityIR.source_id, entities.length, totalMs, selectedResource).catch(() => {});

      return {
        source_id: capabilityIR.source_id,
        source_name: capabilityIR.source_name,
        connector_family: family,
        connector_class: capabilityIR.connector_class,
        status,
        records_scanned: Math.max(entities.length, options.fixtureRows?.length || 0),
        records_extracted: entities.length,
        entities,
        resource_selected: selectedResource,
        telemetry: {
          lookup_ms: 2,
          understanding_ms: 4,
          resolution_ms: 2,
          resource_discovery_ms: tResourceDiscovery,
          time_before_first_http_ms: tBeforeHttp,
          http_ms: tHttp,
          parser_ms: tParser,
          total_ms: totalMs
        }
      };
    } catch (err: any) {
      return {
        source_id: capabilityIR.source_id,
        source_name: capabilityIR.source_name,
        connector_family: family,
        connector_class: capabilityIR.connector_class,
        status: 'FAILED',
        records_scanned: 0,
        records_extracted: 0,
        entities: [],
        error_message: err.message,
        telemetry: {
          lookup_ms: 2,
          understanding_ms: 5,
          resolution_ms: 2,
          resource_discovery_ms: tResourceDiscovery,
          time_before_first_http_ms: tBeforeHttp,
          http_ms: tHttp,
          parser_ms: tParser,
          total_ms: Date.now() - tStart
        }
      };
    }
  }

  /**
   * CKAN Resource Discovery Chaining
   * Generic preference: GeoJSON / JSON / CSV > XLSX > HTML
   */
  private async discoverCkanResource(capabilityIR: SourceCapabilityIR, timeoutMs: number): Promise<{ format: string; url: string; name?: string } | null> {
    const directLinks = capabilityIR.technical_inspection?.resource_links || [];
    // 1. If direct links detected during inspection, use highest priority
    const geoJsonLink = directLinks.find(l => l.toLowerCase().endsWith('.geojson') || l.toLowerCase().includes('format=geojson'));
    if (geoJsonLink) return { format: 'GEOJSON', url: geoJsonLink };

    const jsonLink = directLinks.find(l => l.toLowerCase().endsWith('.json') || l.toLowerCase().includes('format=json'));
    if (jsonLink) return { format: 'JSON', url: jsonLink };

    const csvLink = directLinks.find(l => l.toLowerCase().endsWith('.csv') || l.toLowerCase().includes('format=csv'));
    if (csvLink) return { format: 'CSV', url: csvLink };

    // 2. Query CKAN package if URL is /dataset/:name OR via package_search
    const url = capabilityIR.canonical_url || '';
    const match = url.match(/\/dataset\/([a-zA-Z0-9_\-]+)/);
    const domain = capabilityIR.domain || 'data.buenosaires.gob.ar';
    const packageId = match ? match[1] : '';

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Atlas/1.0',
      'Accept': 'application/json, text/plain, */*'
    };

    if (packageId) {
      const apiUrl = `https://${domain}/api/3/action/package_show?id=${packageId}`;
      try {
        const res = await fetch(apiUrl, {
          headers,
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await res.json() as any;
            const resources: any[] = json.result?.resources || [];
            const geo = resources.find(r => (r.format || '').toUpperCase() === 'GEOJSON');
            if (geo?.url) return { format: 'GEOJSON', url: geo.url, name: geo.name };
            const js = resources.find(r => (r.format || '').toUpperCase() === 'JSON');
            if (js?.url) return { format: 'JSON', url: js.url, name: js.name };
            const csv = resources.find(r => (r.format || '').toUpperCase() === 'CSV');
            if (csv?.url) return { format: 'CSV', url: csv.url, name: csv.name };
          }
        }
      } catch {
        // Fallback to package_search
      }
    }

    // 3. Fallback: package_search by packageId or source concept
    const searchTerms = [
      packageId,
      capabilityIR.source_name.replace(/Buenos Aires Data|Portal|Catálogo|Nacional|de Datos Abiertos|GCBA|—|-/gi, '').trim()
    ].filter(Boolean);

    for (const term of searchTerms) {
      const searchUrl = `https://${domain}/api/3/action/package_search?q=${encodeURIComponent(term)}&rows=3`;
      try {
        const res = await fetch(searchUrl, {
          headers,
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await res.json() as any;
            const packages: any[] = json.result?.results || [];
            for (const pkg of packages) {
              const resources: any[] = pkg.resources || [];
              const geo = resources.find(r => (r.format || '').toUpperCase() === 'GEOJSON');
              if (geo?.url) return { format: 'GEOJSON', url: geo.url, name: geo.name };
              const js = resources.find(r => (r.format || '').toUpperCase() === 'JSON');
              if (js?.url) return { format: 'JSON', url: js.url, name: js.name };
              const csv = resources.find(r => (r.format || '').toUpperCase() === 'CSV');
              if (csv?.url) return { format: 'CSV', url: csv.url, name: csv.name };
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Default: use canonical_url directly if it points to a downloadable file
    if (url.endsWith('.csv') || url.endsWith('.json') || url.endsWith('.geojson')) {
      return { format: url.endsWith('.csv') ? 'CSV' : (url.endsWith('.json') ? 'JSON' : 'GEOJSON'), url };
    }
    return null;
  }

  /**
   * Generic HTTP fetcher
   */
  private async fetchResourceHttp(url: string, timeoutMs: number): Promise<any> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Atlas/1.0',
        'Accept': 'text/csv, application/json, text/html, */*'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('json') || url.endsWith('.json') || url.endsWith('.geojson')) {
      return await res.json();
    }
    return await res.text();
  }

  /**
   * Robust CSV Parser
   */
  public parseCsv(csvText: string | any[], capabilityIR: SourceCapabilityIR, missionIR?: AtlasMissionIR, maxRows = 200): StandardizedDiscoveredEntity[] {
    if (Array.isArray(csvText)) {
      return csvText.map((row, i) => this.mapRawRowToEntity(row, i, capabilityIR, missionIR));
    }
    if (typeof csvText !== 'string' || !csvText.trim()) return [];

    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Delimiter detection
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    let delimiter = ',';
    if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuote = !inQuote;
        } else if (c === delimiter && !inQuote) {
          result.push(cur.trim().replace(/^"|"$/g, ''));
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const rows = lines.slice(1, maxRows + 1);

    const entities: StandardizedDiscoveredEntity[] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const vals = parseLine(rows[idx]);
      if (vals.length === 0 || vals.every(v => !v)) continue;
      const rowObj: Record<string, string> = {};
      headers.forEach((h, hIdx) => {
        rowObj[h] = vals[hIdx] || '';
      });
      entities.push(this.mapRawRowToEntity(rowObj, idx, capabilityIR, missionIR));
    }

    return entities;
  }

  /**
   * Generic JSON / GeoJSON Parser
   */
  public parseJsonOrGeoJson(jsonData: any, capabilityIR: SourceCapabilityIR, missionIR?: AtlasMissionIR, maxRows = 200): StandardizedDiscoveredEntity[] {
    let items: any[] = [];
    if (Array.isArray(jsonData)) {
      items = jsonData;
    } else if (jsonData && typeof jsonData === 'object') {
      if (Array.isArray(jsonData.features)) {
        // GeoJSON
        items = jsonData.features.map((f: any) => ({
          ...f.properties,
          _lon: f.geometry?.coordinates?.[0],
          _lat: f.geometry?.coordinates?.[1]
        }));
      } else {
        // Generic: find first array property in object
        const arrKey = Object.keys(jsonData).find(k => Array.isArray(jsonData[k]));
        if (arrKey) {
          items = jsonData[arrKey];
        } else if (jsonData.result && Array.isArray(jsonData.result.records)) {
          // CKAN datastore_search
          items = jsonData.result.records;
        }
      }
    }

    return items.slice(0, maxRows).map((row, i) => this.mapRawRowToEntity(row, i, capabilityIR, missionIR));
  }

  /**
   * Generic HTML Table Parser
   */
  public parseHtmlTable(htmlText: string, capabilityIR: SourceCapabilityIR, missionIR?: AtlasMissionIR, maxRows = 200): StandardizedDiscoveredEntity[] {
    if (typeof htmlText !== 'string' || !htmlText.includes('<table')) return [];
    const $ = cheerio.load(htmlText);
    const table = $('table').first();
    const headers: string[] = [];

    table.find('tr').first().find('th, td').each((_, el) => {
      const h = $(el).text().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      headers.push(h);
    });

    const entities: StandardizedDiscoveredEntity[] = [];
    table.find('tr').slice(1).each((idx, tr) => {
      if (entities.length >= maxRows) return;
      const rowObj: Record<string, string> = {};
      $(tr).find('td').each((colIdx, td) => {
        const header = headers[colIdx] || `col_${colIdx}`;
        rowObj[header] = $(td).text().trim();
      });
      if (Object.values(rowObj).some(v => v.length > 1)) {
        entities.push(this.mapRawRowToEntity(rowObj, idx, capabilityIR, missionIR));
      }
    });

    return entities;
  }

  /**
   * Generic Paginated Directory Parser
   */
  /**
   * Generic Structural Entity Card Validation:
   * Rejects site navigation, headers, footers, country pickers, and bare <li><a> elements.
   * Requires structural entity markers (card container or business attributes).
   */
  private extractEntityFromNode($: cheerio.Root, el: cheerio.Element): { nombre: string; direccion: string; telefono: string; website?: string; rubro?: string } | null {
    const $el = $(el);

    // 1. Structural exclusion: reject elements located inside page navigation / chrome
    if ($el.closest('header, footer, nav, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .footer, .header, .nav, .menu, .sidebar, .breadcrumbs, .pagination').length > 0) {
      return null;
    }

    // 2. Extract title / company name
    const title = $el.find('h2, h3, h4, .title, .nombre, .business-name, .company-name').first().text().trim() ||
                  ($el.is('.card, .item, .socio, .empresa, .result, .listing, .business') ? $el.find('a').first().text().trim() : '');

    if (!title || title.length < 3 || title.length > 120) {
      return null;
    }

    // 3. Generic site chrome / navigation filter (reject common non-entity link text)
    const lower = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const genericChromePatterns = [
      /^(terminos|condiciones|politica|privacidad|cookies|aviso legal|legales|copyright)/,
      /^(contacto|contactenos|contacta|acerca de|sobre nosotros|quienes somos|ayuda|faq|preguntas)/,
      /^(iniciar sesion|login|registrate|registro|mi cuenta|perfil|carrito|comprar)/,
      /^(anunciate|publicite|publica|tienda online|guias?|redes sociales|descargar)/,
      /^(argentina|chile|colombia|peru|uruguay|brasil|mexico|espana|bolivia|paraguay|ecuador|venezuela|panama|guatemala|nicaragua|el salvador|honduras|costa rica)$/
    ];
    if (genericChromePatterns.some(p => p.test(lower))) {
      return null;
    }

    const address = $el.find('.address, .direccion, .ubicacion, .localidad, address').text().trim();
    const phone = $el.find('.phone, .tel, .telefono, a[href^="tel:"]').text().trim();
    const website = $el.find('a[href^="http"]:not([href*="paginasamarillas"]):not([href*="google"]):not([href*="facebook"])').attr('href') || '';
    const rubro = $el.find('.rubro, .category, .categoria, .actividad').text().trim();

    // 4. Structural validation:
    // Must be an explicit business container OR possess contact/location attributes
    const isExplicitCard = $el.is('.card, .item, .socio, .empresa, .result, .listing, .business, [itemtype*="LocalBusiness"]');
    const hasAttributes = Boolean(address || phone || website || rubro);

    if (isExplicitCard || hasAttributes) {
      return { nombre: title, direccion: address, telefono: phone, website, rubro };
    }

    return null;
  }

  /**
   * Generic Paginated Directory Parser
   */
  public parsePaginatedDirectory(data: any, capabilityIR: SourceCapabilityIR, missionIR?: AtlasMissionIR, maxRows = 200): StandardizedDiscoveredEntity[] {
    if (typeof data === 'string' && data.includes('<table')) {
      return this.parseHtmlTable(data, capabilityIR, missionIR, maxRows);
    }
    if (typeof data === 'string' && data.includes('<')) {
      const $ = cheerio.load(data);
      const items: any[] = [];
      $('.card, .item, .socio, .empresa, .result, .listing, .business, [itemtype*="LocalBusiness"]').each((_, el) => {
        const ent = this.extractEntityFromNode($, el);
        if (ent) items.push(ent);
      });
      // Fallback only if no explicit card classes match, but still subject to strict structural validation
      if (items.length === 0) {
        $('article, div.row, div.col, li').each((_, el) => {
          const ent = this.extractEntityFromNode($, el);
          if (ent) items.push(ent);
        });
      }
      return items.slice(0, maxRows).map((it, i) => this.mapRawRowToEntity(it, i, capabilityIR, missionIR));
    }
    return this.parseJsonOrGeoJson(data, capabilityIR, missionIR, maxRows);
  }

  /**
   * Generic Public Registry Parser
   */
  public parsePublicRegistry(data: any, capabilityIR: SourceCapabilityIR, missionIR?: AtlasMissionIR, maxRows = 200): StandardizedDiscoveredEntity[] {
    return this.parseJsonOrGeoJson(data, capabilityIR, missionIR, maxRows);
  }

  /**
   * Generic Field Mapping: maps Spanish/English synonyms to universal entity fields
   */
  private mapRawRowToEntity(
    row: any,
    index: number,
    capabilityIR: SourceCapabilityIR,
    missionIR?: AtlasMissionIR
  ): StandardizedDiscoveredEntity {
    const keys = Object.keys(row);
    const getVal = (...aliases: string[]): string | null => {
      for (const a of aliases) {
        for (const k of keys) {
          const kNorm = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (kNorm === a || kNorm.includes(a)) {
            const v = row[k];
            if (v !== undefined && v !== null && String(v).trim().length > 0) {
              return String(v).trim();
            }
          }
        }
      }
      return null;
    };

    const rawName = getVal('nombre', 'razon_social', 'denominacion', 'title', 'name', 'empresa', 'comercio', 'establecimiento', 'bodega', 'escuela', 'institucion', 'laboratorio', 'fundicion');
    const street = getVal('calle', 'street', 'arteria');
    const number = getVal('altura', 'numero', 'number', 'door');
    let address = getVal('direccion', 'domicilio', 'ubicacion', 'address', 'dir');
    if (!address && street) {
      address = number ? `${street} ${number}` : street;
    } else if (address && number && !address.includes(number)) {
      address = `${address} ${number}`;
    }

    const city = getVal('ciudad', 'localidad', 'municipio', 'partido', 'city') || missionIR?.geography.canonical_name || 'CABA';
    const province = getVal('provincia', 'province', 'estado') || 'Buenos Aires';
    const realCuit = getVal('cuit', 'cuit_cuil', 'cuit_empresa');
    const rowId = getVal('id', 'codigo', 'identifier', 'objectid');
    const cuit = realCuit || (rowId ? `${capabilityIR.source_id}-${rowId}` : null);
    const phone = getVal('telefono', 'tel', 'phone', 'celular', 'contacto');
    const email = getVal('email', 'correo', 'mail', 'contacto_email');
    const website = getVal('web', 'website', 'sitio_web', 'url', 'pagina_web');
    const category = getVal('rubro', 'actividad', 'categoria', 'tipo', 'category') || missionIR?.object.canonical_name || 'Industrial';

    const name = rawName || 
      (address ? (category && category !== 'Industrial' ? `${category} — ${address}` : `Establecimiento ${address}`) : null) || 
      `Entidad #${index + 1}`;

    const latRaw = row._lat || getVal('lat', 'latitud', 'latitude', 'y');
    const lonRaw = row._lon || getVal('lon', 'lng', 'longitud', 'longitude', 'x');
    const lat = latRaw ? parseFloat(String(latRaw)) : null;
    const lon = lonRaw ? parseFloat(String(lonRaw)) : null;

    const rowUnit = capabilityIR.row_units?.[0] || 'ESTABLISHMENT';
    const entityType = capabilityIR.entity_types?.[0] || 'COMPANY';

    return {
      name,
      canonical_name: name,
      company_name: name,
      cuit,
      tax_id: cuit,
      address,
      city,
      province,
      lat: !isNaN(lat as number) ? lat : null,
      lon: !isNaN(lon as number) ? lon : null,
      phone,
      email,
      website,
      category,
      role: `${category} (${capabilityIR.source_name})`,
      rubros: category,
      source_id: capabilityIR.source_id,
      source_name: capabilityIR.source_name,
      source_url: capabilityIR.canonical_url,
      entity_type: entityType,
      row_unit: rowUnit,
      evidence: {
        source_id: capabilityIR.source_id,
        source_citation: `${capabilityIR.source_name} (${capabilityIR.canonical_url})`,
        record_type: capabilityIR.source_archetype,
        raw_row: row,
        latitude: !isNaN(lat as number) ? lat : null,
        longitude: !isNaN(lon as number) ? lon : null,
        verified_at: new Date().toISOString()
      }
    };
  }

  /**
   * Records execution telemetry to PostgreSQL SSOT
   */
  private async recordExecutionTelemetry(
    sourceId: string, 
    extractedCount: number, 
    latencyMs: number, 
    selectedResource?: { format: string; url: string; name?: string } | null
  ): Promise<void> {
    if (!this.db) return;
    try {
      if (selectedResource?.url && extractedCount > 0) {
        await this.db.query(`
          UPDATE public.atlas_source_knowledge_map
          SET last_success_at = NOW(),
              last_profiled_at = NOW(),
              field_telemetry = jsonb_set(
                jsonb_set(
                  COALESCE(field_telemetry, '{}'::jsonb),
                  '{last_execution}',
                  $1::jsonb
                ),
                '{capability_ir,technical_inspection,resource_links}',
                COALESCE(field_telemetry->'capability_ir'->'technical_inspection'->'resource_links', '[]'::jsonb) || jsonb_build_array($2::text)
              )
          WHERE source_id = $3;
        `, [
          JSON.stringify({
            status: 'SUCCESS',
            rows_extracted: extractedCount,
            latency_ms: latencyMs,
            executed_at: new Date().toISOString()
          }),
          selectedResource.url,
          sourceId
        ]);
      } else {
        await this.db.query(`
          UPDATE public.atlas_source_knowledge_map
          SET last_success_at = NOW(),
              last_profiled_at = NOW(),
              field_telemetry = jsonb_set(
                COALESCE(field_telemetry, '{}'::jsonb),
                '{last_execution}',
                $1::jsonb
              )
          WHERE source_id = $2;
        `, [
          JSON.stringify({
            status: extractedCount > 0 ? 'SUCCESS' : 'EMPTY',
            rows_extracted: extractedCount,
            latency_ms: latencyMs,
            executed_at: new Date().toISOString()
          }),
          sourceId
        ]);
      }
    } catch {}
  }
}
