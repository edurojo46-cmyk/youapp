/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasGeneratedAdapterValidator.ts
 * Path: src/lib/atlas/source-factory/AtlasGeneratedAdapterValidator.ts
 * 
 * Safety & Integrity Validator for Declarative Adapter Specs.
 * Ensures strict declarative configuration without arbitrary code execution,
 * verifies allowed adapter reuse, and checks minimal entity identity mapping.
 */

import type { DeclarativeAdapterSpec } from './AtlasAdapterSpecCompiler.ts';

export interface AdapterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class AtlasGeneratedAdapterValidator {
  private static readonly ALLOWED_ADAPTERS = new Set([
    'ADAPTER_OPEN_DATA_CSV',
    'ADAPTER_OPEN_DATA_JSON',
    'ADAPTER_CKAN_API',
    'ADAPTER_HTML_TABLE',
    'ADAPTER_PUBLIC_REGISTRY',
    'ADAPTER_OSM_OVERPASS',
    'ADAPTER_BULK_CSV_CONNECTOR'
  ]);

  public static validate(spec: DeclarativeAdapterSpec): AdapterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Adapter Existence & Reusability
    if (spec.needs_new_adapter || spec.adapter_id === 'NEEDS_NEW_ADAPTER') {
      errors.push('Spec requires a new specialized adapter (NEEDS_NEW_ADAPTER). Cannot execute with generic suite.');
    } else if (!this.ALLOWED_ADAPTERS.has(spec.adapter_id)) {
      errors.push(`Unrecognized adapter_id: '${spec.adapter_id}'. Must be in certified reusable adapter suite.`);
    }

    // 2. Identity Signal Validation
    const mappedValues = Object.values(spec.field_mapping);
    const hasIdentity = mappedValues.some(val => 
      ['NAME', 'PERSON_NAME', 'COMPANY_NAME', 'CUIT', 'DNI', 'IDENTIFIER'].includes(val)
    );

    if (!hasIdentity) {
      errors.push('Adapter spec must map at least one primary identity attribute (NAME, PERSON_NAME, COMPANY_NAME, CUIT, DNI).');
    }

    // 3. Security Sanity Checks (NO code expressions)
    for (const [key, val] of Object.entries(spec.field_mapping)) {
      if (typeof val !== 'string' || /[<>{}\(\)\[\];=`]/.test(val) || val.includes('eval') || val.includes('function')) {
        errors.push(`Unsafe field mapping detected for '${key}': '${val}'.`);
      }
    }

    // 4. Delimiter checks for CSV
    if (spec.format === 'CSV' && !spec.delimiter) {
      warnings.push('CSV format without explicit delimiter; defaulting to comma.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
