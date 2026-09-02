/**
 * canonicalWorksCatalog.ts — Diccionario Semántico y Ontología de Obras Canónicas (Works Ontology)
 * 
 * Este archivo actúa EXCLUSIVAMENTE como diccionario de conocimiento semántico:
 * - Mapea entidades, títulos canónicos, aliases e identificadores de obras.
 * - Proporciona términos de búsqueda normalizados para consultar el índice físico de Atlas (youapp_index).
 * - NUNCA genera ni fabrica assets/videos de búsqueda inventados.
 */

export interface CanonicalWorkOntologyEntry {
  workId: string;
  canonicalTitle: string;
  artist: string;
  workType: 'song' | 'composition' | 'symphony' | 'suite';
  releaseYear?: number;
  aliases: string[];
  canonicalSearchTerms: string[];
}

export const CANONICAL_WORKS_ONTOLOGY: CanonicalWorkOntologyEntry[] = [
  {
    workId: 'rolling_stones_paint_it_black',
    canonicalTitle: 'Paint It, Black',
    artist: 'The Rolling Stones',
    workType: 'song',
    releaseYear: 1966,
    aliases: ['Paint It Black', 'Paint It, Black (Official Lyric Video)', 'Paint It Black Rolling Stones'],
    canonicalSearchTerms: ['paint it black', 'paint it, black', 'rolling stones paint it black']
  },
  {
    workId: 'queen_bohemian_rhapsody',
    canonicalTitle: 'Bohemian Rhapsody',
    artist: 'Queen',
    workType: 'song',
    releaseYear: 1975,
    aliases: ['Bohemian Rhapsody A Night at the Opera', 'Bohemian Rapsody'],
    canonicalSearchTerms: ['bohemian rhapsody', 'queen bohemian rhapsody']
  },
  {
    workId: 'cerati_crimen',
    canonicalTitle: 'Crimen',
    artist: 'Gustavo Cerati',
    workType: 'song',
    releaseYear: 2006,
    aliases: ['Crimen Ahi Vamos', 'Cerati Crimen'],
    canonicalSearchTerms: ['cerati crimen', 'gustavo cerati crimen', 'crimen']
  },
  {
    workId: 'charly_demoliendo_hoteles',
    canonicalTitle: 'Demoliendo Hoteles',
    artist: 'Charly García',
    workType: 'song',
    releaseYear: 1984,
    aliases: ['Demoliendo Hoteles Piano Bar', 'Charly Demoliendo Hoteles'],
    canonicalSearchTerms: ['demoliendo hoteles', 'charly garcia demoliendo hoteles', 'demoliendo']
  },
  {
    workId: 'soda_de_musica_ligera',
    canonicalTitle: 'De Música Ligera',
    artist: 'Soda Stereo',
    workType: 'song',
    releaseYear: 1990,
    aliases: ['De Musica Ligera Cancion Animal', 'De Música Ligera Gracias Totales'],
    canonicalSearchTerms: ['de musica ligera', 'soda stereo de musica ligera', 'musica ligera']
  },
  {
    workId: 'spinetta_seguir_viviendo_sin_tu_amor',
    canonicalTitle: 'Seguir Viviendo Sin Tu Amor',
    artist: 'Luis Alberto Spinetta',
    workType: 'song',
    releaseYear: 1991,
    aliases: ['Seguir Viviendo Sin Tu Amor Peluson of Milk'],
    canonicalSearchTerms: ['seguir viviendo sin tu amor', 'spinetta seguir viviendo', 'seguir viviendo']
  },
  {
    workId: 'calle_13_la_perla',
    canonicalTitle: 'La Perla',
    artist: 'Calle 13',
    workType: 'song',
    releaseYear: 2008,
    aliases: ['La Perla Calle 13 Rubén Blades', 'La Perla Calle 13', 'Calle 13 ft Ruben Blades La Perla'],
    canonicalSearchTerms: ['calle 13 la perla', 'la perla calle 13', 'la perla']
  },
  {
    workId: 'spinetta_muchacha_ojos_de_papel',
    canonicalTitle: 'Muchacha (Ojos de Papel)',
    artist: 'Luis Alberto Spinetta',
    workType: 'song',
    releaseYear: 1969,
    aliases: ['Muchacha', 'Muchacha Almendra'],
    canonicalSearchTerms: ['muchacha ojos de papel', 'spinetta muchacha']
  },
  {
    workId: 'fito_el_amor_despues_del_amor',
    canonicalTitle: 'El Amor Después del Amor',
    artist: 'Fito Páez',
    workType: 'song',
    releaseYear: 1992,
    aliases: ['El amor despues del amor'],
    canonicalSearchTerms: ['el amor despues del amor', 'fito paez el amor despues del amor']
  },
  {
    workId: 'fito_mariposa_tecknicolor',
    canonicalTitle: 'Mariposa Tecknicolor',
    artist: 'Fito Páez',
    workType: 'song',
    releaseYear: 1994,
    aliases: ['Mariposa Tecknicolor Circo Beat'],
    canonicalSearchTerms: ['mariposa tecknicolor', 'mariposa tecnicolor', 'fito paez mariposa']
  },
  {
    workId: 'charly_los_dinosaurios',
    canonicalTitle: 'Los Dinosaurios',
    artist: 'Charly García',
    workType: 'song',
    releaseYear: 1983,
    aliases: ['Los Dinosaurios Clics Modernos'],
    canonicalSearchTerms: ['los dinosaurios', 'charly garcia los dinosaurios']
  }
];

export function lookupCanonicalWork(query: string): CanonicalWorkOntologyEntry | null {
  const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  for (const entry of CANONICAL_WORKS_ONTOLOGY) {
    if (entry.canonicalSearchTerms.some(st => norm.includes(st) || st.includes(norm))) {
      return entry;
    }
    if (entry.aliases.some(a => norm.includes(a.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}
