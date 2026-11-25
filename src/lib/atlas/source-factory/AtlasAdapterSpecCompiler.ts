/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasAdapterSpecCompiler.ts
 * Path: src/lib/atlas/source-factory/AtlasAdapterSpecCompiler.ts
 * 
 * Compiles a declarative adapter specification from inspected source metadata.
 * Prioritizes reusing certified generic adapters:
 * 1. ADAPTER_OPEN_DATA_CSV
 * 2. ADAPTER_OPEN_DATA_JSON
 * 3. ADAPTER_CKAN_API
 * 4. ADAPTER_HTML_TABLE
 * 5. ADAPTER_PUBLIC_REGISTRY
 * 6. ADAPTER_OSM_OVERPASS
 * 
 * NO ARBITRARY CODE GENERATION.
 */

import type { SourceInspectionResult } from './AtlasSourceInspector.ts';
import type { DiscoveredFormat } from './AtlasFormatDetector.ts';

export interface DeclarativeAdapterSpec {
  spec_id: string;
  source_id: string;
  adapter_id: string;
  reused_existing_adapter: boolean;
  needs_new_adapter: boolean;
  format: DiscoveredFormat;
  encoding: string;
  delimiter?: string;
  json_root_path?: string;
  pagination: {
    type: 'NONE' | 'OFFSET_LIMIT' | 'PAGE_NUMBER' | 'CURSOR';
    param_page?: string;
    param_limit?: string;
    default_limit?: number;
  };
  field_mapping: Record<string, string>; // rawField -> canonicalField
  rate_limit_ms: number;
  executable: boolean;
  compilation_notes: string[];
}

export class AtlasAdapterSpecCompiler {
  /**
   * Compiles an inspection result into a declarative, executable adapter spec.
   */
  public static compile(inspection: SourceInspectionResult): DeclarativeAdapterSpec {
    const spec_id = `SPEC_${inspection.source_id}_${Date.now()}`;
    const formatInfo = inspection.format_info;
    const detectedFields = formatInfo.detected_schema?.fields || [];
    const notes: string[] = [];

    // 1. Determine Field Mappings
    const fieldMapping = this.inferFieldMapping(detectedFields);
    const mappedCanonicalFields = Object.values(fieldMapping);
    
    // Check if at least one identity signal is present
    const hasIdentitySignal = mappedCanonicalFields.some(f => 
      ['NAME', 'PERSON_NAME', 'COMPANY_NAME', 'CUIT', 'DNI', 'IDENTIFIER'].includes(f)
    );

    if (!hasIdentitySignal) {
      notes.push('Schema lacks verifiable identity field (name, cuit, or dni).');
    }

    // 2. Select Adapter by Priority
    let adapterId = 'NEEDS_NEW_ADAPTER';
    let reusedExisting = false;
    let needsNewAdapter = false;

    switch (formatInfo.format) {
      case 'CSV':
        adapterId = 'ADAPTER_OPEN_DATA_CSV';
        reusedExisting = true;
        break;
      case 'JSON':
        adapterId = 'ADAPTER_OPEN_DATA_JSON';
        reusedExisting = true;
        break;
      case 'CKAN':
        adapterId = 'ADAPTER_CKAN_API';
        reusedExisting = true;
        break;
      case 'HTML_TABLE':
        adapterId = 'ADAPTER_HTML_TABLE';
        reusedExisting = true;
        break;
      case 'REST_JSON_API':
        adapterId = 'ADAPTER_PUBLIC_REGISTRY';
        reusedExisting = true;
        break;
      default:
        needsNewAdapter = true;
        adapterId = 'NEEDS_NEW_ADAPTER';
        notes.push(`Format ${formatInfo.format} cannot be handled by existing generic adapter suite.`);
        break;
    }

    if (!hasIdentitySignal && !needsNewAdapter) {
      needsNewAdapter = true;
      adapterId = 'NEEDS_NEW_ADAPTER';
      notes.push('Marked NEEDS_NEW_ADAPTER due to incompatible schema without entity identity fields.');
    }

    const isExecutable = !needsNewAdapter && inspection.source_exists_physically && hasIdentitySignal;

    return {
      spec_id,
      source_id: inspection.source_id,
      adapter_id: adapterId,
      reused_existing_adapter: reusedExisting && !needsNewAdapter,
      needs_new_adapter: needsNewAdapter,
      format: formatInfo.format,
      encoding: inspection.encoding || 'UTF-8',
      delimiter: formatInfo.delimiter,
      json_root_path: formatInfo.json_root_path,
      pagination: {
        type: formatInfo.pagination_hints?.type || 'NONE',
        param_page: formatInfo.pagination_hints?.param_page,
        param_limit: formatInfo.pagination_hints?.param_limit,
        default_limit: 50
      },
      field_mapping: fieldMapping,
      rate_limit_ms: inspection.rate_limit_hints?.delay_ms || 250,
      executable: isExecutable,
      compilation_notes: notes
    };
  }

  /**
   * Deterministic mapping from arbitrary column/property names to Canonical Entity Fields.
   */
  private static inferFieldMapping(rawFields: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};

    for (const raw of rawFields) {
      const norm = raw.toLowerCase().trim().replace(/[\s_\-\.]+/g, '_');

      // Name / Denomination
      if (['razon_social', 'denominacion', 'empresa', 'compania', 'company_name', 'company', 'organizacion', 'organization'].includes(norm)) {
        mapping[raw] = 'COMPANY_NAME';
      } else if (['apellido_y_nombre', 'nombre_y_apellido', 'titular', 'persona', 'person_name', 'nombre_persona'].includes(norm)) {
        mapping[raw] = 'PERSON_NAME';
      } else if (['nombre', 'name', 'contacto', 'nombre_completo', 'full_name'].includes(norm)) {
        mapping[raw] = 'NAME';
      }

      // Identifiers
      else if (['cuit', 'cuil', 'cuit_cuil', 'tax_id'].includes(norm)) {
        mapping[raw] = 'CUIT';
      } else if (['dni', 'documento', 'nro_documento'].includes(norm)) {
        mapping[raw] = 'DNI';
      } else if (['id', 'codigo', 'record_id'].includes(norm)) {
        mapping[raw] = 'IDENTIFIER';
      }

      // Geography
      else if (['provincia', 'province', 'jurisdiccion', 'estado'].includes(norm)) {
        mapping[raw] = 'GEO_PROVINCE';
      } else if (['localidad', 'ciudad', 'municipio', 'partido', 'city'].includes(norm)) {
        mapping[raw] = 'GEO_CITY';
      } else if (['barrio', 'neighborhood', 'comuna'].includes(norm)) {
        mapping[raw] = 'GEO_NEIGHBORHOOD';
      } else if (['domicilio', 'direccion', 'calle', 'address'].includes(norm)) {
        mapping[raw] = 'STREET_ADDRESS';
      }

      // Contact Signals
      else if (['email', 'correo', 'mail', 'correo_electronico', 'e_mail'].includes(norm)) {
        mapping[raw] = 'EMAIL';
      } else if (['telefono', 'tel', 'phone', 'celular', 'whatsapp'].includes(norm)) {
        mapping[raw] = 'PHONE';
      } else if (['linkedin', 'linkedin_url', 'perfil_linkedin'].includes(norm)) {
        mapping[raw] = 'LINKEDIN';
      } else if (['web', 'website', 'sitio_web', 'url'].includes(norm)) {
        mapping[raw] = 'WEBSITE';
      }

      // Occupation / Activity / Rubro
      else if (['rubro', 'actividad', 'profesion', 'oficio', 'sector', 'categoria'].includes(norm)) {
        mapping[raw] = 'OCCUPATION';
      } else if (['tipo_persona', 'tipo_personeria', 'personeria'].includes(norm)) {
        mapping[raw] = 'ENTITY_CLASSIFIER';
      }
    }

    return mapping;
  }
}
