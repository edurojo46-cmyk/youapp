import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computeSchemaFingerprint(headerStr) {
  if (!headerStr) return null;
  return crypto.createHash('sha256').update(headerStr.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function getHeader(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(2048);
  const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
  fs.closeSync(fd);
  const text = buf.toString('utf8', 0, bytesRead);
  return text.split('\n')[0].trim();
}

async function buildLineageGraph() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BUILDING ATLAS FUEL RESOURCE LINEAGE GRAPH');
  console.log('════════════════════════════════════════════════════════════════');

  const lineageEntries = [
    // 1. SSS Prestadores Salud Nuevo
    {
      source_id: 'RES_SSS_PRESTADORES_SALUD',
      catalog_id: 'CAT_DATOS_SALUD_GOB_AR',
      dataset_id: '1e7d12d4-d097-4f17-8277-fd671361f3db',
      resource_id: '9595ce31-b8e0-40ed-afa4-e8783141ea74',
      canonical_resource_url: 'http://datos.salud.gob.ar/dataset/1e7d12d4-d097-4f17-8277-fd671361f3db/resource/9595ce31-b8e0-40ed-afa4-e8783141ea74/download/registro-profesionales-sss-20190826.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Registro Nacional de Prestadores Profesionales Inscriptos en la SSS (Nuevo Sistema)',
      physical_file: 'scratch/physical_sources/registro_profesionales_sss.csv',
      entity_type: 'PROFESIONAL_SALUD',
      date_range: '2019-2024',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_INVALID / SOURCE_REQUIRES_REMEDIATION'
    },
    // 2. SSS Prestadores Salud Histórico
    {
      source_id: 'RES_SSS_PRESTADORES_HISTORICO',
      catalog_id: 'CAT_DATOS_SALUD_GOB_AR',
      dataset_id: '1e7d12d4-d097-4f17-8277-fd671361f3db',
      resource_id: '8f9e74d6-c0ae-412c-af9e-913ccf90e5b7',
      canonical_resource_url: 'http://datos.salud.gob.ar/dataset/1e7d12d4-d097-4f17-8277-fd671361f3db/resource/8f9e74d6-c0ae-412c-af9e-913ccf90e5b7/download/registro_profesionales_historico_sss_20190826.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Registro Nacional de Prestadores Profesionales Inscriptos en la SSS (Sistema Histórico)',
      physical_file: 'scratch/physical_sources/registro_profesionales_historico_sss.csv',
      entity_type: 'PROFESIONAL_SALUD',
      date_range: '1990-2019',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_INVALID / SOURCE_REQUIRES_REMEDIATION'
    },
    // 3. DDJJ Anteriores
    {
      source_id: 'RES_DDJJ_ANTERIORES_FUNCION_PUB',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: 'eda31892-54f7-414d-9685-bd711b757895',
      resource_id: '0ef17546-2ce7-4512-a636-3e3a1757da1a',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/eda31892-54f7-414d-9685-bd711b757895/resource/0ef17546-2ce7-4512-a636-3e3a1757da1a/download/ddjj-actividades-anteriores-funcion-publica-20260630.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Declaraciones Juradas de actividades anteriores a la función pública',
      physical_file: 'scratch/physical_sources/ddjj_actividades_anteriores_202606.csv',
      entity_type: 'FUNCIONARIO_PUBLICO',
      date_range: '2016-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 4. DDJJ Posteriores
    {
      source_id: 'RES_DDJJ_POSTERIORES_FUNCION_PUB',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: 'eda31892-54f7-414d-9685-bd711b757895',
      resource_id: '602967b2-f404-4ff7-9fd3-8779d2ba0e9b',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/eda31892-54f7-414d-9685-bd711b757895/resource/602967b2-f404-4ff7-9fd3-8779d2ba0e9b/download/ddjj-actividades-posteriores-funcion-publica-20260630.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Declaraciones Juradas de actividades posteriores a la función pública',
      physical_file: 'scratch/physical_sources/ddjj_actividades_posteriores_202606.csv',
      entity_type: 'FUNCIONARIO_PUBLICO',
      date_range: '2016-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 5. Magistrados Designaciones
    {
      source_id: 'RES_MAGISTRADOS_DESIGNACIONES',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '9f397011-5459-4f1c-b88e-9f48f7824e03',
      resource_id: 'd4fd21f4-f5c5-48f5-a12d-511981f997dc',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/9f397011-5459-4f1c-b88e-9f48f7824e03/resource/d4fd21f4-f5c5-48f5-a12d-511981f997dc/download/magistrados-justicia-federal-nacional-designaciones-20260911.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Designaciones de magistrados de la Justicia Federal y de la Justicia Nacional',
      physical_file: 'scratch/physical_sources/magistrados_designaciones_202609.csv',
      entity_type: 'JUEZ_MAGISTRADO',
      date_range: '1983-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 6. Magistrados Jueces
    {
      source_id: 'RES_MAGISTRADOS_JUECES',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '3c18d46e-729e-4973-8efd-f54cab18b7e3',
      resource_id: 'b12bdbb7-646f-4701-99b7-1109ce919dd5',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/3c18d46e-729e-4973-8efd-f54cab18b7e3/resource/b12bdbb7-646f-4701-99b7-1109ce919dd5/download/magistrados-justicia-federal-nacional-jueces-20260605.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Magistrados de la Justicia Federal y de la Justicia Nacional - Jueces',
      physical_file: 'scratch/physical_sources/magistrados_jueces.csv',
      entity_type: 'JUEZ_MAGISTRADO',
      date_range: '2026-06',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 7. Magistrados Renuncias
    {
      source_id: 'RES_MAGISTRADOS_RENUNCIAS',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '36c14e01-d3f6-47f3-9f12-9c25a48fe8c6',
      resource_id: 'e0e6483e-bc07-4c3e-a262-6095065f3e6e',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/36c14e01-d3f6-47f3-9f12-9c25a48fe8c6/resource/e0e6483e-bc07-4c3e-a262-6095065f3e6e/download/magistrados-justicia-federal-nacional-renuncias-20260911.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Renuncias de magistrados de la Justicia Federal y la Justicia Nacional',
      physical_file: 'scratch/physical_sources/magistrados_renuncias.csv',
      entity_type: 'JUEZ_MAGISTRADO',
      date_range: '1983-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 8. Magistrados Traslados
    {
      source_id: 'RES_MAGISTRADOS_TRASLADOS',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '94577848-f0c3-42bd-8289-9f751f98fb5a',
      resource_id: 'ade07cd0-734d-43a7-a620-c39fcea1fed4',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/94577848-f0c3-42bd-8289-9f751f98fb5a/resource/ade07cd0-734d-43a7-a620-c39fcea1fed4/download/jueces-justicia-federal-nacional-traslados-20220323.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Traslados de jueces de la Justicia Federal y de la Justicia Nacional',
      physical_file: 'scratch/physical_sources/magistrados_traslados.csv',
      entity_type: 'JUEZ_MAGISTRADO',
      date_range: '2001-2022',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 9. Magistrados Ternas
    {
      source_id: 'RES_MAGISTRADOS_TERNAS',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: 'a6eb5ab3-5c4c-40cb-b901-839f60a148e4',
      resource_id: 'aa6bcb49-e24f-489e-a650-788f5e2a3bb4',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/a6eb5ab3-5c4c-40cb-b901-839f60a148e4/resource/aa6bcb49-e24f-489e-a650-788f5e2a3bb4/download/ternas-seleccion-magistrados-poder-judicial-ministerio-publico-20260505.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Ternas para la selección de magistrados en el Poder Judicial y el Ministerio Público',
      physical_file: 'scratch/physical_sources/ternas_magistrados_202605.csv',
      entity_type: 'POSTULANTE_MAGISTRATURA',
      date_range: '2000-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 10. Magistrados CV
    {
      source_id: 'RES_MAGISTRADOS_CV',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '2892f2ad-e1f0-47ba-98bf-14ca693f3750',
      resource_id: 'd69f519e-9b34-4080-bfe1-775970beb077',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/2892f2ad-e1f0-47ba-98bf-14ca693f3750/resource/d69f519e-9b34-4080-bfe1-775970beb077/download/cv-magistrados-poder-judicial-ministerio-publico-20260505.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Curriculums Vitae de magistrados para cubrir vacantes en el PJN y MPN',
      physical_file: 'scratch/physical_sources/cv_magistrados_202605.csv',
      entity_type: 'POSTULANTE_MAGISTRATURA',
      date_range: '2000-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 11. Cortes Tribunales Superiores Provincias
    {
      source_id: 'RES_AUTORIDADES_CORTES_TRIBUNALES',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '1941a479-1a53-4b3b-9600-443f3b991b81',
      resource_id: '3300a3a2-194f-4bec-811c-abc9777100f6',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/1941a479-1a53-4b3b-9600-443f3b991b81/resource/3300a3a2-194f-4bec-811c-abc9777100f6/download/autoridades-tribunales-superiores-y-cortes-supremas-de-justicia-20240918.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Autoridades de los Tribunales Superiores y Cortes Supremas de Justicia',
      physical_file: 'scratch/physical_sources/autoridades_tribunales_superiores.csv',
      entity_type: 'JUEZ_SUPREMO_PROVINCIAL',
      date_range: '2024',
      geographic_scope: 'NATIONAL_PROVINCIAL',
      tls_status: 'TLS_VALID'
    },
    // 12. ReFeGLo Gobiernos Locales
    {
      source_id: 'RES_REFGLO_GOBIERNOS_LOCALES',
      catalog_id: 'CAT_DATOS_MININTERIOR_GOB_AR',
      dataset_id: '8431ab79-3f44-41ee-b72b-cdc645f68d1e',
      resource_id: 'ebe52783-6a7f-4112-8a7f-a17c91cb6b4e',
      canonical_resource_url: 'http://datos.mininterior.gob.ar/dataset/8431ab79-3f44-41ee-b72b-cdc645f68d1e/resource/ebe52783-6a7f-4112-8a7f-a17c91cb6b4e/download/brgl_-portal-andino-23_12.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Base de Registro Federal de Gobiernos Locales (ReFeGLo)',
      physical_file: 'scratch/physical_sources/brgl_gobiernos_locales.csv',
      entity_type: 'INTENDENTE_ALCALDE_MUNICIPAL',
      date_range: '2023-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 13. Auditorías Energía
    {
      source_id: 'RES_PADRON_AUDITORIAS_ENERGIA',
      catalog_id: 'CAT_DATOS_ENERGIA_GOB_AR',
      dataset_id: 'df832dab-b67c-4952-9f37-1bd28136967a',
      resource_id: '51af09a5-62ff-4fcc-bc42-0120a45131ce',
      canonical_resource_url: 'http://datos.energia.gob.ar/dataset/df832dab-b67c-4952-9f37-1bd28136967a/resource/51af09a5-62ff-4fcc-bc42-0120a45131ce/download/resolucin-318-control-de-auditoras.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Resolución 318 - Control de Auditorías de Instalaciones y Profesionales',
      physical_file: 'scratch/physical_sources/resolucion_318_auditorias.csv',
      entity_type: 'AUDITOR_PROFESIONAL',
      date_range: '2019-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 14. GCBA Administradores Consorcio
    {
      source_id: 'RES_GCBA_ADMINISTRADORES_CONSORCIO',
      catalog_id: 'CAT_DATA_BUENOSAIRES_GOB_AR',
      dataset_id: 'registro-administradores-consorcio',
      resource_id: 'csv-consorcios-2026',
      canonical_resource_url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/registro-administradores-consorcio/registro-administradores-de-consorcio.csv',
      parent_catalog: 'CAT_DATA_BUENOSAIRES_GOB_AR',
      parent_dataset: 'Registro Público de Administradores de Consorcios',
      physical_file: 'scratch/physical_sources/gcba_administradores_consorcio.csv',
      entity_type: 'ADMINISTRADOR_INMOBILIARIO',
      date_range: '2003-2026',
      geographic_scope: 'CABA',
      tls_status: 'TLS_VALID'
    },
    // 15. GCBA Autoridades Superiores
    {
      source_id: 'RES_GCBA_AUTORIDADES_SUPERIORES',
      catalog_id: 'CAT_DATA_BUENOSAIRES_GOB_AR',
      dataset_id: 'autoridades-superiores-funcionarios',
      resource_id: 'csv-autoridades-2024-2026',
      canonical_resource_url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2026.csv',
      parent_catalog: 'CAT_DATA_BUENOSAIRES_GOB_AR',
      parent_dataset: 'Autoridades Superiores y Funcionarios del GCBA',
      physical_file: 'scratch/physical_sources/gcba_autoridades_2026.csv',
      entity_type: 'FUNCIONARIO_PROVINCIAL_CABA',
      date_range: '2024-2026',
      geographic_scope: 'CABA',
      tls_status: 'TLS_VALID'
    },
    // 16. IGJ Slice Unconsumed
    {
      source_id: 'SRC_PHYSICAL_IGJ_NAC_UNCONSUMED_SLICE',
      catalog_id: 'CAT_DATOS_JUS_GOB_AR',
      dataset_id: '30f36834-49f0-4d9e-91d9-33621fb52b6d',
      resource_id: '30558188-9c77-41cb-8c83-06f3bb84b0bf',
      canonical_resource_url: 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'IGJ Autoridades de Entidades por Género (Lines 1.6M-1.85M)',
      physical_file: 'scratch/physical_sources/igj_autoridades_genero_202603.csv',
      entity_type: 'DIRECTOR_SOCIETARIO',
      date_range: '2026-03',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 17. SIPRO Proveedores del Estado (NEW DISCOVERY)
    {
      source_id: 'RES_SIPRO_PROVEEDORES_ESTADO',
      catalog_id: 'CAT_INFRA_DATOS_GOB_AR',
      dataset_id: 'catalog-jgm-dataset-4',
      resource_id: 'distribution-4.23',
      canonical_resource_url: 'https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution/4.23/download/SiPRO.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR',
      parent_dataset: 'Sistema de Contrataciones Electrónicas - SIPRO',
      physical_file: 'scratch/physical_sources/sipro_proveedores.csv',
      entity_type: 'PROVEEDOR_CONTRATISTA_ESTATAL',
      date_range: '2016-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 18. Compras Adjudicaciones Contractuales (NEW DISCOVERY)
    {
      source_id: 'RES_COMPRAS_ADJUDICACIONES',
      catalog_id: 'CAT_INFRA_DATOS_GOB_AR',
      dataset_id: 'catalog-jgm-dataset-4',
      resource_id: 'distribution-4.22',
      canonical_resource_url: 'https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution/4.22/download/Adjudicaciones.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR',
      parent_dataset: 'Sistema de Contrataciones Electrónicas - Adjudicaciones',
      physical_file: 'scratch/physical_sources/compras_adjudicaciones.csv',
      entity_type: 'CONTRATISTA_ADJUDICATARIO',
      date_range: '2016-2026',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    },
    // 19. Audiencias Gestión de Intereses (MinInterior)
    {
      source_id: 'RES_MININTERIOR_AUDIENCIAS',
      catalog_id: 'CAT_DATOS_MININTERIOR_GOB_AR',
      dataset_id: 'f9fcd62a-3656-4bb9-ba83-7544b4b156b8',
      resource_id: 'resource-audiencias-2022-2024',
      canonical_resource_url: 'http://datos.mininterior.gob.ar/dataset/f9fcd62a-3656-4bb9-ba83-7544b4b156b8/resource/8fa4823d-0f38-419d-9518-499792d826dd/download/2024.csv',
      parent_catalog: 'CAT_DATOS_GOB_AR (Federated)',
      parent_dataset: 'Registro Único de Audiencias de Gestión de Intereses (2004-2025)',
      physical_file: 'scratch/physical_sources/audiencias_2024.csv',
      entity_type: 'FUNCIONARIO_Y_SOLICITANTE',
      date_range: '2004-2025',
      geographic_scope: 'NATIONAL',
      tls_status: 'TLS_VALID'
    }
  ];

  const graph = [];

  for (const entry of lineageEntries) {
    const fileExists = fs.existsSync(entry.physical_file);
    const sha256 = fileExists ? computeFileSha256(entry.physical_file) : null;
    const header = fileExists ? getHeader(entry.physical_file) : null;
    const schemaFp = computeSchemaFingerprint(header);
    const underlyingFp = crypto.createHash('sha256').update(`${entry.parent_dataset}:${entry.entity_type}:${entry.geographic_scope}`).digest('hex').slice(0, 16);

    const lineageObj = {
      SOURCE_ID: entry.source_id,
      CATALOG_ID: entry.catalog_id,
      DATASET_ID: entry.dataset_id,
      RESOURCE_ID: entry.resource_id,
      CANONICAL_RESOURCE_URL: entry.canonical_resource_url,
      UNDERLYING_DATASET_FINGERPRINT: underlyingFp,
      PARENT_CATALOG: entry.parent_catalog,
      PARENT_DATASET: entry.parent_dataset,
      CONTENT_SHA256: sha256,
      SCHEMA_FINGERPRINT: schemaFp,
      DATE_RANGE: entry.date_range,
      GEOGRAPHIC_SCOPE: entry.geographic_scope,
      TLS_STATUS: entry.tls_status,
      LOCAL_FILE_PATH: entry.physical_file
    };

    graph.push(lineageObj);
    console.log(`✓ Lineage mapped: [${entry.source_id}] Catalog: ${entry.catalog_id} | SchemaFP: ${schemaFp} | TLS: ${entry.tls_status}`);
  }

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_LINEAGE_NODES: graph.length,
    LINEAGE_GRAPH: graph
  };

  fs.writeFileSync('reports/atlas/certification/atlas_fuel_resource_lineage.json', JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync('scratch/atlas_fuel_resource_lineage.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(`Saved lineage graph to reports/atlas/certification/atlas_fuel_resource_lineage.json`);
}

buildLineageGraph().catch(console.error);
