/**
 * benchmark_atlas_coverage.ts
 *
 * GOLD BENCHMARK SUITE: 200 CONSULTAS ATLAS-ONLY
 * Con análisis estadístico riguroso:
 * - Percentiles (P25, Mediana, P75, P95, Min, Max)
 * - Cobertura Suficiente (>= 6 videos cualificados Q>=60, R>=40)
 * - Lista de Gaps y Top Queries
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { parseQuery } from '../src/lib/search/queryEngine';
import type { ContentItem } from '../src/lib/search/types';

export const GOLD_200_QUERIES = [
  // 40 Educativas
  'clase magistral fisica cuantica', 'curso introduccion a la filosofia', 'tutorial programacion python basico',
  'aprender matematicas derivadas', 'quimica organica explicada', 'biologia celula estructura',
  'curso historia del arte', 'gramatica espanola leccion', 'estadistica probabilidad curso',
  'economia introduccion principios', 'sociologia conceptos fundamentales', 'antropologia cultural clase',
  'astronomia planetas sistema solar', 'geologia placas tectonicas', 'psicologia conductismo psicoanalisis',
  'neurociencia memoria aprendizaje', 'derecho constitucional principios', 'anatomia humana organos',
  'ecologia ecosistemas biodiversidad', 'algoritmos estructuras de datos', 'redes informaticas tcp ip',
  'seguridad informatica criptografia', 'mecanica clasica newton', 'electromagnetismo maxwell',
  'termodinamica leyes calor', 'optica luz refraccion', 'genetica adn arn herencia',
  'botanica plantas fotosintesis', 'zoologia reino animal', 'geografia continentes mapas',
  'literatura teoria literaria', 'linguistica fonetica semantica', 'filosofia logica proposicional',
  'metodologia de la investigacion', 'comunicacion medios teorias', 'educacion pedagogia teorias',
  'ciencias politicas estado poder', 'administracion empresas gestion', 'contabilidad finanzas basico',
  'marketing digital estrategias',

  // 30 Historia
  'revolucion francesa causas consecuencias', 'segunda guerra mundial resumen', 'primera guerra mundial historia',
  'imperio romano caida historia', 'antiguo egipto piramides faraones', 'revolucion industrial transformaciones',
  'guerra fria union sovietica eeuu', 'revolucion rusa 1917 lenin', 'independencia estados unidos 1776',
  'imperio inca machu picchu historia', 'imperio azteca tenochtitlan conquista', 'revolucion de mayo argentina 1810',
  'cruce de los andes san martin', 'guerra civil espanola republica franco', 'caida del muro de berlin 1989',
  'historia de la grecia clasica atenas', 'renacimiento italiano arte historia', 'edad media feudalismo castillos',
  'revolucion mexicana zapata villa', 'descolonizacion de africa siglo xx', 'guerra de vietnam historia documental',
  'guerra de corea division conflicto', 'crisis de los misiles cuba 1962', 'apartheid sudafrica nelson mandela',
  'historia del canal de panama', 'conquista del desierto argentina', 'guerra de la triple alianza historia',
  'batalla de stalingrado documental', 'desembarco de normandia dia d', 'conferencia de yalta division europa',

  // 25 Ciencia y Tecnología
  'como funciona un reactor nuclear', 'telescopio james webb descubrimientos', 'teoria de la relatividad einstein',
  'mecanica cuantica entrelazamiento', 'computacion cuantica qubits explicacion', 'inteligencia artificial redes neuronales',
  'fusion nuclear energia limpia', 'agujeros negros horizonte de sucesos', 'origen del universo big bang',
  'evolucion de las especies darwin', 'edicion genetica crispr cas9', 'energias renovables paneles solares',
  'grafeno materiales del futuro', 'nanotecnologia medicina aplicaciones', 'terraformacion de marte ciencia',
  'viajes espaciales propulsion cohetes', 'superconductores temperatura ambiente', 'velocidad de la luz limites fisica',
  'ondas gravitacionales ligo deteccion', 'materia oscura universo cosmologia', 'antimateria creacion laboratorio cern',
  'baterias de litio funcionamiento', 'redes 5g tecnologia telecomunicaciones', 'robotica humanoide boston dynamics',
  'ciberseguridad ataques ddos malware',

  // 20 Política y Geopolítica
  'noticias internacionales geopolitica', 'conflicto medio oriente historia', 'union europea tratados historia',
  'organizacion de las naciones unidas onu', 'democracia republica representacion debate',
  'geopolitica del petroleo energia mundial', 'crisis economica 2008 lehman brothers', 'guerra en ucrania analisis estrategico',
  'tratado de versalles consecuencias', 'guerra de malvinas 1982 conflicto', 'doctrina monroe historia relaciones',
  'socialismo capitalismo comparacion economica', 'totalitarismo autoritarismo diferencias',
  'derechos humanos declaracion universal', 'corte penal internacional justicia', 'globalizacion tratados libre comercio',
  'soberania alimentaria agricultura mundial', 'cambio climatico acuerdos internacionales', 'migraciones globales causas crisis',
  'diplomacia internacional relaciones exteriores',

  // 20 Cultura y Música
  'historia del tango carlos gardel', 'musica clasica beethoven sinfonia 9', 'mozart requiem historia obra',
  'bach conciertos de brandeburgo', 'historia del jazz new orleans', 'rock argentino spinetta charly garcia',
  'folklore argentino mercedes sosa', 'historia del flamenco espana', 'opera clasica puccini verdi',
  'historia del blues mississippi', 'musica barroca vivaldi cuatro estaciones', 'historia del cine mudo al sonoro',
  'teatro clasico shakespeare hamlet', 'literatura hispanoamericana boom latinoamericano', 'jorge luis borges poemas cuentos',
  'julio cortazar rayuela analisis', 'gabriel garcia marquez cien anos de soledad', 'pintura impresionismo monet van gogh',
  'surrealismo salvador dali pinturas', 'escultura renacimiento miguel angel david',

  // 15 Cine y Cortometrajes
  'Alike short film award animation', 'cortometraje animacion festival ganador', 'classic cinema movie archive',
  'cine independiente cortometraje ficcion', 'videoarte experimental festival vanguardia', 'cortometraje drama premiado',
  'cine expresionismo aleman gabinete caligari', 'cine mudo charles chaplin tiempos modernos', 'documental naturaleza animales',
  'cortometraje animacion 3d corto', 'nouvelle vague cine frances godard', 'neorrealismo italiano ladron de bicicletas',
  'cine documental historia latinoamericana', 'cine clasico hollywood anos dorados', 'cortometraje comedia festival',

  // 15 Tecnología, FOSS y Privacidad
  'gnu linux tutorial terminal comandos', 'richard stallman software libre conferencia', 'privacidad digital tor vpn seguridad',
  'descentralizacion redes federadas mastodon', 'lenguaje rust programacion memoria', 'arquitectura de computadoras cpu gpu',
  'bases de datos relacionales sql nosql', 'protocolo http https ssl tls', 'historia de internet arpanet tcp ip',
  'seguridad informatica ethical hacking', 'virtualizacion docker contenedores kubernetes', 'sistemas operativos kernel linux',
  'compiladores interpretes como funcionan', 'algoritmos de ordenamiento busqueda', 'inteligencia artificial transformers llms',

  // 10 Economía y Sociedad
  'historia del pensamiento economico adam smith', 'crisis gran depresion 1929 causas', 'inflacion hiperinflacion teoria economica',
  'comercio internacional aranceles divisas', 'desigualdad economica indice de gini', 'teoria de juegos equilibrio de nash',
  'banca central politicas monetarias tasas', 'historia de la moneda del trueque al dinero', 'sociologia max weber etica protestante',
  'karl marx el capital conceptos clave',

  // 10 Filosofía
  'teologia de la liberacion gustavo gutierrez', 'leonardo boff teologia latinoamericana', 'filosofia aqui y ahora jose pablo feinmann',
  'platon mito de la caverna republica', 'aristoteles etica a nicomaco virtudes', 'descartes pienso luego existo meditaciones',
  'kant critica de la razon pura imperativo', 'nietzsche asi hablo zaratustra superhombre', 'existencialismo jean paul sartre la nausea',
  'hannah arendt banalidad del mal',

  // 10 Argentina y Latinoamérica
  'historia argentina peronismo 1945', 'cordobazo 1969 movimiento obrero', 'juicio a las juntas 1985 argentina',
  'guerra de malvinas testimonios veteranos', 'independencia de america latina bolivar', 'revolucion cubana 1959 fidel castro',
  'salvador allende discurso 1973 chile', 'revolucion mexicana emiliano zapata', 'historia de los pueblos originarios mapuches',
  'folklore latinoamericano canto popular',

  // 5 Long-tail y Consultas Complejas
  'como funciona un transformador electrico de induccion', 'demostracion matematica teorema de pitagoras',
  'origen del lenguaje humano evolucion linguistica', 'fisiologia de la vision como ve el ojo humano',
  'mecanismo de anticitera computadora astronomica antigua'
];

export async function runAtlasCoverageBenchmark(): Promise<{
  totalQueries: number;
  sufficientCount: number;
  partialCount: number;
  gapCount: number;
  coverageRate: number;
  avgQualifiedPerQuery: number;
  medianQualified: number;
  p25: number;
  p75: number;
  p95: number;
  gapsList: string[];
}> {
  console.log(`\n======================================================================`);
  console.log(`📊 EJECUTANDO GOLD BENCHMARK DE COBERTURA EN ATLAS (${GOLD_200_QUERIES.length} CONSULTAS)`);
  console.log(`======================================================================\n`);

  let sufficientCount = 0; // >= 6 calificados
  let partialCount = 0;    // 1-5 calificados
  let gapCount = 0;        // 0 calificados

  // Paginación para cargar todos los contenidos de youapp_index
  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('provider, provider_content_id, title, description, thumbnail, url, canonical_url, embed_url, creator_name, duration_seconds, published_at, language, content_state')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  const catalog: ContentItem[] = allIndexItems.map((item: any) => ({
    id: `atlas_${item.provider}_${item.provider_content_id}`,
    provider: item.provider || 'atlas',
    providerContentId: item.provider_content_id,
    title: item.title || '',
    description: item.description || '',
    thumbnail: item.thumbnail || (item as any).thumbnail_url,
    videoUrl: item.embed_url || item.url,
    canonicalUrl: item.canonical_url || item.url,
    channelTitle: item.creator_name,
    durationSeconds: item.duration_seconds || 0,
    publishedAt: item.published_at,
    language: item.language || 'es',
    embeddable: true,
    type: 'video',
    retrievalSource: 'atlas'
  }));

  console.log(`🏛️ Índice de Atlas cargado en memoria: ${catalog.length.toLocaleString()} contenidos.`);

  const queryResults: { query: string; count: number }[] = [];
  const gapsList: string[] = [];

  for (let i = 0; i < GOLD_200_QUERIES.length; i++) {
    const rawQuery = GOLD_200_QUERIES[i];
    const query = parseQuery(rawQuery);

    // Filtrado léxico estricto: requiere coincidencia significativa con tokens no-stopword
    const qTokens = rawQuery.toLowerCase().split(/\s+/).filter(t => t.length >= 4);
    const candidates = catalog.filter(item => {
      const text = `${item.title} ${item.description || ''}`.toLowerCase();
      // Debe coincidir con al menos 1 término principal de >= 4 letras
      return qTokens.some(t => text.includes(t));
    });

    if (candidates.length === 0) {
      gapCount++;
      gapsList.push(rawQuery);
      queryResults.push({ query: rawQuery, count: 0 });
      continue;
    }

    const ranked = calculateBaseRanking(candidates, query);
    const scored = calculateQualityScore(ranked);
    // Invariant: Q >= 60 y R >= 40
    const qualified = scored.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40);

    queryResults.push({ query: rawQuery, count: qualified.length });

    if (qualified.length >= 6) {
      sufficientCount++;
    } else if (qualified.length >= 1) {
      partialCount++;
    } else {
      gapCount++;
      gapsList.push(rawQuery);
    }
  }

  // Análisis estadístico
  const counts = queryResults.map(q => q.count).sort((a, b) => a - b);
  const total = GOLD_200_QUERIES.length;
  const coverageRate = Math.round((sufficientCount / total) * 100);
  const sum = counts.reduce((acc, c) => acc + c, 0);
  const avgQualified = +(sum / total).toFixed(1);

  const p25 = counts[Math.floor(total * 0.25)];
  const median = counts[Math.floor(total * 0.50)];
  const p75 = counts[Math.floor(total * 0.75)];
  const p95 = counts[Math.floor(total * 0.95)];
  const min = counts[0];
  const max = counts[counts.length - 1];

  // Top 10 más cubiertas
  const topOverCovered = [...queryResults].sort((a, b) => b.count - a.count).slice(0, 10);
  const topUnderCovered = [...queryResults].filter(q => q.count > 0 && q.count < 6).sort((a, b) => a.count - b.count).slice(0, 10);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`                 ATLAS COVERAGE STATISTICAL BENCHMARK REPORT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total Consultas Evaluadas:       ${total}`);
  console.log(`Atlas Sufficient (>=6 videos):    ${sufficientCount} (${coverageRate}%)`);
  console.log(`Atlas Partial (1-5 videos):       ${partialCount} (${Math.round((partialCount / total) * 100)}%)`);
  console.log(`Atlas Gaps (0 videos):            ${gapCount} (${Math.round((gapCount / total) * 100)}%)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`DISTRIBUCIÓN ESTADÍSTICA (Qualified items / query):`);
  console.log(`  - Promedio (Media):             ${avgQualified}`);
  console.log(`  - Mediana (P50):                ${median}`);
  console.log(`  - P25:                          ${p25}`);
  console.log(`  - P75:                          ${p75}`);
  console.log(`  - P95:                          ${p95}`);
  console.log(`  - Rango (Min - Max):            ${min} - ${max}`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`TOP 5 QUERIES CON MÁS RESULTADOS (Densidad Alta):`);
  topOverCovered.slice(0, 5).forEach(q => console.log(`  - "${q.query}": ${q.count} calificados`));
  console.log(`\nTOP GAPS / BAJA COBERTURA (Prioridad Wave 1B):`);
  gapsList.forEach(q => console.log(`  ⚠️ [GAP 0] "${q}"`));
  topUnderCovered.slice(0, 5).forEach(q => console.log(`  ⚠️ [PARCIAL ${q.count}] "${q.query}"`));
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    totalQueries: total,
    sufficientCount,
    partialCount,
    gapCount,
    coverageRate,
    avgQualifiedPerQuery: avgQualified,
    medianQualified: median,
    p25,
    p75,
    p95,
    gapsList
  };
}

if (process.argv[1]?.includes('benchmark_atlas_coverage')) {
  runAtlasCoverageBenchmark();
}
