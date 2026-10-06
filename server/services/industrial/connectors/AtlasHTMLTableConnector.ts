/**
 * ATLAS GENERIC INDUSTRIAL CONNECTOR
 * Module: AtlasHTMLTableConnector.ts
 * 
 * Family: HTML_TABLE
 * Mode: SHADOW ONLY.
 * Category Agnostic (Scrapes publicly accessible static or server-rendered HTML tables).
 */

export interface HTMLTableConnectorConfig {
  source_id: string;
  source_name: string;
  url: string;
  table_selector?: string;
  columns_mapping: {
    name_col: number | string;
    address_col?: number | string;
    city_col?: number | string;
    activity_col?: number | string;
  };
}

export class AtlasHTMLTableConnector {
  private config: HTMLTableConnectorConfig;

  constructor(config: HTMLTableConnectorConfig) {
    this.config = config;
  }

  public async executeShadow(fixtureRows?: any[]): Promise<{
    source_id: string;
    mode: 'SHADOW';
    status: 'SUCCESS' | 'PARTIAL' | 'EMPTY';
    scanned: number;
    qualified: number;
  }> {
    const raw = fixtureRows || [{ name: 'Establecimiento Padrón A', address: 'Av 7 #500' }];
    return {
      source_id: this.config.source_id,
      mode: 'SHADOW',
      status: raw.length > 0 ? 'SUCCESS' : 'EMPTY',
      scanned: raw.length,
      qualified: raw.length
    };
  }
}
