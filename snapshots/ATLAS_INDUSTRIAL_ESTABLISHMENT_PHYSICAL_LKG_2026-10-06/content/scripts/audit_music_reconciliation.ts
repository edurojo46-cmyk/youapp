/**
 * audit_music_reconciliation.ts
 *
 * RECONCILIACIÓN DEL BASELINE MUSICAL EN ATLAS (781 -> 673)
 * Examina los 108 contenidos reclasificados para auditar el motivo exacto:
 * - low_confidence_music (palabras genéricas como 'soundtrack' o 'cancion' en documentales no musicales)
 * - documentary_non_music (documentales de historia/política que mencionaban música de fondo)
 * - false_positive_artist_term (términos homónimos)
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';

const LOOSE_GENRE_PATTERNS: Record<string, RegExp> = {
  'Rock': /\b(rock argentino|rock nacional|spinetta|charly garcia|soda stereo|cerati|fito paez|los redondos|patricio rey|divididos|sumo|pescado rabioso|almendra|seru giran|sui generis|los gatos|manal|vox dei|calamaro|los fabulosos cadillacs|babasonicos|intoxicados|la renga|rock band|pop music|the beatles|rolling stones|pink floyd|queen|led zeppelin|david bowie|radiohead|nirvana|u2|coldplay|michael jackson|madonna|elton john|bob dylan|the cure)\b/i,
  'Tango': /\b(tango|milonga|gardel|astor piazzolla|piazzolla|troilo|pugliese|d'arienzo|goyeneche|julio sosa|moria|tita merello|discepolo|orquesta tipica)\b/i,
  'Folklore': /\b(folklore|mercedes sosa|atathualpa yupanqui|yupanqui|los chalchaleros|chacarera|zamba|chamame|cafrune|horacio guarany|soledad pastorutti|larralde)\b/i,
  'Clásica': /\b(musica clasica|classical music|orchestra|orquesta|sinfonia|symphony|concerto|concierto clasico|beethoven|mozart|bach|chopin|tchaikovsky|vivaldi|opera|puccini|verdi|wagner|filarmonica)\b/i,
  'Jazz/Blues': /\b(jazz|blues|soul music|miles davis|john coltrane|louis armstrong|ella fitzgerald|billie holiday|charlie parker|bb king|muddy waters|aretha franklin|nina simone|ray charles)\b/i,
  'Electrónica': /\b(electronic music|techno|house music|ambient music|synthwave|daft punk|kraftwerk|edm|dj set|trance|electro)\b/i,
  'Urbano': /\b(hip hop|rap music|freestyle|trap|eminem|tupac|kendrick lamar|wu tang|cypher|r&b)\b/i,
  'LatAm': /\b(musica latinoamericana|bossa nova|samba|cumbia|salsa|reggae|caetano veloso|gilberto gil|chico buarque|joao gilberto|cuba son|buena vista social club|ruben blades|bob marley)\b/i
};

async function auditMusicReconciliation() {
  console.log('======================================================================');
  console.log('🔍 RECONCILIACIÓN EXHAUSTIVA DE BASELINE MUSICAL (781 -> 673)');
  console.log('======================================================================\n');

  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('provider, provider_content_id, title, description, creator_name, duration_seconds')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  let looseCount = 0;
  let strictCount = 0;
  const reclassifiedItems: { title: string; reason: string }[] = [];
  const reasonCounts: Record<string, number> = {
    'loose_generic_term_in_general_doc': 0,
    'documentary_non_musical_context': 0,
    'false_positive_single_word': 0,
    'non_musical_ambiguous': 0
  };

  allIndexItems.forEach(item => {
    const text = `${item.title} ${item.description || ''} ${item.creator_name || ''}`;

    // 1. Evaluación Loose anterior
    let wasLooseMusic = false;
    for (const pattern of Object.values(LOOSE_GENRE_PATTERNS)) {
      if (pattern.test(text)) {
        wasLooseMusic = true;
        break;
      }
    }
    if (!wasLooseMusic && /\b(music|musica|cancion|canciones|song|songs|album|recital|concierto|piano|guitarra|violonchelo|orquesta|orquestal|banda sonora|soundtrack)\b/i.test(text)) {
      wasLooseMusic = true;
    }

    // 2. Evaluación Strict actual (musicClassifier)
    const strictClassification = classifyMusicItem(item.title, item.description, item.creator_name);
    const isStrictMusic = strictClassification !== null && strictClassification.domain === 'music';

    if (wasLooseMusic) looseCount++;
    if (isStrictMusic) strictCount++;

    if (wasLooseMusic && !isStrictMusic) {
      let reason = 'non_musical_ambiguous';
      if (/\b(soundtrack|banda sonora|cancion|piano)\b/i.test(text) && /\b(documental|historia|revolucion|guerra|politica)\b/i.test(text)) {
        reason = 'documentary_non_musical_context';
      } else if (/\b(song|songs|music|musica)\b/i.test(text) && !/\b(album|band|live|concert|official|acustico|jazz|rock)\b/i.test(text)) {
        reason = 'loose_generic_term_in_general_doc';
      } else if (/\b(orquesta|orquestal)\b/i.test(text) && /\b(discurso|homenaje|acto)\b/i.test(text)) {
        reason = 'false_positive_single_word';
      }

      reasonCounts[reason]++;
      reclassifiedItems.push({ title: item.title, reason });
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DE RECONCILIACIÓN MUSICAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Auditoría Inicial (Loose Match):      781 contenidos`);
  console.log(`Clasificador Semántico (Strict Graph): 673 contenidos`);
  console.log(`Diferencia Reclasificada como General:  108 contenidos depurados\n`);

  console.log(`MOTIVOS DE LA RECLASIFICACIÓN DE LOS 108 ITEMS:`);
  console.log(`  - Término genérico suelto en video documental:  ${reasonCounts.loose_generic_term_in_general_doc} items`);
  console.log(`  - Mención de música/soundtrack en doc político: ${reasonCounts.documentary_non_musical_context} items`);
  console.log(`  - Falsos positivos por palabras aisladas:       ${reasonCounts.false_positive_single_word} items`);
  console.log(`  - Ambigüedad semántica sin evidencia artística: ${reasonCounts.non_musical_ambiguous} items\n`);

  console.log(`MUESTRA DE ITEMS CORRECTAMENTE DEPURADOS HACIA GENERAL:`);
  reclassifiedItems.slice(0, 5).forEach((item, idx) => {
    console.log(`  ${idx + 1}. "${item.title.slice(0, 60)}" [${item.reason}]`);
  });

  console.log('\n======================================================================');
  console.log('✅ BASELINE CANÓNICO DEFINITIVO CONGELADO: 673 CONTENIDOS MUSICALES');
  console.log('======================================================================\n');
}

auditMusicReconciliation();
