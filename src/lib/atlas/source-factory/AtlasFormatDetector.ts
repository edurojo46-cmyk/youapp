/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasFormatDetector.ts
 * Path: src/lib/atlas/source-factory/AtlasFormatDetector.ts
 * 
 * Physical format classification and structure discovery for raw data sources.
 * Supports: CSV, JSON, REST JSON API, CKAN, HTML TABLE, XML, RSS/ATOM, SITEMAP.
 * NO arbitrary code generation. NO PDF or browser automation in V1.
 */

export type DiscoveredFormat =
  | 'CSV'
  | 'JSON'
  | 'REST_JSON_API'
  | 'CKAN'
  | 'HTML_TABLE'
  | 'XML'
  | 'RSS_ATOM'
  | 'SITEMAP'
  | 'UNKNOWN';

export interface DiscoveredFormatInfo {
  format: DiscoveredFormat;
  encoding: string;
  confidence: number;
  delimiter?: string;
  json_root_path?: string;
  detected_schema?: {
    fields: string[];
    sample_record_count: number;
    sample_records: Record<string, any>[];
  };
  pagination_hints?: {
    has_pagination: boolean;
    type?: 'NONE' | 'OFFSET_LIMIT' | 'PAGE_NUMBER' | 'CURSOR';
    param_page?: string;
    param_limit?: string;
  };
  rate_limit_hints?: {
    requests_per_minute?: number;
    delay_ms?: number;
  };
}

export class AtlasFormatDetector {
  /**
   * Sniffs buffer or text sample and detects format, schema, delimiter, and pagination hints.
   */
  public static detect(
    sample: string | Buffer,
    hints?: { contentType?: string; url?: string; headers?: Record<string, string> }
  ): DiscoveredFormatInfo {
    const text = typeof sample === 'string' ? sample : sample.toString('utf8');
    const trimmed = text.trim();
    const contentType = (hints?.contentType || '').toLowerCase();
    const url = (hints?.url || '').toLowerCase();

    // 1. CKAN Detection
    if (
      url.includes('/api/3/action/') ||
      trimmed.includes('"help"') && trimmed.includes('"result"') ||
      (trimmed.startsWith('{') && trimmed.includes('"success": true') && trimmed.includes('"result"'))
    ) {
      return this.analyzeCkan(trimmed);
    }

    // 2. JSON & REST JSON API Detection
    if (
      contentType.includes('application/json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      return this.analyzeJson(trimmed, url);
    }

    // 3. XML / RSS / ATOM / SITEMAP Detection
    if (
      contentType.includes('xml') ||
      trimmed.startsWith('<?xml') ||
      trimmed.startsWith('<rss') ||
      trimmed.startsWith('<feed') ||
      trimmed.startsWith('<urlset') ||
      trimmed.startsWith('<sitemapindex')
    ) {
      return this.analyzeXml(trimmed);
    }

    // 4. HTML Table Detection
    if (
      contentType.includes('text/html') ||
      trimmed.includes('<table') ||
      (trimmed.includes('<tr') && trimmed.includes('<td'))
    ) {
      const htmlTableInfo = this.analyzeHtmlTable(trimmed);
      if (htmlTableInfo.confidence > 0.5) return htmlTableInfo;
    }

    // 5. CSV / TSV Detection
    if (
      contentType.includes('csv') ||
      url.endsWith('.csv') ||
      url.endsWith('.tsv') ||
      trimmed.includes(',') ||
      trimmed.includes(';') ||
      trimmed.includes('\t')
    ) {
      const csvInfo = this.analyzeCsv(trimmed);
      if (csvInfo.confidence > 0.4) return csvInfo;
    }

    return {
      format: 'UNKNOWN',
      encoding: 'UTF-8',
      confidence: 0,
      detected_schema: {
        fields: [],
        sample_record_count: 0,
        sample_records: []
      }
    };
  }

  private static analyzeCkan(text: string): DiscoveredFormatInfo {
    try {
      const parsed = JSON.parse(text);
      let records: any[] = [];
      let rootPath = '';

      if (parsed.result?.records && Array.isArray(parsed.result.records)) {
        records = parsed.result.records.slice(0, 50);
        rootPath = 'result.records';
      } else if (parsed.result?.results && Array.isArray(parsed.result.results)) {
        records = parsed.result.results.slice(0, 50);
        rootPath = 'result.results';
      } else if (Array.isArray(parsed.result)) {
        records = parsed.result.slice(0, 50);
        rootPath = 'result';
      }

      const fields = records.length > 0 ? Object.keys(records[0]) : [];

      return {
        format: 'CKAN',
        encoding: 'UTF-8',
        confidence: 0.95,
        json_root_path: rootPath,
        detected_schema: {
          fields,
          sample_record_count: records.length,
          sample_records: records
        },
        pagination_hints: {
          has_pagination: true,
          type: 'OFFSET_LIMIT',
          param_page: 'offset',
          param_limit: 'limit'
        }
      };
    } catch {
      return {
        format: 'CKAN',
        encoding: 'UTF-8',
        confidence: 0.6
      };
    }
  }

  private static analyzeJson(text: string, url: string): DiscoveredFormatInfo {
    try {
      const parsed = JSON.parse(text);
      let records: any[] = [];
      let rootPath = '';

      if (Array.isArray(parsed)) {
        records = parsed.slice(0, 50);
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Look for common array wrappers
        for (const candidateKey of ['data', 'results', 'records', 'items', 'rows', 'entities']) {
          if (Array.isArray(parsed[candidateKey])) {
            records = parsed[candidateKey].slice(0, 50);
            rootPath = candidateKey;
            break;
          }
        }
      }

      const isRestApi = url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('?');
      const format: DiscoveredFormat = isRestApi ? 'REST_JSON_API' : 'JSON';
      const fields = records.length > 0 && typeof records[0] === 'object' ? Object.keys(records[0]) : [];

      const hasPagination = !Array.isArray(parsed) && (
        'total' in parsed || 'page' in parsed || 'offset' in parsed || 'next' in parsed || 'links' in parsed
      );

      return {
        format,
        encoding: 'UTF-8',
        confidence: 0.9,
        json_root_path: rootPath || undefined,
        detected_schema: {
          fields,
          sample_record_count: records.length,
          sample_records: records
        },
        pagination_hints: hasPagination ? {
          has_pagination: true,
          type: 'PAGE_NUMBER',
          param_page: 'page',
          param_limit: 'limit'
        } : undefined
      };
    } catch {
      return {
        format: 'JSON',
        encoding: 'UTF-8',
        confidence: 0.3
      };
    }
  }

  private static analyzeCsv(text: string): DiscoveredFormatInfo {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      return { format: 'CSV', encoding: 'UTF-8', confidence: 0.1 };
    }

    // Determine delimiter by testing candidate counts
    const candidateDelimiters = [',', ';', '\t', '|'];
    let bestDelim = ',';
    let maxFields = 0;
    let consistency = 0;

    for (const delim of candidateDelimiters) {
      const counts = lines.slice(0, 10).map(l => l.split(delim).length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      if (avg > maxFields) {
        maxFields = avg;
        bestDelim = delim;
        // Check if all lines have same count
        consistency = counts.every(c => c === counts[0]) ? 1.0 : 0.7;
      }
    }

    if (maxFields <= 1) {
      return { format: 'UNKNOWN', encoding: 'UTF-8', confidence: 0 };
    }

    const headerLine = lines[0];
    const fields = headerLine.split(bestDelim).map(f => f.trim().replace(/^["']|["']$/g, ''));
    
    // Parse up to 20 sample records
    const sampleRecords: Record<string, any>[] = [];
    for (let i = 1; i < Math.min(lines.length, 21); i++) {
      const parts = lines[i].split(bestDelim).map(p => p.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, any> = {};
      fields.forEach((col, idx) => {
        row[col] = parts[idx] ?? '';
      });
      sampleRecords.push(row);
    }

    return {
      format: 'CSV',
      encoding: 'UTF-8',
      confidence: consistency >= 1.0 ? 0.95 : 0.7,
      delimiter: bestDelim,
      detected_schema: {
        fields,
        sample_record_count: sampleRecords.length,
        sample_records: sampleRecords
      }
    };
  }

  private static analyzeHtmlTable(text: string): DiscoveredFormatInfo {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
    const match = tableRegex.exec(text);
    if (!match) {
      return { format: 'UNKNOWN', encoding: 'UTF-8', confidence: 0 };
    }

    const tableContent = match[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[] = [];
    let rMatch;
    while ((rMatch = rowRegex.exec(tableContent)) !== null && rows.length < 25) {
      rows.push(rMatch[1]);
    }

    if (rows.length < 2) {
      return { format: 'UNKNOWN', encoding: 'UTF-8', confidence: 0 };
    }

    // Headers from first row th or td
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    const fields: string[] = [];
    let cMatch;
    while ((cMatch = cellRegex.exec(rows[0])) !== null) {
      fields.push(cMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    const sampleRecords: Record<string, any>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rowCells: string[] = [];
      const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellM;
      while ((cellM = cellReg.exec(rows[i])) !== null) {
        rowCells.push(cellM[1].replace(/<[^>]+>/g, '').trim());
      }
      if (rowCells.length > 0) {
        const rowObj: Record<string, any> = {};
        fields.forEach((f, idx) => {
          rowObj[f || `col_${idx}`] = rowCells[idx] ?? '';
        });
        sampleRecords.push(rowObj);
      }
    }

    return {
      format: 'HTML_TABLE',
      encoding: 'UTF-8',
      confidence: 0.85,
      detected_schema: {
        fields,
        sample_record_count: sampleRecords.length,
        sample_records: sampleRecords
      }
    };
  }

  private static analyzeXml(text: string): DiscoveredFormatInfo {
    if (text.includes('<rss') || text.includes('<channel')) {
      return { format: 'RSS_ATOM', encoding: 'UTF-8', confidence: 0.9 };
    }
    if (text.includes('<urlset') || text.includes('<sitemapindex')) {
      return { format: 'SITEMAP', encoding: 'UTF-8', confidence: 0.9 };
    }
    return { format: 'XML', encoding: 'UTF-8', confidence: 0.8 };
  }
}
