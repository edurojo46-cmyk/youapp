/**
 * musicClassifier.ts — Clasificador de Entidades Individuales, Cohortes y Roles Editoriales de Onda
 */

import type {
  MusicItemClassification,
  MusicGenreType,
  MusicFormatType,
  OndaNarrativeMetadata,
  OndaExperienceRole,
  NarrativeScoreTier
} from './musicGraphTypes';

export interface EnrichedMusicClassification extends MusicItemClassification {
  confidence: number;            // 0.0 a 1.0
  evidence: string[];            // ej: ["entity_match:luis_alberto_spinetta", "project_match:invisible"]
}

const GENRE_RULES: { genre: MusicGenreType; regex: RegExp; movement?: string; cohort?: string }[] = [
  { genre: 'rock_argentino', regex: /\b(spinetta|charly garcia|soda stereo|cerati|fito paez|los redondos|patricio rey|divididos|sumo|pescado rabioso|almendra|seru giran|sui generis|los gatos|manal|vox dei|calamaro|babasonicos|intoxicados|la renga|rock argentino|rock nacional|virus|luca prodan|pappo|los fabulosos cadillacs|bersuit|rata blanca|las pelotas|ratones paranoicos|enanitos verdes|ataque 77|los pericos|kapanga|citu|skay|guasones|estelares|los tipitos|arbol|attarque|la beriso|ciro y los persas|los piojos|viejo rancio|las pastillas del abuelo|callejeros|don osvaldo|fabulosos)\b/i, movement: 'rock_argentino', cohort: 'Rock Nacional Rioplatense' },
  { genre: 'tango', regex: /\b(tango|milonga|gardel|astor piazzolla|piazzolla|troilo|pugliese|d'arienzo|goyeneche|julio sosa|orquesta tipica|di sarli|horacio ferrer|tita merello|salgan|moria|tango nuevo|bandoneon|roberto firpo|francisco canaro|pedro laurenz|osvaldo fresedo|bajofondo|gotan project|tanghetto|supervielle)\b/i, movement: 'tango_rioplatense', cohort: 'Guardia Vieja y Tango Nuevo' },
  { genre: 'folklore', regex: /\b(folklore|mercedes sosa|atahualpa yupanqui|yupanqui|los chalchaleros|chacarera|zamba|chamame|cafrune|horacio guarany|soledad pastorutti|larralde|los nocheros|peteco carabajal|chango spasiuk|los manseros santiaguenos|tarrago ros|chango farías gómez|raul carnota|cuchi leguizamon|jaime torres|canto popular|folclore|zambas|tonada|vidala)\b/i, movement: 'nuevo_cancionero', cohort: 'Folklore y Tradición Andina' },
  { genre: 'jazz', regex: /\b(jazz|miles davis|john coltrane|louis armstrong|ella fitzgerald|billie holiday|charlie parker|thelonious monk|herbie hancock|bebop|cool jazz|chick corea|dizzy gillespie|chet baker|stan getz|charles mingus|dave brubeck|bill evans|keith jarrett|jazz festival|north sea jazz|monterey jazz|newport jazz|ronnie scott|village vanguard|blue note|art blakey|sonny rollins|dexter gordon|wes montgomery|ornette coleman|pharoah sanders|sun ra|alice coltrane|wayne shorter|mccoy tyner|oscar peterson|dave holland|jacob collier|pat metheny)\b/i, movement: 'modern_jazz', cohort: 'Leyendas del Jazz Universal' },
  { genre: 'blues', regex: /\b(blues|bb king|b\.b\. king|muddy waters|robert johnson|eric clapton blues|delta blues|chicago blues|stevie ray vaughan|albert king|howlin wolf|john lee hooker|buddy guy|t-bone walker|koko taylor|son house|lightnin hopkins|lead belly|albert collins|freddie king|gary moore blues|joe bonamassa|taj mahal|rory gallagher)\b/i, movement: 'blues_tradicional', cohort: 'Pioneros del Blues' },
  { genre: 'classical', regex: /\b(musica clasica|classical music|orchestra|orquesta|sinfonia|symphony|concerto|beethoven|mozart|bach|chopin|tchaikovsky|vivaldi|opera|puccini|verdi|filarmonica|brahms|mahler|ravel|debussy|rachmaninoff|liszt|schubert|mendelssohn|handel|haydn|wagner|stravinsky|shostakovich|prokofiev|philharmonic|concertgebouw|royal albert hall|proms bbc|carnegie hall|bartok|dvorak|sibelius|bruckner|schumann|grieg|strauss|saint-saens|faure|paganini|holst|copland|bernstein classical)\b/i, movement: 'musica_culta', cohort: 'Música Sinfónica y Clásica' },
  { genre: 'flamenco', regex: /\b(flamenco|paco de lucia|camaron de la isla|cante jondo|tomatito|morente|guitarra flamenca|bienal de sevilla|festival de jerez|vicente amigo|diego el cigala|estrella morente|manolo sanlucar|paco cepero|duquende|arcangel|lola flores|bulerias|solea|seguidillas)\b/i, movement: 'nuevo_flamenco', cohort: 'Flamenco y Tradición Ibérica' },
  { genre: 'reggae_dub', regex: /\b(reggae|bob marley|peter tosh|burning spear|fela kuti|afrobeat|dub music|reggae sunsplash|king tubby|lee scratch perry|bunny wailer|dennis brown|gregory isaacs|toots and the maytals|third world|steel pulse|black uhuru|sly and robbie)\b/i, movement: 'roots_reggae', cohort: 'Roots, Dub y Afrobeat' },
  { genre: 'heavy_metal_prog', regex: /\b(iron maiden|black sabbath|king crimson|judas priest|deep purple|rush|prog rock|heavy metal|nwobhm|yes band|genesis prog|jethro tull|pink floyd prog|opeth|dream theater|motorhead|dio|slayer|megadeth|anthrax|pantera|tool band|porcupine tree|marillion|gentle giant|emerson lake palmer|camel band|pfm|premiata forneria marconi|banco del mutuo soccorso|le orme|goblin)\b/i, movement: 'heavy_metal_prog', cohort: 'Metal Clásico y Progresivo' },
  { genre: 'chanson_poetica', regex: /\b(chanson|edith piaf|jacques brel|charles aznavour|serge gainsbourg|brassens|leo ferre|georges moustaki|barbara chanteuse|yves montand|renaud|francois hardy)\b/i, movement: 'chanson_francaise', cohort: 'Chanson Française y Canción Poética' },
  { genre: 'latam_fusion', regex: /\b(bossa nova|tom jobim|joao gilberto|caetano veloso|gilberto gil|chico buarque|son cubano|buena vista social club|ruben blades|fania all stars|salsa dura|cumbia colombiana|silvio rodriguez|serrat|sabina|cafe tacvba|caifanes|mon laferte|jorge drexler|rosalia|c tangana|jaime roos|eduardo mateo|pablo milanes|victor jara|violeta parra|chabuca granda|los jaivas|totó la momposina|ruben rada|hugo fattoruso|candombe|cartola|nelson cavaquinho|baden powell|elis regina|milton nascimento|gal costa)\b/i, movement: 'musica_latinoamericana', cohort: 'Canción Latinoamericana y Fusión' },
  { genre: 'world_music', regex: /\b(world music|fado|amalia rodrigues|mariza|oud|sitar|ravi shankar|alla rakha|gnawa|guembri|persian classical|tar|tombak|balkan brass|goran bregovic|boban markovic|klezmer|giora feidman|qawwali|nusrat fateh ali khan|celta|bagpipes|duduk|kora|toumani diabate)\b/i, movement: 'musica_etnica_global', cohort: 'Tradición y Músicas del Mundo' },
  { genre: 'rock_pop_intl', regex: /\b(the beatles|rolling stones|pink floyd|queen|led zeppelin|david bowie|radiohead|nirvana|u2|coldplay|michael jackson|madonna|the cure|rock internacional|glam rock|bob dylan|the doors|the who|ac\/dc|guns n roses|pearl jam|jimi hendrix|elvis presley|elton john|prince|stevie wonder|police|oasis|blur|arctic monkeys|metallica|red hot chili peppers|linkin park|gorillaz|muse|foo fighters|the clash|ramones|talking heads|fleetwood mac|the smiths|morrissey|joy division|new order|sigur ros|mogwai|godspeed you black emperor|my bloody valentine|cocteau twins|shoegaze|post-rock)\b/i, movement: 'rock_pop_universal', cohort: 'Iconos del Rock y Pop Global' },
  { genre: 'electronic', regex: /\b(electronic music|kraftwerk|daft punk|brian eno ambient|synthwave|techno detroit|house music|cercle live|ambient modular|jean michel jarre|tangerine dream|aphex twin|prodigy|chemical brothers|depeche mode|new order|massive attack|fatboy slim|moby|underworld|berlin school|modular synth|vangelis|boards of canada|autechre|squarepusher|four tet|burial|steve reich|philip glass|terry riley)\b/i, movement: 'electronica_pionera', cohort: 'Pioneros de la Electrónica y Sintetizadores' },
  { genre: 'hiphop', regex: /\b(hip hop|rap music|freestyle|eminem|tupac|kendrick lamar|wu tang|cypher|r&b|snoop dogg|dr dre|notorious big|jay z|nas|kanye|50 cent|outkast|rakim|a tribe called quest|public enemy|run dmc|beastie boys|lauryn hill)\b/i, movement: 'cultura_hiphop', cohort: 'Cultura Hip Hop Clásica' }
];

// ENTIDADES INDIVIDUALES ESTRICTAS (Catálogo Exhaustivo)
interface IndividualEntityDef {
  id: string;
  name: string;
  entityType: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer';
  projects?: string[];
  regex: RegExp;
  country?: string;
  location?: string;
  aliases?: string[];
}

const INDIVIDUAL_ENTITIES: IndividualEntityDef[] = [
  // 🇦🇷 Rock Argentino & Fundacional
  { id: 'luis_alberto_spinetta', name: 'Luis Alberto Spinetta', entityType: 'solo_artist', projects: ['Almendra', 'Pescado Rabioso', 'Invisible', 'Spinetta Jade', 'Socios del Desierto'], regex: /\b(spinetta|almendra|pescado rabioso|invisible|spinetta jade|socios del desierto)\b/i, country: 'AR' },
  { id: 'charly_garcia', name: 'Charly García', entityType: 'solo_artist', projects: ['Sui Generis', 'La Máquina de Hacer Pájaros', 'Serú Girán'], regex: /\b(charly garcia|sui generis|maquina de hacer pajaros|seru giran)\b/i, country: 'AR' },
  { id: 'gustavo_cerati', name: 'Gustavo Cerati', entityType: 'solo_artist', projects: ['Soda Stereo'], regex: /\b(cerati|soda stereo)\b/i, country: 'AR' },
  { id: 'fito_paez', name: 'Fito Páez', entityType: 'solo_artist', regex: /\b(fito paez|fito páez)\b/i, country: 'AR' },
  { id: 'los_redondos', name: 'Patricio Rey y sus Redonditos de Ricota', entityType: 'band', projects: ['Indio Solari', 'Skay Beilinson'], regex: /\b(los redondos|redonditos de ricota|patricio rey|indio solari|skay beilinson)\b/i, country: 'AR' },
  { id: 'divididos', name: 'Divididos', entityType: 'band', regex: /\b(divididos|ricardo mollo|diego arnedo)\b/i, country: 'AR' },
  { id: 'sumo', name: 'Sumo', entityType: 'band', projects: ['Luca Prodan'], regex: /\b(sumo|luca prodan)\b/i, country: 'AR' },
  { id: 'virus', name: 'Virus', entityType: 'band', projects: ['Federico Moura'], regex: /\b(virus|federico moura)\b/i, country: 'AR' },
  { id: 'pappo', name: 'Pappo', entityType: 'solo_artist', projects: ['Pappo\'s Blues', 'Riff'], regex: /\b(pappo|riff|pappo\'s blues)\b/i, country: 'AR' },
  { id: 'andres_calamaro', name: 'Andrés Calamaro', entityType: 'solo_artist', projects: ['Los Abuelos de la Nada', 'Los Rodríguez'], regex: /\b(calamaro|abuelos de la nada|los rodriguez)\b/i, country: 'AR' },
  { id: 'los_fabulosos_cadillacs', name: 'Los Fabulosos Cadillacs', entityType: 'band', regex: /\b(fabulosos cadillacs|vicentico)\b/i, country: 'AR' },
  { id: 'la_renga', name: 'La Renga', entityType: 'band', regex: /\b(la renga|chizzo napoli)\b/i, country: 'AR' },
  { id: 'babasonicos', name: 'Babasónicos', entityType: 'band', regex: /\b(babasonicos|dargelos)\b/i, country: 'AR' },
  { id: 'los_gatos', name: 'Los Gatos', entityType: 'band', projects: ['Litto Nebbia'], regex: /\b(los gatos|litto nebbia)\b/i, country: 'AR' },
  { id: 'manal', name: 'Manal', entityType: 'band', projects: ['Javier Martínez'], regex: /\b(manal|javier martinez)\b/i, country: 'AR' },
  { id: 'vox_dei', name: 'Vox Dei', entityType: 'band', regex: /\b(vox dei|willy quiroga)\b/i, country: 'AR' },
  { id: 'rata_blanca', name: 'Rata Blanca', entityType: 'band', regex: /\b(rata blanca|walter giardino)\b/i, country: 'AR' },
  { id: 'las_pelotas', name: 'Las Pelotas', entityType: 'band', regex: /\b(las pelotas|german daffunchio)\b/i, country: 'AR' },
  { id: 'ratones_paranoicos', name: 'Ratones Paranoicos', entityType: 'band', regex: /\b(ratones paranoicos|juanse)\b/i, country: 'AR' },
  { id: 'los_pericos', name: 'Los Pericos', entityType: 'band', regex: /\b(los pericos|bahiano)\b/i, country: 'AR' },
  { id: 'los_autenticos_decadentes', name: 'Los Auténticos Decadentes', entityType: 'band', regex: /\b(autenticos decadentes|cucho parisi)\b/i, country: 'AR' },
  { id: 'bersuit_vergarabat', name: 'Bersuit Vergarabat', entityType: 'band', projects: ['Gustavo Cordera'], regex: /\b(bersuit|gustavo cordera)\b/i, country: 'AR' },
  { id: 'ataque_77', name: 'Attaque 77', entityType: 'band', projects: ['Ciro Pertusi'], regex: /\b(attaque 77|ataque 77|ciro pertusi)\b/i, country: 'AR' },
  { id: 'los_piojos', name: 'Los Piojos', entityType: 'band', projects: ['Ciro Martínez'], regex: /\b(los piojos|ciro y los persas)\b/i, country: 'AR' },

  // 🇦🇷 Tango & Folklore
  { id: 'astor_piazzolla', name: 'Astor Piazzolla', entityType: 'composer', regex: /\b(astor piazzolla|piazzolla)\b/i, country: 'AR' },
  { id: 'carlos_gardel', name: 'Carlos Gardel', entityType: 'solo_artist', regex: /\b(carlos gardel|gardel)\b/i, country: 'AR' },
  { id: 'anibal_troilo', name: 'Aníbal Troilo', entityType: 'solo_artist', regex: /\b(anibal troilo|troilo)\b/i, country: 'AR' },
  { id: 'osvaldo_pugliese', name: 'Osvaldo Pugliese', entityType: 'solo_artist', regex: /\b(osvaldo pugliese|pugliese)\b/i, country: 'AR' },
  { id: 'juan_darienzo', name: 'Juan D\'Arienzo', entityType: 'solo_artist', regex: /\b(juan d\'arienzo|d\'arienzo)\b/i, country: 'AR' },
  { id: 'roberto_goyeneche', name: 'Roberto Goyeneche', entityType: 'solo_artist', regex: /\b(roberto goyeneche|goyeneche)\b/i, country: 'AR' },
  { id: 'julio_sosa', name: 'Julio Sosa', entityType: 'solo_artist', regex: /\b(julio sosa)\b/i, country: 'UY' },
  { id: 'carlos_di_sarli', name: 'Carlos Di Sarli', entityType: 'solo_artist', regex: /\b(di sarli|carlos di sarli)\b/i, country: 'AR' },
  { id: 'horacio_salgan', name: 'Horacio Salgán', entityType: 'solo_artist', regex: /\b(horacio salgan|salgan)\b/i, country: 'AR' },
  { id: 'mercedes_sosa', name: 'Mercedes Sosa', entityType: 'solo_artist', regex: /\b(mercedes sosa)\b/i, country: 'AR' },
  { id: 'atahualpa_yupanqui', name: 'Atahualpa Yupanqui', entityType: 'solo_artist', regex: /\b(atahualpa yupanqui|yupanqui)\b/i, country: 'AR' },
  { id: 'jorge_cafrune', name: 'Jorge Cafrune', entityType: 'solo_artist', regex: /\b(jorge cafrune|cafrune)\b/i, country: 'AR' },
  { id: 'jose_larralde', name: 'José Larralde', entityType: 'solo_artist', regex: /\b(jose larralde|larralde)\b/i, country: 'AR' },
  { id: 'chango_spasiuk', name: 'Chango Spasiuk', entityType: 'solo_artist', regex: /\b(chango spasiuk|spasiuk)\b/i, country: 'AR' },
  { id: 'peteco_carabajal', name: 'Peteco Carabajal', entityType: 'solo_artist', regex: /\b(peteco carabajal|carabajal)\b/i, country: 'AR' },
  { id: 'jaime_torres', name: 'Jaime Torres', entityType: 'solo_artist', regex: /\b(jaime torres|charango)\b/i, country: 'AR' },
  { id: 'cuchi_leguizamon', name: 'Cuchi Leguizamón', entityType: 'composer', regex: /\b(cuchi leguizamon|cuchi leguizamón)\b/i, country: 'AR' },
  { id: 'bajofondo_tango', name: 'Bajofondo', entityType: 'band', projects: ['Gustavo Santaolalla', 'Luciano Supervielle'], regex: /\b(bajofondo|santaolalla|supervielle)\b/i, country: 'AR' },
  { id: 'gotan_project', name: 'Gotan Project', entityType: 'band', regex: /\b(gotan project)\b/i, country: 'FR' },

  // 🇲🇽 Agrupaciones Específicas Canónicas
  {
    id: 'orquesta_sinfonica_universal',
    name: 'Orquesta Sinfónica Universal',
    entityType: 'orchestra',
    location: 'Guadalajara, Jalisco, México',
    aliases: ['OSU'],
    regex: /\b(orquesta sinfonica universal|orquesta sinfónica universal)\b/i,
    country: 'MX'
  },

  // 🎷 Jazz, Blues & Soul
  { id: 'miles_davis', name: 'Miles Davis', entityType: 'solo_artist', regex: /\b(miles davis)\b/i, country: 'US' },
  { id: 'john_coltrane', name: 'John Coltrane', entityType: 'solo_artist', regex: /\b(john coltrane|coltrane)\b/i, country: 'US' },
  { id: 'thelonious_monk', name: 'Thelonious Monk', entityType: 'solo_artist', regex: /\b(thelonious monk|monk)\b/i, country: 'US' },
  { id: 'louis_armstrong', name: 'Louis Armstrong', entityType: 'solo_artist', regex: /\b(louis armstrong)\b/i, country: 'US' },
  { id: 'ella_fitzgerald', name: 'Ella Fitzgerald', entityType: 'solo_artist', regex: /\b(ella fitzgerald)\b/i, country: 'US' },
  { id: 'billie_holiday', name: 'Billie Holiday', entityType: 'solo_artist', regex: /\b(billie holiday)\b/i, country: 'US' },
  { id: 'bill_evans', name: 'Bill Evans', entityType: 'solo_artist', regex: /\b(bill evans)\b/i, country: 'US' },
  { id: 'charles_mingus', name: 'Charles Mingus', entityType: 'solo_artist', regex: /\b(charles mingus|mingus)\b/i, country: 'US' },
  { id: 'herbie_hancock', name: 'Herbie Hancock', entityType: 'solo_artist', regex: /\b(herbie hancock)\b/i, country: 'US' },
  { id: 'chet_baker', name: 'Chet Baker', entityType: 'solo_artist', regex: /\b(chet baker)\b/i, country: 'US' },
  { id: 'dave_brubeck', name: 'Dave Brubeck', entityType: 'solo_artist', regex: /\b(dave brubeck|brubeck)\b/i, country: 'US' },
  { id: 'keith_jarrett', name: 'Keith Jarrett', entityType: 'solo_artist', regex: /\b(keith jarrett|jarrett)\b/i, country: 'US' },
  { id: 'chick_corea', name: 'Chick Corea', entityType: 'solo_artist', regex: /\b(chick corea|corea)\b/i, country: 'US' },
  { id: 'dizzy_gillespie', name: 'Dizzy Gillespie', entityType: 'solo_artist', regex: /\b(dizzy gillespie|gillespie)\b/i, country: 'US' },
  { id: 'charlie_parker', name: 'Charlie Parker', entityType: 'solo_artist', regex: /\b(charlie parker|bird parker)\b/i, country: 'US' },
  { id: 'pharoah_sanders', name: 'Pharoah Sanders', entityType: 'solo_artist', regex: /\b(pharoah sanders)\b/i, country: 'US' },
  { id: 'sun_ra', name: 'Sun Ra', entityType: 'solo_artist', projects: ['Sun Ra Arkestra'], regex: /\b(sun ra|arkestra)\b/i, country: 'US' },
  { id: 'alice_coltrane', name: 'Alice Coltrane', entityType: 'solo_artist', regex: /\b(alice coltrane)\b/i, country: 'US' },
  { id: 'pat_metheny', name: 'Pat Metheny', entityType: 'solo_artist', regex: /\b(pat metheny)\b/i, country: 'US' },
  { id: 'bb_king', name: 'B.B. King', entityType: 'solo_artist', regex: /\b(bb king|b\.b\. king)\b/i, country: 'US' },
  { id: 'muddy_waters', name: 'Muddy Waters', entityType: 'solo_artist', regex: /\b(muddy waters)\b/i, country: 'US' },
  { id: 'stevie_ray_vaughan', name: 'Stevie Ray Vaughan', entityType: 'solo_artist', regex: /\b(stevie ray vaughan|srv)\b/i, country: 'US' },
  { id: 'eric_clapton', name: 'Eric Clapton', entityType: 'solo_artist', projects: ['Cream', 'Derek and the Dominos'], regex: /\b(eric clapton|cream band)\b/i, country: 'UK' },
  { id: 'robert_johnson', name: 'Robert Johnson', entityType: 'solo_artist', regex: /\b(robert johnson)\b/i, country: 'US' },
  { id: 'howlin_wolf', name: 'Howlin\' Wolf', entityType: 'solo_artist', regex: /\b(howlin wolf|howlin\' wolf)\b/i, country: 'US' },
  { id: 'john_lee_hooker', name: 'John Lee Hooker', entityType: 'solo_artist', regex: /\b(john lee hooker)\b/i, country: 'US' },
  { id: 'buddy_guy', name: 'Buddy Guy', entityType: 'solo_artist', regex: /\b(buddy guy)\b/i, country: 'US' },
  { id: 'albert_king', name: 'Albert King', entityType: 'solo_artist', regex: /\b(albert king)\b/i, country: 'US' },
  { id: 'freddie_king', name: 'Freddie King', entityType: 'solo_artist', regex: /\b(freddie king)\b/i, country: 'US' },
  { id: 'nina_simone', name: 'Nina Simone', entityType: 'solo_artist', regex: /\b(nina simone)\b/i, country: 'US' },
  { id: 'aretha_franklin', name: 'Aretha Franklin', entityType: 'solo_artist', regex: /\b(aretha franklin)\b/i, country: 'US' },
  { id: 'ray_charles', name: 'Ray Charles', entityType: 'solo_artist', regex: /\b(ray charles)\b/i, country: 'US' },
  { id: 'stevie_wonder', name: 'Stevie Wonder', entityType: 'solo_artist', regex: /\b(stevie wonder)\b/i, country: 'US' },
  { id: 'marvin_gaye', name: 'Marvin Gaye', entityType: 'solo_artist', regex: /\b(marvin gaye)\b/i, country: 'US' },
  { id: 'james_brown', name: 'James Brown', entityType: 'solo_artist', regex: /\b(james brown)\b/i, country: 'US' },
  { id: 'otis_redding', name: 'Otis Redding', entityType: 'solo_artist', regex: /\b(otis redding)\b/i, country: 'US' },
  { id: 'sam_cooke', name: 'Sam Cooke', entityType: 'solo_artist', regex: /\b(sam cooke)\b/i, country: 'US' },

  // 🎸 Rock & Pop Internacional
  { id: 'the_beatles', name: 'The Beatles', entityType: 'band', projects: ['John Lennon', 'Paul McCartney', 'George Harrison'], regex: /\b(the beatles|john lennon|paul mccartney|george harrison|ringo starr)\b/i, country: 'UK' },
  { id: 'pink_floyd', name: 'Pink Floyd', entityType: 'band', projects: ['David Gilmour', 'Roger Waters', 'Syd Barrett'], regex: /\b(pink floyd|david gilmour|roger waters|syd barrett)\b/i, country: 'UK' },
  { id: 'david_bowie', name: 'David Bowie', entityType: 'solo_artist', regex: /\b(david bowie|bowie|ziggy stardust)\b/i, country: 'UK' },
  { id: 'queen', name: 'Queen', entityType: 'band', projects: ['Freddie Mercury', 'Brian May'], regex: /\b(queen|freddie mercury|brian may)\b/i, country: 'UK' },
  { id: 'led_zeppelin', name: 'Led Zeppelin', entityType: 'band', projects: ['Jimmy Page', 'Robert Plant'], regex: /\b(led zeppelin|jimmy page|robert plant)\b/i, country: 'UK' },
  { id: 'the_rolling_stones', name: 'The Rolling Stones', entityType: 'band', projects: ['Mick Jagger', 'Keith Richards'], regex: /\b(rolling stones|the rolling stones|mick jagger|keith richards)\b/i, country: 'UK' },
  { id: 'radiohead', name: 'Radiohead', entityType: 'band', projects: ['Thom Yorke', 'The Smile'], regex: /\b(radiohead|thom yorke|the smile)\b/i, country: 'UK' },
  { id: 'nirvana', name: 'Nirvana', entityType: 'band', projects: ['Kurt Cobain', 'Foo Fighters'], regex: /\b(nirvana|kurt cobain|foo fighters|dave grohl)\b/i, country: 'US' },
  { id: 'the_cure', name: 'The Cure', entityType: 'band', projects: ['Robert Smith'], regex: /\b(the cure|robert smith)\b/i, country: 'UK' },
  { id: 'the_doors', name: 'The Doors', entityType: 'band', projects: ['Jim Morrison', 'Ray Manzarek'], regex: /\b(the doors|jim morrison|ray manzarek)\b/i, country: 'US' },
  { id: 'jimi_hendrix', name: 'Jimi Hendrix', entityType: 'solo_artist', regex: /\b(jimi hendrix|hendrix)\b/i, country: 'US' },
  { id: 'bob_dylan', name: 'Bob Dylan', entityType: 'solo_artist', regex: /\b(bob dylan|dylan)\b/i, country: 'US' },
  { id: 'u2', name: 'U2', entityType: 'band', projects: ['Bono', 'The Edge'], regex: /\b(u2|bono|the edge)\b/i, country: 'IE' },
  { id: 'coldplay', name: 'Coldplay', entityType: 'band', regex: /\b(coldplay|chris martin)\b/i, country: 'UK' },
  { id: 'iron_maiden', name: 'Iron Maiden', entityType: 'band', regex: /\b(iron maiden|bruce dickinson)\b/i, country: 'UK' },
  { id: 'black_sabbath', name: 'Black Sabbath', entityType: 'band', projects: ['Ozzy Osbourne', 'Tony Iommi', 'Ronnie James Dio'], regex: /\b(black sabbath|ozzy osbourne|ronnie james dio)\b/i, country: 'UK' },
  { id: 'king_crimson', name: 'King Crimson', entityType: 'band', projects: ['Robert Fripp', 'Bill Bruford'], regex: /\b(king crimson|robert fripp|bill bruford)\b/i, country: 'UK' },
  { id: 'deep_purple', name: 'Deep Purple', entityType: 'band', regex: /\b(deep purple|ritchie blackmore|ian gillan)\b/i, country: 'UK' },
  { id: 'judas_priest', name: 'Judas Priest', entityType: 'band', regex: /\b(judas priest|rob halford)\b/i, country: 'UK' },
  { id: 'ac_dc', name: 'AC/DC', entityType: 'band', regex: /\b(ac\/dc|angus young|bon scott|brian johnson)\b/i, country: 'AU' },
  { id: 'metallica', name: 'Metallica', entityType: 'band', regex: /\b(metallica|james heffield|lars ulrich)\b/i, country: 'US' },
  { id: 'yes_band', name: 'Yes', entityType: 'band', projects: ['Jon Anderson', 'Rick Wakeman'], regex: /\b(yes band|jon anderson|rick wakeman)\b/i, country: 'UK' },
  { id: 'genesis', name: 'Genesis', entityType: 'band', projects: ['Peter Gabriel', 'Phil Collins'], regex: /\b(genesis band|peter gabriel|phil collins)\b/i, country: 'UK' },
  { id: 'rush_band', name: 'Rush', entityType: 'band', projects: ['Geddy Lee', 'Neil Peart'], regex: /\b(rush band|geddy lee|neil peart)\b/i, country: 'CA' },
  { id: 'jethro_tull', name: 'Jethro Tull', entityType: 'band', projects: ['Ian Anderson'], regex: /\b(jethro tull|ian anderson)\b/i, country: 'UK' },
  { id: 'sigur_ros', name: 'Sigur Rós', entityType: 'band', projects: ['Jónsi'], regex: /\b(sigur ros|sigur rós|jonsi)\b/i, country: 'IS' },
  { id: 'mogwai', name: 'Mogwai', entityType: 'band', regex: /\b(mogwai)\b/i, country: 'UK' },
  { id: 'godspeed_you_black_emperor', name: 'Godspeed You! Black Emperor', entityType: 'band', regex: /\b(godspeed you black emperor|gybe)\b/i, country: 'CA' },
  { id: 'cocteau_twins', name: 'Cocteau Twins', entityType: 'band', projects: ['Elizabeth Fraser'], regex: /\b(cocteau twins|elizabeth fraser)\b/i, country: 'UK' },

  // 🎻 Grandes Compositores Clásicos
  { id: 'ludwig_van_beethoven', name: 'Ludwig van Beethoven', entityType: 'composer', regex: /\b(beethoven)\b/i, country: 'DE' },
  { id: 'wolfgang_amadeus_mozart', name: 'Wolfgang Amadeus Mozart', entityType: 'composer', regex: /\b(mozart)\b/i, country: 'AT' },
  { id: 'johann_sebastian_bach', name: 'Johann Sebastian Bach', entityType: 'composer', regex: /\b(bach|j\.s\. bach)\b/i, country: 'DE' },
  { id: 'frederic_chopin', name: 'Frédéric Chopin', entityType: 'composer', regex: /\b(chopin)\b/i, country: 'PL' },
  { id: 'pyotr_ilyich_tchaikovsky', name: 'Pyotr Ilyich Tchaikovsky', entityType: 'composer', regex: /\b(tchaikovsky)\b/i, country: 'RU' },
  { id: 'antonio_vivaldi', name: 'Antonio Vivaldi', entityType: 'composer', regex: /\b(vivaldi)\b/i, country: 'IT' },
  { id: 'johannes_brahms', name: 'Johannes Brahms', entityType: 'composer', regex: /\b(brahms)\b/i, country: 'DE' },
  { id: 'gustav_mahler', name: 'Gustav Mahler', entityType: 'composer', regex: /\b(mahler)\b/i, country: 'AT' },
  { id: 'claude_debussy', name: 'Claude Debussy', entityType: 'composer', regex: /\b(debussy)\b/i, country: 'FR' },
  { id: 'maurice_ravel', name: 'Maurice Ravel', entityType: 'composer', regex: /\b(ravel)\b/i, country: 'FR' },
  { id: 'sergei_rachmaninoff', name: 'Sergei Rachmaninoff', entityType: 'composer', regex: /\b(rachmaninoff|rajmaninov)\b/i, country: 'RU' },
  { id: 'franz_liszt', name: 'Franz Liszt', entityType: 'composer', regex: /\b(liszt)\b/i, country: 'HU' },
  { id: 'giacomo_puccini', name: 'Giacomo Puccini', entityType: 'composer', regex: /\b(puccini)\b/i, country: 'IT' },
  { id: 'giuseppe_verdi', name: 'Giuseppe Verdi', entityType: 'composer', regex: /\b(verdi)\b/i, country: 'IT' },
  { id: 'franz_schubert', name: 'Franz Schubert', entityType: 'composer', regex: /\b(schubert)\b/i, country: 'AT' },
  { id: 'richard_wagner', name: 'Richard Wagner', entityType: 'composer', regex: /\b(wagner)\b/i, country: 'DE' },
  { id: 'igor_stravinsky', name: 'Igor Stravinsky', entityType: 'composer', regex: /\b(stravinsky)\b/i, country: 'RU' },
  { id: 'georg_friedrich_handel', name: 'Georg Friedrich Händel', entityType: 'composer', regex: /\b(handel|haendel)\b/i, country: 'DE' },
  { id: 'joseph_haydn', name: 'Joseph Haydn', entityType: 'composer', regex: /\b(haydn)\b/i, country: 'AT' },
  { id: 'dmitri_shostakovich', name: 'Dmitri Shostakovich', entityType: 'composer', regex: /\b(shostakovich)\b/i, country: 'RU' },
  { id: 'sergei_prokofiev', name: 'Sergei Prokofiev', entityType: 'composer', regex: /\b(prokofiev)\b/i, country: 'RU' },
  { id: 'steve_reich', name: 'Steve Reich', entityType: 'composer', regex: /\b(steve reich)\b/i, country: 'US' },
  { id: 'philip_glass', name: 'Philip Glass', entityType: 'composer', regex: /\b(philip glass)\b/i, country: 'US' },

  // 🏛️ Grandes Solistas y Directores Clásicos & Música Antigua
  { id: 'martha_argerich', name: 'Martha Argerich', entityType: 'performer', regex: /\b(martha argerich|argerich)\b/i, country: 'AR' },
  { id: 'glenn_gould', name: 'Glenn Gould', entityType: 'performer', regex: /\b(glenn gould|gould)\b/i, country: 'CA' },
  { id: 'daniel_barenboim', name: 'Daniel Barenboim', entityType: 'performer', regex: /\b(daniel barenboim|barenboim)\b/i, country: 'AR' },
  { id: 'herbert_von_karajan', name: 'Herbert von Karajan', entityType: 'performer', regex: /\b(karajan|herbert von karajan)\b/i, country: 'AT' },
  { id: 'leonard_bernstein', name: 'Leonard Bernstein', entityType: 'performer', regex: /\b(leonard bernstein|bernstein)\b/i, country: 'US' },
  { id: 'claudio_abbado', name: 'Claudio Abbado', entityType: 'performer', regex: /\b(claudio abbado|abbado)\b/i, country: 'IT' },
  { id: 'sergiu_celibidache', name: 'Sergiu Celibidache', entityType: 'performer', regex: /\b(celibidache)\b/i, country: 'RO' },
  { id: 'carlos_kleiber', name: 'Carlos Kleiber', entityType: 'performer', regex: /\b(carlos kleiber|kleiber)\b/i, country: 'AT' },
  { id: 'maria_callas', name: 'Maria Callas', entityType: 'performer', regex: /\b(maria callas|callas)\b/i, country: 'GR' },
  { id: 'luciano_pavarotti', name: 'Luciano Pavarotti', entityType: 'performer', regex: /\b(luciano pavarotti|pavarotti)\b/i, country: 'IT' },
  { id: 'jordi_savall', name: 'Jordi Savall', entityType: 'performer', projects: ['Hespèrion XXI', 'La Capella Reial'], regex: /\b(jordi savall|hesperion|savall)\b/i, country: 'ES' },

  // 💃 Flamenco, Trova, LatAm, Fado & World
  { id: 'paco_de_lucia', name: 'Paco de Lucía', entityType: 'solo_artist', regex: /\b(paco de lucia|paco de lucía)\b/i, country: 'ES' },
  { id: 'camaron_de_la_isla', name: 'Camarón de la Isla', entityType: 'solo_artist', regex: /\b(camaron de la isla|camarón)\b/i, country: 'ES' },
  { id: 'enrique_morente', name: 'Enrique Morente', entityType: 'solo_artist', regex: /\b(enrique morente|morente)\b/i, country: 'ES' },
  { id: 'tomatito', name: 'Tomatito', entityType: 'solo_artist', regex: /\b(tomatito)\b/i, country: 'ES' },
  { id: 'vicente_amigo', name: 'Vicente Amigo', entityType: 'solo_artist', regex: /\b(vicente amigo)\b/i, country: 'ES' },
  { id: 'silvio_rodriguez', name: 'Silvio Rodríguez', entityType: 'solo_artist', regex: /\b(silvio rodriguez|silvio rodríguez)\b/i, country: 'CU' },
  { id: 'pablo_milanes', name: 'Pablo Milanés', entityType: 'solo_artist', regex: /\b(pablo milanes|pablo milanés)\b/i, country: 'CU' },
  { id: 'joan_manuel_serrat', name: 'Joan Manuel Serrat', entityType: 'solo_artist', regex: /\b(joan manuel serrat|serrat)\b/i, country: 'ES' },
  { id: 'joaquin_sabina', name: 'Joaquín Sabina', entityType: 'solo_artist', regex: /\b(joaquin sabina|sabina)\b/i, country: 'ES' },
  { id: 'jaime_roos', name: 'Jaime Roos', entityType: 'solo_artist', regex: /\b(jaime roos)\b/i, country: 'UY' },
  { id: 'eduardo_mateo', name: 'Eduardo Mateo', entityType: 'solo_artist', regex: /\b(eduardo mateo)\b/i, country: 'UY' },
  { id: 'ruben_rada', name: 'Ruben Rada', entityType: 'solo_artist', regex: /\b(ruben rada|negro rada)\b/i, country: 'UY' },
  { id: 'hugo_fattoruso', name: 'Hugo Fattoruso', entityType: 'solo_artist', projects: ['Opa', 'Los Shakers'], regex: /\b(hugo fattoruso|fattoruso|los shakers)\b/i, country: 'UY' },
  { id: 'jorge_drexler', name: 'Jorge Drexler', entityType: 'solo_artist', regex: /\b(jorge drexler|drexler)\b/i, country: 'UY' },
  { id: 'mon_laferte', name: 'Mon Laferte', entityType: 'solo_artist', regex: /\b(mon laferte)\b/i, country: 'CL' },
  { id: 'victor_jara', name: 'Víctor Jara', entityType: 'solo_artist', regex: /\b(victor jara|víctor jara)\b/i, country: 'CL' },
  { id: 'violeta_parra', name: 'Violeta Parra', entityType: 'solo_artist', regex: /\b(violeta parra)\b/i, country: 'CL' },
  { id: 'los_jaivas', name: 'Los Jaivas', entityType: 'band', regex: /\b(los jaivas|alturas de macchu picchu)\b/i, country: 'CL' },
  { id: 'cafe_tacvba', name: 'Café Tacvba', entityType: 'band', regex: /\b(cafe tacvba|café tacvba)\b/i, country: 'MX' },
  { id: 'caifanes', name: 'Caifanes', entityType: 'band', regex: /\b(caifanes|jaguares)\b/i, country: 'MX' },
  { id: 'tom_jobim', name: 'Tom Jobim', entityType: 'solo_artist', regex: /\b(tom jobim|antonio carlos jobim)\b/i, country: 'BR' },
  { id: 'joao_gilberto', name: 'João Gilberto', entityType: 'solo_artist', regex: /\b(joao gilberto|joão gilberto)\b/i, country: 'BR' },
  { id: 'caetano_veloso', name: 'Caetano Veloso', entityType: 'solo_artist', regex: /\b(caetano veloso)\b/i, country: 'BR' },
  { id: 'gilberto_gil', name: 'Gilberto Gil', entityType: 'solo_artist', regex: /\b(gilberto gil)\b/i, country: 'BR' },
  { id: 'chico_buarque', name: 'Chico Buarque', entityType: 'solo_artist', regex: /\b(chico buarque)\b/i, country: 'BR' },
  { id: 'elis_regina', name: 'Elis Regina', entityType: 'solo_artist', regex: /\b(elis regina)\b/i, country: 'BR' },
  { id: 'milton_nascimento', name: 'Milton Nascimento', entityType: 'solo_artist', regex: /\b(milton nascimento)\b/i, country: 'BR' },
  { id: 'gal_costa', name: 'Gal Costa', entityType: 'solo_artist', regex: /\b(gal costa)\b/i, country: 'BR' },
  { id: 'cartola', name: 'Cartola', entityType: 'solo_artist', regex: /\b(cartola samba)\b/i, country: 'BR' },
  { id: 'baden_powell', name: 'Baden Powell', entityType: 'solo_artist', regex: /\b(baden powell)\b/i, country: 'BR' },
  { id: 'amalia_rodrigues', name: 'Amália Rodrigues', entityType: 'solo_artist', regex: /\b(amalia rodrigues|amália rodrigues)\b/i, country: 'PT' },
  { id: 'mariza', name: 'Mariza', entityType: 'solo_artist', regex: /\b(mariza fado)\b/i, country: 'PT' },
  { id: 'ravi_shankar', name: 'Ravi Shankar', entityType: 'solo_artist', regex: /\b(ravi shankar)\b/i, country: 'IN' },
  { id: 'celia_cruz', name: 'Celia Cruz', entityType: 'solo_artist', regex: /\b(celia cruz)\b/i, country: 'CU' },
  { id: 'ruben_blades', name: 'Rubén Blades', entityType: 'solo_artist', regex: /\b(ruben blades|rubén blades)\b/i, country: 'PA' },
  { id: 'hector_lavoe', name: 'Héctor Lavoe', entityType: 'solo_artist', regex: /\b(hector lavoe|lavoe)\b/i, country: 'PR' },
  { id: 'willie_colon', name: 'Willie Colón', entityType: 'solo_artist', regex: /\b(willie colon|willie colón)\b/i, country: 'US' },
  { id: 'buena_vista_social_club', name: 'Buena Vista Social Club', entityType: 'band', projects: ['Compay Segundo', 'Ibrahim Ferrer'], regex: /\b(buena vista social club|compay segundo|ibrahim ferrer)\b/i, country: 'CU' },
  { id: 'bob_marley', name: 'Bob Marley & The Wailers', entityType: 'band', regex: /\b(bob marley|the wailers)\b/i, country: 'JM' },
  { id: 'peter_tosh', name: 'Peter Tosh', entityType: 'solo_artist', regex: /\b(peter tosh)\b/i, country: 'JM' },
  { id: 'burning_spear', name: 'Burning Spear', entityType: 'solo_artist', regex: /\b(burning spear)\b/i, country: 'JM' },
  { id: 'fela_kuti', name: 'Fela Kuti', entityType: 'solo_artist', regex: /\b(fela kuti|africa 70)\b/i, country: 'NG' },

  // 🇫🇷 Chanson Française
  { id: 'edith_piaf', name: 'Édith Piaf', entityType: 'solo_artist', regex: /\b(edith piaf|piaf)\b/i, country: 'FR' },
  { id: 'jacques_brel', name: 'Jacques Brel', entityType: 'solo_artist', regex: /\b(jacques brel|brel)\b/i, country: 'BE' },
  { id: 'charles_aznavour', name: 'Charles Aznavour', entityType: 'solo_artist', regex: /\b(charles aznavour|aznavour)\b/i, country: 'FR' },
  { id: 'serge_gainsbourg', name: 'Serge Gainsbourg', entityType: 'solo_artist', regex: /\b(serge gainsbourg|gainsbourg)\b/i, country: 'FR' },
  { id: 'georges_brassens', name: 'Georges Brassens', entityType: 'solo_artist', regex: /\b(georges brassens|brassens)\b/i, country: 'FR' },
  { id: 'leo_ferre', name: 'Léo Ferré', entityType: 'solo_artist', regex: /\b(leo ferre|léo ferré)\b/i, country: 'FR' },

  // 🎹 Electrónica & Modular
  { id: 'kraftwerk', name: 'Kraftwerk', entityType: 'band', regex: /\b(kraftwerk)\b/i, country: 'DE' },
  { id: 'daft_punk', name: 'Daft Punk', entityType: 'band', regex: /\b(daft punk)\b/i, country: 'FR' },
  { id: 'brian_eno', name: 'Brian Eno', entityType: 'solo_artist', regex: /\b(brian eno)\b/i, country: 'UK' },
  { id: 'jean_michel_jarre', name: 'Jean-Michel Jarre', entityType: 'solo_artist', regex: /\b(jean michel jarre|jean-michel jarre)\b/i, country: 'FR' },
  { id: 'tangerine_dream', name: 'Tangerine Dream', entityType: 'band', regex: /\b(tangerine dream)\b/i, country: 'DE' },
  { id: 'vangelis', name: 'Vangelis', entityType: 'solo_artist', regex: /\b(vangelis)\b/i, country: 'GR' }
];

function getScoreTier(score: number): NarrativeScoreTier {
  if (score >= 85) return 'elite';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'usable';
  return 'avoid';
}

export function classifyMusicItem(title: string, description = '', creator = ''): EnrichedMusicClassification | null {
  const text = `${title} ${description} ${creator}`.toLowerCase();

  // Filtro de Contexto Negativo (Falsos Positivos de Noticias, Cine, Economía, Poesía, Política)
  const isNegativeContext = /\b(tango bond|tango informativo|virus zombie|virus informatico|prince philip|derek prince|recital de poesia|recital de poesias|recital poético|recital poetico|cabinet of dr caligari|battleship potemkin|short film|animated short|lesa humanidad|inflacion|fintech|revolucion de mayo|videomatch|tandas|dictadura|telefe|noticias caracol|fútbol|futbol|goles|resumen del partido|elecciones|conferencia de prensa|ministro|senado|diputados|juicio oral)\b/i.test(text);

  if (isNegativeContext) {
    // Solo permitir si hay una entidad musical canónica estricta
    let hasStrictEntity = false;
    for (const ent of INDIVIDUAL_ENTITIES) {
      if (ent.regex.test(text)) {
        hasStrictEntity = true;
        break;
      }
    }
    if (!hasStrictEntity) return null; // Es contenido General/Noticias/Cine
  }

  const evidence: string[] = [];
  let confidence = 0.5;

  // 1. Identificar Género, Movimiento y Cohorte
  let matchedGenre: MusicGenreType | null = null;
  let matchedMovement: string | undefined;
  let matchedCohort: string | undefined;

  for (const rule of GENRE_RULES) {
    if (rule.regex.test(text)) {
      matchedGenre = rule.genre;
      matchedMovement = rule.movement;
      matchedCohort = rule.cohort;
      evidence.push(`genre_match:${rule.genre}`);
      confidence += 0.25;
      break;
    }
  }

  // Fallback si no hay género específico pero hay keywords musicales fuertes
  if (!matchedGenre) {
    if (/\b(recital|concierto|piano recital|orchestra|guitarra clasica|jazz festival|symphony|orchestral|synthesizer live|modular)\b/i.test(text)) {
      matchedGenre = 'world_music';
      matchedCohort = 'Música Instrumental y de Escenario';
      evidence.push('generic_music_keyword');
      confidence += 0.1;
    } else {
      return null; // No es música
    }
  }

  // 2. Identificar Entidad Individual Estricta
  let artistId: string | undefined;
  let artistName: string | undefined;
  let entityType: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer' | undefined;
  let projectOrBand: string | undefined;
  let country: string | undefined;

  for (const ent of INDIVIDUAL_ENTITIES) {
    if (ent.regex.test(text)) {
      artistId = ent.id;
      artistName = ent.name;
      entityType = ent.entityType;
      country = ent.country;
      evidence.push(`entity_match:${ent.id}`);
      confidence += 0.25;

      if (ent.projects) {
        for (const proj of ent.projects) {
          if (text.includes(proj.toLowerCase())) {
            projectOrBand = proj;
            evidence.push(`project_match:${proj}`);
            confidence += 0.1;
            break;
          }
        }
      }
      break;
    }
  }

  // Detección heurística de artista si el título contiene "Artista - Canción"
  if (!artistId) {
    const artistTitleMatch = title.match(/^([A-Z\u00C0-\u017E0-9\s&]{3,35})\s*[-–—:]\s*(.+)$/);
    if (artistTitleMatch && artistTitleMatch[1]) {
      const candidate = artistTitleMatch[1].trim();
      if (!/^(official|video|audio|full|live|hd|album|ep|mix|cd|session|recital|concierto|documental|festival|orquesta|filarmonica)\b/i.test(candidate)) {
        artistId = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        artistName = candidate;
        entityType = 'solo_artist';
        evidence.push(`heuristic_artist_title:${candidate}`);
        confidence += 0.15;
      }
    }
  }

  // Fallback si es filarmónica o conjunto orquestal clásico reconocido
  if (!artistId && /\b(berliner philharmoniker|wiener philharmoniker|concertgebouw|london symphony|chicago symphony|boston symphony|orchestra|filarmonica|sinfonica|proms bbc)\b/i.test(text)) {
    artistId = 'orquesta_sinfonica_clasica';
    artistName = 'Orquesta Sinfónica Clásica';
    entityType = 'orchestra';
    evidence.push('orchestral_entity_fallback');
    confidence += 0.15;
  }

  // 3. Formato
  let format: MusicFormatType = 'studio';
  if (/\b(en vivo|live concert|recital|full concert|live at|en directo|concierto completo)\b/i.test(text)) {
    format = 'concert';
    evidence.push('format:concert');
    confidence += 0.1;
  } else if (/\b(acustico|acoustic|unplugged)\b/i.test(text)) {
    format = 'acoustic_unplugged';
    evidence.push('format:acoustic');
    confidence += 0.1;
  } else if (/\b(session|sesion|kexp|tiny desk|studio session|audiotree|colors show)\b/i.test(text)) {
    format = 'session';
    evidence.push('format:session');
    confidence += 0.1;
  } else if (/\b(documental|documentary|history of|biografia musical|making of)\b/i.test(text)) {
    format = 'documentary';
    evidence.push('format:documentary');
  } else if (/\b(entrevista|interview|masterclass|clase magistral)\b/i.test(text)) {
    format = 'interview_masterclass';
    evidence.push('format:interview');
  } else if (/\b(official video|video oficial|videoclip)\b/i.test(text)) {
    format = 'videoclip';
    evidence.push('format:videoclip');
  }

  // 4. Puntuaciones Continuas Calibradas (0–100) y Roles de Experiencia para Onda
  const isConcert = format === 'concert';
  const isAcousticSession = format === 'acoustic_unplugged' || format === 'session';
  const isStudio = format === 'studio';
  const isDoc = format === 'documentary';
  const isInterview = format === 'interview_masterclass';
  const isClip = format === 'videoclip';
  const isHistoric = /\b(195|196|197|198|historico|legendario|rare|inedito|inédito|masterpiece|obra cumbre)\b/i.test(text);

  // Opener Score: Selectivo para aperturas canónicas o sesiones de alto gancho
  let openerScore = 40;
  if (isAcousticSession) openerScore += 35;
  if (isClip) openerScore += 30;
  if (artistId && ['luis_alberto_spinetta', 'charly_garcia', 'david_bowie', 'the_beatles', 'pink_floyd', 'gustavo_cerati', 'miles_davis'].includes(artistId)) openerScore += 15;

  // Transition Score: Selectivo para canciones de estudio, instrumentales o puentes
  let transitionScore = 45;
  if (isStudio) transitionScore += 30;
  if (format === 'session') transitionScore += 25;
  if (matchedGenre === 'jazz' || matchedGenre === 'electronic' || matchedGenre === 'classical') transitionScore += 10;

  // Closer Score: Selectivo para conciertos masivos o clímax sinfónicos
  let closerScore = 30;
  if (isConcert) closerScore += 45;
  if (isHistoric && isConcert) closerScore += 15;

  // Energy & Visual Demand Scores
  let energyScore = 50;
  if (format === 'acoustic_unplugged') energyScore = 20;
  else if (matchedGenre === 'heavy_metal_prog') energyScore = 90;
  else if (isConcert) energyScore = 80;

  let visualDemandScore = 50;
  if (isConcert || isAcousticSession) visualDemandScore = 80;
  if (isClip) visualDemandScore = 90;

  // Rarity & Historical Value
  let rarityScore = isHistoric ? 75 : 25;
  if (/\b(unreleased|bootleg|demo|rare|inedito|inédito|ensayo|rehearsal|soundboard|outtake|hotel room|tv archive|soundcheck|alternate take)\b/i.test(text)) rarityScore = Math.min(100, rarityScore + 25);

  let historicalScore = isHistoric ? 85 : 40;
  if (/\b(woodstock|monterey|montreux|teatro colon|recital historico|1967|1968|1969|1970|1972)\b/i.test(text)) historicalScore = Math.min(100, historicalScore + 15);

  openerScore = Math.min(100, Math.max(0, openerScore));
  transitionScore = Math.min(100, Math.max(0, transitionScore));
  closerScore = Math.min(100, Math.max(0, closerScore));

  // Determinación del Rol Editorial Primario (Experience Role)
  let experienceRole: OndaExperienceRole = 'performance';
  if (rarityScore >= 75) {
    experienceRole = 'surprise';
  } else if (isDoc) {
    experienceRole = 'deep_dive';
  } else if (isInterview) {
    experienceRole = 'context';
  } else if (format === 'acoustic_unplugged') {
    experienceRole = 'breather';
  } else if (isConcert && energyScore >= 75) {
    experienceRole = closerScore >= 75 ? 'climax' : 'performance';
  } else if (openerScore >= 75) {
    experienceRole = 'hook';
  } else if (transitionScore >= 70) {
    experienceRole = 'bridge';
  }

  const narrativeProfile: OndaNarrativeMetadata = {
    openerScore,
    transitionScore,
    closerScore,
    energyScore,
    visualDemandScore,
    rarityScore,
    historicalScore,

    energyLevel: energyScore < 35 ? 'low' : (energyScore > 70 ? 'high' : 'medium'),
    visualAttention: visualDemandScore > 70 ? 'high' : (visualDemandScore < 40 ? 'low' : 'medium'),
    historicalValue: historicalScore >= 80 ? (historicalScore >= 92 ? 'masterpiece' : 'high') : 'standard',
    experienceRole,

    openerTier: getScoreTier(openerScore),
    transitionTier: getScoreTier(transitionScore),
    closerTier: getScoreTier(closerScore),

    isGoodOpener: openerScore >= 75,
    isGoodTransition: transitionScore >= 70,
    isGoodCloser: closerScore >= 70,
    isDeepCut: rarityScore >= 70
  };

  return {
    domain: 'music',
    genre: matchedGenre,
    movement: matchedMovement,
    cohortOrCollection: matchedCohort,
    artistId,
    artistName,
    entityType,
    projectOrBand,
    format,
    country,
    narrativeProfile,
    confidence: Math.min(1.0, +confidence.toFixed(2)),
    evidence
  };
}
