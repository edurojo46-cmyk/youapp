export type SupportedCountryCode = 'AR' | 'PE' | 'MX' | 'CO' | 'CL' | 'UY' | 'ES' | 'US';

export interface CountryProfile {
  code: SupportedCountryCode;
  name: string;
  flag: string;
  tag: string;
  regionGroup: 'latam' | 'es' | 'us';
  countryTerms: string[];
  newsKeywords: string[];
  musicKeywords: string[];
  sportsKeywords: string[];
  featuredNewspapers: Array<{ name: string; domain: string }>;
}

export const SUPPORTED_COUNTRIES: CountryProfile[] = [
  {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    tag: 'country-ar',
    regionGroup: 'latam',
    countryTerms: ['argentina', 'argentino', 'buenos aires', 'olga', 'luzu', 'blender', 'gelatina', 'vorterix', 'urbana play', 'nadie dice nada'],
    newsKeywords: ['tn', 'todo noticias', 'c5n', 'la nacion', 'ln+', 'a24', 'cronica', 'america tv', 'telefe', 'el trece', 'infobae', 'canal 26'],
    musicKeywords: ['soda stereo', 'charly garcia', 'spinetta', 'fito paez', 'patricio rey', 'los piojos', 'bizarrap', 'duki', 'maria becerra', 'nicki nicole', 'la konga', 'los palmeras', 'rock nacional'],
    sportsKeywords: ['tyc sports', 'espn argentina', 'boca', 'river', 'messi', 'seleccion argentina', 'afa', 'liga profesional'],
    featuredNewspapers: [
      { name: 'Infobae', domain: 'infobae.com' },
      { name: 'La Nación', domain: 'lanacion.com.ar' },
      { name: 'Clarín', domain: 'clarin.com' }
    ]
  },
  {
    code: 'PE',
    name: 'Perú',
    flag: '🇵🇪',
    tag: 'country-pe',
    regionGroup: 'latam',
    countryTerms: ['peru', 'peruano', 'peruana', 'lima', 'hablando huevadas', 'la lengua', 'carloncho', 'no somos tv', 'rpp', 'latina', 'exitosa'],
    newsKeywords: ['rpp', 'latina noticias', 'america noticias', 'exitosa', 'tvperu', 'canal n', 'panamericana', 'atv noticias', 'el comercio', 'la republica', 'willax'],
    musicKeywords: ['grupo 5', 'agua marina', 'armonia 10', 'gian marco', 'pedro suarez', 'eva ayllon', 'chabuca granda', 'libido', 'amen', 'mar de copas', 'cumbia peruana', 'rock peruano'],
    sportsKeywords: ['alianza lima', 'universitario', 'sporting cristal', 'liga 1', 'seleccion peruana', 'movistar deportes', 'golperu'],
    featuredNewspapers: [
      { name: 'El Comercio', domain: 'elcomercio.pe' },
      { name: 'La República', domain: 'larepublica.pe' },
      { name: 'RPP', domain: 'rpp.pe' }
    ]
  },
  {
    code: 'MX',
    name: 'México',
    flag: '🇲🇽',
    tag: 'country-mx',
    regionGroup: 'latam',
    countryTerms: ['mexico', 'mexicano', 'mexicana', 'cdmx', 'monterrey', 'la cotorrisa', 'franco escamilla', 'luisito comunica', 'roberto mtz', 'el mariana', 'rivers'],
    newsKeywords: ['nmas', 'n+', 'milenio', 'imagen noticias', 'azteca noticias', 'forotv', 'el universal', 'aristegui', 'latin us', 'adn40'],
    musicKeywords: ['luis miguel', 'juan gabriel', 'vicente fernandez', 'caifanes', 'cafe tacvba', 'zoe', 'mana', 'peso pluma', 'natanael cano', 'natalia lafourcade', 'los angeles azules'],
    sportsKeywords: ['tudn', 'espn mexico', 'liga mx', 'club america', 'chivas', 'cruz azul', 'seleccion mexicana'],
    featuredNewspapers: [
      { name: 'El Universal', domain: 'eluniversal.com.mx' },
      { name: 'Milenio', domain: 'milenio.com' },
      { name: 'Reforma', domain: 'reforma.com' }
    ]
  },
  {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    tag: 'country-co',
    regionGroup: 'latam',
    countryTerms: ['colombia', 'colombiano', 'colombiana', 'bogota', 'medellin', 'westcol', 'juanpis', 'caracol', 'rcn'],
    newsKeywords: ['noticias caracol', 'noticias rcn', 'semana', 'el tiempo', 'ntn24', 'citytv', 'blu radio', 'w radio', 'noticias uno'],
    musicKeywords: ['shakira', 'juanes', 'carlos vives', 'karol g', 'feid', 'j balvin', 'maluma', 'morat', 'aterciopelados', 'joe arroyo', 'vallenato'],
    sportsKeywords: ['win sports', 'seleccion colombia', 'atletico nacional', 'millonarios', 'america de cali', 'liga betplay'],
    featuredNewspapers: [
      { name: 'El Tiempo', domain: 'eltiempo.com' },
      { name: 'El Espectador', domain: 'elespectador.com' },
      { name: 'Semana', domain: 'semana.com' }
    ]
  },
  {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    tag: 'country-cl',
    regionGroup: 'latam',
    countryTerms: ['chile', 'chileno', 'chilena', 'santiago de chile', 'tomas va a morir', 'el sentido del humor', 'meganoticias', '24 horas'],
    newsKeywords: ['24 horas', 'meganoticias', 't13', 'chv noticias', 'biobio', 'cnn chile', 'tvn'],
    musicKeywords: ['los prisioneros', 'los bunkers', 'mon laferte', 'los tres', 'la ley', 'francisca valenzuela', 'gepe', 'violeta parra', 'victor jara'],
    sportsKeywords: ['tnt sports chile', 'colo colo', 'universidad de chile', 'universidad catolica', 'la roja'],
    featuredNewspapers: [
      { name: 'Emol', domain: 'emol.com' },
      { name: 'La Tercera', domain: 'latercera.com' },
      { name: 'BioBioChile', domain: 'biobiochile.cl' }
    ]
  },
  {
    code: 'UY',
    name: 'Uruguay',
    flag: '🇺🇾',
    tag: 'country-uy',
    regionGroup: 'latam',
    countryTerms: ['uruguay', 'uruguayo', 'uruguaya', 'montevideo', 'subrayado', 'telemundo', 'telenoche', 'aweno', 'daro kneubuhler'],
    newsKeywords: ['subrayado', 'telemundo', 'telenoche', 'canal 10', 'canal 4', 'canal 12', 'el pais uruguay', 'el observador', 'montevideo portal'],
    musicKeywords: ['el cuarteto de nos', 'no te va gustar', 'la vela puerca', 'jorge drexler', 'jaime roos', 'ruben rada', 'alfredo zitarrosa'],
    sportsKeywords: ['penarol', 'nacional', 'seleccion uruguaya', 'auf', 'tenfield'],
    featuredNewspapers: [
      { name: 'El País', domain: 'elpais.com.uy' },
      { name: 'El Observador', domain: 'elobservador.com.uy' },
      { name: 'Montevideo Portal', domain: 'montevideo.com.uy' }
    ]
  },
  {
    code: 'ES',
    name: 'España',
    flag: '🇪🇸',
    tag: 'country-es',
    regionGroup: 'es',
    countryTerms: ['espana', 'espanol', 'madrid', 'barcelona', 'ibai', 'auronplay', 'the wild project', 'jordi wild', 'elrubius', 'thegrefg', 'illojuan', 'la revuelta'],
    newsKeywords: ['rtve', 'antena 3', 'el pais', 'el mundo', 'la sexta', 'telecinco', 'abc', 'la vanguardia', 'euronews'],
    musicKeywords: ['rosalia', 'alejandro sanz', 'joaquin sabina', 'mecano', 'heroes del silencio', 'extremoduro', 'c tangana', 'aitana', 'estopa', 'pablo alboran'],
    sportsKeywords: ['real madrid', 'barcelona', 'laliga', 'marca', 'chiringuito', 'dazn espana'],
    featuredNewspapers: [
      { name: 'El País', domain: 'elpais.com' },
      { name: 'El Mundo', domain: 'elmundo.es' },
      { name: 'RTVE', domain: 'rtve.es' }
    ]
  },
  {
    code: 'US',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    tag: 'country-us',
    regionGroup: 'us',
    countryTerms: ['usa', 'united states', 'american', 'joe rogan', 'lex fridman', 'mrbeast', 'ishowspeed', 'kai cenat', 'jimmy fallon'],
    newsKeywords: ['cnn', 'nbc news', 'abc news', 'cbs news', 'bbc', 'fox news', 'reuters', 'associated press', 'univision', 'telemundo'],
    musicKeywords: ['taylor swift', 'billie eilish', 'bruno mars', 'the weeknd', 'beyonce', 'kendrick lamar', 'metallica', 'nirvana', 'queen'],
    sportsKeywords: ['espn', 'nba', 'nfl', 'mlb', 'mls', 'ufc'],
    featuredNewspapers: [
      { name: 'The New York Times', domain: 'nytimes.com' },
      { name: 'Reuters', domain: 'reuters.com' },
      { name: 'AP News', domain: 'apnews.com' }
    ]
  }
];

const COUNTRY_BY_CODE = new Map<SupportedCountryCode, CountryProfile>(
  SUPPORTED_COUNTRIES.map((c) => [c.code, c])
);

const STORAGE_KEY = 'youapp_user_country_v1';
export const COUNTRY_CHANGED_EVENT = 'youapp:country-changed';

export function detectCountryFromBrowser(): SupportedCountryCode {
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
    if (tz.includes('argentina') || tz.includes('buenos_aires') || tz.includes('cordoba') || tz.includes('mendoza')) {
      return 'AR';
    }
    if (tz.includes('lima')) return 'PE';
    if (tz.includes('mexico') || tz.includes('monterrey') || tz.includes('tijuana') || tz.includes('cancun') || tz.includes('guadalajara')) {
      return 'MX';
    }
    if (tz.includes('bogota')) return 'CO';
    if (tz.includes('santiago')) return 'CL';
    if (tz.includes('montevideo')) return 'UY';
    if (tz.includes('madrid') || tz.includes('canary')) return 'ES';
    if (tz.includes('new_york') || tz.includes('los_angeles') || tz.includes('chicago') || tz.includes('denver') || tz.includes('phoenix') || tz.includes('miami')) {
      return 'US';
    }

    const lang = (navigator.language || '').toLowerCase();
    if (lang.includes('-pe')) return 'PE';
    if (lang.includes('-ar')) return 'AR';
    if (lang.includes('-mx')) return 'MX';
    if (lang.includes('-co')) return 'CO';
    if (lang.includes('-cl')) return 'CL';
    if (lang.includes('-uy')) return 'UY';
    if (lang.includes('-es')) return 'ES';
    if (lang.startsWith('en-us') || lang === 'en') return 'US';
  } catch {
    // ignore Intl errors
  }
  return 'AR';
}

export function getSavedCountryPreference(): SupportedCountryCode | 'auto' {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = (localStorage.getItem(STORAGE_KEY) || '').trim().toUpperCase();
    if (raw && COUNTRY_BY_CODE.has(raw as SupportedCountryCode)) {
      return raw as SupportedCountryCode;
    }
  } catch {
    // ignore
  }
  return 'auto';
}

export function getActiveCountryCode(): SupportedCountryCode {
  const pref = getSavedCountryPreference();
  return pref === 'auto' ? detectCountryFromBrowser() : pref;
}

export function getActiveCountryProfile(): CountryProfile {
  return COUNTRY_BY_CODE.get(getActiveCountryCode()) || SUPPORTED_COUNTRIES[0];
}

export function setUserCountryPreference(choice: SupportedCountryCode | 'auto'): CountryProfile {
  if (typeof window !== 'undefined') {
    try {
      if (choice === 'auto') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, choice);
      }
    } catch {
      // ignore
    }
    const profile = getActiveCountryProfile();
    window.dispatchEvent(new CustomEvent(COUNTRY_CHANGED_EVENT, { detail: profile }));
    return profile;
  }
  return getActiveCountryProfile();
}
