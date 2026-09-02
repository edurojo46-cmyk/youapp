/**
 * worksGraphEngine.ts — Motor de Detección de Obras Canónicas y Clasificación de Versiones (Works Graph V1)
 */

import type { CanonicalWork, AssetWorkRelation, WorkVersionType, WorksGraphSummary } from './worksGraphTypes';

export const CANONICAL_WORKS_REGISTRY: CanonicalWork[] = [
  // 🇦🇷 Rock Argentino & Rioplatense
  {
    id: 'spinetta_muchacha_ojos_de_papel',
    canonicalTitle: 'Muchacha (Ojos de Papel)',
    normalizedTitle: 'muchacha ojos de papel',
    workType: 'song',
    primaryEntityId: 'luis_alberto_spinetta',
    primaryEntityName: 'Luis Alberto Spinetta',
    aliases: ['Muchacha', 'Muchacha ojos de papel Almendra'],
    regex: /\b(muchacha ojos de papel|muchacha\(ojos de papel\))\b/i,
    releaseYear: 1969
  },
  {
    id: 'spinetta_bajan',
    canonicalTitle: 'Bajan',
    normalizedTitle: 'bajan',
    workType: 'song',
    primaryEntityId: 'luis_alberto_spinetta',
    primaryEntityName: 'Luis Alberto Spinetta',
    aliases: ['Bajan Artaud', 'Bajan Pescado Rabioso'],
    regex: /\b(bajan pescado rabioso|bajan spinetta|bajan artaud)\b/i,
    releaseYear: 1973
  },
  {
    id: 'spinetta_cantata_de_puentes_amarillos',
    canonicalTitle: 'Cantata de Puentes Amarillos',
    normalizedTitle: 'cantata de puentes amarillos',
    workType: 'song',
    primaryEntityId: 'luis_alberto_spinetta',
    primaryEntityName: 'Luis Alberto Spinetta',
    aliases: ['Cantata de puentes amarillos', 'Puentes amarillos'],
    regex: /\b(cantata de puentes amarillos|puentes amarillos spinetta)\b/i,
    releaseYear: 1973
  },
  {
    id: 'spinetta_seguir_viviendo_sin_tu_amor',
    canonicalTitle: 'Seguir Viviendo Sin Tu Amor',
    normalizedTitle: 'seguir viviendo sin tu amor',
    workType: 'song',
    primaryEntityId: 'luis_alberto_spinetta',
    primaryEntityName: 'Luis Alberto Spinetta',
    aliases: ['Seguir viviendo sin tu amor'],
    regex: /\b(seguir viviendo sin tu amor)\b/i,
    releaseYear: 1991
  },
  {
    id: 'charly_los_dinosaurios',
    canonicalTitle: 'Los Dinosaurios',
    normalizedTitle: 'los dinosaurios',
    workType: 'song',
    primaryEntityId: 'charly_garcia',
    primaryEntityName: 'Charly García',
    aliases: ['Los Dinosaurios Charly Garcia', 'Clics Modernos Dinosaurios'],
    regex: /\b(los dinosaurios|los dinosaurios charly)\b/i,
    releaseYear: 1983
  },
  {
    id: 'charly_inconsciente_colectivo',
    canonicalTitle: 'Inconsciente Colectivo',
    normalizedTitle: 'inconsciente colectivo',
    workType: 'song',
    primaryEntityId: 'charly_garcia',
    primaryEntityName: 'Charly García',
    aliases: ['Inconsciente colectivo', 'Yendo de la cama al living'],
    regex: /\b(inconsciente colectivo)\b/i,
    releaseYear: 1982
  },
  {
    id: 'charly_rezo_por_vos',
    canonicalTitle: 'Rezo Por Vos',
    normalizedTitle: 'rezo por vos',
    workType: 'song',
    primaryEntityId: 'charly_garcia',
    primaryEntityName: 'Charly García & Luis Alberto Spinetta',
    aliases: ['Rezo por vos Spinetta Charly'],
    regex: /\b(rezo por vos)\b/i,
    releaseYear: 1986
  },
  {
    id: 'cerati_de_musica_ligera',
    canonicalTitle: 'De Música Ligera',
    normalizedTitle: 'de musica ligera',
    workType: 'song',
    primaryEntityId: 'gustavo_cerati',
    primaryEntityName: 'Soda Stereo & Gustavo Cerati',
    aliases: ['De Musica Ligera', 'Cancion Animal Soda Stereo'],
    regex: /\b(de musica ligera|de música ligera)\b/i,
    releaseYear: 1990
  },
  {
    id: 'cerati_persiana_americana',
    canonicalTitle: 'Persiana Americana',
    normalizedTitle: 'persiana americana',
    workType: 'song',
    primaryEntityId: 'gustavo_cerati',
    primaryEntityName: 'Soda Stereo & Gustavo Cerati',
    aliases: ['Persiana Americana Signos'],
    regex: /\b(persiana americana)\b/i,
    releaseYear: 1986
  },
  {
    id: 'fito_el_amor_despues_del_amor',
    canonicalTitle: 'El Amor Después del Amor',
    normalizedTitle: 'el amor despues del amor',
    workType: 'song',
    primaryEntityId: 'fito_paez',
    primaryEntityName: 'Fito Páez',
    aliases: ['El amor despues del amor'],
    regex: /\b(el amor despues del amor|el amor después del amor)\b/i,
    releaseYear: 1992
  },
  {
    id: 'fito_mariposa_tecknicolor',
    canonicalTitle: 'Mariposa Tecknicolor',
    normalizedTitle: 'mariposa tecknicolor',
    workType: 'song',
    primaryEntityId: 'fito_paez',
    primaryEntityName: 'Fito Páez',
    aliases: ['Mariposa Tecknicolor Circo Beat'],
    regex: /\b(mariposa tecknicolor|mariposa tecnicolor)\b/i,
    releaseYear: 1994
  },
  {
    id: 'los_redondos_jijiji',
    canonicalTitle: 'Ji Ji Ji',
    normalizedTitle: 'ji ji ji',
    workType: 'song',
    primaryEntityId: 'los_redondos',
    primaryEntityName: 'Patricio Rey y sus Redonditos de Ricota',
    aliases: ['Ji Ji Ji Oktubre', 'El Pogo Mas Grande del Mundo'],
    regex: /\b(ji ji ji|jijiji)\b/i,
    releaseYear: 1986
  },
  {
    id: 'divididos_el_38',
    canonicalTitle: 'El 38',
    normalizedTitle: 'el 38',
    workType: 'song',
    primaryEntityId: 'divididos',
    primaryEntityName: 'Divididos',
    aliases: ['El 38 esta cargado', 'Acariciando lo aspero'],
    regex: /\b(el 38|el 38 esta cargado)\b/i,
    releaseYear: 1991
  },

  // 🇦🇷 🇺🇾 Tango & Folclore Canónico
  {
    id: 'piazzolla_libertango',
    canonicalTitle: 'Libertango',
    normalizedTitle: 'libertango',
    workType: 'composition',
    primaryEntityId: 'astor_piazzolla',
    primaryEntityName: 'Astor Piazzolla',
    aliases: ['Libertango Piazzolla'],
    regex: /\b(libertango)\b/i,
    releaseYear: 1974
  },
  {
    id: 'piazzolla_adios_nonino',
    canonicalTitle: 'Adiós Nonino',
    normalizedTitle: 'adios nonino',
    workType: 'composition',
    primaryEntityId: 'astor_piazzolla',
    primaryEntityName: 'Astor Piazzolla',
    aliases: ['Adios Nonino', 'Adiós Nonino'],
    regex: /\b(adios nonino|adiós nonino)\b/i,
    releaseYear: 1959
  },
  {
    id: 'gardel_el_dia_que_me_quieras',
    canonicalTitle: 'El Día Que Me Quieras',
    normalizedTitle: 'el dia que me quieras',
    workType: 'song',
    primaryEntityId: 'carlos_gardel',
    primaryEntityName: 'Carlos Gardel & Alfredo Le Pera',
    aliases: ['El dia que me quieras'],
    regex: /\b(el dia que me quieras|el día que me quieras)\b/i,
    releaseYear: 1935
  },
  {
    id: 'gardel_volver',
    canonicalTitle: 'Volver',
    normalizedTitle: 'volver',
    workType: 'song',
    primaryEntityId: 'carlos_gardel',
    primaryEntityName: 'Carlos Gardel',
    aliases: ['Volver tango'],
    regex: /\b(volver gardel|tango volver)\b/i,
    releaseYear: 1935
  },
  {
    id: 'gardel_por_una_cabeza',
    canonicalTitle: 'Por Una Cabeza',
    normalizedTitle: 'por una cabeza',
    workType: 'song',
    primaryEntityId: 'carlos_gardel',
    primaryEntityName: 'Carlos Gardel',
    aliases: ['Por una cabeza tango'],
    regex: /\b(por una cabeza)\b/i,
    releaseYear: 1935
  },
  {
    id: 'mercedes_alfonsina_y_el_mar',
    canonicalTitle: 'Alfonsina y el Mar',
    normalizedTitle: 'alfonsina y el mar',
    workType: 'song',
    primaryEntityId: 'mercedes_sosa',
    primaryEntityName: 'Mercedes Sosa & Ariel Ramírez',
    aliases: ['Alfonsina y el mar'],
    regex: /\b(alfonsina y el mar)\b/i,
    releaseYear: 1969
  },
  {
    id: 'yupanqui_los_ejes_de_mi_carreta',
    canonicalTitle: 'Los Ejes de Mi Carreta',
    normalizedTitle: 'los ejes de mi carreta',
    workType: 'song',
    primaryEntityId: 'atahualpa_yupanqui',
    primaryEntityName: 'Atahualpa Yupanqui',
    aliases: ['Los ejes de mi carreta'],
    regex: /\b(los ejes de mi carreta)\b/i,
    releaseYear: 1960
  },

  // 🎸 Rock & Pop Universal
  {
    id: 'rolling_stones_paint_it_black',
    canonicalTitle: 'Paint It, Black',
    normalizedTitle: 'paint it black',
    workType: 'song',
    primaryEntityId: 'the_rolling_stones',
    primaryEntityName: 'The Rolling Stones',
    aliases: ['Paint It Black', 'Paint It, Black (Official Lyric Video)', 'Paint It Black Rolling Stones'],
    regex: /\b(paint it,?\s*black)\b/i,
    releaseYear: 1966
  },
  {
    id: 'queen_bohemian_rhapsody',
    canonicalTitle: 'Bohemian Rhapsody',
    normalizedTitle: 'bohemian rhapsody',
    workType: 'song',
    primaryEntityId: 'queen',
    primaryEntityName: 'Queen',
    aliases: ['Bohemian Rhapsody A Night at the Opera'],
    regex: /\b(bohemian rhapsody)\b/i,
    releaseYear: 1975
  },
  {
    id: 'bowie_heroes',
    canonicalTitle: '"Heroes"',
    normalizedTitle: 'heroes',
    workType: 'song',
    primaryEntityId: 'david_bowie',
    primaryEntityName: 'David Bowie & Brian Eno',
    aliases: ['Heroes David Bowie'],
    regex: /\b(heroes david bowie|david bowie heroes)\b/i,
    releaseYear: 1977
  },
  {
    id: 'bowie_space_oddity',
    canonicalTitle: 'Space Oddity',
    normalizedTitle: 'space oddity',
    workType: 'song',
    primaryEntityId: 'david_bowie',
    primaryEntityName: 'David Bowie',
    aliases: ['Space Oddity Major Tom'],
    regex: /\b(space oddity)\b/i,
    releaseYear: 1969
  },
  {
    id: 'beatles_hey_jude',
    canonicalTitle: 'Hey Jude',
    normalizedTitle: 'hey jude',
    workType: 'song',
    primaryEntityId: 'the_beatles',
    primaryEntityName: 'The Beatles',
    aliases: ['Hey Jude Beatles'],
    regex: /\b(hey jude)\b/i,
    releaseYear: 1968
  },
  {
    id: 'floyd_shine_on_you_crazy_diamond',
    canonicalTitle: 'Shine On You Crazy Diamond',
    normalizedTitle: 'shine on you crazy diamond',
    workType: 'song',
    primaryEntityId: 'pink_floyd',
    primaryEntityName: 'Pink Floyd',
    aliases: ['Shine On You Crazy Diamond Wish You Were Here'],
    regex: /\b(shine on you crazy diamond)\b/i,
    releaseYear: 1975
  },
  {
    id: 'floyd_comfortably_numb',
    canonicalTitle: 'Comfortably Numb',
    normalizedTitle: 'comfortably numb',
    workType: 'song',
    primaryEntityId: 'pink_floyd',
    primaryEntityName: 'Pink Floyd',
    aliases: ['Comfortably Numb The Wall'],
    regex: /\b(comfortably numb)\b/i,
    releaseYear: 1979
  },
  {
    id: 'black_sabbath_paranoid',
    canonicalTitle: 'Paranoid',
    normalizedTitle: 'paranoid',
    workType: 'song',
    primaryEntityId: 'black_sabbath',
    primaryEntityName: 'Black Sabbath',
    aliases: ['Paranoid Black Sabbath'],
    regex: /\b(paranoid black sabbath|black sabbath paranoid)\b/i,
    releaseYear: 1970
  },
  {
    id: 'radiohead_paranoid_android',
    canonicalTitle: 'Paranoid Android',
    normalizedTitle: 'paranoid android',
    workType: 'song',
    primaryEntityId: 'radiohead',
    primaryEntityName: 'Radiohead',
    aliases: ['Paranoid Android OK Computer'],
    regex: /\b(paranoid android)\b/i,
    releaseYear: 1997
  },

  // 🎷 Jazz Universal
  {
    id: 'miles_so_what',
    canonicalTitle: 'So What',
    normalizedTitle: 'so what',
    workType: 'improvisation_piece',
    primaryEntityId: 'miles_davis',
    primaryEntityName: 'Miles Davis',
    aliases: ['So What Kind of Blue'],
    regex: /\b(so what miles davis|miles davis so what)\b/i,
    releaseYear: 1959
  },
  {
    id: 'coltrane_a_love_supreme',
    canonicalTitle: 'A Love Supreme',
    normalizedTitle: 'a love supreme',
    workType: 'suite',
    primaryEntityId: 'john_coltrane',
    primaryEntityName: 'John Coltrane',
    aliases: ['A Love Supreme Suite'],
    regex: /\b(a love supreme)\b/i,
    releaseYear: 1965
  },
  {
    id: 'dave_brubeck_take_five',
    canonicalTitle: 'Take Five',
    normalizedTitle: 'take five',
    workType: 'song',
    primaryEntityId: 'dave_brubeck',
    primaryEntityName: 'Dave Brubeck & Paul Desmond',
    aliases: ['Take Five Time Out'],
    regex: /\b(take five brubeck|dave brubeck take five)\b/i,
    releaseYear: 1959
  },

  // 🎻 Música Clásica Universal
  {
    id: 'beethoven_symphony_9',
    canonicalTitle: 'Sinfonía No. 9 en Re menor, Op. 125 "Coral"',
    normalizedTitle: 'sinfonia no 9 beethoven coral',
    workType: 'symphony',
    primaryEntityId: 'ludwig_van_beethoven',
    primaryEntityName: 'Ludwig van Beethoven',
    aliases: ['Beethoven Symphony 9', 'Ode to Joy', 'Himno a la Alegria'],
    regex: /\b(symphony no\.? 9|sinfonia no\.? 9|ode to joy|himno a la alegria)\b/i,
    releaseYear: 1824
  },
  {
    id: 'beethoven_symphony_5',
    canonicalTitle: 'Sinfonía No. 5 en Do menor, Op. 67',
    normalizedTitle: 'sinfonia no 5 beethoven',
    workType: 'symphony',
    primaryEntityId: 'ludwig_van_beethoven',
    primaryEntityName: 'Ludwig van Beethoven',
    aliases: ['Beethoven Symphony 5'],
    regex: /\b(symphony no\.? 5|sinfonia no\.? 5 beethoven)\b/i,
    releaseYear: 1808
  },
  {
    id: 'ravel_bolero',
    canonicalTitle: 'Boléro',
    normalizedTitle: 'bolero ravel',
    workType: 'composition',
    primaryEntityId: 'maurice_ravel',
    primaryEntityName: 'Maurice Ravel',
    aliases: ['Bolero de Ravel'],
    regex: /\b(bolero de ravel|boléro de ravel|ravel bolero)\b/i,
    releaseYear: 1928
  },
  {
    id: 'vivaldi_four_seasons',
    canonicalTitle: 'Las Cuatro Estaciones, Op. 8',
    normalizedTitle: 'las cuatro estaciones vivaldi',
    workType: 'concerto',
    primaryEntityId: 'antonio_vivaldi',
    primaryEntityName: 'Antonio Vivaldi',
    aliases: ['The Four Seasons', 'Le quattro stagioni'],
    regex: /\b(four seasons vivaldi|cuatro estaciones vivaldi|quattro stagioni)\b/i,
    releaseYear: 1725
  },
  {
    id: 'debussy_clair_de_lune',
    canonicalTitle: 'Clair de Lune',
    normalizedTitle: 'clair de lune debussy',
    workType: 'composition',
    primaryEntityId: 'claude_debussy',
    primaryEntityName: 'Claude Debussy',
    aliases: ['Suite bergamasque Clair de lune'],
    regex: /\b(clair de lune|claro de luna debussy)\b/i,
    releaseYear: 1905
  },
  {
    id: 'bach_cello_suites',
    canonicalTitle: 'Suites para Violonchelo Solo, BWV 1007-1012',
    normalizedTitle: 'suites para violonchelo solo bach',
    workType: 'suite',
    primaryEntityId: 'johann_sebastian_bach',
    primaryEntityName: 'Johann Sebastian Bach',
    aliases: ['Bach Cello Suite No 1', 'Cello Suites'],
    regex: /\b(cello suite|suites para violonchelo|bwv 1007)\b/i,
    releaseYear: 1720
  },

  // 💃 Flamenco & Canción Latinoamericana
  {
    id: 'paco_entre_dos_aguas',
    canonicalTitle: 'Entre Dos Aguas',
    normalizedTitle: 'entre dos aguas',
    workType: 'song',
    primaryEntityId: 'paco_de_lucia',
    primaryEntityName: 'Paco de Lucía',
    aliases: ['Entre dos aguas rumba'],
    regex: /\b(entre dos aguas)\b/i,
    releaseYear: 1973
  },
  {
    id: 'jobim_aguas_de_marco',
    canonicalTitle: 'Águas de Março',
    normalizedTitle: 'aguas de marco',
    workType: 'song',
    primaryEntityId: 'tom_jobim',
    primaryEntityName: 'Tom Jobim & Elis Regina',
    aliases: ['Aguas de marco', 'Waters of March'],
    regex: /\b(aguas de marco|águas de março|waters of march)\b/i,
    releaseYear: 1972
  },
  {
    id: 'silvio_ojala',
    canonicalTitle: 'Ojalá',
    normalizedTitle: 'ojala',
    workType: 'song',
    primaryEntityId: 'silvio_rodriguez',
    primaryEntityName: 'Silvio Rodríguez',
    aliases: ['Ojala Silvio Rodriguez'],
    regex: /\b(ojala silvio|ojalá silvio)\b/i,
    releaseYear: 1978
  },
  {
    id: 'serrat_mediterraneo',
    canonicalTitle: 'Mediterráneo',
    normalizedTitle: 'mediterraneo',
    workType: 'song',
    primaryEntityId: 'joan_manuel_serrat',
    primaryEntityName: 'Joan Manuel Serrat',
    aliases: ['Mediterraneo Serrat'],
    regex: /\b(mediterraneo serrat|mediterráneo serrat)\b/i,
    releaseYear: 1971
  }
];

export function detectWorkVersion(title: string, description = ''): WorkVersionType {
  const text = `${title} ${description}`.toLowerCase();

  if (/\b(rehearsal|ensayo|soundcheck)\b/i.test(text)) return 'rehearsal';
  if (/\b(demo|early version|home recording)\b/i.test(text)) return 'demo';
  if (/\b(outtake|alternate take|toma alternativa|inédito|inedito)\b/i.test(text)) return 'outtake';
  if (/\b(cover|homenaje|tributo|versionado por|interpretado por)\b/i.test(text)) return 'cover';
  if (/\b(analisis|análisis|teoria musical|como se compuso|explicacion|how it was made)\b/i.test(text)) return 'analysis';
  if (/\b(documental|documentary|historia de|making of)\b/i.test(text)) return 'documentary';
  if (/\b(interview|entrevista|masterclass|clase magistral)\b/i.test(text)) return 'interview_context';
  if (/\b(acustico|acústico|acoustic|unplugged|solo piano|solo guitar)\b/i.test(text)) return 'acoustic';
  if (/\b(live|en vivo|en directo|concierto|recital|festival|full concert)\b/i.test(text)) return 'live';
  if (/\b(official video|video oficial|audio oficial|original audio|remastered|studio version|album version)\b/i.test(text)) return 'studio';

  return 'unknown';
}

export function matchCanonicalWork(title: string, description = '', creator = ''): AssetWorkRelation | null {
  const text = `${title} ${description} ${creator}`.toLowerCase();
  const evidence: string[] = [];

  for (const work of CANONICAL_WORKS_REGISTRY) {
    if (work.regex.test(text)) {
      evidence.push(`work_regex_match:${work.id}`);
      const versionType = detectWorkVersion(title, description);

      return {
        assetId: '',
        workId: work.id,
        canonicalTitle: work.canonicalTitle,
        primaryEntityId: work.primaryEntityId,
        versionType,
        confidence: 0.95,
        evidence
      };
    }

    for (const alias of work.aliases) {
      if (text.includes(alias.toLowerCase())) {
        evidence.push(`work_alias_match:${alias}`);
        const versionType = detectWorkVersion(title, description);

        return {
          assetId: '',
          workId: work.id,
          canonicalTitle: work.canonicalTitle,
          primaryEntityId: work.primaryEntityId,
          versionType,
          confidence: 0.92,
          evidence
        };
      }
    }
  }

  return null;
}
