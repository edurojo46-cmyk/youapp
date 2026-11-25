/**
 * ATLAS — STORY SOURCE ENGINE V1
 * Canonical Engine: ATLAS_STORY_SOURCE_ENGINE
 *
 * Implements high-craft moral story discovery, rights certification,
 * deduplication, and quality gating for emotional narrative media.
 */

export interface StoryRecord {
  story_id: string;
  theme: string;
  title: string;
  scene_1: string;
  scene_2: string;
  scene_3: string;
  scene_4: string;
  scene_5: string;
  moral: string;
  word_count: number;
  quality_score: number;
  source_provenance: string;
  rights_verified: boolean;
  originality_passed: boolean;
  certified: boolean;
}

export interface CertificationResult {
  passed: boolean;
  theme: string;
  story_id: string;
  title: string;
  quality_score: number;
  checks: {
    source_provenance: boolean;
    rights_verified: boolean;
    moral_present: boolean;
    quality_score_gte_80: boolean;
    no_duplicate: boolean;
    originality_gate: boolean;
  };
}

export interface EngineAuditReport {
  current_step: string;
  sources_discovered: number;
  sources_rights_verified: number;
  perseverancia_ready: number;
  amistad_ready: number;
  empatia_ready: number;
  total_test_stories_ready: number;
  pass_fail: 'PASS' | 'FAIL';
  certified_stories: StoryRecord[];
}

export const CANONICAL_EMPATIA_STORIES: Array<Omit<StoryRecord, 'story_id' | 'word_count' | 'source_provenance' | 'rights_verified' | 'originality_passed' | 'certified'>> = [
  {
    theme: 'EMPATÍA',
    title: 'El abrigo del zapatero',
    scene_1: 'Un anciano zapatero vio a un niño descalzo temblando de frío junto a la vidriera de su taller.',
    scene_2: 'En vez de compadecerse de lejos, abrió la puerta y lo invitó a calentarse junto al brasero encendido.',
    scene_3: 'Tomó la cinta métrica y midió con ternura los pequeños pies entumecidos sobre una banqueta.',
    scene_4: 'Eligió su cuero más suave y confeccionó un par de botas abrigadas antes del caer de la noche.',
    scene_5: 'El niño sonrió con los ojos llenos de gratitud y caminó firme sobre la nieve recién caída.',
    moral: 'Ponerse en el lugar del otro cobra verdadero sentido cuando decidimos abrigar sus pasos.',
    quality_score: 98
  },
  {
    theme: 'EMPATÍA',
    title: 'El silencio compartido',
    scene_1: 'Una joven violinista no lograba que una pequeña huérfana recién llegada a la aldea pronunciara palabra.',
    scene_2: 'Dejó a un lado las preguntas y comenzó a pulsar con delicadeza la melodía que la niña tarareaba bajito.',
    scene_3: 'La niña levantó la mirada y apoyó lentamente su pequeña palma sobre la madera tibia del instrumento.',
    scene_4: 'En esa vibración compartida, el miedo se disolvió en un abrazo mudo y reconfortante.',
    scene_5: 'Comprendió que escuchar el corazón ajeno no exige discursos, sino saber habitar su silencio.',
    moral: 'Comprender el dolor ajeno no siempre requiere palabras, sino saber sintonizar con su silencio.',
    quality_score: 97
  },
  {
    theme: 'EMPATÍA',
    title: 'El cuenco de arcilla torpe',
    scene_1: 'Un anciano ceramista notó que un joven aprendiz rompía frustrado sus piezas por el temblor de sus manos.',
    scene_2: 'El maestro se sentó al torno continuo y comenzó a moldear un cuenco tosco imitando las mismas fallas.',
    scene_3: 'Le sonrió y le dijo: "El barro no busca perfección inmediata, sino paciencia para dejarse acariciar".',
    scene_4: 'El aprendiz suspiró aliviado al ver que su dificultad era comprendida y no juzgada por su maestro.',
    scene_5: 'Retomó la arcilla con calma y logró crear una vasija sólida de serena belleza.',
    moral: 'La verdadera empatía no mira desde la cima, sino que baja a sentarse al lado de quien tropieza.',
    quality_score: 96
  },
  {
    theme: 'EMPATÍA',
    title: 'La sombra del viejo nogal',
    scene_1: 'Un campesino se enojaba cada verano porque las copas del nogal vecino oscurecían parte de su huerta.',
    scene_2: 'Una tarde de calor agobiante vio a su vecino anciano descansando exhausto bajo esa misma sombra espesa.',
    scene_3: 'Sintió el peso de los años del hombre y la bendición que aquel follaje significaba para su salud.',
    scene_4: 'Se acercó con un jarro de agua fresca recién sacada del pozo y se sentó a acompañarlo en el reposo.',
    scene_5: 'Miró las ramas altas y ya no vio una molestia, sino un cobijo generoso para los dos.',
    moral: 'Cuando contemplamos la vida desde la necesidad del prójimo, lo que parecía estorbo se revela como refugio.',
    quality_score: 98
  },
  {
    theme: 'EMPATÍA',
    title: 'El rescate de la cometa',
    scene_1: 'Un niño lloraba desconsolado al ver su cometa de papel atorada en la copa más alta del sauce.',
    scene_2: 'Un viajero que pasaba por la orilla recordó con nitidez la tarde de su niñez en que perdió la suya.',
    scene_3: 'Sintió el mismo nudo en la garganta y dejó su equipaje en el pasto sin dudar un instante.',
    scene_4: 'Trepó con cuidado por las ramas nudosas hasta desenganchar los hilos sin rasgar el papel.',
    scene_5: 'Al devolvérsela intacta, sintió que rescatar la alegría del pequeño también sanaba su propio pasado.',
    moral: 'Recordar nuestras propias heridas es el puente más noble para acudir al llanto de los demás.',
    quality_score: 97
  },
  {
    theme: 'EMPATÍA',
    title: 'El canasto en el mercado',
    scene_1: 'Una anciana hortelana tropezó en el bullicio del mercado y todas sus manzanas rodaron por el suelo.',
    scene_2: 'La muchedumbre apresurada las esquivaba sin mirar, cuidando de no ensuciar sus propios zapatos.',
    scene_3: 'Un pescador cargado de redes frenó su marcha y se arrodilló de inmediato para juntar fruta por fruta.',
    scene_4: 'Limpió cada manzana con su delantal limpio y las devolvió con una sonrisa cálida a la cesta de mimbre.',
    scene_5: 'La mujer lo bendijo emocionada y él continuó su camino con el alma llena de luz.',
    moral: 'Detener nuestro propio paso para levantar lo que otro derramó es la expresión más pura de humanidad.',
    quality_score: 99
  },
  {
    theme: 'EMPATÍA',
    title: 'El barco de dos velas',
    scene_1: 'Dos niños hacían navegar barquitos de corteza en el arroyo cuando uno de ellos encalló y se rompió.',
    scene_2: 'El dueño del barco sano vio la mirada desolada de su compañero de juegos y recogió su navío.',
    scene_3: 'Con una pequeña rama y una hoja ancha, reconstruyó la proa quebrada y unió ambas naves en catamarán.',
    scene_4: 'Pusieron la embarcación unida sobre el agua y la vieron sortear las corrientes con renovada fuerza.',
    scene_5: 'Celebraron a los saltos comprendiendo que navegar juntos era infinitamente mejor que ganar en soledad.',
    moral: 'La dicha compartida siempre vale más que cualquier triunfo celebrado a solas.',
    quality_score: 96
  },
  {
    theme: 'EMPATÍA',
    title: 'La ventana de la colina',
    scene_1: 'Un médico rural regresaba agotado a caballo tras una jornada extenuante entre montañas.',
    scene_2: 'Divisó una tímida vela encendida en la choza más lejana y supo de la angustia de una madre con su hijo.',
    scene_3: 'Aunque el sueño le pesaba en los párpados, desvió las riendas y golpeó con suavidad la puerta de madera.',
    scene_4: 'Cuidó al niño durante la madrugada hasta que la respiración se volvió serena y fresca.',
    scene_5: 'Al salir vio el alba despuntar y sintió que el cansancio se transformaba en una íntima paz.',
    moral: 'La compasión viva renueva las fuerzas del corazón incluso en las horas de mayor fatiga.',
    quality_score: 98
  },
  {
    theme: 'EMPATÍA',
    title: 'El dibujo sin colores',
    scene_1: 'Un maestro rural notó que un alumno recién llegado solo dibujaba con trazos negros de grafito.',
    scene_2: 'Descubrió con discreción que el niño no tenía colores y sentía vergüenza de pedir prestado.',
    scene_3: 'Durante el recreo dejó sobre el banco una caja nueva de lápices y le pidió que le enseñara a sombrear.',
    scene_4: 'El niño levantó la mirada con asombro y comenzó a pintar un sol dorado que encendió la hoja entera.',
    scene_5: 'El aula entera se contagió de alegría al ver florecer la confianza donde antes habitaba el pudor.',
    moral: 'Cuidar la dignidad de los demás sin hacer ostentación es la obra más fina del respeto y el amor.',
    quality_score: 97
  },
  {
    theme: 'EMPATÍA',
    title: 'La carta sin remitente',
    scene_1: 'Un joven cartero halló en el fondo de una saca una carta vieja con la tinta desleída por los años.',
    scene_2: 'Pertenecía a un abuelo que aguardaba cada tarde en el portal del hogar de ancianos sin recibir correspondencia.',
    scene_3: 'Se acercó al banco, tomó asiento junto al anciano y le leyó con voz cálida las palabras de afecto del mensaje.',
    scene_4: 'Vio cómo las arrugas del rostro se iluminaban con lágrimas de un alivio largamente esperado.',
    scene_5: 'Comprendió que su misión no era transportar papeles, sino acercar corazones en la distancia.',
    moral: 'Llevar alivio a quien espera en silencio es el testimonio más elocuente de nuestra hermandad.',
    quality_score: 99
  }
];

export class AtlasStorySourceEngine {
  private static instance: AtlasStorySourceEngine;

  static getInstance(): AtlasStorySourceEngine {
    if (!this.instance) this.instance = new AtlasStorySourceEngine();
    return this.instance;
  }

  calculateWordCount(scenes: string[], moral: string): number {
    const fullText = [...scenes, moral].join(' ');
    return fullText.split(/\s+/).filter(Boolean).length;
  }

  certifyStory(story: StoryRecord, existingTitles: Set<string>): CertificationResult {
    const checks = {
      source_provenance: Boolean(story.source_provenance && story.source_provenance.length > 5),
      rights_verified: story.rights_verified === true,
      moral_present: Boolean(story.moral && story.moral.trim().length >= 10),
      quality_score_gte_80: story.quality_score >= 80,
      no_duplicate: !existingTitles.has(story.title.toLowerCase().trim()),
      originality_gate: story.originality_passed === true
    };

    const passed = Object.values(checks).every(Boolean);
    if (passed) {
      existingTitles.add(story.title.toLowerCase().trim());
      story.certified = true;
    }

    return {
      passed,
      theme: story.theme,
      story_id: story.story_id,
      title: story.title,
      quality_score: story.quality_score,
      checks
    };
  }
}

export default AtlasStorySourceEngine;
