import fs from 'fs';
import path from 'path';

// Existing queries
import { BENCHMARK_QUERIES } from './benchmarkData';

const newQueriesRaw = `
Q053	News / Current	inflación argentina último dato
Q054	News / Current	dólar blue hoy
Q055	News / Current	últimas noticias economía argentina
Q056	News / Current	mercados financieros hoy
Q057	News / Current	bitcoin noticias hoy
Q058	News / Current	inteligencia artificial últimas noticias
Q059	News / Current	nuevas medidas económicas argentina
Q060	News / Current	clima político argentina hoy
Q061	News / Current	conflicto Rusia Ucrania últimas noticias
Q062	News / Current	noticias Medio Oriente hoy
Q063	News / Current	tecnología novedades esta semana
Q064	News / Current	bolsa de Nueva York hoy
Q065	News / Current	elecciones próximas en Argentina
Q066	News / Current	precio petróleo hoy
Q067	News / Current	mercado inmobiliario argentina actualidad
Q068	News / Current	últimas noticias de la NASA
Q069	News / Current	novedades medicina esta semana
Q070	News / Current	fútbol argentino noticias hoy
Q071	Entity / Evergreen	Diego Maradona
Q072	Entity / Evergreen	Lionel Scaloni
Q073	Entity / Evergreen	Mercedes Sosa
Q074	Entity / Evergreen	Charly García
Q075	Entity / Evergreen	Luis Alberto Spinetta
Q076	Entity / Evergreen	Jorge Luis Borges
Q077	Entity / Evergreen	Julio Cortázar
Q078	Entity / Evergreen	Albert Einstein
Q079	Entity / Evergreen	Marie Curie
Q080	Entity / Evergreen	Steve Jobs
Q081	Entity / Evergreen	Christopher Nolan
Q082	Entity / Evergreen	Quentin Tarantino
Q083	Entity / Evergreen	Adele
Q084	Entity / Evergreen	Freddie Mercury
Q085	Entity / Evergreen	Cristiano Ronaldo
Q086	Entity / Evergreen	Michael Jordan
Q087	Historical	Revolución de Mayo 1810
Q088	Historical	independencia argentina 1816
Q089	Historical	batalla de San Lorenzo 1813
Q090	Historical	bombardeo Plaza de Mayo 1955
Q091	Historical	retorno de Perón 1972
Q092	Historical	Argentina Mundial 1978
Q093	Historical	guerra de Malvinas 1982
Q094	Historical	recuperación democracia argentina 1983
Q095	Historical	caída del Muro de Berlín 1989
Q096	Historical	llegada del hombre a la Luna 1969
Q097	Historical	crisis de los misiles de Cuba 1962
Q098	Historical	atentados 11 de septiembre 2001
Q099	Historical	primera guerra mundial archivos
Q100	Historical	desembarco de Normandía 1944
Q101	Historical	Woodstock 1969
Q102	Historical	Juegos Olímpicos México 1968
Q103	Specialized audiovisual	cortometraje de ciencia ficción latinoamericano
Q104	Specialized audiovisual	cine experimental argentino
Q105	Specialized audiovisual	cortos de animación independiente
Q106	Specialized audiovisual	documental arquitectura moderna
Q107	Specialized audiovisual	documental fotografía callejera
Q108	Specialized audiovisual	videoclips experimentales
Q109	Specialized audiovisual	portfolio director de fotografía
Q110	Specialized audiovisual	cortometraje sin diálogo
Q111	Specialized audiovisual	documental de montaña Patagonia
Q112	Specialized audiovisual	cine documental social latinoamericano
Q113	Specialized audiovisual	stop motion independiente
Q114	Specialized audiovisual	cortometraje premiado festival de cine
Q115	Specialized audiovisual	documental sobre diseño gráfico
Q116	Specialized audiovisual	film ensayo experimental
Q117	Specialized audiovisual	animación 3D artística independiente
Q118	Specialized audiovisual	documental de tango Buenos Aires
Q119	Education / Tutorial	aprender Python desde cero
Q120	Education / Tutorial	curso introducción inteligencia artificial
Q121	Education / Tutorial	cómo funciona una red neuronal
Q122	Education / Tutorial	aprender edición de video
Q123	Education / Tutorial	tutorial fotografía para principiantes
Q124	Education / Tutorial	cómo hacer un podcast profesional
Q125	Education / Tutorial	aprender guitarra acordes básicos
Q126	Education / Tutorial	explicación sencilla física cuántica
Q127	Education / Tutorial	historia económica argentina explicada
Q128	Education / Tutorial	cómo programar una aplicación web
Q129	Education / Tutorial	aprender inglés conversación
Q130	Education / Tutorial	curso de marketing digital
Q131	Education / Tutorial	cómo editar audio profesional
Q132	Education / Tutorial	introducción a astronomía
Q133	Live / Gaming	streaming de ajedrez en vivo
Q134	Live / Gaming	torneo esports en vivo
Q135	Live / Gaming	campeonato Counter Strike live
Q136	Live / Gaming	speedrun videojuegos en vivo
Q137	Live / Gaming	desarrollo de videojuegos streaming
Q138	Live / Gaming	charla tecnología en vivo
Q139	Live / Gaming	música electrónica live set
Q140	Live / Gaming	programación en vivo coding
Q141	Live / Gaming	conferencia científica en vivo
Q142	Live / Gaming	entrevista deportiva en vivo
Q143	Difficult / Ambiguous	jaguar
Q144	Difficult / Ambiguous	mercurio
Q145	Difficult / Ambiguous	matrix
Q146	Difficult / Ambiguous	python
Q147	Difficult / Ambiguous	apple
Q148	Difficult / Ambiguous	java
Q149	Difficult / Ambiguous	river
Q150	Difficult / Ambiguous	boca
Q151	Difficult / Ambiguous	jordan
Q152	Difficult / Ambiguous	saturno
`;

const normalize = (q: string) => {
  return q.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, ''); // alphanumeric only
};

const seen = new Set<string>();
BENCHMARK_QUERIES.forEach((q: any) => seen.add(normalize(q.query)));

const newQueries = [];
let replacedCount = 0;

const replacements = {
  'News / Current': 'noticias internacionales hoy',
  'Entity / Evergreen': 'Nikola Tesla',
  'Historical': 'revolucion francesa 1789',
  'Specialized audiovisual': 'cortometraje stop motion de terror',
  'Education / Tutorial': 'como cocinar risotto',
  'Live / Gaming': 'torneo de poker en vivo',
  'Difficult / Ambiguous': 'lima'
};

const lines = newQueriesRaw.trim().split('\n');
for (const line of lines) {
  const parts = line.split('\t');
  if (parts.length < 3) continue;
  const id = parts[0];
  const catRaw = parts[1].trim();
  let qText = parts[2].trim();
  
  const norm = normalize(qText);
  if (seen.has(norm)) {
    console.log(`Duplicate found: ${qText}. Replacing with alternative in category ${catRaw}`);
    qText = replacements[catRaw] || (qText + ' extra');
    replacedCount++;
  }
  
  seen.add(normalize(qText));

  const obj: any = {
    id,
    query: qText,
    category: catRaw.toLowerCase().replace(/ \/ /g, '_').replace(/ /g, '_')
  };

  // Add expected intents/topics similar to the original ones
  if (catRaw === 'News / Current') {
    obj.expectedIntent = 'NEWS';
    obj.freshness = 'current';
  } else if (catRaw === 'Entity / Evergreen') {
    obj.expectedIntent = 'ENTITY';
    obj.freshness = 'evergreen';
  } else if (catRaw === 'Historical') {
    obj.expectedIntent = 'HISTORY';
    obj.expectedTopic = 'history';
  } else if (catRaw === 'Specialized audiovisual') {
    obj.expectedIntent = 'SPECIALIZED';
    if (qText.includes('corto') || qText.includes('film') || qText.includes('animación')) {
      obj.expectedFormat = 'short_film';
      obj.expectedTopic = 'film';
    } else if (qText.includes('documental')) {
      obj.expectedFormat = 'documentary';
    }
  } else if (catRaw === 'Education / Tutorial') {
    obj.expectedIntent = 'EDUCATION';
  } else if (catRaw === 'Live / Gaming') {
    if (qText.includes('esports') || qText.includes('videojuego') || qText.includes('gaming') || qText.includes('speedrun') || qText.includes('counter strike')) {
      obj.expectedIntent = 'GAMING';
      obj.expectedTopic = 'gaming';
    }
    obj.expectedFormat = 'live';
  } else if (catRaw === 'Difficult / Ambiguous') {
    obj.ambiguity = true;
  }

  newQueries.push(obj);
}

const allQueries = [...BENCHMARK_QUERIES, ...newQueries];

console.log(`Total queries: ${allQueries.length} (Replaced ${replacedCount} duplicates)`);
fs.writeFileSync('allQueries.json', JSON.stringify(allQueries, null, 2), 'utf-8');
