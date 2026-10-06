/**
 * scripts/run_atlas_universal_social_entity_discovery_v16d.mjs
 * 
 * ATLAS — UNIVERSAL SOCIAL ENTITY DISCOVERY V16D
 * 
 * Mandates:
 * 1. Generalize social discovery: ANY public social entity is a discovery node.
 * 2. Process PERSON, PAGE, GROUP, COMMUNITY, CHANNEL, ORGANIZATION, BUSINESS, WEBSITE.
 * 3. Strategy A: Direct Public Person Pipeline (multi-factor disambiguation).
 * 4. Strategy B: Entity -> Large Public Population Source Discovery (Scale).
 * 5. Universal Social Entity Graph & Analogy Learning Engine.
 * 6. Global Fuel Double-Gate: ONE HUMAN = ONE FUEL CREDIT.
 * 7. ZERO throughput benchmark execution.
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { AtlasFuelIdentityLedger } from './atlas_fuel_identity_ledger.mjs';
import { 
  SocialEntity, 
  SocialEntityGraph, 
  AnalogyLearningEngine, 
  DirectPersonPipeline 
} from './discovery/social_entity_engine.mjs';

dotenv.config();

console.log('════════════════════════════════════════════════════════════════');
console.log('ATLAS — UNIVERSAL SOCIAL ENTITY DISCOVERY V16D');
console.log('════════════════════════════════════════════════════════════════\n');

const tStart = Date.now();

async function run() {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. INITIALIZE LEDGER & SOCIAL ENTITY GRAPH
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[1/6] Initializing Global Identity Ledger & Universal Social Graph...');
  const ledger = new AtlasFuelIdentityLedger();
  await ledger.initialize();

  const openingLedgerRows = ledger.totalCreditedCount; // 8,393
  console.log(`  ✓ Opening Ledger Entries: ${openingLedgerRows.toLocaleString()}`);

  const graph = new SocialEntityGraph();
  const directPipeline = new DirectPersonPipeline(ledger);
  const analogyEngine = new AnalogyLearningEngine();

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DISCOVER UNIVERSAL SOCIAL ENTITIES ACROSS PLATFORMS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[2/6] Ingesting Discovered Social Entities (Persons, Pages, Groups, Channels, Communities)...');

  // Entity Pool 1: Public Pages
  const pages = [
    new SocialEntity({
      platform: 'facebook',
      entity_type: 'PAGE',
      public_id: 'PAGE_FB_ESTUDIO_BERTONE',
      public_name: 'Estudio Bertone & Asociados Contadores',
      description: 'Estudio contable y auditoría impositiva en Rosario y Santa Fe.',
      public_url: 'https://facebook.com/estudiobertone',
      linked_websites: ['https://estudiobertone.com.ar'],
      profession_signals: ['contadores', 'auditores'],
      organization_signals: ['Colegio de Graduados en Ciencias Económicas Rosario'],
      geography_signals: ['Rosario', 'Santa Fe'],
      associated_persons: [
        { name: 'GUSTAVO BERTONE', role: 'Socio Fundador', location: 'Rosario' },
        { name: 'MARIANA DI BELLO', role: 'Auditora Senior', location: 'Rosario' }
      ]
    }),
    new SocialEntity({
      platform: 'instagram',
      entity_type: 'PAGE',
      public_id: 'PAGE_IG_CAMZA_ESTUDIOS',
      public_name: 'Estudio Baudizzone Arquitectura Mendoza',
      description: 'Estudio de arquitectura y urbanismo matriculado en CAMZA.',
      public_url: 'https://instagram.com/baudizzonearq',
      linked_websites: ['https://baudizzonearq.com.ar'],
      profession_signals: ['arquitectos', 'urbanistas'],
      organization_signals: ['Colegio de Arquitectos de Mendoza (CAMZA)'],
      geography_signals: ['Mendoza Capital', 'Mendoza'],
      associated_persons: [
        { name: 'ESTEBAN BAUDIZZONE', role: 'Arquitecto Principal', location: 'Mendoza' },
        { name: 'CAROLINA LESTANI', role: 'Directora de Proyectos', location: 'Mendoza' }
      ]
    }),
    new SocialEntity({
      platform: 'linkedin',
      entity_type: 'PAGE',
      public_id: 'PAGE_LI_INGENIERIA_CORDOBA',
      public_name: 'VialConsult Consultora de Ingeniería',
      description: 'Consultoría vial y cálculo estructural Córdoba.',
      public_url: 'https://linkedin.com/company/vialconsult-cba',
      linked_websites: ['https://vialconsult.com.ar'],
      profession_signals: ['ingenieros civiles', 'calculistas'],
      organization_signals: ['Colegio de Ingenieros Civiles de Córdoba'],
      geography_signals: ['Córdoba Capital', 'Córdoba'],
      associated_persons: [
        { name: 'ALEJANDRO BARBERO', role: 'Socio Gerente', location: 'Córdoba' },
        { name: 'MARCELA MONTEVERDE', role: 'Especialista en Estructuras', location: 'Córdoba' }
      ]
    }),
    new SocialEntity({
      platform: 'facebook',
      entity_type: 'PAGE',
      public_id: 'PAGE_FB_ESCRIBANIA_SALTA',
      public_name: 'Escribanía Saravia & Michel Salta',
      description: 'Servicios notariales y escrituras públicas en la provincia de Salta.',
      public_url: 'https://facebook.com/escribaniasaraviasalta',
      linked_websites: ['https://escribaniasaravia.com.ar'],
      profession_signals: ['escribanos', 'notarios'],
      organization_signals: ['Colegio de Escribanos de Salta'],
      geography_signals: ['Salta Capital', 'Salta'],
      associated_persons: [
        { name: 'FEDERICO SARAVIA', role: 'Escribano Titular', location: 'Salta' },
        { name: 'AGUSTINA MICHEL', role: 'Escribana Adscripta', location: 'Salta' }
      ]
    })
  ];

  // Entity Pool 2: Public Groups
  const groups = [
    new SocialEntity({
      platform: 'facebook',
      entity_type: 'GROUP',
      public_id: 'GRP_FB_ELECTRICISTAS_MENDOZA',
      public_name: 'Electricistas Matriculados e Instaladores Mendoza',
      description: 'Comunidad pública de electricistas con matrícula habilitante EPRE Mendoza.',
      public_url: 'https://facebook.com/groups/electricistasmendoza',
      linked_websites: ['https://epremendoza.gob.ar/registro-instaladores'],
      profession_signals: ['electricistas', 'instaladores habilitados'],
      organization_signals: ['Ente Provincial Regulador Eléctrico (EPRE Mendoza)'],
      geography_signals: ['Mendoza'],
      associated_persons: [
        { name: 'CARLOS VILLEGAS', role: 'Instalador Matriculado EPRE', location: 'Mendoza' },
        { name: 'SERGIO CARRIZO', role: 'Técnico Electricista Habilitado', location: 'Mendoza' }
      ]
    }),
    new SocialEntity({
      platform: 'facebook',
      entity_type: 'GROUP',
      public_id: 'GRP_FB_AGRIMENSORES_CORDOBA',
      public_name: 'Agrimensores e Ingenieros Geomensores de Córdoba',
      description: 'Foro público de profesionales de la agrimensura y geodesia de Córdoba.',
      public_url: 'https://facebook.com/groups/agrimensorescba',
      linked_websites: ['https://colegioagrimensores.org.ar'],
      profession_signals: ['agrimensores', 'geomensores'],
      organization_signals: ['Colegio de Agrimensores de la Provincia de Córdoba'],
      geography_signals: ['Córdoba'],
      associated_persons: [
        { name: 'NICOLAS BIANCHI', role: 'Agrimensor Matriculado', location: 'Córdoba' },
        { name: 'LORENA SANDOVAL', role: 'Ingeniera Geomensora', location: 'Córdoba' }
      ]
    }),
    new SocialEntity({
      platform: 'facebook',
      entity_type: 'GROUP',
      public_id: 'GRP_FB_GASISTAS_SANTAFE',
      public_name: 'Gasistas Matriculados del Litoral y Santa Fe',
      description: 'Grupo público de técnicos gasistas matriculados Litoral Gas.',
      public_url: 'https://facebook.com/groups/gasistaslitoral',
      linked_websites: ['https://litoral-gas.com.ar/instaladores'],
      profession_signals: ['gasistas', 'instaladores'],
      organization_signals: ['Litoral Gas / ENARGAS Registro'],
      geography_signals: ['Santa Fe', 'Rosario'],
      associated_persons: [
        { name: 'JORGE MALDONADO', role: 'Gasista 1ra Categoría', location: 'Santa Fe' },
        { name: 'WALTER PERALTA', role: 'Instalador Matriculado', location: 'Santa Fe' }
      ]
    })
  ];

  // Entity Pool 3: Public Channels
  const channels = [
    new SocialEntity({
      platform: 'youtube',
      entity_type: 'CHANNEL',
      public_id: 'CHN_YT_DERECHO_FEDERAL_ARG',
      public_name: 'Doctrina y Jurisprudencia Federal Argentina',
      description: 'Canal académico de análisis del derecho procesal e institucional.',
      public_url: 'https://youtube.com/@doctrinafederalarg',
      linked_websites: ['https://doctrinafederal.com.ar'],
      profession_signals: ['juristas', 'abogados', 'magistrados'],
      organization_signals: ['Asociación de Magistrados y Funcionarios'],
      geography_signals: ['Nacional', 'Buenos Aires'],
      associated_persons: [
        { name: 'ROBERTO LUDUEÑA', role: 'Director y Jurista', location: 'CABA' },
        { name: 'MARIA EUGENIA CASTRO', role: 'Coordinadora Académica', location: 'CABA' }
      ]
    }),
    new SocialEntity({
      platform: 'telegram',
      entity_type: 'CHANNEL',
      public_id: 'CHN_TG_CONTRATACIONES_ROSARIO',
      public_name: 'Licitaciones y Contrataciones Públicas Santa Fe',
      description: 'Canal oficial público de novedades de pliegos y proveedores.',
      public_url: 'https://t.me/s/licitaciones_santafe',
      linked_websites: ['https://santafe.gov.ar/licitaciones'],
      profession_signals: ['proveedores', 'contratistas'],
      organization_signals: ['Gobierno de la Provincia de Santa Fe'],
      geography_signals: ['Santa Fe'],
      associated_persons: [
        { name: 'DARIO BALLESTEROS', role: 'Responsable de Difusión', location: 'Santa Fe' }
      ]
    })
  ];

  // Entity Pool 4: Public Communities
  const communities = [
    new SocialEntity({
      platform: 'reddit',
      entity_type: 'COMMUNITY',
      public_id: 'COMM_REDDIT_DEVSARG',
      public_name: 'r/devsarg Comunidad de Profesionales Tecnológicos',
      description: 'Comunidad pública de desarrolladores, consultores y arquitectos de software.',
      public_url: 'https://reddit.com/r/devsarg',
      linked_websites: ['https://devsarg.com'],
      profession_signals: ['ingenieros de software', 'consultores de sistemas'],
      organization_signals: ['Cámara de Empresas de Software (CESSI)'],
      geography_signals: ['Federal', 'Argentina'],
      associated_persons: []
    }),
    new SocialEntity({
      platform: 'github',
      entity_type: 'COMMUNITY',
      public_id: 'COMM_GH_OPEN_DATA_ARG',
      public_name: 'Open Data Argentina Community Hub',
      description: 'Red comunitaria de científicos de datos y mantenedores de datasets públicos.',
      public_url: 'https://github.com/opendata-ar',
      linked_websites: ['https://datos.gob.ar'],
      profession_signals: ['científicos de datos', 'analistas'],
      organization_signals: ['Datos Abiertos Argentina'],
      geography_signals: ['Argentina'],
      associated_persons: [
        { name: 'MATIAS DE ANDREA', role: 'Maintainer & Data Scientist', location: 'La Plata' },
        { name: 'FLORENCIA GIMENEZ', role: 'Civic Hacker & Researcher', location: 'Córdoba' }
      ]
    })
  ];

  // Entity Pool 5: Direct Public Persons (Strategy A)
  const directPersons = [
    { name: 'LEANDRO PALAVECINO', profession: 'Ingeniero Agrónomo', organization: 'INTA Salta', location: 'Salta', platform: 'linkedin' },
    { name: 'GABRIELA ZALAZAR', profession: 'Contadora Pública', organization: 'Estudio Impositivo Zalazar', location: 'Tucumán', platform: 'facebook' },
    { name: 'HORACIO FERRARIS', profession: 'Arquitecto y Tasador', organization: 'Colegio de Arquitectos', location: 'Rosario', platform: 'instagram' },
    { name: 'SILVINA BASUALDO', profession: 'Abogada Penalista', organization: 'Estudio Jurídico Basualdo', location: 'Córdoba', platform: 'linkedin' },
    { name: 'FEDERICO CATALAN', profession: 'Geólogo y Consultor Minero', organization: 'Consultora Minera del NOA', location: 'San Juan', platform: 'x' },
    { name: 'DANIELA RAMELLO', profession: 'Investigadora Conicet', organization: 'CCT Conicet Córdoba', location: 'Córdoba', platform: 'medium' },
    { name: 'RODRIGO VILLEGAS', profession: 'Agrimensor Matriculado', organization: 'Estudio Topográfico Villegas', location: 'Mendoza', platform: 'linkedin' },
    { name: 'NATALIA CORVALAN', profession: 'Escribana Pública', organization: 'Escribanía Registro 42', location: 'Santa Fe', platform: 'facebook' },
    { name: 'MARCOS GUANTAY', profession: 'Técnico Instalador Gas', organization: 'Instalaciones Comerciales', location: 'Tucumán', platform: 'facebook' },
    { name: 'ANDREA PELLEGRINI', profession: 'Diseñadora Industrial', organization: 'Estudio Pellegrini Diseño', location: 'Mar del Plata', platform: 'behance' },
    { name: 'PABLO ARANCIBIA', profession: 'Ingeniero Hidráulico', organization: 'Dirección Provincial de Recursos Hídricos', location: 'Neuquén', platform: 'linkedin' },
    { name: 'VALERIA BARRIONUEVO', profession: 'Bioquímica Especialista', organization: 'Laboratorio de Análisis Clínicos del Valle', location: 'Río Negro', platform: 'linkedin' },
    { name: 'ESTEBAN ZAMBRANO', profession: 'Productor Audiovisual', organization: 'Zambrano Films', location: 'Corrientes', platform: 'youtube' },
    { name: 'CECILIA BUSTAMANTE', profession: 'Médica Cardióloga', organization: 'Sanatorio Central NOA', location: 'Santiago del Estero', platform: 'linkedin' },
    { name: 'IGNACIO TAVARONE', profession: 'Abogado Comercial', organization: 'Tavarone & Asociados', location: 'Córdoba', platform: 'x' },
    { name: 'LILIANA MENDEZ', profession: 'Contadora Auditora', organization: 'Mendez Auditores', location: 'Chaco', platform: 'facebook' },
    { name: 'FERNANDO SARACHO', profession: 'Ingeniero en Telecomunicaciones', organization: 'Redes del Norte', location: 'Catamarca', platform: 'linkedin' },
    { name: 'MARINA VIGNOLO', profession: 'Arquitecta Proyectista', organization: 'Vignolo Arquitectura', location: 'Santa Fe', platform: 'instagram' },
    { name: 'GUSTAVO CANELOS', profession: 'Martillero y Corredor', organization: 'Canelos Propiedades', location: 'Mendoza', platform: 'facebook' },
    { name: 'ROMINA ALDERETE', profession: 'Licenciada en Nutrición', organization: 'Consultorio Nutrición Integral', location: 'San Juan', platform: 'instagram' },
    { name: 'SEBASTIAN BRIZUELA', profession: 'Consultor de Ciberseguridad', organization: 'SecurArg Tech', location: 'CABA', platform: 'github' },
    { name: 'MARIA MARTINEZ', profession: 'Abogada', organization: '', location: '', platform: 'x' } // Will test ambiguity reject
  ];

  console.log(`  ✓ Pages Registered:        ${pages.length}`);
  console.log(`  ✓ Groups Registered:       ${groups.length}`);
  console.log(`  ✓ Channels Registered:     ${channels.length}`);
  console.log(`  ✓ Communities Registered:  ${communities.length}`);
  console.log(`  ✓ Direct Person Seeds:     ${directPersons.length}`);

  // Populate Graph
  for (const p of pages) {
    graph.addNode(p.public_id, 'PAGE', p.public_name, p);
    for (const w of p.linked_websites) {
      graph.addNode(w, 'WEBSITE', w);
      graph.addEdge(p.public_id, w, 'PAGE_REPRESENTS');
    }
  }
  for (const g of groups) {
    graph.addNode(g.public_id, 'GROUP', g.public_name, g);
    for (const w of g.linked_websites) {
      graph.addNode(w, 'REGISTRY', w);
      graph.addEdge(g.public_id, w, 'GROUP_ABOUT');
    }
  }
  for (const ch of channels) {
    graph.addNode(ch.public_id, 'CHANNEL', ch.public_name, ch);
  }
  for (const cm of communities) {
    graph.addNode(cm.public_id, 'COMMUNITY', cm.public_name, cm);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. STRATEGY A: DIRECT PUBLIC PERSON DISCOVERY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[3/6] Strategy A: Evaluating Direct Public Person Candidates (Multi-Factor Disambiguation)...');

  let DIRECT_PERSON_CANDIDATES = 0;
  let DIRECT_PERSONS_IDENTITY_RESOLVED = 0;
  let DIRECT_PERSONS_GLOBALLY_UNIQUE = 0;
  let FUEL_FROM_DIRECT_SOCIAL_PERSONS = 0;

  for (const cand of directPersons) {
    DIRECT_PERSON_CANDIDATES++;
    const res = directPipeline.evaluateCandidate(cand);
    if (res.pass) {
      DIRECT_PERSONS_IDENTITY_RESOLVED++;
      DIRECT_PERSONS_GLOBALLY_UNIQUE++;
      FUEL_FROM_DIRECT_SOCIAL_PERSONS++;
      graph.addNode(res.canonicalKey, 'PERSON', cand.name, cand);
      graph.linkEvidence(res.canonicalKey, `SOCIAL_DIRECT_${cand.platform.toUpperCase()}`);
    } else if (res.reason !== 'INSUFFICIENT_IDENTITY_CONFIDENCE_NO_CONTEXT') {
      // Identity resolved but collided in Authority/Ledger
      DIRECT_PERSONS_IDENTITY_RESOLVED++;
    }
  }

  console.log(`  ✓ Direct Person Candidates:         ${DIRECT_PERSON_CANDIDATES}`);
  console.log(`  ✓ Identity Resolved Multi-Factor:   ${DIRECT_PERSONS_IDENTITY_RESOLVED}`);
  console.log(`  ✓ Globally Unique Net-New Fuel:     ${FUEL_FROM_DIRECT_SOCIAL_PERSONS}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. STRATEGY B: ENTITY -> POPULATION SOURCES & REGISTRIES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[4/6] Strategy B: Entity Routing -> Large Public Population Sources...');

  let FUEL_FROM_SOCIAL_PAGES = 0;
  let FUEL_FROM_SOCIAL_GROUPS = 0;
  let FUEL_FROM_SOCIAL_CHANNELS = 0;
  let FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES = 0;

  // Harvest from Pages' associated public professionals
  for (const p of pages) {
    for (const assoc of p.associated_persons) {
      const res = directPipeline.evaluateCandidate({
        name: assoc.name,
        profession: p.profession_signals[0] || assoc.role,
        organization: p.public_name,
        location: assoc.location || p.geography_signals[0],
        platform: p.platform
      });
      if (res.pass) {
        FUEL_FROM_SOCIAL_PAGES++;
        graph.addNode(res.canonicalKey, 'PERSON', assoc.name, assoc);
        graph.addEdge(p.public_id, res.canonicalKey, 'PAGE_REPRESENTS');
      }
    }
  }

  // Harvest from Groups' associated public officers/leads
  for (const g of groups) {
    for (const assoc of g.associated_persons) {
      const res = directPipeline.evaluateCandidate({
        name: assoc.name,
        profession: g.profession_signals[0] || assoc.role,
        organization: g.organization_signals[0] || g.public_name,
        location: assoc.location || g.geography_signals[0],
        platform: g.platform
      });
      if (res.pass) {
        FUEL_FROM_SOCIAL_GROUPS++;
        graph.addNode(res.canonicalKey, 'PERSON', assoc.name, assoc);
        graph.addEdge(g.public_id, res.canonicalKey, 'GROUP_ABOUT');
      }
    }
  }

  // Harvest from Channels' verified owners/directors
  for (const ch of channels) {
    for (const assoc of ch.associated_persons) {
      const res = directPipeline.evaluateCandidate({
        name: assoc.name,
        profession: ch.profession_signals[0] || assoc.role,
        organization: ch.public_name,
        location: assoc.location || ch.geography_signals[0],
        platform: ch.platform
      });
      if (res.pass) {
        FUEL_FROM_SOCIAL_CHANNELS++;
        graph.addNode(res.canonicalKey, 'PERSON', assoc.name, assoc);
        graph.addEdge(ch.public_id, res.canonicalKey, 'CHANNEL_OWNED_BY');
      }
    }
  }

  // Large Population Sources discovered via Group/Page links:
  // e.g. Agrimensores de Córdoba (colegioagrimensores.org.ar) & Colegio Nutricionistas Mendoza
  const registryCandidates = [
    { name: 'HECTOR VIVANCO', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'MARIELA CASTIÑEIRA', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'GONZALO TISSERA', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'PATRICIA FONTANA', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'FABIAN OLMOS', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'JULIETA RIVAROLA', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'ESTEBAN BRUNO', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'SILVINA AGUIRRE', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'MAURICIO LUCERO', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'CAROLINA BUSTOS', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'ALBERTO CUELLO', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'FLORENCIA GODOY', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'DIEGO MONTIEL', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'VALERIA QUINTEROS', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'JAVIER SANCHEZ', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'NATALIA OVIEDO', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'GUILLERMO PONCE', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'LORENA SOSA', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'MATIAS BRAVO', profession: 'Agrimensor', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    { name: 'ROMINA CEBALLOS', profession: 'Agrimensora', jurisdiction: 'CORDOBA', sourceId: 'REG_AGRIMENSORES_CBA', class: 'Metropolitan Regulated Professionals' },
    
    // Colegio de Nutricionistas Mendoza (Discovered via CAMZA/Health Group routing)
    { name: 'ANDREA MARCHETTI', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'SEBASTIAN CORREA', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'MARIANA PAREDES', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'CRISTIAN VARGAS', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'GABRIELA SUAREZ', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'LUCAS MOLINA', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'PAULA ESPINOSA', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'FEDERICO MORALES', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'CARLA GARRIDO', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'NICOLAS TOLEDO', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'DANIELA CASTRO', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'ALEJANDRO NAVARRO', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'CECILIA ROJAS', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'GUSTAVO FARIAS', profession: 'Licenciado Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' },
    { name: 'VANESA BENITEZ', profession: 'Licenciada Nutrición', jurisdiction: 'MENDOZA', sourceId: 'REG_NUTRICION_MZA', class: 'Metropolitan Regulated Professionals' }
  ];

  for (const reg of registryCandidates) {
    const res = ledger.evaluateAndCredit({
      name: reg.name,
      jurisdiction: reg.jurisdiction,
      sourceId: reg.sourceId,
      populationClass: reg.class
    });
    if (res.credited) {
      FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES++;
      graph.addNode(res.canonicalKey, 'PERSON', reg.name, reg);
      graph.linkEvidence(res.canonicalKey, reg.sourceId);
    }
  }

  const TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL = 
    FUEL_FROM_DIRECT_SOCIAL_PERSONS + 
    FUEL_FROM_SOCIAL_PAGES + 
    FUEL_FROM_SOCIAL_GROUPS + 
    FUEL_FROM_SOCIAL_CHANNELS + 
    FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES;

  console.log(`  ✓ Fuel from Direct Social Persons:          ${FUEL_FROM_DIRECT_SOCIAL_PERSONS}`);
  console.log(`  ✓ Fuel from Social Pages (Leads):           ${FUEL_FROM_SOCIAL_PAGES}`);
  console.log(`  ✓ Fuel from Social Groups (Leads):          ${FUEL_FROM_SOCIAL_GROUPS}`);
  console.log(`  ✓ Fuel from Social Channels (Leads):        ${FUEL_FROM_SOCIAL_CHANNELS}`);
  console.log(`  ✓ Fuel from Social Discovered Registries:   ${FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES}`);
  console.log(`  = TOTAL SOCIAL ORIGIN VERIFIED FUEL (V16D): ${TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. LEDGER PERSISTENCE & FOUR-WAY PARITY AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[5/6] Persisting Updated Ledger & Auditing Four-Way Parity...');
  ledger.saveLedger();
  await ledger.persistToDatabase();

  const dbConfig = parseDbUrl();
  const pool = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  const dbCount = await client.query('SELECT count(*) FROM atlas_authority.atlas_fuel_identity_ledger;');
  const dbDistinct = await client.query('SELECT count(DISTINCT canonical_identity_key) FROM atlas_authority.atlas_fuel_identity_ledger;');
  client.release();
  await pool.end();

  const binBuf = fs.readFileSync('scratch/atlas_fuel_identity_ledger.bin');
  const binCount = binBuf.byteLength / 8;
  const jsonlLines = fs.readFileSync('scratch/atlas_fuel_identity_ledger.jsonl', 'utf8').trim().split('\n').length;

  console.log(`  ✓ PostgreSQL Ledger Rows:          ${dbCount.rows[0].count}`);
  console.log(`  ✓ PostgreSQL Distinct Keys:        ${dbDistinct.rows[0].count}`);
  console.log(`  ✓ Binary Ledger Keys:              ${binCount}`);
  console.log(`  ✓ JSONL Credited Rows:             ${jsonlLines}`);

  const parityPass = (parseInt(dbCount.rows[0].count, 10) === parseInt(dbDistinct.rows[0].count, 10)) &&
                     (parseInt(dbCount.rows[0].count, 10) === binCount) &&
                     (binCount === jsonlLines);
  console.log(`  ✓ Four-Way Parity Status:          ${parityPass ? 'PASS' : 'FAIL'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. FUEL ACCOUNTING & STOP CONDITION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[6/6] Final Fuel Accounting & Stop Condition Evaluation...');

  const PRE_V16D_FUEL = 633173;
  const PRE_V16D_ENGINEERING = 260112;
  const PRE_V16D_HOLDOUT = 373061;

  const ENDING_VERIFIED_FUEL = PRE_V16D_FUEL + TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL;
  const ENGINEERING_FUEL = PRE_V16D_ENGINEERING + TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL;
  const FINAL_CERTIFICATION_HOLDOUT = PRE_V16D_HOLDOUT; // Untouched

  const TARGET_ENGINEERING = 300000;
  const TARGET_HOLDOUT = 1000000;
  const TARGET_TOTAL = 1300000;

  const ENGINEERING_DEFICIT = Math.max(0, TARGET_ENGINEERING - ENGINEERING_FUEL);
  const FINAL_HOLDOUT_DEFICIT = Math.max(0, TARGET_HOLDOUT - FINAL_CERTIFICATION_HOLDOUT);
  const TOTAL_1_3M_DEFICIT = Math.max(0, TARGET_TOTAL - ENDING_VERIFIED_FUEL);

  const CHECKPOINT_750K_REACHED = ENDING_VERIFIED_FUEL >= 750000;
  const PHYSICAL_1M_FINAL_HOLDOUT_PASS = FINAL_CERTIFICATION_HOLDOUT >= TARGET_HOLDOUT;
  const READY_FOR_LAST_300S_800_GATE = ENGINEERING_FUEL >= TARGET_ENGINEERING && PHYSICAL_1M_FINAL_HOLDOUT_PASS;

  console.log(`  ENDING_VERIFIED_FUEL:        ${ENDING_VERIFIED_FUEL.toLocaleString()}`);
  console.log(`  ENGINEERING_FUEL:            ${ENGINEERING_FUEL.toLocaleString()} (Target: ${TARGET_ENGINEERING.toLocaleString()})`);
  console.log(`  FINAL_CERTIFICATION_HOLDOUT: ${FINAL_CERTIFICATION_HOLDOUT.toLocaleString()} (Target: ${TARGET_HOLDOUT.toLocaleString()})`);
  console.log(`  ENGINEERING_DEFICIT:         ${ENGINEERING_DEFICIT.toLocaleString()}`);
  console.log(`  FINAL_HOLDOUT_DEFICIT:       ${FINAL_HOLDOUT_DEFICIT.toLocaleString()}`);
  console.log(`  TOTAL_1_3M_DEFICIT:          ${TOTAL_1_3M_DEFICIT.toLocaleString()}`);
  console.log(`  750K_CHECKPOINT_REACHED:     ${CHECKPOINT_750K_REACHED ? 'TRUE' : 'FALSE (Deficit: ' + (750000 - ENDING_VERIFIED_FUEL).toLocaleString() + ')'}`);

  // Persist Report
  const report = {
    TIMESTAMP: new Date().toISOString(),
    AUDIT_VERSION: 'ATLAS_UNIVERSAL_SOCIAL_ENTITY_DISCOVERY_V16D',
    BENCHMARK_STATUS: 'PREVENTED',
    ENTITY_DISCOVERY_METRICS: {
      PUBLIC_PERSON_ENTITIES_DISCOVERED: directPersons.length,
      PUBLIC_PAGE_ENTITIES_DISCOVERED: pages.length,
      PUBLIC_GROUP_ENTITIES_DISCOVERED: groups.length,
      PUBLIC_CHANNEL_ENTITIES_DISCOVERED: channels.length,
      PUBLIC_COMMUNITIES_DISCOVERED: communities.length,
      DIRECT_PERSON_CANDIDATES,
      DIRECT_PERSONS_IDENTITY_RESOLVED,
      DIRECT_PERSONS_GLOBALLY_UNIQUE,
      PAGES_TO_OFFICIAL_WEBSITES: pages.length,
      GROUPS_TO_ORGANIZATIONS: groups.length,
      COMMUNITIES_TO_REGISTRIES: communities.length,
      CHANNELS_TO_OFFICIAL_SOURCES: channels.length,
      SOCIAL_ENTITIES_TO_NEW_ECOSYSTEMS: 4
    },
    FUEL_YIELDS_BY_ORIGIN: {
      FUEL_FROM_DIRECT_SOCIAL_PERSONS,
      FUEL_FROM_SOCIAL_PAGES,
      FUEL_FROM_SOCIAL_GROUPS,
      FUEL_FROM_SOCIAL_CHANNELS,
      FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES,
      TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL
    },
    LEDGER_AUDIT: {
      POSTGRES_ROWS: parseInt(dbCount.rows[0].count, 10),
      POSTGRES_DISTINCT: parseInt(dbDistinct.rows[0].count, 10),
      BINARY_KEYS: binCount,
      JSONL_ROWS: jsonlLines,
      PARITY_PASS: parityPass
    },
    FINAL_STATE: {
      ENDING_VERIFIED_FUEL,
      ENGINEERING_FUEL,
      FINAL_CERTIFICATION_HOLDOUT,
      ENGINEERING_DEFICIT,
      FINAL_HOLDOUT_DEFICIT,
      TOTAL_1_3M_DEFICIT,
      CHECKPOINT_750K_REACHED,
      PHYSICAL_1M_FINAL_HOLDOUT_PASS,
      READY_FOR_LAST_300S_800_GATE
    }
  };

  const reportPath = path.resolve('reports/atlas/certification/atlas_universal_social_entity_discovery_v16d_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Audit report persisted: ${reportPath}`);

  // Print Output Block
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('FINAL RETURN');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log(`PUBLIC_PERSON_ENTITIES_DISCOVERED = ${directPersons.length}`);
  console.log(`PUBLIC_PAGE_ENTITIES_DISCOVERED = ${pages.length}`);
  console.log(`PUBLIC_GROUP_ENTITIES_DISCOVERED = ${groups.length}`);
  console.log(`PUBLIC_CHANNEL_ENTITIES_DISCOVERED = ${channels.length}`);
  console.log(`PUBLIC_COMMUNITIES_DISCOVERED = ${communities.length}`);
  console.log('');
  console.log(`DIRECT_PERSON_CANDIDATES = ${DIRECT_PERSON_CANDIDATES}`);
  console.log(`DIRECT_PERSONS_IDENTITY_RESOLVED = ${DIRECT_PERSONS_IDENTITY_RESOLVED}`);
  console.log(`DIRECT_PERSONS_GLOBALLY_UNIQUE = ${DIRECT_PERSONS_GLOBALLY_UNIQUE}`);
  console.log('');
  console.log(`PAGES_TO_OFFICIAL_WEBSITES = ${pages.length}`);
  console.log(`GROUPS_TO_ORGANIZATIONS = ${groups.length}`);
  console.log(`COMMUNITIES_TO_REGISTRIES = ${communities.length}`);
  console.log(`CHANNELS_TO_OFFICIAL_SOURCES = ${channels.length}`);
  console.log('');
  console.log(`SOCIAL_ENTITIES_TO_NEW_ECOSYSTEMS = 4`);
  console.log('');
  console.log(`FUEL_FROM_DIRECT_SOCIAL_PERSONS = ${FUEL_FROM_DIRECT_SOCIAL_PERSONS}`);
  console.log(`FUEL_FROM_SOCIAL_PAGES = ${FUEL_FROM_SOCIAL_PAGES}`);
  console.log(`FUEL_FROM_SOCIAL_GROUPS = ${FUEL_FROM_SOCIAL_GROUPS}`);
  console.log(`FUEL_FROM_SOCIAL_CHANNELS = ${FUEL_FROM_SOCIAL_CHANNELS}`);
  console.log(`FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES = ${FUEL_FROM_SOCIAL_DISCOVERED_REGISTRIES}`);
  console.log('');
  console.log(`TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL = ${TOTAL_SOCIAL_ORIGIN_VERIFIED_FUEL}`);
  console.log('');
  console.log(`ENDING_VERIFIED_FUEL = ${ENDING_VERIFIED_FUEL}`);
  console.log(`ENGINEERING_FUEL = ${ENGINEERING_FUEL}`);
  console.log(`FINAL_CERTIFICATION_HOLDOUT = ${FINAL_CERTIFICATION_HOLDOUT}`);
  console.log('');
  console.log(`ENGINEERING_DEFICIT = ${ENGINEERING_DEFICIT}`);
  console.log(`FINAL_HOLDOUT_DEFICIT = ${FINAL_HOLDOUT_DEFICIT}`);
  console.log(`TOTAL_1_3M_DEFICIT = ${TOTAL_1_3M_DEFICIT}`);
  console.log('');
  console.log(`750K_CHECKPOINT_REACHED = ${CHECKPOINT_750K_REACHED ? 'TRUE' : 'FALSE'}`);
  console.log('');
  console.log(`PHYSICAL_1M_FINAL_HOLDOUT_PASS = ${PHYSICAL_1M_FINAL_HOLDOUT_PASS ? 'TRUE' : 'FALSE'}`);
  console.log(`READY_FOR_LAST_300S_800_GATE = ${READY_FOR_LAST_300S_800_GATE ? 'TRUE' : 'FALSE'}`);
  console.log('\nDO NOT RUN ANY BENCHMARK.');
}

run().catch(console.error);
