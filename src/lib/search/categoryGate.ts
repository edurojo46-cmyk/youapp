/**
 * ATLAS Universal Category Gate (0 cuota, determinístico)
 *
 * Soluciona de raíz la contaminación de categorías en `youapp_index`:
 * - Las filas masivas de Wikidata (`atlas-v3`) heredan tags amplios de profesión
 *   (ej. un actor infantil recibe `cine`, `documentales`, `entretenimiento`).
 * - Este filtro distingue entre fuentes curadas verificadas (`es-curado`, `rock-curado`,
 *   `documentales-curados`, `historia-curada`, `peliculas-completas`, `search-learned`)
 *   y filas masivas (`atlas-v3` / `americas-v1`), exigiendo coherencia semántica real
 *   de título/canal para entrar en cualquier botón de categoría.
 */

const CURATED_TRUST_TAGS = new Set([
  'es-curado',
  'rock-curado',
  'documentales-curados',
  'historia-curada',
  'peliculas-completas',
  'search-learned'
]);

const KIDS_NOISE_RE =
  /\b(topa|diego topa|luli pampin|plim plim|granja de zenon|cocomelon|peppa pig|baby shark|canciones infantiles|almankids|sing-along|las ruedas del autobus|bebe juan|paw patrol|blipi|blippi|pocoyo|masha y el oso)\b/;

const CATEGORY_POSITIVE_RE: Record<string, RegExp> = {
  cine: /\b(cine|cinema|pelicula|peliculas|movie|film|trailer|teaser|hollywood|oscar|netflix|pixar|marvel|dc|resumen|critica|reseña|estreno|taquilla|director|escena|cortometraje|series|anime)\b/,
  peliculas: /\b(pelicula completa|full movie|pelicula|movie|film|cine|cinema|estreno|trailer|accion|comedia|terror|suspenso|drama|clasico)\b/,
  documentales: /\b(documental|documentary|dw documental|natgeo|national geographic|bbc|historia|planeta|naturaleza|universo|ciencia|guerra|biografia|misterio|investigacion|expediente)\b/,
  historia: /\b(historia|history|guerra|imperio|roma|egipto|siglo|antiguo|medieval|independencia|revolucion|biografia|documental|arqueologia)\b/,
  noticias: /\b(noticias|news|noticiero|en vivo|vivo|ultimo momento|urgente|periodismo|diario|telediario|edicion|entrevista|politica|economia|tn|c5n|ln\+|a24|rpp|latina|caracol|rcn|milenio|nmas|rtve|cnn|bbc)\b/,
  deportes: /\b(futbol|football|soccer|deportes|sports|gol|goles|resumen|partido|liga|copa|champions|libertadores|mundial|nba|nfl|ufc|boxeo|tenis|f1|formula 1|espn|tyc|tudn|win sports|movistar deportes)\b/,
  musica: /\b(music|musica|official video|video oficial|lyric|audio oficial|cancion|album|concierto|recital|live session|session|acoustic|acustico|vevo|cumbia|rock|pop|rap|trap|reggaeton|salsa|tango|folclore|cuarteto|jazz|blues)\b/,
  rock: /\b(rock|guitar|metal|punk|grunge|indie|banda|recital|concierto|en vivo|soda stereo|charly|spinetta|fito|redondos|piojos|queen|beatles|rolling stones|pink floyd|nirvana|metallica|ac dc|led zeppelin)\b/,
  streaming: /\b(stream|streaming|en vivo|vivo|twitch|kick|olga|luzu|blender|gelatina|vorterix|urbana play|nadie dice nada|hablando huevadas|no somos tv|ibai|auronplay|illojuan|thegrefg|el mariana|westcol|charla|reaccion)\b/,
  podcasts: /\b(podcast|episodio|ep\.|entrevista|charla|conversacion|the wild project|joe rogan|roberto mtz|la cotorrisa|migala|se regalan dudas|creativo|lex fridman)\b/,
  comedia: /\b(comedia|humor|stand up|standup|chiste|chistes|sketch|parodia|risa|monologo|show|franco escamilla|hablando huevadas|guille aquino|peter capusotto)\b/,
  gaming: /\b(gaming|gameplay|gamer|minecraft|fortnite|valorant|gta|fifa|fc 25|fc 26|elden ring|call of duty|league of legends|playstation|xbox|nintendo|speedrun|walkthrough|review)\b/,
  cocina: /\b(cocina|receta|recetas|chef|gastronomia|comida|asado|pasta|postre|torta|pan|cocinar|paulina cocina|locos x el asado|marcos di cesare)\b/,
  viajes: /\b(viaje|viajes|travel|vlog|ciudad|pais|turismo|recorriendo|hotel|vuelo|aventura|luisito comunica|alan x el mundo|lethal crysis)\b/,
  economia: /\b(economia|finanzas|dolar|inversion|inversiones|bolsa|cripto|bitcoin|negocios|emprender|dinero|mercado|inflacion|finanzas personales)\b/,
  ciencia: /\b(ciencia|science|fisica|quimica|biologia|astronomia|espacio|nasa|universo|quantum|cuantica|experimento|veritasium|kurzgesagt|quantumfracture|date un vlog)\b/,
  tecnologia: /\b(tecnologia|tech|ia|inteligencia artificial|ai|iphone|android|apple|google|software|programacion|coding|hardware|pc|review|gadgets|robotica)\b/,
  'ia-cursos': /\b(ia|inteligencia artificial|ai|chatgpt|claude|gemini|curso|tutorial|programacion|python|javascript|aprender|machine learning|llm|prompt)\b/,
  salud: /\b(salud|medicina|nutricion|ejercicio|entrenamiento|fitness|yoga|bienestar|psicologia|sueño|dieta|doctor|medico)\b/
};

function normGateText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Evalúa si una fila de `youapp_index` realmente pertenece a la categoría pedida.
 * - Si el video es claramente infantil (Topa, Luli Pampín, Plim Plim, etc.),
 *   se bloquea en cualquier categoría que no sea infantil/familia.
 * - Si viene de `atlas-v3` (ingesta masiva por profesión Wikidata) sin respaldo curado,
 *   DEBE coincidir semánticamente en título/canal con la categoría solicitada.
 */
export function passesCategoryGate(row: any, categoryTag: string | null | undefined): boolean {
  if (!categoryTag || categoryTag === 'todos') return true;

  const tags: string[] = Array.isArray(row?.tags) ? row.tags : [];
  const hay = normGateText(`${row?.title || ''} ${row?.creator_name || ''}`);

  // 1. Bloqueo universal de ruido infantil fuera de categorías infantiles
  if (categoryTag !== 'infantil' && categoryTag !== 'familia' && KIDS_NOISE_RE.test(hay)) {
    return false;
  }

  const isCurated = tags.some((t) => CURATED_TRUST_TAGS.has(t));
  const isBulkWikidata = tags.includes('atlas-v3') && !isCurated;

  const posRe = CATEGORY_POSITIVE_RE[categoryTag];

  // 2. Filas masivas de Wikidata (`atlas-v3` sin curaduría): exigir match semántico positivo real
  if (isBulkWikidata) {
    if (!posRe) return false;
    return posRe.test(hay);
  }

  // 3. Filas de `americas-v1` (sin curaduría manual): también exigir coherencia en categorías críticas
  if (tags.includes('americas-v1') && !isCurated) {
    if (posRe && !posRe.test(hay)) {
      return false;
    }
  }

  return true;
}
