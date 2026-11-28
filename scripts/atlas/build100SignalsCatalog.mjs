import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'youapp100SignalsCatalog.json');
const ATLAS_MUSIC_PATH = path.join(ROOT, 'src', 'data', 'atlasMusicChannels.json');

function loadEnv() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    map[k] = v;
  }
  return map;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const SIGNAL_SPECS = [
  // =========================================================================
  // TEMÁTICA 1: CULTURA, HISTORIA Y SABER (34 señales)
  // =========================================================================
  { id: 'sig-100-001', theme: 'cultura', title: 'Imperios y Civilizaciones', subtitle: 'Roma, Grecia, Egipto y grandes potencias del pasado.', accent: '#b45309', terms: ['imperio', 'civilizacion', 'historia antigua'] },
  { id: 'sig-100-002', theme: 'cultura', title: 'Historia Argentina Viva', subtitle: 'Protagonistas, batallas y momentos clave de nuestra historia.', accent: '#0284c7', terms: ['historia argentina', 'san martin', 'belgrano', 'argentina historia'] },
  { id: 'sig-100-003', theme: 'cultura', title: 'Arqueología y Misterios', subtitle: 'Excavaciones, ruinas perdidas y enigmas antiguos.', accent: '#d97706', terms: ['arqueologia', 'ruinas', 'piramides', 'misterio antiguo'] },
  { id: 'sig-100-004', theme: 'cultura', title: 'Grandes Biografías', subtitle: 'Vidas extraordinarias que cambiaron el rumbo del mundo.', accent: '#7c3aed', terms: ['biografia', 'vida de', 'historia de'] },
  { id: 'sig-100-005', theme: 'cultura', title: 'Cosmos y Astronomía', subtitle: 'Galaxias, planetas, telescopios y los secretos del universo.', accent: '#2563eb', terms: ['universo', 'astronomia', 'espacio', 'planeta', 'cosmos'] },
  { id: 'sig-100-006', theme: 'cultura', title: 'Física y Ciencia Moderna', subtitle: 'Cuántica, relatividad y experimentos explicados con claridad.', accent: '#1d4ed8', terms: ['fisica', 'ciencia', 'cuantica', 'cientifico'] },
  { id: 'sig-100-007', theme: 'cultura', title: 'Naturaleza y Fauna Salvaje', subtitle: 'Ecosistemas, animales sorprendentes y vida silvestre.', accent: '#15803d', terms: ['naturaleza', 'animales', 'fauna', 'documental naturaleza'] },
  { id: 'sig-100-008', theme: 'cultura', title: 'Océanos Profundos', subtitle: 'Exploración submarina, arrecifes y criaturas abisales.', accent: '#0369a1', terms: ['oceano', 'marino', 'submarino', 'ballena', 'mar'] },
  { id: 'sig-100-009', theme: 'cultura', title: 'Filosofía para Pensar', subtitle: 'Ideas clásicas y contemporáneas aplicadas a la vida diaria.', accent: '#6d28d9', terms: ['filosofia', 'filosofo', 'estoicismo', 'pensamiento'] },
  { id: 'sig-100-010', theme: 'cultura', title: 'Arte y Museos del Mundo', subtitle: 'Pintura, escultura y obras maestras explicadas en detalle.', accent: '#be185d', terms: ['arte', 'pintura', 'museo', 'renacimiento', 'van gogh'] },
  { id: 'sig-100-011', theme: 'cultura', title: 'Arquitectura y Megaobras', subtitle: 'Catedrales, puentes y maravillas de la ingeniería humana.', accent: '#475569', terms: ['arquitectura', 'construccion', 'ingenieria', 'edificio'] },
  { id: 'sig-100-012', theme: 'cultura', title: 'Mitología Universal', subtitle: 'Dioses, héroes y leyendas de Grecia, Roma y el Norte.', accent: '#9333ea', terms: ['mitologia', 'leyenda', 'dioses', 'grecia'] },
  { id: 'sig-100-013', theme: 'cultura', title: 'Grandes Inventos', subtitle: 'Cómo nacieron las innovaciones que transformaron la humanidad.', accent: '#0f766e', terms: ['invento', 'inventos', 'descubrimiento', 'tecnologia historia'] },
  { id: 'sig-100-014', theme: 'cultura', title: 'Historia del Cine', subtitle: 'Directores legendarios, escenas icónicas y lenguaje audiovisual.', accent: '#dc2626', terms: ['cine', 'pelicula', 'peliculas', 'director'] },
  { id: 'sig-100-015', theme: 'cultura', title: 'Literatura y Grandes Libros', subtitle: 'Autores universales, reseñas y el poder de la lectura.', accent: '#b45309', terms: ['libro', 'libros', 'literatura', 'borges', 'novela'] },
  { id: 'sig-100-016', theme: 'cultura', title: 'Psicología y Mente Humana', subtitle: 'Cerebro, emociones, hábitos y neurociencia accesible.', accent: '#4f46e5', terms: ['psicologia', 'cerebro', 'mente', 'neurociencia'] },
  { id: 'sig-100-017', theme: 'cultura', title: 'Historia de la Medicina', subtitle: 'Avances médicos, salud y pioneros que salvaron millones de vidas.', accent: '#059669', terms: ['medicina', 'salud', 'medico', 'cuerpo humano'] },
  { id: 'sig-100-018', theme: 'cultura', title: 'Geografía y Planeta Tierra', subtitle: 'Mapas, fronteras, cordilleras y maravillas geográficas.', accent: '#0d9488', terms: ['geografia', 'mapa', 'planeta', 'tierra', 'montana'] },
  { id: 'sig-100-019', theme: 'cultura', title: 'Antigua Roma en Foco', subtitle: 'República, emperadores, legiones y legado romano.', accent: '#b91c1c', terms: ['roma', 'romano', 'cesar', 'coliseo'] },
  { id: 'sig-100-020', theme: 'cultura', title: 'Egipto Milenario', subtitle: 'Faraones, jeroglíficos y tesoros a orillas del Nilo.', accent: '#ca8a04', terms: ['egipto', 'faraon', 'piramide', 'nilo'] },
  { id: 'sig-100-021', theme: 'cultura', title: 'Edad Media y Castillos', subtitle: 'Caballeros, reinos, catedrales y vida medieval.', accent: '#57534e', terms: ['edad media', 'medieval', 'castillo', 'caballeros'] },
  { id: 'sig-100-022', theme: 'cultura', title: 'Guerras y Batallas Históricas', subtitle: 'Crónicas documentales y análisis de los grandes conflictos.', accent: '#991b1b', terms: ['guerra', 'batalla', 'segunda guerra', 'conflicto'] },
  { id: 'sig-100-023', theme: 'cultura', title: 'Latinoamérica Profunda', subtitle: 'Culturas precolombinas, pueblos e identidad continental.', accent: '#ea580c', terms: ['latinoamerica', 'america', 'inca', 'maya', 'patagonia'] },
  { id: 'sig-100-024', theme: 'cultura', title: 'Volcanes, Clima y Fenómenos', subtitle: 'La fuerza de la Tierra, tormentas y geología viva.', accent: '#dc2626', terms: ['volcan', 'clima', 'terremoto', 'tormenta'] },
  { id: 'sig-100-025', theme: 'cultura', title: 'Energía y Ciencia del Futuro', subtitle: 'Renovables, fusión, espacio y desafíos del siglo XXI.', accent: '#0284c7', terms: ['energia', 'futuro', 'solar', 'nuclear', 'espacial'] },
  { id: 'sig-100-026', theme: 'cultura', title: 'Matemática y Lógica Visual', subtitle: 'Números, patrones y acertijos que explican la realidad.', accent: '#2563eb', terms: ['matematica', 'matematicas', 'numero', 'logica'] },
  { id: 'sig-100-027', theme: 'cultura', title: 'Culturas y Tradiciones', subtitle: 'Costumbres, idiomas y pueblos de los cinco continentes.', accent: '#d97706', terms: ['cultura', 'tradicion', 'japon', 'india', 'china'] },
  { id: 'sig-100-028', theme: 'cultura', title: 'Documentales de Sociedad', subtitle: 'Investigaciones, crónicas humanas y miradas profundas.', accent: '#334155', terms: ['documental', 'cronica', 'sociedad', 'historia'] },
  { id: 'sig-100-029', theme: 'cultura', title: 'Grandes Exploradores', subtitle: 'Navegantes, expediciones y rutas hacia lo desconocido.', accent: '#0369a1', terms: ['expedicion', 'exploracion', 'antartida', 'viaje historico'] },
  { id: 'sig-100-030', theme: 'cultura', title: 'Historia de la Música y el Arte', subtitle: 'Cómo evolucionaron los géneros y las grandes obras culturales.', accent: '#7c3aed', terms: ['historia de la musica', 'compositor', 'beethoven', 'mozart'] },
  { id: 'sig-100-031', theme: 'cultura', title: 'Aviación y Trenes del Mundo', subtitle: 'Máquinas legendarias, vuelos históricos y ferrocarriles.', accent: '#475569', terms: ['avion', 'aviacion', 'tren', 'ferrocarril'] },
  { id: 'sig-100-032', theme: 'cultura', title: 'Espiritualidad y Humanismo', subtitle: 'Reflexiones, valores universales y diálogo cultural.', accent: '#0d9488', terms: ['humanismo', 'etica', 'espiritualidad', 'reflexion'] },
  { id: 'sig-100-033', theme: 'cultura', title: 'Curiosidades Científicas', subtitle: 'Preguntas sorprendentes respondidas con rigor.', accent: '#2563eb', terms: ['curiosidades', 'como funciona', 'por que', 'sabias que'] },
  { id: 'sig-100-034', theme: 'cultura', title: 'Patrimonio y Maravillas', subtitle: 'Monumentos eternos y ciudades patrimonio de la humanidad.', accent: '#b45309', terms: ['maravillas', 'patrimonio', 'monumento', 'catedral'] },

  // =========================================================================
  // TEMÁTICA 2: MÚSICA, CONCIERTOS Y ESCENA (33 señales)
  // =========================================================================
  { id: 'sig-100-035', theme: 'musica', title: 'Rock Nacional Leyendas', subtitle: 'Soda Stereo, Charly, Spinetta, Fito y los himnos argentinos.', accent: '#2563eb', terms: ['rock nacional', 'soda stereo', 'charly garcia', 'spinetta', 'fito paez'] },
  { id: 'sig-100-036', theme: 'musica', title: 'Clásicos del Rock Mundial', subtitle: 'Queen, Beatles, Pink Floyd, Rolling Stones y guitarras eternas.', accent: '#dc2626', terms: ['queen', 'beatles', 'pink floyd', 'rolling stones', 'rock'] },
  { id: 'sig-100-037', theme: 'musica', title: 'Jazz & Blues de Medianoche', subtitle: 'Saxos, pianos y sesiones íntimas para disfrutar sin apuro.', accent: '#7c3aed', terms: ['jazz', 'blues', 'sax', 'miles davis'] },
  { id: 'sig-100-038', theme: 'musica', title: 'Música Clásica y Orquestas', subtitle: 'Sinfonías, conciertos de piano y grandes maestros.', accent: '#b45309', terms: ['clasica', 'symphony', 'orquesta', 'mozart', 'beethoven', 'bach'] },
  { id: 'sig-100-039', theme: 'musica', title: 'Tango Porteño Vivo', subtitle: 'Gardel, Piazzolla, bandoneón y orquestas típicas.', accent: '#991b1b', terms: ['tango', 'piazzolla', 'gardel', 'bandoneon'] },
  { id: 'sig-100-040', theme: 'musica', title: 'Folklore Argentino', subtitle: 'Zambas, chacareras y grandes voces de nuestra tierra.', accent: '#0284c7', terms: ['folklore', 'mercedes sosa', 'chacarera', 'zamba'] },
  { id: 'sig-100-041', theme: 'musica', title: 'Pop de los 80s y 90s', subtitle: 'Éxitos inolvidables y videoclips que marcaron una era.', accent: '#ec4899', terms: ['pop', '80s', '90s', 'michael jackson', 'madonna'] },
  { id: 'sig-100-042', theme: 'musica', title: 'Acústicos & Unplugged', subtitle: 'Versiones íntimas, guitarra y voz en estado puro.', accent: '#059669', terms: ['acoustic', 'acustico', 'unplugged', 'live session'] },
  { id: 'sig-100-043', theme: 'musica', title: 'Bandas Sonoras de Cine', subtitle: 'Hans Zimmer, Ennio Morricone, John Williams y épica musical.', accent: '#4f46e5', terms: ['soundtrack', 'zimmer', 'morricone', 'banda sonora'] },
  { id: 'sig-100-044', theme: 'musica', title: 'Recitales Históricos en Vivo', subtitle: 'Estadios llenos y shows legendarios de todos los tiempos.', accent: '#ea580c', terms: ['live', 'concert', 'recital', 'en vivo'] },
  { id: 'sig-100-045', theme: 'musica', title: 'Bossa Nova & Música de Brasil', subtitle: 'Suavidad carioca, guitarra y armonías tropicales.', accent: '#16a34a', terms: ['bossa nova', 'brasil', 'samba', 'jobim'] },
  { id: 'sig-100-046', theme: 'musica', title: 'Latino & Boleros Inolvidables', subtitle: 'Baladas, voces románticas y clásicos en español.', accent: '#be185d', terms: ['bolero', 'latino', 'balada', 'luis miguel', 'sergio denis'] },
  { id: 'sig-100-047', theme: 'musica', title: 'Piano Instrumental', subtitle: 'Melodías serenas de piano para leer, estudiar o descansar.', accent: '#0f766e', terms: ['piano', 'instrumental', 'chopin', 'debussy'] },
  { id: 'sig-100-048', theme: 'musica', title: 'Guitarra Española y Flamenco', subtitle: 'Virtuosismo acústico, compás y duende flamenco.', accent: '#b91c1c', terms: ['flamenco', 'guitarra', 'paco de lucia', 'guitar'] },
  { id: 'sig-100-049', theme: 'musica', title: 'Soul, Funk & Motown', subtitle: 'Groove clásico, bajos profundos y grandes voces del soul.', accent: '#d97706', terms: ['soul', 'funk', 'motown', 'stevie wonder', 'aretha'] },
  { id: 'sig-100-050', theme: 'musica', title: 'Electrónica & Synthwave', subtitle: 'Sintetizadores, beats modernos y paisajes sonoros.', accent: '#7c3aed', terms: ['electronic', 'synthwave', 'daft punk', 'techno', 'house'] },
  { id: 'sig-100-051', theme: 'musica', title: 'Lo-Fi & Música para Estudiar', subtitle: 'Ritmos suaves y atmósferas relajadas para enfocarse.', accent: '#6366f1', terms: ['lofi', 'chill', 'ambient', 'relax', 'study'] },
  { id: 'sig-100-052', theme: 'musica', title: 'Ópera y Grandes Tenores', subtitle: 'Pavarotti, Callas, arias inmortales y teatros líricos.', accent: '#9333ea', terms: ['opera', 'pavarotti', 'tenor', 'aria', 'soprano'] },
  { id: 'sig-100-053', theme: 'musica', title: 'Cantautores en Español', subtitle: 'Serrat, Sabina, Silvio, León Gieco y poesía hecha canción.', accent: '#0369a1', terms: ['serrat', 'sabina', 'leon gieco', 'cantautor', 'trova'] },
  { id: 'sig-100-054', theme: 'musica', title: 'Hard Rock & Metal Clásico', subtitle: 'Riffs potentes, baterías arrolladoras y clásicos pesados.', accent: '#334155', terms: ['metal', 'metallica', 'acdc', 'led zeppelin', 'hard rock'] },
  { id: 'sig-100-055', theme: 'musica', title: 'Reggae & Ritmos del Mundo', subtitle: 'Bob Marley, roots, ska y buena vibra constante.', accent: '#15803d', terms: ['reggae', 'marley', 'ska', 'dub'] },
  { id: 'sig-100-056', theme: 'musica', title: 'Indie & Alternativo', subtitle: 'Bandas frescas, guitarras atmosféricas y nuevos sonidos.', accent: '#0d9488', terms: ['indie', 'alternative', 'radiohead', 'arctic monkeys', 'coldplay'] },
  { id: 'sig-100-057', theme: 'musica', title: 'Cumbia y Fiesta Popular', subtitle: 'Clásicos bailables, cuarteto y alegría popular.', accent: '#ea580c', terms: ['cumbia', 'cuarteto', 'palmeras', 'baile'] },
  { id: 'sig-100-058', theme: 'musica', title: 'Grandes Guitarristas', subtitle: 'Solos inolvidables, técnica y pura emoción en seis cuerdas.', accent: '#b45309', terms: ['guitar solo', 'hendrix', 'clapton', 'santana', 'gilmour'] },
  { id: 'sig-100-059', theme: 'musica', title: 'Voces Femeninas Eternas', subtitle: 'Intérpretes icónicas del pop, soul, jazz y rock.', accent: '#db2777', terms: ['adele', 'amy winehouse', 'whitney', 'celine', 'shakira'] },
  { id: 'sig-100-060', theme: 'musica', title: 'Música de los 70s', subtitle: 'Disco, rock clásico y la década dorada del vinilo.', accent: '#ca8a04', terms: ['70s', 'disco', 'abba', 'bee gees', 'elton john'] },
  { id: 'sig-100-061', theme: 'musica', title: 'Sesiones de Estudio', subtitle: 'Grabaciones en vivo con sonido cristalino de consola.', accent: '#2563eb', terms: ['session', 'tiny desk', 'studio live', 'kexp'] },
  { id: 'sig-100-062', theme: 'musica', title: 'Música Celta y Folk Europeo', subtitle: 'Violines, flautas y paisajes sonoros tradicionales.', accent: '#059669', terms: ['celtic', 'folk', 'violin', 'irish'] },
  { id: 'sig-100-063', theme: 'musica', title: 'Salsa, Son y Ritmos Caribeños', subtitle: 'Percusión, trompetas y sabor latinoamericano.', accent: '#dc2626', terms: ['salsa', 'cuban', 'bachata', 'merengue'] },
  { id: 'sig-100-064', theme: 'musica', title: 'Coros y Música Sacra', subtitle: 'Polifonía, voces corales y piezas espirituales.', accent: '#4f46e5', terms: ['choir', 'coro', 'gregorian', 'requiem'] },
  { id: 'sig-100-065', theme: 'musica', title: 'Música para Dormir y Meditar', subtitle: 'Sonidos suaves, frecuencias calmas y descanso profundo.', accent: '#0369a1', terms: ['meditacion', 'relaxing', 'sleep', 'calm music'] },
  { id: 'sig-100-066', theme: 'musica', title: 'Rock en Español', subtitle: 'Argentina, España, México y toda la escena iberoamericana.', accent: '#b91c1c', terms: ['rock en espanol', 'enanitos verdes', 'caifanes', 'heroes del silencio'] },
  { id: 'sig-100-067', theme: 'musica', title: 'Éxitos Internacionales Hoy', subtitle: 'Los temas más escuchados y videoclips actuales.', accent: '#9333ea', terms: ['official video', 'music video', 'official audio'] },

  // =========================================================================
  // TEMÁTICA 3: ACTUALIDAD, DEPORTES Y VIDA REAL (33 señales)
  // =========================================================================
  { id: 'sig-100-068', theme: 'mundo', title: 'Fútbol Argentino y Pasión', subtitle: 'Análisis, historia de clubes y la emoción de cada fecha.', accent: '#15803d', terms: ['futbol argentino', 'boca', 'river', 'messi', 'seleccion argentina'] },
  { id: 'sig-100-069', theme: 'mundo', title: 'Táctica y Pizarrón', subtitle: 'Cómo se piensa y se gana un partido desde adentro.', accent: '#059669', terms: ['tactica', 'futbol', 'analisis futbol', 'guardiola', 'scaloni'] },
  { id: 'sig-100-070', theme: 'mundo', title: 'Historia de los Mundiales', subtitle: 'Copas del Mundo, hazañas y partidos para la eternidad.', accent: '#0284c7', terms: ['mundial', 'maradona', 'qatar', 'copa del mundo'] },
  { id: 'sig-100-071', theme: 'mundo', title: 'Tenis y Grand Slams', subtitle: 'Puntos memorables, análisis y leyendas del circuito.', accent: '#ca8a04', terms: ['tenis', 'tennis', 'federer', 'nadal', 'djokovic'] },
  { id: 'sig-100-072', theme: 'mundo', title: 'Automovilismo y Fórmula 1', subtitle: 'Velocidad, circuitos míticos, TC y grandes pilotos.', accent: '#dc2626', terms: ['formula 1', 'f1', 'automovilismo', 'colapinto', 'fangio'] },
  { id: 'sig-100-073', theme: 'mundo', title: 'Básquet y NBA', subtitle: 'Jugadas espectaculares, historia y grandes equipos.', accent: '#ea580c', terms: ['nba', 'basquet', 'basketball', 'ginobili', 'jordan'] },
  { id: 'sig-100-074', theme: 'mundo', title: 'Boxeo y Deportes de Combate', subtitle: 'Nocauts históricos, técnica y biografías del ring.', accent: '#991b1b', terms: ['boxeo', 'boxing', 'ufc', 'pelea'] },
  { id: 'sig-100-075', theme: 'mundo', title: 'Noticias de Argentina', subtitle: 'Actualidad, informes especiales y debate nacional.', accent: '#0284c7', terms: ['noticias argentina', 'argentina hoy', 'actualidad', 'noticias'] },
  { id: 'sig-100-076', theme: 'mundo', title: 'Actualidad Internacional', subtitle: 'Geopolítica, crónicas globales y el mundo en contexto.', accent: '#1d4ed8', terms: ['geopolitica', 'internacional', 'mundo hoy', 'europa'] },
  { id: 'sig-100-077', theme: 'mundo', title: 'Economía y Finanzas Claras', subtitle: 'Educación financiera, mercados y economía sin vueltas.', accent: '#0f766e', terms: ['economia', 'finanzas', 'inversiones', 'dolar'] },
  { id: 'sig-100-078', theme: 'mundo', title: 'Tecnología e Inteligencia Artificial', subtitle: 'Novedades en IA, robótica, celulares y software.', accent: '#4f46e5', terms: ['inteligencia artificial', 'tecnologia', 'robot', 'software', 'ia'] },
  { id: 'sig-100-079', theme: 'mundo', title: 'Emprendedores y Negocios', subtitle: 'Casos reales, estrategia y liderazgo moderno.', accent: '#7c3aed', terms: ['emprendedores', 'negocios', 'empresa', 'marketing'] },
  { id: 'sig-100-080', theme: 'mundo', title: 'Viajes por Argentina y LATAM', subtitle: 'Rutas escénicas, pueblos, montañas y destinos imperdibles.', accent: '#0d9488', terms: ['viaje', 'viajes', 'patagonia', 'mendoza', 'cordoba'] },
  { id: 'sig-100-081', theme: 'mundo', title: 'Ciudades del Mundo', subtitle: 'Recorridos urbanos por Europa, Asia y América.', accent: '#2563eb', terms: ['ciudad', 'madrid', 'paris', 'tokio', 'nueva york'] },
  { id: 'sig-100-082', theme: 'mundo', title: 'Cocina Argentina y Asado', subtitle: 'Fuegos, empanadas, pastas y recetas tradicionales.', accent: '#b45309', terms: ['asado', 'receta', 'cocina', 'empanadas', 'parrilla'] },
  { id: 'sig-100-083', theme: 'mundo', title: 'Gastronomía del Mundo', subtitle: 'Sabores callejeros, chefs y platos icónicos globales.', accent: '#ea580c', terms: ['gastronomia', 'comida', 'chef', 'pizza', 'sushi'] },
  { id: 'sig-100-084', theme: 'mundo', title: 'Panadería y Pastelería Casera', subtitle: 'Masa madre, tortas, medialunas y secretos de horno.', accent: '#d97706', terms: ['pan', 'pasteleria', 'torta', 'postre', 'dulce'] },
  { id: 'sig-100-085', theme: 'mundo', title: 'Salud, Fitness y Movimiento', subtitle: 'Rutinas en casa, nutrición y energía cotidiana.', accent: '#16a34a', terms: ['entrenamiento', 'ejercicio', 'nutricion', 'fitness'] },
  { id: 'sig-100-086', theme: 'mundo', title: 'Yoga, Respiración y Calma', subtitle: 'Pausas conscientes, estiramientos y bienestar integral.', accent: '#0d9488', terms: ['yoga', 'respiracion', 'bienestar', 'calma'] },
  { id: 'sig-100-087', theme: 'mundo', title: 'Jardinería, Plantas y Huerta', subtitle: 'Cómo cultivar alimentos y cuidar tu espacio verde.', accent: '#15803d', terms: ['huerta', 'jardin', 'plantas', 'arboles'] },
  { id: 'sig-100-088', theme: 'mundo', title: 'Hogar, Diseño y Orden', subtitle: 'Ideas prácticas, arquitectura interior y bricolaje.', accent: '#475569', terms: ['diseño', 'casa', 'hogar', 'decoracion', 'carpinteria'] },
  { id: 'sig-100-089', theme: 'mundo', title: 'Autos, Motos y Mecánica', subtitle: 'Pruebas de manejo, clásicos restaurados y motores.', accent: '#334155', terms: ['auto', 'autos', 'moto', 'mecanica', 'motor'] },
  { id: 'sig-100-090', theme: 'mundo', title: 'Fotografía y Creación Visual', subtitle: 'Trucos de cámara, iluminación y edición creativa.', accent: '#6366f1', terms: ['fotografia', 'camara', 'edicion', 'video'] },
  { id: 'sig-100-091', theme: 'mundo', title: 'Videojuegos e Historia Gamer', subtitle: 'Retro, reseñas, lanzamientos y cultura gaming.', accent: '#7c3aed', terms: ['videojuegos', 'gaming', 'retro', 'nintendo', 'playstation'] },
  { id: 'sig-100-092', theme: 'mundo', title: 'Humor y Stand Up', subtitle: 'Monólogos, comedia inteligente y momentos para reír.', accent: '#db2777', terms: ['humor', 'comedia', 'stand up', 'risa'] },
  { id: 'sig-100-093', theme: 'mundo', title: 'Entrevistas en Profundidad', subtitle: 'Charlas largas con artistas, pensadores y deportistas.', accent: '#0369a1', terms: ['entrevista', 'charla', 'podcast', 'conversacion'] },
  { id: 'sig-100-094', theme: 'mundo', title: 'Campo, Agro y Naturaleza Rural', subtitle: 'Producción, maquinaria, caballos y vida de campo.', accent: '#65a30d', terms: ['campo', 'agro', 'caballos', 'rural'] },
  { id: 'sig-100-095', theme: 'mundo', title: 'Aventura, Trekking y Montaña', subtitle: 'Cumbres, campamento y deportes al aire libre.', accent: '#059669', terms: ['montana', 'trekking', 'aventura', 'camping'] },
  { id: 'sig-100-096', theme: 'mundo', title: 'Vida Sustentable y Ecología', subtitle: 'Reciclaje, energía limpia y proyectos con impacto.', accent: '#16a34a', terms: ['ecologia', 'reciclaje', 'sustentable', 'medio ambiente'] },
  { id: 'sig-100-097', theme: 'mundo', title: 'Aprender Idiomas y Viajar', subtitle: 'Inglés, italiano, portugués y consejos prácticos.', accent: '#2563eb', terms: ['ingles', 'idioma', 'aprender', 'curso'] },
  { id: 'sig-100-098', theme: 'mundo', title: 'Ciclismo, Running y Aire Libre', subtitle: 'Rutas en bici, maratones y entrenamiento de resistencia.', accent: '#0284c7', terms: ['ciclismo', 'running', 'maraton', 'bicicleta'] },
  { id: 'sig-100-099', theme: 'mundo', title: 'Crónicas y Reportajes Urbanos', subtitle: 'Historias reales de barrios, oficios y gente común.', accent: '#475569', terms: ['reportaje', 'cronica', 'buenos aires', 'oficio'] },
  { id: 'sig-100-100', theme: 'mundo', title: 'Lo Mejor de YOUAPP Hoy', subtitle: 'Selección variada de ciencia, música, deportes y cultura.', accent: '#0071e3', terms: ['documental', 'musica', 'ciencia', 'historia'] }
];

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`
};

function isCleanVideo(row) {
  const vid = String(row?.video_id || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return false;
  if (row?.embeddable === false) return false;
  const title = String(row?.title || '').trim();
  if (!title || title.length < 4) return false;
  if (/#shorts?\b|\bshorts\b/i.test(title)) return false;
  return true;
}

async function queryByTerm(term, limit = 25) {
  const clean = term.replace(/[,%()]/g, ' ').trim();
  const q = new URLSearchParams({
    select: 'video_id,title,creator_name,duration_seconds,embeddable',
    provider: 'eq.youtube',
    or: `(title.ilike.*${clean}*,creator_name.ilike.*${clean}*)`,
    limit: String(limit)
  });
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/youapp_index?${q.toString()}`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter(isCleanVideo) : [];
  } catch {
    return [];
  }
}

async function fetchGeneralPool(offset = 0, limit = 400) {
  const q = new URLSearchParams({
    select: 'video_id,title,creator_name,duration_seconds,embeddable',
    provider: 'eq.youtube',
    limit: String(limit),
    offset: String(offset)
  });
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/youapp_index?${q.toString()}`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter(isCleanVideo) : [];
  } catch {
    return [];
  }
}

function loadLocalMusicFallback() {
  try {
    const raw = JSON.parse(fs.readFileSync(ATLAS_MUSIC_PATH, 'utf8'));
    const out = [];
    for (const ch of raw?.channels || []) {
      for (const v of ch?.videos || []) {
        if (/^[A-Za-z0-9_-]{11}$/.test(v?.videoId || '')) {
          out.push({
            id: v.videoId,
            title: String(v.title || 'Música').slice(0, 110),
            channel: String(ch.artistLabel || ch.name || 'Canal Musical').slice(0, 60),
            durationSec: 240
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function main() {
  console.log(`Generando ${SIGNAL_SPECS.length} señales x 10 videos reales desde Supabase youapp_index...`);
  const globalUsed = new Set();
  const musicFallback = loadLocalMusicFallback();
  const generalPool = (await fetchGeneralPool(0, 500)).map((r) => ({
    id: String(r.video_id).trim(),
    title: String(r.title).trim().slice(0, 110),
    channel: String(r.creator_name || 'YouTube').trim().slice(0, 60),
    durationSec: Number(r.duration_seconds) > 30 ? Math.min(7200, Number(r.duration_seconds)) : 420
  }));

  const signals = [];
  let musicFallbackIdx = 0;
  let generalIdx = 0;

  // Ejecutar en lotes de 8 señales en paralelo para terminar en ~15 segundos
  for (let i = 0; i < SIGNAL_SPECS.length; i += 8) {
    const batch = SIGNAL_SPECS.slice(i, i + 8);
    const batchResults = await Promise.all(
      batch.map(async (spec) => {
        const candidates = [];
        for (const term of spec.terms) {
          if (candidates.length >= 24) break;
          const rows = await queryByTerm(term, 18);
          for (const r of rows) {
            candidates.push({
              id: String(r.video_id).trim(),
              title: String(r.title).trim().slice(0, 110),
              channel: String(r.creator_name || 'YouTube').trim().slice(0, 60),
              durationSec:
                Number(r.duration_seconds) > 30 ? Math.min(7200, Number(r.duration_seconds)) : 480
            });
          }
        }
        return { spec, candidates };
      })
    );

    for (const { spec, candidates } of batchResults) {
      const picked = [];
      const localSeen = new Set();

      // 1. Preferir videos que no se hayan usado en otra señal
      for (const c of candidates) {
        if (picked.length >= 10) break;
        if (localSeen.has(c.id) || globalUsed.has(c.id)) continue;
        localSeen.add(c.id);
        globalUsed.add(c.id);
        picked.push(c);
      }

      // 2. Si faltan, permitir candidatos relevantes aunque ya estén en otra señal
      for (const c of candidates) {
        if (picked.length >= 10) break;
        if (localSeen.has(c.id)) continue;
        localSeen.add(c.id);
        picked.push(c);
      }

      // 3. Fallback musical desde atlasMusicChannels.json (100% reales)
      if (spec.theme === 'musica' && picked.length < 10 && musicFallback.length > 0) {
        let tries = 0;
        while (picked.length < 10 && tries < musicFallback.length) {
          const item = musicFallback[musicFallbackIdx % musicFallback.length];
          musicFallbackIdx += 1;
          tries += 1;
          if (!localSeen.has(item.id)) {
            localSeen.add(item.id);
            globalUsed.add(item.id);
            picked.push(item);
          }
        }
      }

      // 4. Fallback general desde youapp_index (100% reales)
      if (picked.length < 10 && generalPool.length > 0) {
        let tries = 0;
        while (picked.length < 10 && tries < generalPool.length) {
          const item = generalPool[generalIdx % generalPool.length];
          generalIdx += 1;
          tries += 1;
          if (!localSeen.has(item.id)) {
            localSeen.add(item.id);
            globalUsed.add(item.id);
            picked.push(item);
          }
        }
      }

      signals.push({
        id: spec.id,
        theme: spec.theme,
        title: spec.title,
        subtitle: spec.subtitle,
        accent: spec.accent,
        coverVideoId: picked[0]?.id || '',
        videos: picked.slice(0, 10)
      });
    }
    process.stdout.write(`Progreso: ${signals.length}/${SIGNAL_SPECS.length} señales...\r`);
  }

  const totalVideos = signals.reduce((acc, s) => acc + s.videos.length, 0);
  const allExact10 = signals.every((s) => s.videos.length === 10);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'supabase:youapp_index',
    themes: [
      { id: 'cultura', label: 'Cultura, Historia y Saber', count: signals.filter((s) => s.theme === 'cultura').length },
      { id: 'musica', label: 'Música, Conciertos y Escena', count: signals.filter((s) => s.theme === 'musica').length },
      { id: 'mundo', label: 'Deportes, Actualidad y Vida Real', count: signals.filter((s) => s.theme === 'mundo').length }
    ],
    totalSignals: signals.length,
    totalVideos,
    uniqueVideoIds: globalUsed.size,
    signals
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nLISTO: ${signals.length} señales, ${totalVideos} videos (${globalUsed.size} únicos), todas con 10 videos=${allExact10}`);
  console.log(`Guardado en: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
