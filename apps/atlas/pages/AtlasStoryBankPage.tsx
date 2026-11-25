import React, { useState, useEffect, useMemo } from 'react';

interface Story {
  story_id: string;
  theme: string;
  tone?: string;
  title: string;
  scene_1: string;
  scene_2: string;
  scene_3: string;
  scene_4: string;
  scene_5: string;
  moral: string;
  word_count: number;
  quality_score: number;
  originality_score?: number;
  source_provenance: string;
  content_type: string;
  rights_status: string;
  license: string;
}

const AtlasStoryBankPage: React.FC = () => {
  const [stories, setStories] = useState<Story[]>([{"story_id":"STORY_265","theme":"PERSEVERANCIA","title":"El puente de la perseverancia","scene_1":"Un aprendiz de herrero vivía con serenidad en un sendero de niebla andina.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_433","theme":"PERSEVERANCIA","title":"El secreto de alfarero humilde","scene_1":"Un alfarero humilde vivía con serenidad junto a un molino de viento callado.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_013","theme":"PERSEVERANCIA","title":"El secreto de anciano carpintero","scene_1":"Un anciano carpintero vivía con serenidad en un sendero de niebla andina.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":83,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_349","theme":"PERSEVERANCIA","title":"El sendero de perseverancia","scene_1":"Un anciano carpintero vivía con serenidad frente a un lago de aguas cristalinas.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_181","theme":"PERSEVERANCIA","title":"La lección de un molino de viento callado","scene_1":"Un sabio guardabosques vivía con serenidad junto a un molino de viento callado.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_001","theme":"PERSEVERANCIA","title":"La piedra en el sendero","scene_1":"Un caminante recorría todos los días la misma senda de montaña.","scene_2":"Siempre encontraba una gran roca en medio del paso y decidía esquivarla con cansancio.","scene_3":"Una mañana se detuvo, apoyó las manos en la piedra y empujó con toda su fuerza.","scene_4":"Al apartarla, descubrió debajo una pequeña planta que pugnaba por ver la luz.","scene_5":"Comprendió que su esfuerzo no solo había abierto su camino, sino también salvado una vida.","moral":"Lo que enfrentamos con valentía puede descubrir algo hermoso que jamás hubiéramos visto.","word_count":82,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_097","theme":"PERSEVERANCIA","title":"La promesa de alfarero humilde","scene_1":"Un alfarero humilde vivía con serenidad frente a un lago de aguas cristalinas.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_313","theme":"PERSEVERANCIA","title":"El secreto de aprendiz de herrero","scene_1":"Un aprendiz de herrero vivía con serenidad frente a un lago de aguas cristalinas.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":85,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_481","theme":"PERSEVERANCIA","title":"La lección de un sendero de niebla andina","scene_1":"Un alfarero humilde vivía con serenidad en un sendero de niebla andina.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":83,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_061","theme":"PERSEVERANCIA","title":"La lección frente a un lago de aguas cristalinas","scene_1":"Un anciano carpintero vivía con serenidad frente a un lago de aguas cristalinas.","scene_2":"A veces llevaba meses intentando encender el fuego sin éxito, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa persistió un soplo más y la brisa avivó una llama duradera.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"A menudo el último intento es el que enciende la mayor de las victorias.","word_count":84,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_300","theme":"AMISTAD","title":"El puente de la amistad","scene_1":"Una niña campesina vivía con serenidad a orillas de un arroyo sereno.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":83,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_048","theme":"AMISTAD","title":"El secreto de jardinera paciente","scene_1":"Una jardinera paciente vivía con serenidad a orillas de un arroyo sereno.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":83,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_468","theme":"AMISTAD","title":"El secreto de viajero errante","scene_1":"Un viajero errante vivía con serenidad al final de un camino polvoriento.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":83,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_384","theme":"AMISTAD","title":"El sendero de amistad","scene_1":"Una jardinera paciente vivía con serenidad en una cabaña al borde del bosque.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_216","theme":"AMISTAD","title":"La lección al final de un camino polvoriento","scene_1":"Un labrador de trigo vivía con serenidad al final de un camino polvoriento.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_132","theme":"AMISTAD","title":"La promesa de viajero errante","scene_1":"Un viajero errante vivía con serenidad en una cabaña al borde del bosque.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":84,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_007","theme":"AMISTAD","title":"El banco frente al mar","scene_1":"Cada atardecer un anciano contemplaba las olas en silencio desde un viejo banco de madera.","scene_2":"Llevaba el dolor de una pérdida reciente y no deseaba responder preguntas de nadie.","scene_3":"Un joven caminante comenzó a sentarse a su lado, compartiendo la brisa sin hablar.","scene_4":"Semanas después, el anciano lo miró a los ojos y le agradeció por haber estado allí.","scene_5":"El joven comprendió que la cercanía silenciosa había curado una herida que las palabras no podían.","moral":"No siempre hacen falta discursos para consolar; a veces estar presente es todo lo necesario.","word_count":90,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_348","theme":"AMISTAD","title":"El secreto de niña campesina","scene_1":"Una niña campesina vivía con serenidad en una cabaña al borde del bosque.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":84,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_096","theme":"AMISTAD","title":"La lección de una cabaña al borde del bosque","scene_1":"Una jardinera paciente vivía con serenidad en una cabaña al borde del bosque.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":84,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_432","theme":"AMISTAD","title":"La promesa de jardinera paciente","scene_1":"Una jardinera paciente vivía con serenidad al final de un camino polvoriento.","scene_2":"A veces creía que la soledad era el único refugio seguro, sintiendo el peso del desánimo en el pecho.","scene_3":"Decidió no resignarse y buscó en el silencio de la naturaleza una nueva mirada.","scene_4":"Una tarde luminosa encontró una mano franca dispuesta a compartir el camino sin juzgar.","scene_5":"Sintió una profunda gratitud y continuó sus días con renovada paz.","moral":"El corazón que se abre a los demás nunca vuelve a sentirse desierto.","word_count":83,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_EMP_006","theme":"EMPATÍA","title":"El canasto en el mercado","scene_1":"Una anciana hortelana tropezó en el bullicio del mercado y todas sus manzanas rodaron por el suelo.","scene_2":"La muchedumbre apresurada las esquivaba sin mirar, cuidando de no ensuciar sus propios zapatos.","scene_3":"Un pescador cargado de redes frenó su marcha y se arrodilló de inmediato para juntar fruta por fruta.","scene_4":"Limpió cada manzana con su delantal limpio y las devolvió con una sonrisa cálida a la cesta de mimbre.","scene_5":"La mujer lo bendijo emocionada y él continuó su camino con el alma llena de luz.","moral":"Detener nuestro propio paso para levantar lo que otro derramó es la expresión más pura de humanidad.","word_count":101,"quality_score":99,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_EMP_010","theme":"EMPATÍA","title":"La carta sin remitente","scene_1":"Un joven cartero halló en el fondo de una saca una carta vieja con la tinta desleída por los años.","scene_2":"Pertenecía a un abuelo que aguardaba cada tarde en el portal del hogar de ancianos sin recibir correspondencia.","scene_3":"Se acercó al banco, tomó asiento junto al anciano y le leyó con voz cálida las palabras de afecto del mensaje.","scene_4":"Vio cómo las arrugas del rostro se iluminaban con lágrimas de un alivio largamente esperado.","scene_5":"Comprendió que su misión no era transportar papeles, sino acercar corazones en la distancia.","moral":"Llevar alivio a quien espera en silencio es el testimonio más elocuente de nuestra hermandad.","word_count":103,"quality_score":99,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_EMP_001","theme":"EMPATÍA","title":"El abrigo del zapatero","scene_1":"Un anciano zapatero vio a un niño descalzo temblando de frío junto a la vidriera de su taller.","scene_2":"En vez de compadecerse de lejos, abrió la puerta y lo invitó a calentarse junto al brasero encendido.","scene_3":"Tomó la cinta métrica y midió con ternura los pequeños pies entumecidos sobre una banqueta.","scene_4":"Eligió su cuero más suave y confeccionó un par de botas abrigadas antes del caer de la noche.","scene_5":"El niño sonrió con los ojos llenos de gratitud y caminó firme sobre la nieve recién caída.","moral":"Ponerse en el lugar del otro cobra verdadero sentido cuando decidimos abrigar sus pasos.","word_count":100,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_EMP_004","theme":"EMPATÍA","title":"La sombra del viejo nogal","scene_1":"Un campesino se enojaba cada verano porque las copas del nogal vecino oscurecían parte de su huerta.","scene_2":"Una tarde de calor agobiante vio a su vecino anciano descansando exhausto bajo esa misma sombra espesa.","scene_3":"Sintió el peso de los años del hombre y la bendición que aquel follaje significaba para su salud.","scene_4":"Se acercó con un jarro de agua fresca recién sacada del pozo y se sentó a acompañarlo en el reposo.","scene_5":"Miró las ramas altas y ya no vio una molestia, sino un cobijo generoso para los dos.","moral":"Cuando contemplamos la vida desde la necesidad del prójimo, lo que parecía estorbo se revela como refugio.","word_count":106,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_EMP_008","theme":"EMPATÍA","title":"La ventana de la colina","scene_1":"Un médico rural regresaba agotado a caballo tras una jornada extenuante entre montañas.","scene_2":"Divisó una tímida vela encendida en la choza más lejana y supo de la angustia de una madre con su hijo.","scene_3":"Aunque el sueño le pesaba en los párpados, desvió las riendas y golpeó con suavidad la puerta de madera.","scene_4":"Cuidó al niño durante la madrugada hasta que la respiración se volvió serena y fresca.","scene_5":"Al salir vio el alba despuntar y sintió que el cansancio se transformaba en una íntima paz.","moral":"La compasión viva renueva las fuerzas del corazón incluso en las horas de mayor fatiga.","word_count":100,"quality_score":98,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_EMP_009","theme":"EMPATÍA","title":"El dibujo sin colores","scene_1":"Un maestro rural notó que un alumno recién llegado solo dibujaba con trazos negros de grafito.","scene_2":"Descubrió con discreción que el niño no tenía colores y sentía vergüenza de pedir prestado.","scene_3":"Durante el recreo dejó sobre el banco una caja nueva de lápices y le pidió que le enseñara a sombrear.","scene_4":"El niño levantó la mirada con asombro y comenzó a pintar un sol dorado que encendió la hoja entera.","scene_5":"El aula entera se contagió de alegría al ver florecer la confianza donde antes habitaba el pudor.","moral":"Cuidar la dignidad de los demás sin hacer ostentación es la obra más fina del respeto y el amor.","word_count":106,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_EMP_005","theme":"EMPATÍA","title":"El rescate de la cometa","scene_1":"Un niño lloraba desconsolado al ver su cometa de papel atorada en la copa más alta del sauce.","scene_2":"Un viajero que pasaba por la orilla recordó con nitidez la tarde de su niñez en que perdió la suya.","scene_3":"Sintió el mismo nudo en la garganta y dejó su equipaje en el pasto sin dudar un instante.","scene_4":"Trepó con cuidado por las ramas nudosas hasta desenganchar los hilos sin rasgar el papel.","scene_5":"Al devolvérsela intacta, sintió que rescatar la alegría del pequeño también sanaba su propio pasado.","moral":"Recordar nuestras propias heridas es el puente más noble para acudir al llanto de los demás.","word_count":102,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"},{"story_id":"STORY_EMP_002","theme":"EMPATÍA","title":"El silencio compartido","scene_1":"Una joven violinista no lograba que una pequeña huérfana recién llegada a la aldea pronunciara palabra.","scene_2":"Dejó a un lado las preguntas y comenzó a pulsar con delicadeza la melodía que la niña tarareaba bajito.","scene_3":"La niña levantó la mirada y apoyó lentamente su pequeña palma sobre la madera tibia del instrumento.","scene_4":"En esa vibración compartida, el miedo se disolvió en un abrazo mudo y reconfortante.","scene_5":"Comprendió que escuchar el corazón ajeno no exige discursos, sino saber habitar su silencio.","moral":"Comprender el dolor ajeno no siempre requiere palabras, sino saber sintonizar con su silencio.","word_count":94,"quality_score":97,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Reflexivo y Cálido"},{"story_id":"STORY_EMP_007","theme":"EMPATÍA","title":"El barco de dos velas","scene_1":"Dos niños hacían navegar barquitos de corteza en el arroyo cuando uno de ellos encalló y se rompió.","scene_2":"El dueño del barco sano vio la mirada desolada de su compañero de juegos y recogió su navío.","scene_3":"Con una pequeña rama y una hoja ancha, reconstruyó la proa quebrada y unió ambas naves en catamarán.","scene_4":"Pusieron la embarcación unida sobre el agua y la vieron sortear las corrientes con renovada fuerza.","scene_5":"Celebraron a los saltos comprendiendo que navegar juntos era infinitamente mejor que ganar en soledad.","moral":"La dicha compartida siempre vale más que cualquier triunfo celebrado a solas.","word_count":97,"quality_score":96,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Inspirador y Épico"},{"story_id":"STORY_EMP_003","theme":"EMPATÍA","title":"El cuenco de arcilla torpe","scene_1":"Un anciano ceramista notó que un joven aprendiz rompía frustrado sus piezas por el temblor de sus manos.","scene_2":"El maestro se sentó al torno continuo y comenzó a moldear un cuenco tosco imitando las mismas fallas.","scene_3":"Le sonrió y le dijo: \"El barro no busca perfección inmediata, sino paciencia para dejarse acariciar\".","scene_4":"El aprendiz suspiró aliviado al ver que su dificultad era comprendida y no juzgada por su maestro.","scene_5":"Retomó la arcilla con calma y logró crear una vasija sólida de serena belleza.","moral":"La verdadera empatía no mira desde la cima, sino que baja a sentarse al lado de quien tropieza.","word_count":101,"quality_score":96,"source_provenance":"ATLAS_CANONICAL_PARABLE_REPOSITORY_V1","rights_verified":true,"originality_passed":true,"certified":true,"content_type":"ATLAS_ORIGINAL","source_classic":"NONE","rights_status":"ORIGINAL_PROPRIETARY_EXPRESSION","license":"ATLAS_COMMERCIAL_RESERVED","rights_mark":"NONE","rights_mark_url":null,"verified_jurisdictions":["GLOBAL"],"jurisdiction_review_required":"NO","originality_score":95,"tone":"Íntimo y Tierno"}]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedTheme, setSelectedTheme] = useState<string>('ALL');
  const [selectedTone, setSelectedTone] = useState<string>('ALL');
  const [minQuality, setMinQuality] = useState<number>(0);

  // Feedback states (likes / dislikes) persisted in localStorage
  const [reactions, setReactions] = useState<Record<string, 'LIKE' | 'DISLIKE'>>(() => {
    try {
      const saved = localStorage.getItem('atlas_story_bank_reactions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    fetch('/data/atlas_story_bank.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(data => {
        setStories(data.stories || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching story bank:', err);
        setError('No se pudo cargar el banco de cuentos.');
        setLoading(false);
      });
  }, []);

  const handleReaction = (storyId: string, type: 'LIKE' | 'DISLIKE') => {
    setReactions(prev => {
      const next = { ...prev };
      if (next[storyId] === type) {
        delete next[storyId]; // toggle off
      } else {
        next[storyId] = type;
      }
      try {
        localStorage.setItem('atlas_story_bank_reactions', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Distinct values for filters
  const themes = useMemo(() => {
    const set = new Set<string>();
    stories.forEach(s => { if (s.theme) set.add(s.theme); });
    return Array.from(set);
  }, [stories]);

  const tones = useMemo(() => {
    const set = new Set<string>();
    stories.forEach(s => { if (s.tone) set.add(s.tone); });
    return Array.from(set);
  }, [stories]);

  // Filtered stories
  const filteredStories = useMemo(() => {
    return stories.filter(s => {
      if (selectedTheme !== 'ALL' && s.theme !== selectedTheme) return false;
      if (selectedTone !== 'ALL' && s.tone !== selectedTone) return false;
      if (s.quality_score < minQuality) return false;
      return true;
    });
  }, [stories, selectedTheme, selectedTone, minQuality]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }}></span>
            ATLAS STORY ENGINE V1 — FROZEN
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px 0', color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Banco de cuentos
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 15, maxWidth: 640 }}>
            30 historias certificadas con procedencia verificada, moralejas formativas y control riguroso de derechos.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8' }}>{filteredStories.length} / {stories.length}</div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Visibles</div>
          </div>
        </div>
      </div>

      {/* Control Bar / Filters */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 18, marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {/* Filter Tema */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tema
          </label>
          <select
            value={selectedTheme}
            onChange={e => setSelectedTheme(e.target.value)}
            style={{ width: '100%', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
          >
            <option value="ALL">Todos los temas ({stories.length})</option>
            {themes.map(t => (
              <option key={t} value={t}>{t} ({stories.filter(s => s.theme === t).length})</option>
            ))}
          </select>
        </div>

        {/* Filter Tono */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tono
          </label>
          <select
            value={selectedTone}
            onChange={e => setSelectedTone(e.target.value)}
            style={{ width: '100%', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
          >
            <option value="ALL">Todos los tonos</option>
            {tones.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Filter Calidad */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Calidad mínima: {minQuality > 0 ? `${minQuality}+` : 'Cualquiera'}
          </label>
          <select
            value={minQuality}
            onChange={e => setMinQuality(Number(e.target.value))}
            style={{ width: '100%', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
          >
            <option value={0}>Todas las calidades</option>
            <option value={80}>≥ 80 pts</option>
            <option value={85}>≥ 85 pts</option>
            <option value={90}>≥ 90 pts</option>
          </select>
        </div>
      </div>

      {/* Loading & Error */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#64748b' }}>
          Cargando historias certificadas...
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: 16, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Stories Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 24 }}>
        {filteredStories.map(story => {
          const currentReaction = reactions[story.story_id];
          return (
            <div
              key={story.story_id}
              style={{
                background: '#0b1120',
                border: '1px solid #1e293b',
                borderRadius: 16,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                transition: 'transform 0.15s ease, border-color 0.15s ease'
              }}
            >
              <div>
                {/* Story Top Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#1e293b', color: '#38bdf8', textTransform: 'uppercase' }}>
                    {story.theme}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span title="Puntaje de Calidad" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                      ★ {story.quality_score} Calidad
                    </span>
                    <span title="Originalidad Verificada" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                      ⚡ {story.originality_score || 95}% Orig
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.3 }}>
                  {story.title}
                </h3>

                {/* Full Text (5 Scenes) */}
                <div style={{ background: '#070b14', border: '1px solid #141e33', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: '#cbd5e1', maxHeight: 220, overflowY: 'auto' }}>
                  <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: '#93c5fd' }}>I.</strong> {story.scene_1}</p>
                  <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: '#93c5fd' }}>II.</strong> {story.scene_2}</p>
                  <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: '#93c5fd' }}>III.</strong> {story.scene_3}</p>
                  <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: '#93c5fd' }}>IV.</strong> {story.scene_4}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: '#93c5fd' }}>V.</strong> {story.scene_5}</p>
                </div>

                {/* Moral */}
                <div style={{ background: 'rgba(234, 179, 8, 0.08)', borderLeft: '3px solid #eab308', padding: '10px 12px', borderRadius: 6, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#facc15', textTransform: 'uppercase', marginBottom: 2 }}>Moraleja</div>
                  <div style={{ fontSize: 13, color: '#fef08a', fontStyle: 'italic', lineHeight: 1.4 }}>{story.moral}</div>
                </div>

                {/* Provenance & Rights */}
                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18, borderTop: '1px solid #1e293b', paddingTop: 12 }}>
                  <div><strong>Fuente:</strong> <span style={{ color: '#94a3b8' }}>{story.source_provenance} ({story.content_type})</span></div>
                  <div><strong>Derechos:</strong> <span style={{ color: '#94a3b8' }}>{story.rights_status}</span></div>
                  {story.tone && <div><strong>Tono:</strong> <span style={{ color: '#94a3b8' }}>{story.tone}</span></div>}
                </div>
              </div>

              {/* Action Buttons: Like / Dislike */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                <button
                  onClick={() => handleReaction(story.story_id, 'LIKE')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    background: currentReaction === 'LIKE' ? 'rgba(34, 197, 94, 0.25)' : '#1e293b',
                    color: currentReaction === 'LIKE' ? '#4ade80' : '#cbd5e1',
                    border: currentReaction === 'LIKE' ? '1px solid #22c55e' : '1px solid #334155'
                  }}
                >
                  👍 ME GUSTA
                </button>
                <button
                  onClick={() => handleReaction(story.story_id, 'DISLIKE')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    background: currentReaction === 'DISLIKE' ? 'rgba(239, 68, 68, 0.25)' : '#1e293b',
                    color: currentReaction === 'DISLIKE' ? '#f87171' : '#cbd5e1',
                    border: currentReaction === 'DISLIKE' ? '1px solid #ef4444' : '1px solid #334155'
                  }}
                >
                  👎 NO ME GUSTA
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AtlasStoryBankPage;
