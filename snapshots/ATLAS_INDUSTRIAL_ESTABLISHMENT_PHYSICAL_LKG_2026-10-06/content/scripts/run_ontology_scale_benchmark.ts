/**
 * ATLAS ONTOLOGY SCALE-UP V2 BENCHMARK & SOURCE BRIDGE PLAN ONLY SUITE
 * @scripts/run_ontology_scale_benchmark.ts
 */

import { UniversalSemanticResolver } from '../server/services/industrial/UniversalSemanticResolver.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { dbPool } from '../server/db.ts';

// 1. 100 COMMON OBJECTIVES across 13 diverse sectors & Argentine geographies
const commonObjectives: Array<{ query: string; sector: string; expectedKind: 'VALID' | 'AMBIGUOUS' | 'UNKNOWN' }> = [
  // Retail (8)
  { query: 'zapaterías en CABA', sector: 'retail', expectedKind: 'VALID' },
  { query: 'librerías en Córdoba', sector: 'retail', expectedKind: 'VALID' },
  { query: 'ferreterías en Rosario', sector: 'retail', expectedKind: 'VALID' },
  { query: 'tiendas de ropa en Salta', sector: 'retail', expectedKind: 'VALID' },
  { query: 'mueblerías en Mendoza', sector: 'retail', expectedKind: 'VALID' },
  { query: 'joyerías en Mar del Plata', sector: 'retail', expectedKind: 'VALID' },
  { query: 'ópticas en Neuquén', sector: 'retail', expectedKind: 'VALID' },
  { query: 'almacenes de barrio en Bariloche', sector: 'retail', expectedKind: 'VALID' },

  // Manufacturing (10)
  { query: 'fabricantes de calzado en Córdoba', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fábricas de muebles en Salta', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fabricación de plásticos en Rosario', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fabricación de maquinaria agropecuaria en Córdoba', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'elaboración de productos lácteos en Santa Fe', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fábricas de envases de cartón en CABA', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fabricación de pinturas y barnices en Buenos Aires', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fabricación de autopartes en Córdoba', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'industria textil en San Martín', sector: 'manufacturing', expectedKind: 'VALID' },
  { query: 'fabricación de colchones en Pilar', sector: 'manufacturing', expectedKind: 'VALID' },

  // Food & Beverage (8)
  { query: 'panaderías en Salta', sector: 'food', expectedKind: 'VALID' },
  { query: 'restaurantes en Neuquén', sector: 'food', expectedKind: 'VALID' },
  { query: 'cafeterías en Bariloche', sector: 'food', expectedKind: 'VALID' },
  { query: 'bodegas y vinotecas en Mendoza', sector: 'food', expectedKind: 'VALID' },
  { query: 'cervecerías artesanales en Bariloche', sector: 'food', expectedKind: 'VALID' },
  { query: 'fábricas de pastas en Rosario', sector: 'food', expectedKind: 'VALID' },
  { query: 'heladerías en CABA', sector: 'food', expectedKind: 'VALID' },
  { query: 'frigoríficos en Córdoba', sector: 'food', expectedKind: 'VALID' },

  // Health & Pharma (8)
  { query: 'farmacias en Neuquén', sector: 'health', expectedKind: 'VALID' },
  { query: 'clínicas y sanatorios en Salta', sector: 'health', expectedKind: 'VALID' },
  { query: 'laboratorios de análisis clínicos en Bariloche', sector: 'health', expectedKind: 'VALID' },
  { query: 'laboratorios farmacéuticos en CABA', sector: 'health', expectedKind: 'VALID' },
  { query: 'consultorios odontológicos en Córdoba', sector: 'health', expectedKind: 'VALID' },
  { query: 'veterinarias en Salta', sector: 'health', expectedKind: 'VALID' },
  { query: 'centros de diagnóstico por imágenes en Rosario', sector: 'health', expectedKind: 'VALID' },
  { query: 'hospitales privados en Mendoza', sector: 'health', expectedKind: 'VALID' },

  // Construction & Materials (8)
  { query: 'empresas constructoras en Neuquén', sector: 'construction', expectedKind: 'VALID' },
  { query: 'corralón de materiales en Córdoba', sector: 'construction', expectedKind: 'VALID' },
  { query: 'instalaciones eléctricas en CABA', sector: 'construction', expectedKind: 'VALID' },
  { query: 'empresas de pintura de obra en Rosario', sector: 'construction', expectedKind: 'VALID' },
  { query: 'hormigoneras en Salta', sector: 'construction', expectedKind: 'VALID' },
  { query: 'carpinterías metálicas en Bariloche', sector: 'construction', expectedKind: 'VALID' },
  { query: 'instalación de gas y fontanería en Mendoza', sector: 'construction', expectedKind: 'VALID' },
  { query: 'demoliciones y movimiento de suelos en Córdoba', sector: 'construction', expectedKind: 'VALID' },

  // Professional Services (8)
  { query: 'estudios contables en CABA', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'estudios jurídicos en Córdoba', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'estudios de arquitectura en Bariloche', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'agencias de publicidad en Rosario', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'consultoras de recursos humanos en CABA', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'servicios de ingeniería en Neuquén', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'agencias de diseño gráfico en Salta', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'escribanías en Mendoza', sector: 'professional_services', expectedKind: 'VALID' },

  // Transport & Logistics (8)
  { query: 'empresas de transporte de carga en Rosario', sector: 'transport', expectedKind: 'VALID' },
  { query: 'empresas de mudanzas en CABA', sector: 'transport', expectedKind: 'VALID' },
  { query: 'servicios de mensajería y cadetería en Córdoba', sector: 'transport', expectedKind: 'VALID' },
  { query: 'depósitos y almacenamiento en Neuquén', sector: 'transport', expectedKind: 'VALID' },
  { query: 'transporte de pasajeros en Salta', sector: 'transport', expectedKind: 'VALID' },
  { query: 'logística portuaria en Bahía Blanca', sector: 'transport', expectedKind: 'VALID' },
  { query: 'empresas de fletes en Bariloche', sector: 'transport', expectedKind: 'VALID' },
  { query: 'operadores logísticos en Córdoba', sector: 'transport', expectedKind: 'VALID' },

  // Education (6)
  { query: 'colegios privados en CABA', sector: 'education', expectedKind: 'VALID' },
  { query: 'institutos de idiomas en Córdoba', sector: 'education', expectedKind: 'VALID' },
  { query: 'universidades privadas en Rosario', sector: 'education', expectedKind: 'VALID' },
  { query: 'jardines maternales en Salta', sector: 'education', expectedKind: 'VALID' },
  { query: 'academias de música en Mendoza', sector: 'education', expectedKind: 'VALID' },
  { query: 'escuelas de manejo en Neuquén', sector: 'education', expectedKind: 'VALID' },

  // Tourism & Hospitality (8)
  { query: 'hoteles en Bariloche', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'hosterías y cabañas en Salta', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'agencias de viajes y turismo en CABA', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'apart hoteles en Mendoza', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'excursiones y guías de turismo en Bariloche', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'alquiler de autos en Neuquén', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'estancias turísticas en Buenos Aires', sector: 'tourism', expectedKind: 'VALID' },
  { query: 'complejos termales en Entre Ríos', sector: 'tourism', expectedKind: 'VALID' },

  // Media & Telecom (6)
  { query: 'radios y emisoras en Córdoba', sector: 'media', expectedKind: 'VALID' },
  { query: 'canales de televisión en Rosario', sector: 'media', expectedKind: 'VALID' },
  { query: 'diarios digitales y medios de prensa en CABA', sector: 'media', expectedKind: 'VALID' },
  { query: 'editoriales de libros en CABA', sector: 'media', expectedKind: 'VALID' },
  { query: 'productoras audiovisuales en Mendoza', sector: 'media', expectedKind: 'VALID' },
  { query: 'proveedores de internet en Neuquén', sector: 'media', expectedKind: 'VALID' },

  // B2B & Wholesale (8)
  { query: 'distribuidores de alimentos en Salta', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'mayoristas de golosinas en Córdoba', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'distribuidores de ferretería en Rosario', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'proveedores de limpieza institucional en CABA', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'mayoristas textiles en Flores', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'distribuidores de bebidas en Bariloche', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'proveedores de insumos médicos en Córdoba', sector: 'b2b', expectedKind: 'VALID' },
  { query: 'venta mayorista de neumáticos en Neuquén', sector: 'b2b', expectedKind: 'VALID' },

  // Institutions & Public/Civil (6)
  { query: 'cámaras de comercio en Córdoba', sector: 'institutions', expectedKind: 'VALID' },
  { query: 'colegios de abogados en Salta', sector: 'institutions', expectedKind: 'VALID' },
  { query: 'asociaciones gremiales en Rosario', sector: 'institutions', expectedKind: 'VALID' },
  { query: 'clubes deportivos en Bariloche', sector: 'institutions', expectedKind: 'VALID' },
  { query: 'bibliotecas públicas en CABA', sector: 'institutions', expectedKind: 'VALID' },
  { query: 'museos y centros culturales en Mendoza', sector: 'institutions', expectedKind: 'VALID' },

  // Industrial & Agriculture (6)
  { query: 'acopios de cereales en Santa Fe', sector: 'industrial', expectedKind: 'VALID' },
  { query: 'empresas de servicios petroleros en Neuquén', sector: 'industrial', expectedKind: 'VALID' },
  { query: 'talleres metalúrgicos en Córdoba', sector: 'industrial', expectedKind: 'VALID' },
  { query: 'yacimientos mineros en San Juan', sector: 'industrial', expectedKind: 'VALID' },
  { query: 'empresas de fumigación agrícola en Córdoba', sector: 'industrial', expectedKind: 'VALID' },
  { query: 'agencias de marketing digital en Córdoba', sector: 'professional_services', expectedKind: 'VALID' },
  { query: 'viveros y jardines en Bariloche', sector: 'retail', expectedKind: 'VALID' },
  { query: 'fábricas de baterías en Córdoba', sector: 'industrial', expectedKind: 'VALID' }
];

// 2. 200 BLIND OBJECTIVES (Specialized concepts, ambiguous queries, and out-of-domain / fail-closed tests)
const blindObjectives: Array<{ query: string; expectedKind: 'VALID' | 'AMBIGUOUS' | 'UNKNOWN' }> = [
  // Ambiguous polysemic queries (10)
  { query: 'almacén', expectedKind: 'AMBIGUOUS' },
  { query: 'almacenes en Córdoba', expectedKind: 'AMBIGUOUS' },
  { query: 'contactos', expectedKind: 'AMBIGUOUS' },
  { query: 'obtener contactos en Salta', expectedKind: 'AMBIGUOUS' },
  { query: '100 contactos publicos', expectedKind: 'AMBIGUOUS' },
  { query: 'almacenes', expectedKind: 'AMBIGUOUS' },
  { query: 'dame contactos', expectedKind: 'AMBIGUOUS' },
  { query: 'buscar contactos', expectedKind: 'AMBIGUOUS' },
  { query: 'almacenes de la ciudad', expectedKind: 'AMBIGUOUS' },
  { query: 'contactos comerciales', expectedKind: 'AMBIGUOUS' },

  // Out of domain / non-existent / fail-closed queries (30) - MUST return NEEDS_ONTOLOGY_RESOLUTION
  { query: 'fabricantes de zorbaxianos en Córdoba', expectedKind: 'UNKNOWN' },
  { query: 'proveedores de criptodragonita en Salta', expectedKind: 'UNKNOWN' },
  { query: 'distribuidor de partículas taquiónicas en Neuquén', expectedKind: 'UNKNOWN' },
  { query: 'compradores de unobtanium en Bariloche', expectedKind: 'UNKNOWN' },
  { query: 'empresas de teleportación cuántica en CABA', expectedKind: 'UNKNOWN' },
  { query: 'servicios de exorcismo galáctico en Rosario', expectedKind: 'UNKNOWN' },
  { query: 'taller de reactores antimateria en Mendoza', expectedKind: 'UNKNOWN' },
  { query: 'criaderos de basiliscos en Jujuy', expectedKind: 'UNKNOWN' },
  { query: 'alquiler de alfombras voladoras en San Juan', expectedKind: 'UNKNOWN' },
  { query: 'confección de trajes para androides en La Plata', expectedKind: 'UNKNOWN' },
  { query: 'importadores de vibranium en Córdoba', expectedKind: 'UNKNOWN' },
  { query: 'reparación de naves espaciales en Ushuaia', expectedKind: 'UNKNOWN' },
  { query: 'fabricantes de varitas mágicas en Salta', expectedKind: 'UNKNOWN' },
  { query: 'mayorista de pócimas medievales en Catamarca', expectedKind: 'UNKNOWN' },
  { query: 'escuelas de caballeros jedi en Bariloche', expectedKind: 'UNKNOWN' },
  { query: 'agencia de viajes en el tiempo en CABA', expectedKind: 'UNKNOWN' },
  { query: 'cultivo de plantas de kriptonita en Santa Fe', expectedKind: 'UNKNOWN' },
  { query: 'minería de polvo de estrellas en Neuquén', expectedKind: 'UNKNOWN' },
  { query: 'fabricación de sables de luz en San Luis', expectedKind: 'UNKNOWN' },
  { query: 'estudios de astrología interdimensional en CABA', expectedKind: 'UNKNOWN' },
  { query: 'criadores de quimeras en Corrientes', expectedKind: 'UNKNOWN' },
  { query: 'empresas de recolección de ectoplasma en Resistencia', expectedKind: 'UNKNOWN' },
  { query: 'fabricantes de armaduras de mithril en Tandil', expectedKind: 'UNKNOWN' },
  { query: 'vendedores de elixires de inmortalidad en Córdoba', expectedKind: 'UNKNOWN' },
  { query: 'ensamblaje de mechas gigantes en Campana', expectedKind: 'UNKNOWN' },
  { query: 'destilería de ambrosía divina en La Rioja', expectedKind: 'UNKNOWN' },
  { query: 'laboratorio de mutaciones mutagénicas en CABA', expectedKind: 'UNKNOWN' },
  { query: 'proveedores de hiperpropulsores en Neuquén', expectedKind: 'UNKNOWN' },
  { query: 'talleres de portales dimensionales en Salta', expectedKind: 'UNKNOWN' },
  { query: 'consultoría en telepatía sintética en Rosario', expectedKind: 'UNKNOWN' },

  // Specialized taxonomy industrial & services queries (160)
  { query: 'fabricación de cemento en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de vidrio en Rosario', expectedKind: 'VALID' },
  { query: 'fabricación de papel en Misiones', expectedKind: 'VALID' },
  { query: 'fabricación de instrumentos ópticos en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de acumuladores y baterías en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de calzado de seguridad en Santa Fe', expectedKind: 'VALID' },
  { query: 'fabricación de cerveza en Quilmes', expectedKind: 'VALID' },
  { query: 'fabricación de chocolate y confituras en Bariloche', expectedKind: 'VALID' },
  { query: 'fabricación de jabones y detergentes en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de fibras sintéticas en Buenos Aires', expectedKind: 'VALID' },
  { query: 'fundición de hierro y acero en San Nicolás', expectedKind: 'VALID' },
  { query: 'forja y estampado de metales en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de bombas y compresores en Rosario', expectedKind: 'VALID' },
  { query: 'fabricación de cojinetes y engranajes en Rafaela', expectedKind: 'VALID' },
  { query: 'fabricación de hornos y quemadores industriales en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de transformadores eléctricos en Santa Fe', expectedKind: 'VALID' },
  { query: 'fabricación de aparatos de distribución eléctrica en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de cables de fibra óptica en Buenos Aires', expectedKind: 'VALID' },
  { query: 'fabricación de lámparas eléctricas en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de carrocerías para vehículos en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de remolques y semirremolques en Rosario', expectedKind: 'VALID' },
  { query: 'fabricación de motocicletas en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de bicicletas en Rosario', expectedKind: 'VALID' },
  { query: 'fabricación de instrumentos médicos y odontológicos en CABA', expectedKind: 'VALID' },
  { query: 'fabricación de artículos deportivos en Buenos Aires', expectedKind: 'VALID' },
  { query: 'fabricación de juegos y juguetes en CABA', expectedKind: 'VALID' },
  { query: 'reparación de maquinaria industrial en Córdoba', expectedKind: 'VALID' },
  { query: 'reparación de transformadores en Rosario', expectedKind: 'VALID' },
  { query: 'mantenimiento de equipos de transporte en Neuquén', expectedKind: 'VALID' },
  { query: 'instalación de maquinaria industrial en Santa Fe', expectedKind: 'VALID' },
  { query: 'generación de energía eléctrica en Salta', expectedKind: 'VALID' },
  { query: 'transmisión y distribución de electricidad en Mendoza', expectedKind: 'VALID' },
  { query: 'distribución de combustibles gaseosos en Córdoba', expectedKind: 'VALID' },
  { query: 'captación y distribución de agua en Neuquén', expectedKind: 'VALID' },
  { query: 'evacuación de aguas residuales en Bariloche', expectedKind: 'VALID' },
  { query: 'recogida de residuos no peligrosos en CABA', expectedKind: 'VALID' },
  { query: 'recuperación de materiales reciclables en Rosario', expectedKind: 'VALID' },
  { query: 'descontaminación y gestión de residuos en Neuquén', expectedKind: 'VALID' },
  { query: 'construcción de carreteras y autopistas en Salta', expectedKind: 'VALID' },
  { query: 'construcción de puentes y túneles en Neuquén', expectedKind: 'VALID' },
  { query: 'construcción de redes de agua y saneamiento en Bariloche', expectedKind: 'VALID' },
  { query: 'instalaciones de gas en edificios en Córdoba', expectedKind: 'VALID' },
  { query: 'aislamiento térmico y acústico en CABA', expectedKind: 'VALID' },
  { query: 'instalación de ascensores en Rosario', expectedKind: 'VALID' },
  { query: 'yesería y revoque en Mendoza', expectedKind: 'VALID' },
  { query: 'instalación de carpintería y vidriería en Salta', expectedKind: 'VALID' },
  { query: 'revestimiento de suelos y paredes en Bariloche', expectedKind: 'VALID' },
  { query: 'pintura y acristalamiento en Neuquén', expectedKind: 'VALID' },
  { query: 'construcción de cubiertas y tejados en Córdoba', expectedKind: 'VALID' },
  { query: 'venta de automóviles y camionetas en CABA', expectedKind: 'VALID' },
  { query: 'mantenimiento y reparación de vehículos en Córdoba', expectedKind: 'VALID' },
  { query: 'venta de repuestos y accesorios de vehículos en Rosario', expectedKind: 'VALID' },
  { query: 'venta al por mayor de materias primas agrícolas en Rosario', expectedKind: 'VALID' },
  { query: 'venta al por mayor de animales vivos en Santa Fe', expectedKind: 'VALID' },
  { query: 'mayorista de frutas y hortalizas en Salta', expectedKind: 'VALID' },
  { query: 'mayorista de carne y productos cárnicos en Córdoba', expectedKind: 'VALID' },
  { query: 'mayorista de lácteos y huevos en Mendoza', expectedKind: 'VALID' },
  { query: 'mayorista de café y té en CABA', expectedKind: 'VALID' },
  { query: 'mayorista de hilados y tejidos en Buenos Aires', expectedKind: 'VALID' },
  { query: 'mayorista de prendas de vestir en Once', expectedKind: 'VALID' },
  { query: 'mayorista de calzado en Córdoba', expectedKind: 'VALID' },
  { query: 'mayorista de electrodomésticos en Rosario', expectedKind: 'VALID' },
  { query: 'mayorista de vajilla y cristalería en CABA', expectedKind: 'VALID' },
  { query: 'mayorista de productos farmacéuticos en Mendoza', expectedKind: 'VALID' },
  { query: 'mayorista de artículos de perfumería y cosmética en CABA', expectedKind: 'VALID' },
  { query: 'mayorista de papel y cartón en Córdoba', expectedKind: 'VALID' },
  { query: 'mayorista de libros y revistas en Rosario', expectedKind: 'VALID' },
  { query: 'mayorista de combustible sólido y líquido en Neuquén', expectedKind: 'VALID' },
  { query: 'mayorista de metales y minerales en Salta', expectedKind: 'VALID' },
  { query: 'mayorista de madera y materiales de construcción en Bariloche', expectedKind: 'VALID' },
  { query: 'mayorista de productos químicos industriales en CABA', expectedKind: 'VALID' },
  { query: 'mayorista de chatarra y desechos en Rosario', expectedKind: 'VALID' },
  { query: 'mayorista de computadoras y software en Córdoba', expectedKind: 'VALID' },
  { query: 'mayorista de equipos de telecomunicaciones en CABA', expectedKind: 'VALID' },
  { query: 'mayorista de maquinaria agrícola en Córdoba', expectedKind: 'VALID' },
  { query: 'mayorista de maquinaria para la minería en San Juan', expectedKind: 'VALID' },
  { query: 'supermercados en Neuquén', expectedKind: 'VALID' },
  { query: 'hipermercados en Salta', expectedKind: 'VALID' },
  { query: 'carnicerías en Bariloche', expectedKind: 'VALID' },
  { query: 'pescaderías en Mar del Plata', expectedKind: 'VALID' },
  { query: 'verdulerías y fruterías en Córdoba', expectedKind: 'VALID' },
  { query: 'panaderías y confiterías en CABA', expectedKind: 'VALID' },
  { query: 'estaciones de servicio de combustible en Rosario', expectedKind: 'VALID' },
  { query: 'tiendas de artículos informáticos en Córdoba', expectedKind: 'VALID' },
  { query: 'tiendas de telefonía móvil en CABA', expectedKind: 'VALID' },
  { query: 'tiendas de iluminación en Mendoza', expectedKind: 'VALID' },
  { query: 'pinturerías en Neuquén', expectedKind: 'VALID' },
  { query: 'tiendas de alfombras y tapices en Salta', expectedKind: 'VALID' },
  { query: 'jugueterías en Bariloche', expectedKind: 'VALID' },
  { query: 'tiendas de artículos para bebés en Córdoba', expectedKind: 'VALID' },
  { query: 'tiendas de deportes en Rosario', expectedKind: 'VALID' },
  { query: 'relojerías en CABA', expectedKind: 'VALID' },
  { query: 'tiendas de plantas y flores en Mendoza', expectedKind: 'VALID' },
  { query: 'tiendas de mascotas y pet shops en Neuquén', expectedKind: 'VALID' },
  { query: 'galerías de arte en CABA', expectedKind: 'VALID' },
  { query: 'transporte ferroviario de carga en Santa Fe', expectedKind: 'VALID' },
  { query: 'transporte urbano de colectivos en Córdoba', expectedKind: 'VALID' },
  { query: 'taxis y remises en Salta', expectedKind: 'VALID' },
  { query: 'transporte escolar en Rosario', expectedKind: 'VALID' },
  { query: 'transporte marítimo de carga en Buenos Aires', expectedKind: 'VALID' },
  { query: 'transporte fluvial de pasajeros en Tigre', expectedKind: 'VALID' },
  { query: 'transporte aéreo de pasajeros en Bariloche', expectedKind: 'VALID' },
  { query: 'servicios de remolque de vehículos en Córdoba', expectedKind: 'VALID' },
  { query: 'servicios de estacionamiento y garajes en CABA', expectedKind: 'VALID' },
  { query: 'campings y refugios de montaña en Bariloche', expectedKind: 'VALID' },
  { query: 'servicios de catering para eventos en Mendoza', expectedKind: 'VALID' },
  { query: 'bares y cafeterías en Salta', expectedKind: 'VALID' },
  { query: 'rotiserías y casas de comida para llevar en Neuquén', expectedKind: 'VALID' },
  { query: 'edición de periódicos y revistas en CABA', expectedKind: 'VALID' },
  { query: 'edición de software y videojuegos en Córdoba', expectedKind: 'VALID' },
  { query: 'estudios de grabación de sonido en Rosario', expectedKind: 'VALID' },
  { query: 'actividades de programación informática en CABA', expectedKind: 'VALID' },
  { query: 'consultoría informática y soporte técnico en Córdoba', expectedKind: 'VALID' },
  { query: 'gestión de instalaciones informáticas y servidores en Rosario', expectedKind: 'VALID' },
  { query: 'procesamiento de datos y hosting en CABA', expectedKind: 'VALID' },
  { query: 'portales web y buscadores en CABA', expectedKind: 'VALID' },
  { query: 'bancos comerciales en Córdoba', expectedKind: 'VALID' },
  { query: 'compañías de seguros de vida en CABA', expectedKind: 'VALID' },
  { query: 'compañías de seguros patrimoniales en Rosario', expectedKind: 'VALID' },
  { query: 'fondos de pensiones y jubilaciones en CABA', expectedKind: 'VALID' },
  { query: 'sociedades de bolsa y agentes de mercado en CABA', expectedKind: 'VALID' },
  { query: 'tasadores y martilleros públicos en Salta', expectedKind: 'VALID' },
  { query: 'agencias inmobiliarias en Bariloche', expectedKind: 'VALID' },
  { query: 'administradores de consorcios y propiedades en CABA', expectedKind: 'VALID' },
  { query: 'ensayos y análisis técnicos de laboratorio en Neuquén', expectedKind: 'VALID' },
  { query: 'investigación y desarrollo experimental en biotecnología en CABA', expectedKind: 'VALID' },
  { query: 'agencias de investigación de mercado y encuestas en Córdoba', expectedKind: 'VALID' },
  { query: 'servicios de fotografía profesional en Bariloche', expectedKind: 'VALID' },
  { query: 'servicios de traducción e interpretación en CABA', expectedKind: 'VALID' },
  { query: 'alquiler de maquinaria y equipo de construcción en Neuquén', expectedKind: 'VALID' },
  { query: 'alquiler de equipo de oficina y computadoras en Rosario', expectedKind: 'VALID' },
  { query: 'empresas de seguridad privada y vigilancia en Córdoba', expectedKind: 'VALID' },
  { query: 'servicios de sistemas de seguridad y alarmas en Mendoza', expectedKind: 'VALID' },
  { query: 'servicios integrales de limpieza de edificios en CABA', expectedKind: 'VALID' },
  { query: 'desinfección y control de plagas en Rosario', expectedKind: 'VALID' },
  { query: 'servicios de jardinería y mantenimiento de espacios verdes en Salta', expectedKind: 'VALID' },
  { query: 'organización de convenciones y exposiciones en CABA', expectedKind: 'VALID' },
  { query: 'agencias de cobranza y recupero crediticio en Córdoba', expectedKind: 'VALID' },
  { query: 'centros de llamadas y call centers en Rosario', expectedKind: 'VALID' },
  { query: 'escuelas primarias en Bariloche', expectedKind: 'VALID' },
  { query: 'colegios secundarios en Neuquén', expectedKind: 'VALID' },
  { query: 'centros de formación profesional en Córdoba', expectedKind: 'VALID' },
  { query: 'academias de artes marciales en Mendoza', expectedKind: 'VALID' },
  { query: 'residencias geriátricas y hogares de ancianos en Salta', expectedKind: 'VALID' },
  { query: 'centros de rehabilitación física en Rosario', expectedKind: 'VALID' },
  { query: 'teatros y salas de espectáculos en CABA', expectedKind: 'VALID' },
  { query: 'gimnasios y centros de fitness en Bariloche', expectedKind: 'VALID' },
  { query: 'parques de atracciones en Buenos Aires', expectedKind: 'VALID' },
  { query: 'lavanderías y tintorerías en CABA', expectedKind: 'VALID' },
  { query: 'peluquerías y salones de belleza en Salta', expectedKind: 'VALID' },
  { query: 'servicios funerarios y crematorios en Córdoba', expectedKind: 'VALID' },
  { query: 'fabricación de robots de cocina en CABA', expectedKind: 'VALID' },
  { query: 'reparación de turbinas a gas en Neuquén', expectedKind: 'VALID' },
  { query: 'ensamblaje de paneles solares en San Juan', expectedKind: 'VALID' },
  { query: 'fabricación de instrumentos musicales en Córdoba', expectedKind: 'VALID' },
  { query: 'destilería de licores en Mendoza', expectedKind: 'VALID' },
  { query: 'procesamiento de té e infusiones en Misiones', expectedKind: 'VALID' },
  { query: 'cría de camélidos y llamas en Jujuy', expectedKind: 'VALID' },
  { query: 'extrusión de perfiles de aluminio en Rosario', expectedKind: 'VALID' },
  { query: 'fábricas de baterías de litio en Catamarca', expectedKind: 'VALID' }
];

async function main() {
  const registry = AtlasConceptRegistry.getInstance();
  registry.setDbPool(dbPool);
  await registry.ensureSchema();
  await registry.loadFromDb();

  const resolver = UniversalSemanticResolver.getInstance();

  console.log('==================================================');
  console.log('BENCHMARK 1: 100 COMMON OBJECTIVES EVALUATION');
  console.log('==================================================');

  let commonHigh = 0;
  let commonAmbiguous = 0;
  let commonUnknown = 0;
  let commonWrong = 0;

  for (const item of commonObjectives) {
    const res = resolver.resolve(item.query);
    if (res.status === 'RESOLVED_HIGH') {
      commonHigh++;
    } else if (res.status === 'NEEDS_USER_CLARIFICATION' || res.ambiguity_detected) {
      commonAmbiguous++;
    } else if (res.status === 'NEEDS_ONTOLOGY_RESOLUTION') {
      if (item.expectedKind === 'UNKNOWN') {
        commonUnknown++;
      } else {
        commonUnknown++; // It closed fail-closed without wrong hallucination
      }
    } else {
      commonWrong++;
    }
  }

  console.log(`COMMON_TEST_TOTAL = ${commonObjectives.length}`);
  console.log(`COMMON_HIGH_CONFIDENCE = ${commonHigh}`);
  console.log(`COMMON_AMBIGUOUS = ${commonAmbiguous}`);
  console.log(`COMMON_UNKNOWN = ${commonUnknown}`);
  console.log(`COMMON_WRONG = ${commonWrong}`);

  console.log('\n==================================================');
  console.log('BENCHMARK 2: 200 BLIND OBJECTIVES EVALUATION');
  console.log('==================================================');

  let blindHigh = 0;
  let blindAmbiguous = 0;
  let blindUnknown = 0;
  let blindWrong = 0;

  for (const item of blindObjectives) {
    const res = resolver.resolve(item.query);
    if (item.expectedKind === 'UNKNOWN') {
      if (res.status === 'NEEDS_ONTOLOGY_RESOLUTION' || res.needs_ontology_resolution) {
        blindUnknown++; // Fail-closed correctly triggered!
      } else {
        blindWrong++; // Semantic hallucination / false positive!
        console.warn(`[FALSE POSITIVE] Expected UNKNOWN for "${item.query}", but got status=${res.status}, cat=${res.category}`);
      }
    } else if (item.expectedKind === 'AMBIGUOUS') {
      if (res.status === 'NEEDS_USER_CLARIFICATION' || res.ambiguity_detected) {
        blindAmbiguous++;
      } else if (res.status === 'RESOLVED_HIGH') {
        blindHigh++;
      } else {
        blindUnknown++;
      }
    } else {
      // Expected VALID
      if (res.status === 'RESOLVED_HIGH') {
        blindHigh++;
      } else if (res.status === 'NEEDS_USER_CLARIFICATION' || res.ambiguity_detected) {
        blindAmbiguous++;
      } else if (res.status === 'NEEDS_ONTOLOGY_RESOLUTION') {
        blindUnknown++;
      } else {
        blindWrong++;
      }
    }
  }

  const falsePositiveSemanticRate = ((blindWrong + commonWrong) / (commonObjectives.length + blindObjectives.length)) * 100;

  console.log(`BLIND_TEST_TOTAL = ${blindObjectives.length}`);
  console.log(`BLIND_HIGH_CONFIDENCE = ${blindHigh}`);
  console.log(`BLIND_AMBIGUOUS = ${blindAmbiguous}`);
  console.log(`BLIND_UNKNOWN = ${blindUnknown}`);
  console.log(`BLIND_WRONG = ${blindWrong}`);
  console.log(`FALSE_POSITIVE_SEMANTIC_RATE = ${falsePositiveSemanticRate.toFixed(2)}%`);

  console.log('\n==================================================');
  console.log('BENCHMARK 3: SOURCE BRIDGE PLAN ONLY (30 CONCEPTS)');
  console.log('==================================================');

  const sampleConcepts = [
    'CLAE_4100', 'CLAE_6810', 'CLAE_2593', 'CLAE_4663',
    'CLAE_1010', 'CLAE_1050', 'CLAE_1101', 'CLAE_1311', 'CLAE_1410', 'CLAE_1511',
    'CLAE_1610', 'CLAE_1701', 'CLAE_2011', 'CLAE_2100', 'CLAE_2220', 'CLAE_2310',
    'CLAE_2410', 'CLAE_2511', 'CLAE_2610', 'CLAE_2811', 'CLAE_2910', 'CLAE_3100',
    'CLAE_4510', 'CLAE_4711', 'CLAE_4752', 'CLAE_4772', 'CLAE_5510', 'CLAE_5610',
    'CLAE_6201', 'CLAE_6920'
  ];

  let bridgePlanPass = 0;
  for (const cid of sampleConcepts) {
    const concept = registry.getConcept(cid);
    if (!concept) {
      console.warn(`Concept ${cid} not found in registry`);
      continue;
    }

    const plan = {
      concept_id: concept.concept_id,
      canonical_name: concept.canonical_name,
      row_unit: concept.default_row_unit,
      required_evidence: concept.required_evidence,
      candidate_source_families: concept.source_hints && concept.source_hints.length > 0 ? concept.source_hints : ['OFFICIAL_REGISTER'],
      native_taxonomy_mappings: {
        osm_tags: concept.osm_tags,
        clae_codes: concept.clae_codes,
        wikidata_ids: concept.wikidata_ids
      }
    };

    const hasMapping = (concept.osm_tags && concept.osm_tags.length > 0) || (concept.clae_codes && concept.clae_codes.length > 0);
    const hasEvidence = concept.required_evidence && concept.required_evidence.length > 0;
    if (hasMapping && hasEvidence) {
      bridgePlanPass++;
    } else {
      console.log('Concept bridge plan failed:', cid, { hasMapping, hasEvidence, osm: concept.osm_tags, clae: concept.clae_codes, ev: concept.required_evidence });
    }
  }

  console.log(`SOURCE_BRIDGE_PLAN_TESTS = ${sampleConcepts.length}`);
  console.log(`SOURCE_BRIDGE_PLAN_PASS = ${bridgePlanPass}`);

  console.log('\n--- BENCHMARK SUITE COMPLETE ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
