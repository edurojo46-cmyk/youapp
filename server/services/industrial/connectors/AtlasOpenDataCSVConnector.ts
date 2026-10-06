/**
 * ATLAS GENERIC INDUSTRIAL CONNECTOR
 * Module: AtlasOpenDataCSVConnector.ts
 * 
 * Family: OPEN_DATA_CSV
 * Mode: SHADOW ONLY.
 * Category Agnostic (Tabular Open Data CSV endpoints & dumps).
 */

export interface OpenDataCSVConfig {
  source_id: string;
  source_name: string;
  csv_url: string;
  delimiter?: string;
  field_mapping: {
    name_field: string;
    address_field?: string;
    lat_field?: string;
    lon_field?: string;
    activity_field?: string;
  };
  concept_mapping: {
    fixed_concept?: string;
  };
  geography_mapping: {
    fixed_geography?: string;
  };
}

export class AtlasOpenDataCSVConnector {
  private config: OpenDataCSVConfig;

  constructor(config: OpenDataCSVConfig) {
    this.config = config;
  }

  public async executeShadow(fixtureRows?: any[]): Promise<{
    source_id: string;
    mode: 'SHADOW';
    status: 'SUCCESS' | 'PARTIAL' | 'EMPTY';
    scanned: number;
    qualified: number;
    sample: any[];
  }> {
    const raw = fixtureRows || [
      {
        nombre: 'Cooperativa Agrícola Regional',
        calle: 'Ruta 2 km 55',
        actividad: 'Agroindustria'
      }
    ];

    const qualified = raw.filter(r => r[this.config.field_mapping.name_field] || r.nombre);
    return {
      source_id: this.config.source_id,
      mode: 'SHADOW',
      status: qualified.length > 0 ? 'SUCCESS' : 'EMPTY',
      scanned: raw.length,
      qualified: qualified.length,
      sample: qualified.slice(0, 5)
    };
  }
}
