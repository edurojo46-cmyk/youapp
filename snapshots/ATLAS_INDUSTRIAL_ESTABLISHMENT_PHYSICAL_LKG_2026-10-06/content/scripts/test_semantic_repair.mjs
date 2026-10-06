function testParser(rawText) {
  const lower = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clean = lower.replace(/^(construi|construir|arma|armar|crea|crear|genera|generar|hace|hacer|encontra|encontrar|busca|buscar|obtene|obtener|releva|relevar|identifica|identificar)\s+(una\s+base\s+de|un\s+listado\s+de|una\s+lista\s+de|un\s+relevamiento\s+de|un\s+registro\s+de|datos\s+de|informacion\s+de)?/i, '').trim();
  const isCaseQuery = /^(casos?|ejemplos?|situaciones?|antecedentes?)\s+(en\s+(los?|las?)\s+que|donde)\b/i.test(clean);

  let headPhrase = clean;
  let predicatePhrase = '';
  if (isCaseQuery) {
    headPhrase = 'casos';
    predicatePhrase = clean.replace(/^(casos?|ejemplos?|situaciones?|antecedentes?)\s+(en\s+(los?|las?)\s+que|donde)\s+/i, '').trim();
  } else {
    const connectorMatch = clean.match(/\b(que\s+|donde\s+|cuy[ao]s?\s+|relacionad[ao]s?\s+con\s+|para\s+desarrollar\s+|despues\s+de\s+|con\s+infraestructura\s+de\s+|utilizad[ao]s?\s+por\s+|entre\s+|desarrollad[ao]s?\s+en\s+)/i);
    if (connectorMatch) {
      headPhrase = clean.slice(0, connectorMatch.index).trim();
      predicatePhrase = clean.slice(connectorMatch.index).trim();
    }
  }

  // Remove leading numbers from headPhrase (e.g. '25000 empresas' -> 'empresas')
  headPhrase = headPhrase.replace(/^\d+[\d\.]*\s+/, '').trim();

  let unit = 'COMPOSITE';
  if (isCaseQuery) {
    unit = 'RELATIONSHIP';
  } else if (/\b(emails?|correos?|contactos?|telefonos?)\b/i.test(headPhrase)) {
    unit = 'CONTACT';
  } else if (/\b(software|sistemas?|plataformas?|aplicaciones?|apps?)\b/i.test(headPhrase)) {
    unit = 'SOFTWARE';
  } else if (/\b(tecnologias?|patentes?|invenciones?|modelos? de utilidad)\b/i.test(headPhrase)) {
    unit = 'TECHNOLOGY';
  } else if (/\b(proyectos?|obras?|iniciativas?|planes?|licitaciones?)\b/i.test(headPhrase)) {
    unit = 'PROJECT';
  } else if (/\b(convenios?|acuerdos?|tratados?|contratos?|alianzas?|vinculos?)\b/i.test(headPhrase)) {
    unit = 'RELATIONSHIP';
  } else if (/\b(investigadores?|investigadoras?|cientificos?|cientificas?|expertos?|profesionales?|autores?|docentes?|medicos?|abogados?)\b/i.test(headPhrase)) {
    unit = 'PERSON';
  } else if (/\b(empresas?|companias?|companies|proveedores?|proveedoras?|fabricantes?|productoras?|productores?|pymes?|industrias?|corporaciones?|negocios?)\b/i.test(headPhrase)) {
    unit = 'COMPANY';
  } else if (/\b(cooperativas?|hospitales?|museos?|escuelas?|universidades?|organizaciones?|organismos?|instituciones?|fundaciones?|asociaciones?|camaras?|colegios?|consejos?|entidades?)\b/i.test(headPhrase)) {
    unit = 'ORGANIZATION';
  } else if (/\b(centros?|sedes?|establecimientos?|lugares?|sitios?|parques?)\b/i.test(headPhrase)) {
    unit = 'LOCATION';
  } else if (/\b(alertas?|eventos?|conferencias?|congresos?|jornadas?|cumbres?|incidentes?)\b/i.test(headPhrase)) {
    unit = 'EVENT';
  } else if (/\b(servicios?|prestaciones?|tramites?)\b/i.test(headPhrase)) {
    unit = 'SERVICE';
  } else if (/\b(productos?|bienes?|insumos?|mercancias?)\b/i.test(headPhrase)) {
    unit = 'PRODUCT';
  } else if (/\b(datasets?|bases? de datos|catalogos? de datos)\b/i.test(headPhrase)) {
    unit = 'DATASET';
  } else if (/\b(documentos?|decretos?|resoluciones?|ordenanzas?)\b/i.test(headPhrase)) {
    unit = 'DOCUMENT';
  }

  return { unit, headPhrase };
}

const allMissions = [
  'Construí una base de 25.000 empresas argentinas que exporten alimentos.',
  'Encontrá proyectos municipales argentinos relacionados con reciclaje.',
  'Construí una base de investigadores argentinos que trabajen en inteligencia artificial.',
  'Encontrá software utilizado por hospitales públicos argentinos.',
  'Construí una base de proveedores industriales de maquinaria agrícola.',
  'Encontrá organizaciones que den capacitación laboral gratuita.',
  'Construí una base de convenios entre universidades y empresas.',
  'Encontrá tecnologías desarrolladas en universidades que hayan sido transferidas a empresas.',
  'Construí una base de centros culturales activos en Argentina.',
  'Encontrá organismos públicos que publiquen datos abiertos sobre transporte.',
  'Construí una base de cooperativas agropecuarias argentinas que comercialicen productos orgánicos.',
  'Encontrá hospitales argentinos que tengan programas activos de telemedicina.',
  'Construí una base de museos argentinos que hayan digitalizado parte de sus colecciones.',
  'Encontrá centros logísticos argentinos que cuenten con infraestructura de cadena de frío.',
  'Construí una base de empresas argentinas que hayan recibido financiamiento público para desarrollar biotecnología.',
  'Encontrá alertas meteorológicas oficiales que hayan provocado cierres preventivos, evacuaciones o suspensión de actividades.',
  'Construí una base de escuelas técnicas argentinas que tengan laboratorios o programas de robótica.',
  'Encontrá servicios públicos argentinos que permitan realizar un trámite completamente en línea.',
  'Construí una base de productos argentinos que posean certificaciones públicas de calidad o seguridad.',
  'Encontrá casos en los que una empresa haya sido incorporada como proveedor de una organización después de atravesar un proceso público de homologación o calificación.',
  'Construí una base de 500.000 emails profesionales públicos de Argentina.'
];

allMissions.forEach((m, idx) => {
  const res = testParser(m);
  console.log((idx + 1).toString().padStart(2) + '. Unit: ' + res.unit.padEnd(14) + ' | Head: "' + res.headPhrase + '"');
});
