/**
 * entityResolverV2.ts — Resolver Multicapa de Entidades Musicales con Calibración de Confianza
 *
 * Niveles de Confianza:
 *  - >= 0.95: Auto-Link (Canónico exacto, alias directo o sintaxis limpia "Artista - Obra" verificado).
 *  - 0.85 - 0.94: Link con 2da evidencia (Corroborado por creador, género, movimiento o proyecto).
 *  - 0.70 - 0.84: Candidato (No se vincula para garantizar False Link Rate < 1%).
 *  - < 0.70: Unresolved.
 */

export interface ResolvedEntity {
  id: string;
  name: string;
  entityType: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer' | 'ensemble' | 'venue';
  country?: string;
  confidence: number;
  evidence: string[];
  resolvedVia: 'exact_canonical' | 'exact_alias' | 'title_syntax' | 'composer_work' | 'project_band' | 'ensemble_match' | 'unresolved';
}

export interface EntityRelation {
  from: string;
  to: string;
  type: 'FORMER_MEMBER_OF' | 'MEMBER_OF' | 'FOUNDER_OF' | 'LEAD_SINGER_OF' | 'COLLABORATED_WITH';
  strength: number;
}

export interface ProvisionalEntity {
  id: string;
  canonicalName: string;
  type: 'PERSON' | 'BAND' | 'SHOW' | 'ORGANIZATION' | 'PLACE' | 'FRANCHISE' | 'UNKNOWN';
  identityConfidence: number;
  typeConfidence: number;
  source: string;
}

const provisionalEntities = new Map<string, ProvisionalEntity>();

export function registerProvisionalEntity(name: string, type: 'PERSON' | 'BAND' | 'SHOW' | 'ORGANIZATION' | 'PLACE' | 'FRANCHISE' | 'UNKNOWN' = 'UNKNOWN', source: string = 'query/open_world'): ProvisionalEntity {
  const norm = name.toLowerCase().trim();
  if (provisionalEntities.has(norm)) {
    return provisionalEntities.get(norm)!;
  }
  const id = `prov_${norm.replace(/[^a-z0-9]+/g, '_')}`;
  const entity: ProvisionalEntity = {
    id,
    canonicalName: name,
    type,
    identityConfidence: 0.90, // Alta confianza para identidad
    typeConfidence: type === 'UNKNOWN' ? 0 : 0.90, // Si no se conoce, cero.
    source
  };
  provisionalEntities.set(norm, entity);
  return entity;
}

export function getProvisionalEntity(name: string): ProvisionalEntity | undefined {
  const norm = name.toLowerCase().trim();
  return provisionalEntities.get(norm);
}

export interface CanonicalEntityDef {
  id: string;
  name: string;
  entityType: 'solo_artist' | 'band' | 'composer' | 'orchestra' | 'performer' | 'ensemble' | 'venue';
  aliases: string[];
  regex: RegExp;
  country?: string;
  projects?: string[];
  genres?: string[];
}

export const CANONICAL_ENTITIES_V2: CanonicalEntityDef[] = [
  // 🇦🇷 Rock Argentino & Rioplatense
  { id: 'luis_alberto_spinetta', name: 'Luis Alberto Spinetta', entityType: 'solo_artist', aliases: ['Spinetta', 'El Flaco Spinetta'], regex: /\b(spinetta)\b/i, country: 'AR', projects: ['Almendra', 'Pescado Rabioso', 'Invisible', 'Spinetta Jade', 'Socios del Desierto'] },
  { id: 'charly_garcia', name: 'Charly García', entityType: 'solo_artist', aliases: ['Charly', 'Charly Garcia'], regex: /\b(charly\s+garcia|charly\s+garcía|charly)\b/i, country: 'AR', projects: ['Sui Generis', 'La Máquina de Hacer Pájaros', 'Serú Girán'] },
  { id: 'gustavo_cerati', name: 'Gustavo Cerati', entityType: 'solo_artist', aliases: ['Cerati', 'Gustavo Adrián Cerati'], regex: /\b(gustavo cerati|cerati)\b/i, country: 'AR' },
  { id: 'soda_stereo', name: 'Soda Stereo', entityType: 'band', aliases: ['Soda'], regex: /\b(soda stereo)\b/i, country: 'AR' },
  { id: 'fito_paez', name: 'Fito Páez', entityType: 'solo_artist', aliases: ['Fito Paez'], regex: /\b(fito paez|fito páez)\b/i, country: 'AR' },
  { id: 'los_redondos', name: 'Patricio Rey y sus Redonditos de Ricota', entityType: 'band', aliases: ['Los Redondos'], regex: /\b(los redondos|redonditos de ricota|patricio rey)\b/i, country: 'AR' },
  { id: 'indio_solari', name: 'Indio Solari', entityType: 'solo_artist', aliases: ['El Indio'], regex: /\b(indio solari)\b/i, country: 'AR' },
  { id: 'skay_beilinson', name: 'Skay Beilinson', entityType: 'solo_artist', aliases: ['Skay'], regex: /\b(skay beilinson|skay)\b/i, country: 'AR' },
  { id: 'divididos', name: 'Divididos', entityType: 'band', aliases: ['La aplanadora del rock'], regex: /\b(divididos)\b/i, country: 'AR' },
  { id: 'ricardo_mollo', name: 'Ricardo Mollo', entityType: 'solo_artist', aliases: ['Mollo'], regex: /\b(ricardo mollo)\b/i, country: 'AR' },
  { id: 'diego_arnedo', name: 'Diego Arnedo', entityType: 'solo_artist', aliases: ['Arnedo'], regex: /\b(diego arnedo)\b/i, country: 'AR' },
  { id: 'sumo', name: 'Sumo', entityType: 'band', aliases: ['Sumo band'], regex: /\b(sumo band)\b/i, country: 'AR' },
  { id: 'luca_prodan', name: 'Luca Prodan', entityType: 'solo_artist', aliases: ['Luca'], regex: /\b(luca prodan)\b/i, country: 'AR' },
  { id: 'pappo', name: 'Pappo', entityType: 'solo_artist', aliases: ['Norberto Napolitano', 'Pappo\'s Blues', 'Riff'], regex: /\b(pappo|pappo\'s blues|riff band)\b/i, country: 'AR' },
  { id: 'andres_calamaro', name: 'Andrés Calamaro', entityType: 'solo_artist', aliases: ['Calamaro', 'El Salmon'], regex: /\b(calamaro|andres calamaro)\b/i, country: 'AR' },
  { id: 'los_fabulosos_cadillacs', name: 'Los Fabulosos Cadillacs', entityType: 'band', aliases: ['Cadillacs'], regex: /\b(fabulosos cadillacs)\b/i, country: 'AR' },
  { id: 'vicentico', name: 'Vicentico', entityType: 'solo_artist', aliases: ['Gabriel Fernández Capello'], regex: /\b(vicentico)\b/i, country: 'AR' },
  { id: 'virus_band', name: 'Virus', entityType: 'band', aliases: ['Virus band'], regex: /\b(virus band)\b/i, country: 'AR' },
  { id: 'federico_moura', name: 'Federico Moura', entityType: 'solo_artist', aliases: ['Moura'], regex: /\b(federico moura)\b/i, country: 'AR' },
  { id: 'la_renga', name: 'La Renga', entityType: 'band', aliases: [], regex: /\b(la renga)\b/i, country: 'AR' },
  { id: 'chizzo_napoli', name: 'Chizzo Napoli', entityType: 'solo_artist', aliases: ['Chizzo'], regex: /\b(chizzo napoli)\b/i, country: 'AR' },
  { id: 'babasonicos', name: 'Babasónicos', entityType: 'band', aliases: ['Babasonicos'], regex: /\b(babasonicos|babasónicos)\b/i, country: 'AR' },
  { id: 'adrian_dargelos', name: 'Adrián Dárgelos', entityType: 'solo_artist', aliases: ['Dargelos', 'Dárgelos'], regex: /\b(adrian dargelos|adrián dárgelos|dargelos)\b/i, country: 'AR' },
  { id: 'los_piojos', name: 'Los Piojos', entityType: 'band', aliases: [], regex: /\b(los piojos)\b/i, country: 'AR' },
  { id: 'ciro_martinez', name: 'Ciro Martínez', entityType: 'solo_artist', aliases: ['Ciro Martinez', 'Andrés Ciro Martínez'], regex: /\b(ciro martinez|ciro martínez)\b/i, country: 'AR' },
  { id: 'ciro_y_los_persas', name: 'Ciro y los Persas', entityType: 'band', aliases: [], regex: /\b(ciro y los persas)\b/i, country: 'AR' },
  { id: 'ratones_paranoicos', name: 'Ratones Paranoicos', entityType: 'band', aliases: [], regex: /\b(ratones paranoicos)\b/i, country: 'AR' },
  { id: 'juanse', name: 'Juanse', entityType: 'solo_artist', aliases: ['Juan Sebastián Gutiérrez'], regex: /\b(juanse)\b/i, country: 'AR' },
  { id: 'las_pelotas', name: 'Las Pelotas', entityType: 'band', aliases: [], regex: /\b(las pelotas)\b/i, country: 'AR' },
  { id: 'german_daffunchio', name: 'Germán Daffunchio', entityType: 'solo_artist', aliases: ['German Daffunchio', 'Daffunchio'], regex: /\b(german daffunchio|germán daffunchio|daffunchio)\b/i, country: 'AR' },
  { id: 'rata_blanca', name: 'Rata Blanca', entityType: 'band', aliases: [], regex: /\b(rata blanca)\b/i, country: 'AR' },
  { id: 'walter_giardino', name: 'Walter Giardino', entityType: 'solo_artist', aliases: ['Giardino'], regex: /\b(walter giardino)\b/i, country: 'AR' },
  { id: 'adrian_barilari', name: 'Adrián Barilari', entityType: 'solo_artist', aliases: ['Adrian Barilari', 'Barilari'], regex: /\b(adrian barilari|adrián barilari|barilari)\b/i, country: 'AR' },
  { id: 'los_pericos', name: 'Los Pericos', entityType: 'band', aliases: [], regex: /\b(los pericos)\b/i, country: 'AR' },
  { id: 'bahiano', name: 'Bahiano', entityType: 'solo_artist', aliases: ['El Bahiano'], regex: /\b(bahiano)\b/i, country: 'AR' },
  { id: 'juanchi_baleiron', name: 'Juanchi Baleirón', entityType: 'solo_artist', aliases: ['Juanchi Baleiron'], regex: /\b(juanchi baleiron|juanchi baleirón)\b/i, country: 'AR' },
  { id: 'los_autenticos_decadentes', name: 'Los Auténticos Decadentes', entityType: 'band', aliases: ['Autenticos Decadentes'], regex: /\b(autenticos decadentes|auténticos decadentes)\b/i, country: 'AR' },
  { id: 'cucho_parisi', name: 'Cucho Parisi', entityType: 'solo_artist', aliases: ['Cucho'], regex: /\b(cucho parisi)\b/i, country: 'AR' },
  { id: 'bersuit_vergarabat', name: 'Bersuit Vergarabat', entityType: 'band', aliases: ['Bersuit'], regex: /\b(bersuit vergarabat|bersuit)\b/i, country: 'AR' },
  { id: 'gustavo_cordera', name: 'Gustavo Cordera', entityType: 'solo_artist', aliases: ['Cordera'], regex: /\b(gustavo cordera|cordera)\b/i, country: 'AR' },
  { id: 'attaque_77', name: 'Attaque 77', entityType: 'band', aliases: ['Ataque 77'], regex: /\b(attaque 77|ataque 77)\b/i, country: 'AR' },
  { id: 'ciro_pertusi', name: 'Ciro Pertusi', entityType: 'solo_artist', aliases: ['Pertusi'], regex: /\b(ciro pertusi)\b/i, country: 'AR' },
  { id: 'litto_nebbia', name: 'Litto Nebbia', entityType: 'solo_artist', aliases: ['Los Gatos'], regex: /\b(litto nebbia|los gatos band)\b/i, country: 'AR' },
  { id: 'manal', name: 'Manal', entityType: 'band', aliases: [], regex: /\b(manal band)\b/i, country: 'AR' },
  { id: 'javier_martinez_manal', name: 'Javier Martínez', entityType: 'solo_artist', aliases: ['Javier Martinez'], regex: /\b(javier martinez manal)\b/i, country: 'AR' },
  { id: 'vox_dei', name: 'Vox Dei', entityType: 'band', aliases: [], regex: /\b(vox dei)\b/i, country: 'AR' },

  // 🇦🇷 🇺🇾 Tango, Candombe, Folklore & Cantautores
  { id: 'leon_gieco', name: 'León Gieco', entityType: 'solo_artist', aliases: ['Leon Gieco'], regex: /\b(leon gieco|león gieco)\b/i, country: 'AR' },
  { id: 'victor_heredia', name: 'Víctor Heredia', entityType: 'solo_artist', aliases: ['Victor Heredia'], regex: /\b(victor heredia|víctor heredia)\b/i, country: 'AR' },
  { id: 'pedro_aznar', name: 'Pedro Aznar', entityType: 'solo_artist', aliases: ['Aznar'], regex: /\b(pedro aznar|aznar)\b/i, country: 'AR' },
  { id: 'astor_piazzolla', name: 'Astor Piazzolla', entityType: 'composer', aliases: ['Piazzolla', 'Quinteto Tango Nuevo'], regex: /\b(astor piazzolla|piazzolla|quinteto tango nuevo)\b/i, country: 'AR' },
  { id: 'carlos_gardel', name: 'Carlos Gardel', entityType: 'solo_artist', aliases: ['El Zorzal Criollo'], regex: /\b(carlos gardel|gardel)\b/i, country: 'AR' },
  { id: 'anibal_troilo', name: 'Aníbal Troilo', entityType: 'solo_artist', aliases: ['Pichuco', 'Troilo'], regex: /\b(anibal troilo|aníbal troilo|troilo|pichuco)\b/i, country: 'AR' },
  { id: 'osvaldo_pugliese', name: 'Osvaldo Pugliese', entityType: 'solo_artist', aliases: ['Pugliese'], regex: /\b(osvaldo pugliese|pugliese)\b/i, country: 'AR' },
  { id: 'juan_darienzo', name: 'Juan D\'Arienzo', entityType: 'solo_artist', aliases: ['El Rey del Compás'], regex: /\b(juan d\'arienzo|d\'arienzo|rey del compas)\b/i, country: 'AR' },
  { id: 'roberto_goyeneche', name: 'Roberto Goyeneche', entityType: 'solo_artist', aliases: ['El Polaco Goyeneche'], regex: /\b(roberto goyeneche|goyeneche|polaco goyeneche)\b/i, country: 'AR' },
  { id: 'julio_sosa', name: 'Julio Sosa', entityType: 'solo_artist', aliases: ['El Varón del Tango'], regex: /\b(julio sosa|varon del tango)\b/i, country: 'UY' },
  { id: 'carlos_di_sarli', name: 'Carlos Di Sarli', entityType: 'solo_artist', aliases: ['Di Sarli'], regex: /\b(carlos di sarli|di sarli)\b/i, country: 'AR' },
  { id: 'horacio_salgan', name: 'Horacio Salgán', entityType: 'solo_artist', aliases: ['Salgan y De Lio'], regex: /\b(horacio salgan|horacio salgán|salgan y de lio)\b/i, country: 'AR' },
  { id: 'bajofondo_tango', name: 'Bajofondo', entityType: 'band', aliases: ['Bajofondo Tango Club', 'Gustavo Santaolalla', 'Luciano Supervielle'], regex: /\b(bajofondo|santaolalla|supervielle)\b/i, country: 'AR' },
  { id: 'gotan_project', name: 'Gotan Project', entityType: 'band', aliases: ['Philippe Cohen Solal'], regex: /\b(gotan project)\b/i, country: 'FR' },
  { id: 'mercedes_sosa', name: 'Mercedes Sosa', entityType: 'solo_artist', aliases: ['La Negra Sosa'], regex: /\b(mercedes sosa|la negra sosa)\b/i, country: 'AR' },
  { id: 'atahualpa_yupanqui', name: 'Atahualpa Yupanqui', entityType: 'solo_artist', aliases: ['Don Ata', 'Yupanqui'], regex: /\b(atahualpa yupanqui|yupanqui|don ata)\b/i, country: 'AR' },
  { id: 'jorge_cafrune', name: 'Jorge Cafrune', entityType: 'solo_artist', aliases: ['Cafrune'], regex: /\b(jorge cafrune|cafrune)\b/i, country: 'AR' },
  { id: 'jose_larralde', name: 'José Larralde', entityType: 'solo_artist', aliases: ['Larralde'], regex: /\b(jose larralde|josé larralde|larralde)\b/i, country: 'AR' },
  { id: 'chango_spasiuk', name: 'Chango Spasiuk', entityType: 'solo_artist', aliases: ['Spasiuk'], regex: /\b(chango spasiuk|spasiuk)\b/i, country: 'AR' },
  { id: 'jaime_torres', name: 'Jaime Torres', entityType: 'solo_artist', aliases: ['Torres Charango'], regex: /\b(jaime torres)\b/i, country: 'AR' },
  { id: 'jaime_roos', name: 'Jaime Roos', entityType: 'solo_artist', aliases: ['Roos'], regex: /\b(jaime roos)\b/i, country: 'UY' },
  { id: 'ruben_rada', name: 'Ruben Rada', entityType: 'solo_artist', aliases: ['El Negro Rada', 'Opa'], regex: /\b(ruben rada|negro rada|rada uruguay)\b/i, country: 'UY' },
  { id: 'hugo_fattoruso', name: 'Hugo Fattoruso', entityType: 'solo_artist', aliases: ['Fattoruso', 'Los Shakers', 'Opa Trio'], regex: /\b(hugo fattoruso|fattoruso|los shakers)\b/i, country: 'UY' },
  { id: 'eduardo_mateo', name: 'Eduardo Mateo', entityType: 'solo_artist', aliases: ['Mateo'], regex: /\b(eduardo mateo|mateo solo bien se lame)\b/i, country: 'UY' },

  // 🎷 Jazz & Blues Universal
  { id: 'miles_davis', name: 'Miles Davis', entityType: 'solo_artist', aliases: ['Miles'], regex: /\b(miles davis)\b/i, country: 'US' },
  { id: 'john_coltrane', name: 'John Coltrane', entityType: 'solo_artist', aliases: ['Trane', 'Coltrane'], regex: /\b(john coltrane|coltrane)\b/i, country: 'US' },
  { id: 'thelonious_monk', name: 'Thelonious Monk', entityType: 'solo_artist', aliases: ['Monk'], regex: /\b(thelonious monk|monk jazz)\b/i, country: 'US' },
  { id: 'bill_evans', name: 'Bill Evans', entityType: 'solo_artist', aliases: ['Bill Evans Trio'], regex: /\b(bill evans)\b/i, country: 'US' },
  { id: 'charles_mingus', name: 'Charles Mingus', entityType: 'solo_artist', aliases: ['Mingus'], regex: /\b(charles mingus|mingus)\b/i, country: 'US' },
  { id: 'louis_armstrong', name: 'Louis Armstrong', entityType: 'solo_artist', aliases: ['Satchmo'], regex: /\b(louis armstrong|satchmo)\b/i, country: 'US' },
  { id: 'ella_fitzgerald', name: 'Ella Fitzgerald', entityType: 'solo_artist', aliases: ['First Lady of Song'], regex: /\b(ella fitzgerald)\b/i, country: 'US' },
  { id: 'billie_holiday', name: 'Billie Holiday', entityType: 'solo_artist', aliases: ['Lady Day'], regex: /\b(billie holiday|lady day)\b/i, country: 'US' },
  { id: 'chet_baker', name: 'Chet Baker', entityType: 'solo_artist', aliases: ['Chet'], regex: /\b(chet baker)\b/i, country: 'US' },
  { id: 'herbie_hancock', name: 'Herbie Hancock', entityType: 'solo_artist', aliases: ['Headhunters'], regex: /\b(herbie hancock)\b/i, country: 'US' },
  { id: 'chick_corea', name: 'Chick Corea', entityType: 'solo_artist', aliases: ['Return to Forever'], regex: /\b(chick corea|return to forever)\b/i, country: 'US' },
  { id: 'dave_brubeck', name: 'Dave Brubeck', entityType: 'solo_artist', aliases: ['Dave Brubeck Quartet'], regex: /\b(dave brubeck)\b/i, country: 'US' },
  { id: 'keith_jarrett', name: 'Keith Jarrett', entityType: 'solo_artist', aliases: ['The Koln Concert'], regex: /\b(keith jarrett)\b/i, country: 'US' },
  { id: 'pat_metheny', name: 'Pat Metheny', entityType: 'solo_artist', aliases: ['Pat Metheny Group'], regex: /\b(pat metheny)\b/i, country: 'US' },
  { id: 'bb_king', name: 'B.B. King', entityType: 'solo_artist', aliases: ['King of the Blues'], regex: /\b(bb king|b\.b\. king)\b/i, country: 'US' },
  { id: 'muddy_waters', name: 'Muddy Waters', entityType: 'solo_artist', aliases: ['McKinley Morganfield'], regex: /\b(muddy waters)\b/i, country: 'US' },
  { id: 'stevie_ray_vaughan', name: 'Stevie Ray Vaughan', entityType: 'solo_artist', aliases: ['SRV', 'Double Trouble'], regex: /\b(stevie ray vaughan|srv|double trouble)\b/i, country: 'US' },
  { id: 'howlin_wolf', name: 'Howlin\' Wolf', entityType: 'solo_artist', aliases: ['Chester Burnett'], regex: /\b(howlin wolf|howlin\' wolf)\b/i, country: 'US' },
  { id: 'john_lee_hooker', name: 'John Lee Hooker', entityType: 'solo_artist', aliases: ['Hooker'], regex: /\b(john lee hooker)\b/i, country: 'US' },
  { id: 'robert_johnson', name: 'Robert Johnson', entityType: 'solo_artist', aliases: ['Cross Road Blues'], regex: /\b(robert johnson)\b/i, country: 'US' },
  { id: 'buddy_guy', name: 'Buddy Guy', entityType: 'solo_artist', aliases: ['Guy'], regex: /\b(buddy guy)\b/i, country: 'US' },
  { id: 'albert_king', name: 'Albert King', entityType: 'solo_artist', aliases: ['Born Under a Bad Sign'], regex: /\b(albert king)\b/i, country: 'US' },

  // 🎸 Rock & Pop Universal
  { id: 'the_beatles', name: 'The Beatles', entityType: 'band', aliases: ['Beatles'], regex: /\b(the beatles|beatles)\b/i, country: 'UK' },
  { id: 'pink_floyd', name: 'Pink Floyd', entityType: 'band', aliases: ['Floyd'], regex: /\b(pink floyd)\b/i, country: 'UK' },
  { id: 'david_bowie', name: 'David Bowie', entityType: 'solo_artist', aliases: ['Bowie', 'Ziggy Stardust', 'Thin White Duke'], regex: /\b(david bowie|bowie|ziggy stardust)\b/i, country: 'UK' },
  { id: 'queen', name: 'Queen', entityType: 'band', aliases: ['Freddie Mercury', 'Brian May'], regex: /\b(queen(\s+band)?)\b/i, country: 'UK' },
  { id: 'led_zeppelin', name: 'Led Zeppelin', entityType: 'band', aliases: ['Zeppelin'], regex: /\b(led zeppelin)\b/i, country: 'UK' },
  { id: 'the_rolling_stones', name: 'The Rolling Stones', entityType: 'band', aliases: ['Rolling Stones', 'Stones'], regex: /\b(rolling stones|the rolling stones)\b/i, country: 'UK' },
  { id: 'radiohead', name: 'Radiohead', entityType: 'band', aliases: ['The Smile'], regex: /\b(radiohead|the smile)\b/i, country: 'UK' },
  { id: 'nirvana', name: 'Nirvana', entityType: 'band', aliases: [], regex: /\b(nirvana)\b/i, country: 'US' },
  { id: 'the_cure', name: 'The Cure', entityType: 'band', aliases: ['Robert Smith'], regex: /\b(the cure|robert smith)\b/i, country: 'UK' },
  { id: 'the_doors', name: 'The Doors', entityType: 'band', aliases: ['Jim Morrison', 'Ray Manzarek'], regex: /\b(the doors|jim morrison|ray manzarek)\b/i, country: 'US' },
  { id: 'jimi_hendrix', name: 'Jimi Hendrix', entityType: 'solo_artist', aliases: ['Hendrix', 'Jimi Hendrix Experience'], regex: /\b(jimi hendrix|hendrix)\b/i, country: 'US' },
  { id: 'bob_dylan', name: 'Bob Dylan', entityType: 'solo_artist', aliases: ['Dylan'], regex: /\b(bob dylan|dylan)\b/i, country: 'US' },
  { id: 'iron_maiden', name: 'Iron Maiden', entityType: 'band', aliases: ['Maiden', 'Bruce Dickinson'], regex: /\b(iron maiden|bruce dickinson)\b/i, country: 'UK' },
  { id: 'black_sabbath', name: 'Black Sabbath', entityType: 'band', aliases: ['Sabbath', 'Ozzy Osbourne', 'Tony Iommi', 'Ronnie James Dio'], regex: /\b(black sabbath|ozzy osbourne|ronnie james dio|tony iommi)\b/i, country: 'UK' },
  { id: 'king_crimson', name: 'King Crimson', entityType: 'band', aliases: ['Robert Fripp', 'Bill Bruford'], regex: /\b(king crimson|robert fripp|bill bruford)\b/i, country: 'UK' },
  { id: 'deep_purple', name: 'Deep Purple', entityType: 'band', aliases: ['Ritchie Blackmore', 'Ian Gillan'], regex: /\b(deep purple|ritchie blackmore|ian gillan)\b/i, country: 'UK' },
  { id: 'judas_priest', name: 'Judas Priest', entityType: 'band', aliases: ['Rob Halford'], regex: /\b(judas priest|rob halford)\b/i, country: 'UK' },
  { id: 'yes_band', name: 'Yes', entityType: 'band', aliases: ['Jon Anderson', 'Rick Wakeman'], regex: /\b(yes band|jon anderson|rick wakeman)\b/i, country: 'UK' },
  { id: 'genesis', name: 'Genesis', entityType: 'band', aliases: ['Peter Gabriel', 'Phil Collins'], regex: /\b(genesis band|peter gabriel|phil collins)\b/i, country: 'UK' },
  { id: 'rush_band', name: 'Rush', entityType: 'band', aliases: ['Geddy Lee', 'Neil Peart'], regex: /\b(rush band|geddy lee|neil peart)\b/i, country: 'CA' },
  { id: 'jethro_tull', name: 'Jethro Tull', entityType: 'band', aliases: ['Ian Anderson'], regex: /\b(jethro tull|ian anderson)\b/i, country: 'UK' },
  { id: 'sigur_ros', name: 'Sigur Rós', entityType: 'band', aliases: ['Sigur Ros', 'Jónsi'], regex: /\b(sigur ros|sigur rós|jonsi)\b/i, country: 'IS' },
  { id: 'mogwai', name: 'Mogwai', entityType: 'band', aliases: ['Mogwai'], regex: /\b(mogwai)\b/i, country: 'UK' },
  { id: 'godspeed_you_black_emperor', name: 'Godspeed You! Black Emperor', entityType: 'band', aliases: ['GYBE'], regex: /\b(godspeed you black emperor|gybe)\b/i, country: 'CA' },
  { id: 'cocteau_twins', name: 'Cocteau Twins', entityType: 'band', aliases: ['Elizabeth Fraser', 'Robin Guthrie'], regex: /\b(cocteau twins|elizabeth fraser)\b/i, country: 'UK' },
  { id: 'can_band', name: 'Can', entityType: 'band', aliases: ['Holger Czukay', 'Jaki Liebezeit', 'Damo Suzuki'], regex: /\b(can band|holger czukay|jaki liebezeit|damo suzuki)\b/i, country: 'DE' },
  { id: 'neu_band', name: 'Neu!', entityType: 'band', aliases: ['Michael Rother', 'Klaus Dinger'], regex: /\b(neu!|michael rother|klaus dinger)\b/i, country: 'DE' },
  { id: 'faust_band', name: 'Faust', entityType: 'band', aliases: ['Faust Krautrock'], regex: /\b(faust band|faust krautrock)\b/i, country: 'DE' },

  // 🎻 Compositores Clásicos Universales
  { id: 'ludwig_van_beethoven', name: 'Ludwig van Beethoven', entityType: 'composer', aliases: ['Beethoven'], regex: /\b(beethoven|ludwig van beethoven)\b/i, country: 'DE' },
  { id: 'wolfgang_amadeus_mozart', name: 'Wolfgang Amadeus Mozart', entityType: 'composer', aliases: ['Mozart', 'W.A. Mozart'], regex: /\b(mozart|wolfgang amadeus mozart)\b/i, country: 'AT' },
  { id: 'johann_sebastian_bach', name: 'Johann Sebastian Bach', entityType: 'composer', aliases: ['Bach', 'J.S. Bach'], regex: /\b(bach|j\.s\. bach|johann sebastian bach)\b/i, country: 'DE' },
  { id: 'frederic_chopin', name: 'Frédéric Chopin', entityType: 'composer', aliases: ['Chopin', 'Fryderyk Chopin'], regex: /\b(chopin|frédéric chopin|frederic chopin)\b/i, country: 'PL' },
  { id: 'pyotr_ilyich_tchaikovsky', name: 'Pyotr Ilyich Tchaikovsky', entityType: 'composer', aliases: ['Tchaikovsky', 'Tschaikowski'], regex: /\b(tchaikovsky|tchaikovski|tschaikowski)\b/i, country: 'RU' },
  { id: 'antonio_vivaldi', name: 'Antonio Vivaldi', entityType: 'composer', aliases: ['Vivaldi'], regex: /\b(vivaldi|antonio vivaldi)\b/i, country: 'IT' },
  { id: 'johannes_brahms', name: 'Johannes Brahms', entityType: 'composer', aliases: ['Brahms'], regex: /\b(brahms|johannes brahms)\b/i, country: 'DE' },
  { id: 'gustav_mahler', name: 'Gustav Mahler', entityType: 'composer', aliases: ['Mahler'], regex: /\b(mahler|gustav mahler)\b/i, country: 'AT' },
  { id: 'claude_debussy', name: 'Claude Debussy', entityType: 'composer', aliases: ['Debussy'], regex: /\b(debussy|claude debussy)\b/i, country: 'FR' },
  { id: 'maurice_ravel', name: 'Maurice Ravel', entityType: 'composer', aliases: ['Ravel'], regex: /\b(maurice ravel|bolero de ravel)\b/i, country: 'FR' },
  { id: 'sergei_rachmaninoff', name: 'Sergei Rachmaninoff', entityType: 'composer', aliases: ['Rachmaninoff', 'Rachmaninov'], regex: /\b(rachmaninoff|rachmaninov|rajmaninov)\b/i, country: 'RU' },
  { id: 'franz_schubert', name: 'Franz Schubert', entityType: 'composer', aliases: ['Schubert'], regex: /\b(schubert|franz schubert)\b/i, country: 'AT' },
  { id: 'richard_wagner', name: 'Richard Wagner', entityType: 'composer', aliases: ['Wagner'], regex: /\b(wagner|richard wagner)\b/i, country: 'DE' },
  { id: 'giuseppe_verdi', name: 'Giuseppe Verdi', entityType: 'composer', aliases: ['Verdi'], regex: /\b(verdi|giuseppe verdi)\b/i, country: 'IT' },
  { id: 'giacomo_puccini', name: 'Giacomo Puccini', entityType: 'composer', aliases: ['Puccini'], regex: /\b(puccini|giacomo puccini)\b/i, country: 'IT' },
  { id: 'steve_reich', name: 'Steve Reich', entityType: 'composer', aliases: ['Reich'], regex: /\b(steve reich)\b/i, country: 'US' },
  { id: 'philip_glass', name: 'Philip Glass', entityType: 'composer', aliases: ['Glass'], regex: /\b(philip glass)\b/i, country: 'US' },

  // 🏛️ Solistas Clásicos, Directores & Música Antigua
  { id: 'martha_argerich', name: 'Martha Argerich', entityType: 'performer', aliases: ['Argerich'], regex: /\b(martha argerich|argerich)\b/i, country: 'AR' },
  { id: 'glenn_gould', name: 'Glenn Gould', entityType: 'performer', aliases: ['Gould'], regex: /\b(glenn gould|gould)\b/i, country: 'CA' },
  { id: 'daniel_barenboim', name: 'Daniel Barenboim', entityType: 'performer', aliases: ['Barenboim'], regex: /\b(daniel barenboim|barenboim)\b/i, country: 'AR' },
  { id: 'herbert_von_karajan', name: 'Herbert von Karajan', entityType: 'performer', aliases: ['Karajan'], regex: /\b(herbert von karajan|karajan)\b/i, country: 'AT' },
  { id: 'leonard_bernstein', name: 'Leonard Bernstein', entityType: 'performer', aliases: ['Bernstein'], regex: /\b(leonard bernstein|bernstein)\b/i, country: 'US' },
  { id: 'carlos_kleiber', name: 'Carlos Kleiber', entityType: 'performer', aliases: ['Kleiber'], regex: /\b(carlos kleiber|kleiber)\b/i, country: 'AT' },
  { id: 'jordi_savall', name: 'Jordi Savall', entityType: 'performer', aliases: ['Savall', 'Hespèrion XXI'], regex: /\b(jordi savall|savall|hesperion|hespèrion)\b/i, country: 'ES' },
  { id: 'dietrich_fischer_dieskau', name: 'Dietrich Fischer-Dieskau', entityType: 'performer', aliases: ['Fischer-Dieskau'], regex: /\b(dietrich fischer dieskau|fischer dieskau)\b/i, country: 'DE' },
  { id: 'orquesta_sinfonica_clasica', name: 'Orquesta Sinfónica Clásica', entityType: 'orchestra', aliases: ['Berliner Philharmoniker', 'Wiener Philharmoniker', 'Concertgebouw', 'London Symphony'], regex: /\b(berliner philharmoniker|wiener philharmoniker|concertgebouw|london symphony|chicago symphony|philharmonic orchestra|sinfonica|orquesta)\b/i, country: 'Global' },

  // 💃 Flamenco, Fado, LatAm & Tradición Mundial
  { id: 'paco_de_lucia', name: 'Paco de Lucía', entityType: 'solo_artist', aliases: ['Paco de Lucia'], regex: /\b(paco de lucia|paco de lucía)\b/i, country: 'ES' },
  { id: 'camaron_de_la_isla', name: 'Camarón de la Isla', entityType: 'solo_artist', aliases: ['Camaron'], regex: /\b(camaron de la isla|camarón de la isla|camaron)\b/i, country: 'ES' },
  { id: 'enrique_morente', name: 'Enrique Morente', entityType: 'solo_artist', aliases: ['Morente'], regex: /\b(enrique morente|morente)\b/i, country: 'ES' },
  { id: 'tomatito', name: 'Tomatito', entityType: 'solo_artist', aliases: ['Jose Fernandez Torres'], regex: /\b(tomatito)\b/i, country: 'ES' },
  { id: 'vicente_amigo', name: 'Vicente Amigo', entityType: 'solo_artist', aliases: ['Amigo'], regex: /\b(vicente amigo)\b/i, country: 'ES' },
  { id: 'jorge_pardo', name: 'Jorge Pardo', entityType: 'solo_artist', aliases: ['Pardo Flamenco'], regex: /\b(jorge pardo)\b/i, country: 'ES' },
  { id: 'chano_dominguez', name: 'Chano Domínguez', entityType: 'solo_artist', aliases: ['Chano Dominguez'], regex: /\b(chano dominguez|chano domínguez)\b/i, country: 'ES' },
  { id: 'pedro_iturralde', name: 'Pedro Iturralde', entityType: 'solo_artist', aliases: ['Iturralde'], regex: /\b(pedro iturralde|iturralde)\b/i, country: 'ES' },
  { id: 'amalia_rodrigues', name: 'Amália Rodrigues', entityType: 'solo_artist', aliases: ['Amalia Rodrigues', 'Rainha do Fado'], regex: /\b(amalia rodrigues|amália rodrigues)\b/i, country: 'PT' },
  { id: 'mariza', name: 'Mariza', entityType: 'solo_artist', aliases: ['Mariza Fado'], regex: /\b(mariza fado|mariza)\b/i, country: 'PT' },
  { id: 'the_chieftains', name: 'The Chieftains', entityType: 'band', aliases: ['Paddy Moloney'], regex: /\b(the chieftains|chieftains|paddy moloney)\b/i, country: 'IE' },
  { id: 'alan_stivell', name: 'Alan Stivell', entityType: 'solo_artist', aliases: ['Stivell'], regex: /\b(alan stivell|stivell)\b/i, country: 'FR' },
  { id: 'planxty', name: 'Planxty', entityType: 'band', aliases: ['Christy Moore Planxty'], regex: /\b(planxty|christy moore)\b/i, country: 'IE' },
  { id: 'tom_jobim', name: 'Tom Jobim', entityType: 'solo_artist', aliases: ['Antonio Carlos Jobim'], regex: /\b(tom jobim|antonio carlos jobim|jobim)\b/i, country: 'BR' },
  { id: 'joao_gilberto', name: 'João Gilberto', entityType: 'solo_artist', aliases: ['Joao Gilberto'], regex: /\b(joao gilberto|joão gilberto)\b/i, country: 'BR' },
  { id: 'caetano_veloso', name: 'Caetano Veloso', entityType: 'solo_artist', aliases: ['Caetano'], regex: /\b(caetano veloso|caetano)\b/i, country: 'BR' },
  { id: 'gilberto_gil', name: 'Gilberto Gil', entityType: 'solo_artist', aliases: ['Gilberto Gil'], regex: /\b(gilberto gil)\b/i, country: 'BR' },
  { id: 'chico_buarque', name: 'Chico Buarque', entityType: 'solo_artist', aliases: ['Chico'], regex: /\b(chico buarque)\b/i, country: 'BR' },
  { id: 'elis_regina', name: 'Elis Regina', entityType: 'solo_artist', aliases: ['Elis'], regex: /\b(elis regina)\b/i, country: 'BR' },
  { id: 'milton_nascimento', name: 'Milton Nascimento', entityType: 'solo_artist', aliases: ['Bituca', 'Milton'], regex: /\b(milton nascimento|bituca)\b/i, country: 'BR' },
  { id: 'cartola', name: 'Cartola', entityType: 'solo_artist', aliases: ['Angenor de Oliveira'], regex: /\b(cartola)\b/i, country: 'BR' },
  { id: 'nelson_cavaquinho', name: 'Nelson Cavaquinho', entityType: 'solo_artist', aliases: ['Nelson Cavaquinho'], regex: /\b(nelson cavaquinho)\b/i, country: 'BR' },
  { id: 'silvio_rodriguez', name: 'Silvio Rodríguez', entityType: 'solo_artist', aliases: ['Silvio Rodriguez'], regex: /\b(silvio rodriguez|silvio rodríguez)\b/i, country: 'CU' },
  { id: 'pablo_milanes', name: 'Pablo Milanés', entityType: 'solo_artist', aliases: ['Pablo Milanes'], regex: /\b(pablo milanes|pablo milanés)\b/i, country: 'CU' },
  { id: 'joan_manuel_serrat', name: 'Joan Manuel Serrat', entityType: 'solo_artist', aliases: ['Serrat'], regex: /\b(joan manuel serrat|serrat)\b/i, country: 'ES' },
  { id: 'joaquin_sabina', name: 'Joaquín Sabina', entityType: 'solo_artist', aliases: ['Sabina'], regex: /\b(joaquin sabina|joaquín sabina|sabina)\b/i, country: 'ES' },
  { id: 'bob_marley', name: 'Bob Marley & The Wailers', entityType: 'band', aliases: ['The Wailers', 'Bob Marley'], regex: /\b(bob marley|the wailers)\b/i, country: 'JM' },
  { id: 'peter_tosh', name: 'Peter Tosh', entityType: 'solo_artist', aliases: ['Tosh'], regex: /\b(peter tosh)\b/i, country: 'JM' },
  { id: 'fela_kuti', name: 'Fela Kuti', entityType: 'solo_artist', aliases: ['Fela Anikulapo Kuti', 'Africa 70'], regex: /\b(fela kuti|africa 70)\b/i, country: 'NG' },
  { id: 'ravi_shankar', name: 'Ravi Shankar', entityType: 'solo_artist', aliases: ['Pandit Ravi Shankar'], regex: /\b(ravi shankar)\b/i, country: 'IN' },
  { id: 'munir_bashir', name: 'Munir Bashir', entityType: 'solo_artist', aliases: ['Bashir Oud'], regex: /\b(munir bashir|oud solo)\b/i, country: 'IQ' },
  { id: 'goran_bregovic', name: 'Goran Bregović', entityType: 'solo_artist', aliases: ['Goran Bregovic', 'Wedding and Funeral Orchestra'], regex: /\b(goran bregovic|goran bregović|wedding and funeral)\b/i, country: 'BA' },

  // 🌟 Pop, Balada & Música Popular Global/Latina
  { id: 'ricky_martin', name: 'Ricky Martin', entityType: 'solo_artist', aliases: ['Ricky Martin'], regex: /\b(ricky martin)\b/i, country: 'PR' },
  { id: 'sandro', name: 'Sandro', entityType: 'solo_artist', aliases: ['Sandro de América', 'Roberto Sánchez'], regex: /\b(sandro de america|sandro de américa|sandro)\b/i, country: 'AR' },
  { id: 'shakira', name: 'Shakira', entityType: 'solo_artist', aliases: ['Shakira Mebarak'], regex: /\b(shakira)\b/i, country: 'CO' },
  { id: 'calle_13', name: 'Calle 13', entityType: 'band', aliases: ['Residente', 'Calle 13 Oficial'], regex: /\b(calle 13|residente)\b/i, country: 'PR' },
  { id: 'chayanne', name: 'Chayanne', entityType: 'solo_artist', aliases: ['Elmer Figueroa'], regex: /\b(chayanne)\b/i, country: 'PR' },
  { id: 'michael_jackson', name: 'Michael Jackson', entityType: 'solo_artist', aliases: ['MJ', 'King of Pop'], regex: /\b(michael jackson)\b/i, country: 'US' },
  { id: 'queen', name: 'Queen', entityType: 'band', aliases: ['Queen Band'], regex: /\b(queen(\s+band)?)\b/i, country: 'GB' },
  { id: 'luciano_pavarotti', name: 'Luciano Pavarotti', entityType: 'solo_artist', aliases: ['Pavarotti'], regex: /\b(luciano\s+pavarotti|pavarotti)\b/i, country: 'IT' },

  // 🏛️ Figuras Públicas, Culturales e Institucionales
  { id: 'papa_francisco', name: 'Papa Francisco', entityType: 'performer', aliases: ['Pope Francis', 'Jorge Mario Bergoglio', 'Francisco Papa'], regex: /\b(papa francisco|pope francis|jorge mario bergoglio)\b/i, country: 'VA' },
  { id: 'lionel_messi', name: 'Lionel Messi', entityType: 'performer', aliases: ['Messi', 'Leo Messi'], regex: /\b(lionel messi|leo messi|messi)\b/i, country: 'AR' },
  { id: 'javier_milei', name: 'Javier Milei', entityType: 'performer', aliases: ['Milei'], regex: /\b(javier milei|milei)\b/i, country: 'AR' },

  // 🏛️ Recintos Históricos, Teatros y Estadios Universales (Venues)
  { id: 'teatro_colon', name: 'Teatro Colón', entityType: 'venue', aliases: ['Teatro Colon', 'el Colon', 'el Colón', 'Colón', 'Colon'], regex: /\b(teatro\s+col[oó]n|en\s+el\s+col[oó]n|\bcol[oó]n\b)\b/i, country: 'AR' },
  { id: 'estadio_obras', name: 'Estadio Obras Sanitarias', entityType: 'venue', aliases: ['Obras', 'Estadio Obras', 'Obras Sanitarias', 'en Obras'], regex: /\b(estadio\s+obras(?:\s+sanitarias)?|en\s+obras|\bobras\b)\b/i, country: 'AR' },
  { id: 'estadio_ferro', name: 'Estadio Ferro Carril Oeste', entityType: 'venue', aliases: ['Ferro', 'Estadio Ferro', 'en Ferro'], regex: /\b(estadio\s+ferro|en\s+ferro|\bferro\b)\b/i, country: 'AR' },
  { id: 'wembley_stadium', name: 'Wembley Stadium', entityType: 'venue', aliases: ['Wembley', 'Estadio Wembley'], regex: /\b(wembley(?:\s+stadium)?)\b/i, country: 'GB' },
  { id: 'teatro_alla_scala', name: 'Teatro alla Scala', entityType: 'venue', aliases: ['La Scala', 'La Scala de Milán', 'Teatro de La Scala'], regex: /\b(la\s+scala(?:\s+de\s+mil[aá]n)?|teatro\s+alla\s+scala)\b/i, country: 'IT' },
  { id: 'carnegie_hall', name: 'Carnegie Hall', entityType: 'venue', aliases: ['Carnegie Hall NY'], regex: /\b(carnegie\s+hall)\b/i, country: 'US' },
  { id: 'madison_square_garden', name: 'Madison Square Garden', entityType: 'venue', aliases: ['MSG', 'The Garden'], regex: /\b(madison\s+square\s+garden|\bmsg\b)\b/i, country: 'US' },
  { id: 'luna_park', name: 'Estadio Luna Park', entityType: 'venue', aliases: ['Luna Park'], regex: /\b(luna\s+park)\b/i, country: 'AR' },
  { id: 'teatro_gran_rex', name: 'Teatro Gran Rex', entityType: 'venue', aliases: ['Gran Rex'], regex: /\b(gran\s+rex|teatro\s+gran\s+rex)\b/i, country: 'AR' },
  { id: 'estadio_river_plate', name: 'Estadio River Plate', entityType: 'venue', aliases: ['El Monumental', 'Monumental de Nuñez', 'River Plate'], regex: /\b(monumental|river\s+plate|estadio\s+river)\b/i, country: 'AR' },
  { id: 'estadio_velez', name: 'Estadio Vélez Sarsfield', entityType: 'venue', aliases: ['Vélez', 'Velez', 'Estadio Velez', 'en Velez'], regex: /\b(estadio\s+v[eé]lez|en\s+v[eé]lez|\bv[eé]lez\b)\b/i, country: 'AR' },
  { id: 'estadio_huracan', name: 'Estadio Tomás Adolfo Ducó', entityType: 'venue', aliases: ['Huracán', 'Huracan', 'El Ducó', 'Estadio Huracán'], regex: /\b(estadio\s+hurac[aá]n|en\s+hurac[aá]n|\bhurac[aá]n\b|el\s+duc[oó])\b/i, country: 'AR' },
  { id: 'estadio_unico_la_plata', name: 'Estadio Único de La Plata', entityType: 'venue', aliases: ['Estadio Unico', 'Estadio Único', 'Único de La Plata'], regex: /\b(estadio\s+[uú]nico(?:\s+de\s+la\s+plata)?|[uú]nico\s+de\s+la\s+plata)\b/i, country: 'AR' },
  { id: 'olympia_paris', name: 'L\'Olympia', entityType: 'venue', aliases: ['Olympia de París', 'Olympia Paris'], regex: /\b(olympia(?:\s+de\s+par[ií]s)?)\b/i, country: 'FR' }
];

export const CANONICAL_RELATIONS: EntityRelation[] = [
  { from: 'bahiano', to: 'los_pericos', type: 'FORMER_MEMBER_OF', strength: 0.75 },
  { from: 'juanchi_baleiron', to: 'los_pericos', type: 'MEMBER_OF', strength: 0.70 },
  { from: 'indio_solari', to: 'los_redondos', type: 'FORMER_MEMBER_OF', strength: 0.85 },
  { from: 'skay_beilinson', to: 'los_redondos', type: 'FORMER_MEMBER_OF', strength: 0.80 },
  { from: 'gustavo_cerati', to: 'soda_stereo', type: 'FORMER_MEMBER_OF', strength: 0.85 },
  { from: 'vicentico', to: 'los_fabulosos_cadillacs', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'ricardo_mollo', to: 'divididos', type: 'MEMBER_OF', strength: 0.80 },
  { from: 'ricardo_mollo', to: 'sumo', type: 'FORMER_MEMBER_OF', strength: 0.60 },
  { from: 'diego_arnedo', to: 'divididos', type: 'MEMBER_OF', strength: 0.80 },
  { from: 'diego_arnedo', to: 'sumo', type: 'FORMER_MEMBER_OF', strength: 0.60 },
  { from: 'luca_prodan', to: 'sumo', type: 'FORMER_MEMBER_OF', strength: 0.85 },
  { from: 'chizzo_napoli', to: 'la_renga', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'adrian_dargelos', to: 'babasonicos', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'ciro_martinez', to: 'los_piojos', type: 'FORMER_MEMBER_OF', strength: 0.80 },
  { from: 'ciro_martinez', to: 'ciro_y_los_persas', type: 'MEMBER_OF', strength: 0.80 },
  { from: 'juanse', to: 'ratones_paranoicos', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'german_daffunchio', to: 'las_pelotas', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'german_daffunchio', to: 'sumo', type: 'FORMER_MEMBER_OF', strength: 0.60 },
  { from: 'walter_giardino', to: 'rata_blanca', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'adrian_barilari', to: 'rata_blanca', type: 'MEMBER_OF', strength: 0.75 },
  { from: 'cucho_parisi', to: 'los_autenticos_decadentes', type: 'MEMBER_OF', strength: 0.70 },
  { from: 'gustavo_cordera', to: 'bersuit_vergarabat', type: 'FORMER_MEMBER_OF', strength: 0.75 },
  { from: 'ciro_pertusi', to: 'attaque_77', type: 'FORMER_MEMBER_OF', strength: 0.75 },
  { from: 'javier_martinez_manal', to: 'manal', type: 'MEMBER_OF', strength: 0.75 }
];

export function checkEntityRelation(fromId: string, toId: string): EntityRelation | null {
  return CANONICAL_RELATIONS.find(r => r.from === fromId && r.to === toId) || null;
}

/**
 * Resolutor Jerárquico de Venues / Recintos:
 * PRIMARY: Entity Graph / Atlas place entities / aliases
 * SECONDARY: Static venue ontology fallback
 */
export function resolveVenueFromEntityGraph(text: string): { canonicalVenue: string; venueId: string; confidence: number; matchedText: string } | null {
  const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. PRIMARY: Búsqueda en el Entity Graph para entities de tipo 'venue'
  const venueEntities = CANONICAL_ENTITIES_V2.filter(e => e.entityType === 'venue');
  for (const v of venueEntities) {
    if (v.regex.test(text) || v.regex.test(norm)) {
      // Encontrar el fragmento que coincidió
      const match = text.match(v.regex) || norm.match(v.regex);
      return {
        canonicalVenue: v.name,
        venueId: v.id,
        confidence: 0.96,
        matchedText: match ? match[0] : v.name
      };
    }
    for (const alias of v.aliases) {
      const aliasNorm = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (norm.includes(aliasNorm)) {
        return {
          canonicalVenue: v.name,
          venueId: v.id,
          confidence: 0.92,
          matchedText: alias
        };
      }
    }
  }

  return null;
}

export function resolveEntityV2(title: string, description = '', creator = ''): ResolvedEntity {
  const text = `${title} ${description} ${creator}`.toLowerCase();
  const evidence: string[] = [];

  // V2-E2: Epithet Detection (e.g. "Nancy Ajram, Queen of Arab Pop")
  const epithetRegex = /,\s*(queen|king|star|frontman|legend)\s+of\s+[^,:]+/gi;
  let cleanTitleForEntity = title.replace(epithetRegex, '');

  // V2-E2: Explicit Entity Extraction (Candidate Pipeline)
  const explicitPatterns = [
    /^(?:[A-Z][A-Za-z0-9]+'s\s+)?([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})\s*(?:-|,|:|\(|\[)/,
    /^(?:[A-Z][A-Za-z0-9]+'s\s+)?([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})\s+(?:Plays|Talks|Reacts|Performs|Live|Reunites|Gets|Is|On|plays|talks|reacts|performs|live|reunites|gets|is|on)\b/,
    /^Interview With\s+([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})/, 
    /^(?:Watch\s+)?([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})\s+(?:React|react)\b/
  ];

  let explicitEntityMatch = null;
  for (const pat of explicitPatterns) {
    const m = cleanTitleForEntity.match(pat);
    if (m && m[1] && m[1].trim().length > 3 && !['The', 'A', 'An', 'My', 'Our', 'Watch', 'Watch React'].includes(m[1].trim())) {
      explicitEntityMatch = m[1].trim();
      break;
    }
  }
  
  if (explicitEntityMatch) {
    const lowExplicit = explicitEntityMatch.toLowerCase();
    const canonicalMatch = CANONICAL_ENTITIES_V2.find(e => 
      e.name.toLowerCase() === lowExplicit || e.aliases.some(a => a.toLowerCase() === lowExplicit)
    );
    if (canonicalMatch) {
       evidence.push(`explicit_title_entity_canonical:${canonicalMatch.id}`);
       return {
         id: canonicalMatch.id,
         name: canonicalMatch.name,
         entityType: canonicalMatch.entityType,
         confidence: 0.99,
         evidence,
         resolvedVia: 'exact_canonical'
       };
    } else {
       evidence.push(`explicit_title_entity_provisional:${lowExplicit}`);
       return {
         id: `prov_${lowExplicit.replace(/[^a-z0-9]+/g, '_')}`,
         name: explicitEntityMatch,
         entityType: 'solo_artist',
         confidence: 0.95,
         evidence,
         resolvedVia: 'exact_canonical'
       };
    }
  }

  const textWithoutEpithet = cleanTitleForEntity.toLowerCase();
  
  // NIVEL 0: Provisional Entities Cache (Open-world discovery)
  for (const [normName, prov] of provisionalEntities.entries()) {
    if (text.includes(normName)) {
      evidence.push(`provisional_entity_match:${prov.id}`);
      return {
        id: prov.id,
        name: prov.canonicalName,
        entityType: prov.type === 'BAND' ? 'band' : 'solo_artist',
        confidence: prov.identityConfidence, // Se usa la confianza de identidad para activar rutas
        evidence,
        resolvedVia: 'exact_canonical' // Tratado como canónico
      };
    }
  }

  // NIVEL 1 & 2: Exact Canonical & Exact Alias Match
  for (const ent of CANONICAL_ENTITIES_V2) {
    if (ent.regex.test(textWithoutEpithet)) {
      evidence.push(`canonical_match:${ent.id}`);
      return {
        id: ent.id,
        name: ent.name,
        entityType: ent.entityType,
        country: ent.country,
        confidence: 0.98,
        evidence,
        resolvedVia: 'exact_canonical'
      };
    }

    for (const alias of ent.aliases) {
      if (textWithoutEpithet.includes(alias.toLowerCase())) {
        evidence.push(`alias_match:${alias}`);
        return {
          id: ent.id,
          name: ent.name,
          entityType: ent.entityType,
          country: ent.country,
          confidence: 0.95,
          evidence,
          resolvedVia: 'exact_alias'
        };
      }
    }
  }

  // NIVEL 3: Sintaxis Limpia de Título "Artista - Canción / Obra" o "Obra - Artista"
  const cleanTitle = title
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\s*\(Official.*?\)/i, '')
    .replace(/\s*\(Live.*?\)/i, '')
    .replace(/\s*\(HD.*?\)/i, '')
    .replace(/\s*\(Audio.*?\)/i, '');

  const titleSplit = cleanTitle.match(/^([A-Z\u00C0-\u017E0-9\s&'.]{3,35})\s*[-–—:]\s*(.+)$/);
  if (titleSplit && titleSplit[1]) {
    const candidateA = titleSplit[1].trim();
    const candidateB = titleSplit[2].trim();
    const lowA = candidateA.toLowerCase();
    const lowB = candidateB.toLowerCase();

    // Comprobar si candidateA es entidad
    if (!/^(official|video|audio|full|live|recital|concierto|festival|documental|session|hd|4k|album|cancion|tema|obra|sinfonia|sonata|tango|rock|jazz|blues|folk|orquesta)\b/i.test(lowA)) {
      for (const ent of CANONICAL_ENTITIES_V2) {
        if (ent.name.toLowerCase().includes(lowA) || lowA.includes(ent.name.toLowerCase())) {
          evidence.push(`title_syntax_matched_canonical:${ent.id}`);
          return {
            id: ent.id,
            name: ent.name,
            entityType: ent.entityType,
            country: ent.country,
            confidence: 0.94,
            evidence,
            resolvedVia: 'title_syntax'
          };
        }
      }

      const words = candidateA.split(/\s+/);
      if (words.length >= 2 && words.length <= 4 && !/^(the|a|an|los|las|el|la|un|una)\b/i.test(candidateA)) {
        const generatedId = lowA.replace(/[^a-z0-9]+/g, '_');
        evidence.push(`clean_title_syntax:${candidateA}`);
        return {
          id: generatedId,
          name: candidateA,
          entityType: 'solo_artist',
          confidence: 0.88,
          evidence,
          resolvedVia: 'title_syntax'
        };
      }
    }

    // Comprobar si candidateB es entidad
    for (const ent of CANONICAL_ENTITIES_V2) {
      if (ent.name.toLowerCase().includes(lowB) || lowB.includes(ent.name.toLowerCase())) {
        evidence.push(`title_syntax_matched_canonical_b:${ent.id}`);
        return {
          id: ent.id,
          name: ent.name,
          entityType: ent.entityType,
          country: ent.country,
          confidence: 0.94,
          evidence,
          resolvedVia: 'title_syntax'
        };
      }
    }
  }

  // NIVEL 4: Creador del Contenido (si es canal de artista oficial / verificado)
  if (creator && creator.length >= 3 && creator.length <= 35) {
    const lowCreator = creator.toLowerCase();
    if (!/^(vevo|records|music|official|canal|tv|radio|archivo|sound|audio)\b/i.test(lowCreator)) {
      for (const ent of CANONICAL_ENTITIES_V2) {
        if (ent.name.toLowerCase().includes(lowCreator) || lowCreator.includes(ent.name.toLowerCase())) {
          evidence.push(`creator_corroboration:${ent.id}`);
          return {
            id: ent.id,
            name: ent.name,
            entityType: ent.entityType,
            country: ent.country,
            confidence: 0.90,
            evidence,
            resolvedVia: 'exact_alias'
          };
        }
      }
    }
  }

  // NIVEL 5: Fallback No Resuelto
  return {
    id: '',
    name: '',
    entityType: 'solo_artist',
    confidence: 0.30,
    evidence: ['no_high_confidence_match'],
    resolvedVia: 'unresolved'
  };
}
