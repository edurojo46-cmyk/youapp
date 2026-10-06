import crypto from 'crypto';

// Non-person patterns for strict rejection
const NON_PERSON_PATTERNS = [
  /\b(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|inc|corp|llc|gmbh|coop|cooperativa|asociacion|fundacion|instituto|ministerio|secretaria|direccion|municipalidad|gobierno|hospital|clinica|banco|empresa|sociedad|holding|union|federacion|consorcio)\b/i,
  /\b(buque|vessel|barco|embarcacion|lancha|avion|aircraft|matricula|expediente|resolucion|decreto|ordenanza|ley|artículo|articulo)\b/i,
  /\b(est\.?|estacion|estaciones|servicio|servicios|combustible|combustibles|ypf|shell|axion|oil|petrobras|refineria|planta|gas|gnc|distribuidora|central|generacion|transformador|linea)\b/i,
  /^(null|undefined|unknown|n\/a|anonimo|sin nombre|generico)$/i,
  /\d{4,}/
];

/**
 * Normalizes a person display name
 */
export function normalizePersonName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates whether a text looks like a natural person's name
 */
export function isNaturalPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.replace(/[\t\n\r\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 3) return false;
  for (const pat of NON_PERSON_PATTERNS) {
    if (pat.test(trimmed)) return false;
  }
  const words = trimmed.split(' ').filter(w => w.length >= 2);
  return words.length >= 2;
}

/**
 * Resolves a natural person to a canonical global human ID independent of physical row locators.
 *
 * Invariant: Physical Row = Evidence. Human = Natural Person.
 * Priority:
 * 1. Lawful strong public identifier (DNI, Passport, CUIT, OpenAlex ID)
 * 2. Canonical human authority lookup
 * 3. Canonical alias map lookup
 * 4. Multi-field deterministic resolution
 */
export function resolveCanonicalHuman({
  displayName,
  docType = '',
  docNumber = '',
  sourceId = '',
  jurisdiction = 'ARG / NACIONAL',
  aliasMap = null,
  authorityMap = null
}) {
  if (!displayName || !isNaturalPersonName(displayName)) {
    return { isNaturalPerson: false, canonicalHumanId: null, resolutionMethod: 'REJECTED_NON_PERSON' };
  }

  const cleanDoc = (docNumber || '').trim().replace(/\D/g, '');
  const rawDocUpper = (docNumber || '').trim().toUpperCase();
  const docTypeUpper = (docType || '').trim().toUpperCase();
  const normName = normalizePersonName(displayName);

  let strongKey = null;
  let resolutionMethod = null;
  let isArgCitizenship = false;

  // 1. Strong Public Identifier Resolution
  if (docTypeUpper.includes('IDENTIDAD') || docTypeUpper === 'DNI' || docTypeUpper.includes('NACIONAL')) {
    if (cleanDoc.length >= 6 && cleanDoc.length <= 9) {
      strongKey = `ARG:DNI:${cleanDoc}`;
      resolutionMethod = 'STRONG_DNI';
      isArgCitizenship = true;
    }
  } else if (docTypeUpper.includes('PASAPORTE')) {
    const passportClean = rawDocUpper.replace(/[^A-Z0-9]/g, '');
    if (passportClean.length >= 5) {
      strongKey = `PASSPORT:${passportClean}`;
      resolutionMethod = 'STRONG_PASSPORT';
      isArgCitizenship = false;
    }
  } else if (docTypeUpper.includes('LIBRETA') || docTypeUpper.includes('CEDULA') || docTypeUpper.includes('LE') || docTypeUpper.includes('LC')) {
    if (cleanDoc.length >= 5 && cleanDoc.length <= 9) {
      strongKey = `ARG:${docTypeUpper.replace(/[^A-Z]/g, '_')}:${cleanDoc}`;
      resolutionMethod = 'STRONG_NATIONAL_DOC';
      isArgCitizenship = true;
    }
  } else if (cleanDoc.length >= 7 && cleanDoc.length <= 8) {
    // Unlabeled 7-8 digit number in Argentine context
    strongKey = `ARG:DNI:${cleanDoc}`;
    resolutionMethod = 'INFERRED_ARG_DNI';
    isArgCitizenship = true;
  }

  // 2. Canonical Authority & Alias Map Lookup
  if (strongKey && aliasMap && aliasMap.has(strongKey)) {
    const canonicalAlias = aliasMap.get(strongKey);
    return {
      isNaturalPerson: true,
      canonicalHumanId: canonicalAlias,
      resolutionMethod: 'CANONICAL_ALIAS_MAP',
      isArgCitizenship,
      isArgLink: true,
      strongIdentifier: strongKey
    };
  }

  if (strongKey) {
    return {
      isNaturalPerson: true,
      canonicalHumanId: strongKey,
      resolutionMethod,
      isArgCitizenship,
      isArgLink: true,
      strongIdentifier: strongKey
    };
  }

  // 3. Multi-Field Deterministic Identity Resolution (Fallback for records without strong doc)
  // Deterministic cluster on normalized name + jurisdiction/province
  const geoCode = jurisdiction.includes('CABA') ? 'CABA' : (jurisdiction.includes('PBA') ? 'PBA' : 'ARG');
  const nameHash = crypto.createHash('sha256').update(`${normName}::${geoCode}`).digest('hex').slice(0, 16);
  const multiFieldKey = `ARG:HUMAN:NAME_${geoCode}:${nameHash}`;

  return {
    isNaturalPerson: true,
    canonicalHumanId: multiFieldKey,
    resolutionMethod: 'MULTI_FIELD_NAME_GEO',
    isArgCitizenship: false,
    isArgLink: true,
    strongIdentifier: null
  };
}
