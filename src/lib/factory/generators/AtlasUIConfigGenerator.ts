/**
 * ATLAS UI CONFIG GENERATOR V1
 * 
 * Generates declarative DomainUIConfig consumed by AtlasSearchAppShell.
 * Provides clean search headers, filters, columns, detail drawers, and badges
 * without exposing internal queues, worker logs, or radar torque to end users.
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { DomainUIConfig } from '../../fabric/contracts/AtlasDomainPack';

export class AtlasUIConfigGenerator {
  public static generateUIConfig(intent: ParsedDomainIntent): DomainUIConfig {
    if (intent.entity_type === 'COMPANY' || intent.entity_type === 'SUPPLIER') {
      return {
        search_placeholder: 'Buscar proveedores, productos (ej. válvulas, caños, acero, bombas, mecanizado)...',
        primary_column: 'company_name',
        columns: [
          { key: 'company_name', label: 'Empresa / Razón Social', width: '30%' },
          { key: 'industry_sector', label: 'Sector / Rubro', width: '22%' },
          { key: 'products', label: 'Principales Productos', width: '26%' },
          { key: 'province', label: 'Provincia', width: '12%' },
          { key: 'certifications', label: 'Certificaciones', width: '10%' }
        ],
        filters: [
          { key: 'industry_sector', label: 'Sector Industrial', type: 'select', options: ['Metalúrgica y Metalmecánica', 'Petróleo, Gas y Energía', 'Química y Petroquímica', 'Maquinaria y Equipos', 'Construcción e Infraestructura', 'Servicios Industriales'] },
          { key: 'province', label: 'Provincia', type: 'select', options: ['Buenos Aires', 'Santa Fe', 'Córdoba', 'Mendoza', 'Neuquén', 'CABA', 'San Juan', 'Chubut'] },
          { key: 'certifications', label: 'Normas de Calidad', type: 'select', options: ['ISO 9001', 'ISO 14001', 'IRAM', 'API Spec Q1', 'ASME'] },
          { key: 'sipro_status', label: 'Registro SIPRO', type: 'select', options: ['HABILITADO', 'INSCRIPTO', 'EN_TRAMITE'] }
        ],
        detail_sections: [
          { id: 'overview', label: 'Datos Corporativos', fields: ['company_name', 'trade_name', 'cuit', 'industry_sector'] },
          { id: 'products', label: 'Capacidades y Productos', fields: ['products', 'certifications'] },
          { id: 'location', label: 'Planta y Radicación', fields: ['province', 'city'] },
          { id: 'commercial', label: 'Contacto Comercial Público', fields: ['official_website', 'verified_commercial_email', 'commercial_phone'] },
          { id: 'provenance', label: 'Evidencia Oficial', fields: ['sipro_status', 'source_url', 'observed_at'] }
        ],
        badges: [
          {
            field: 'sipro_status',
            values_color_map: {
              'HABILITADO': 'emerald',
              'INSCRIPTO': 'blue',
              'EN_TRAMITE': 'amber'
            }
          }
        ],
        default_sort: { field: 'company_name', direction: 'asc' }
      };
    }

    return {
      search_placeholder: `Buscar en ${intent.display_name}...`,
      primary_column: 'name',
      columns: [{ key: 'name', label: 'Nombre' }],
      filters: [],
      detail_sections: [{ id: 'general', label: 'Detalles', fields: ['name'] }],
      badges: [],
      default_sort: { field: 'name', direction: 'asc' }
    };
  }
}
