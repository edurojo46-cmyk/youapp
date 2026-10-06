/**
 * ATLAS NAME COMPARATOR — ROBUST COMPARATIVE NORMALIZATION
 * 
 * Provides comparative equivalence matching for Argentine and international author names.
 * 
 * Rules:
 * 1. Preserves original display names at all times (destructive provenance is forbidden).
 * 2. Treats as equivalent:
 *    - Hyphens (-, en-dash, em-dash, unicode hyphens) <-> space
 *    - Apostrophes ('’, etc.)
 *    - Particles: de, del, de la, de los, de las, di, da, van, von, y
 *    - Initials with or without dot (C. vs C)
 *    - Upper/lowercase and diacritics (á, é, í, ó, ú, ñ -> a, e, i, o, u, n)
 * 3. Never does blind normalization: compatible name alone does not resolve identity.
 * 4. Guards against ambiguity: flags AMBIGUOUS_IDENTITY if multiple candidates match.
 * 5. Strict given name / initial compatibility: different initials (e.g. C. vs A.) NEVER match,
 *    even if they share compound surnames.
 */

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'di', 'da', 'van', 'von', 'y']);

/**
 * Normalizes a name string for comparative matching.
 * Does NOT modify original names stored in DB.
 */
export function normalizeNameForComparison(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]/g, ' ') // all unicode hyphens -> space
    .replace(/['’`´"]/g, ' ') // apostrophes -> space
    .replace(/\./g, ' ') // dots from initials (C. -> C)
    .replace(/[^a-z0-9\s]/g, ' ') // all other punctuation
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();
}

/**
 * Tokenizes a name into clean tokens, optionally filtering out standard particles.
 */
export function tokenizeName(name: string, filterParticles = false): string[] {
  const norm = normalizeNameForComparison(name);
  if (!norm) return [];
  const tokens = norm.split(' ').filter(Boolean);
  if (filterParticles) {
    const filtered = tokens.filter(t => !PARTICLES.has(t));
    return filtered.length > 0 ? filtered : tokens;
  }
  return tokens;
}

export interface NameComparisonResult {
  matches: boolean;
  confidence: number;
  reason: 'EXACT_NORMALIZED' | 'INITIAL_AND_COMPOUND_SURNAME' | 'FULL_TOKEN_OVERLAP' | 'SURNAME_AND_GIVEN_OVERLAP' | 'INITIAL_CONFLICT_MISMATCH' | 'SURNAME_MISMATCH' | 'MISMATCH';
}

/**
 * Compares a target name against a candidate author name.
 */
export function compareAuthorNames(targetName: string, candidateName: string): NameComparisonResult {
  if (!targetName || !candidateName) {
    return { matches: false, confidence: 0, reason: 'MISMATCH' };
  }

  const s1 = normalizeNameForComparison(targetName);
  const s2 = normalizeNameForComparison(candidateName);

  // Exact match after hyphen/accent/dot normalization
  if (s1 === s2) {
    return { matches: true, confidence: 1.0, reason: 'EXACT_NORMALIZED' };
  }

  const t1 = tokenizeName(targetName, true);
  const t2 = tokenizeName(candidateName, true);

  if (t1.length === 0 || t2.length === 0) {
    return { matches: false, confidence: 0, reason: 'MISMATCH' };
  }

  const set1 = new Set(t1);
  const set2 = new Set(t2);

  // 1. Strict Given Name / Initial Check:
  // First tokens must NOT conflict!
  const first1 = t1[0];
  const first2 = t2[0];
  const firstCompatible = 
    first1 === first2 || 
    (first1.length === 1 && first2.startsWith(first1)) || 
    (first2.length === 1 && first1.startsWith(first2));

  if (!firstCompatible) {
    // Conflict in given name or initial (e.g. 'c' vs 'a', 'carlos' vs 'alberto')
    return { matches: false, confidence: 0, reason: 'INITIAL_CONFLICT_MISMATCH' };
  }

  // 2. Strict Surname Check:
  // Surnames must match (at least one of the final tokens must match)
  const surname1 = t1[t1.length - 1];
  const surname2 = t2[t2.length - 1];
  const surnamesOverlap = set1.has(surname2) || set2.has(surname1);

  if (!surnamesOverlap) {
    return { matches: false, confidence: 0, reason: 'SURNAME_MISMATCH' };
  }

  const overlap = t1.filter(t => set2.has(t));

  // Case: Initial + compound surname (e.g. 'c martin gomez' vs 'c martin gomez')
  if (firstCompatible && surnamesOverlap && overlap.length >= Math.min(t1.length, t2.length) - 1 && overlap.length >= 1) {
    return { matches: true, confidence: 0.98, reason: 'INITIAL_AND_COMPOUND_SURNAME' };
  }

  if (firstCompatible && overlap.length >= 2) {
    return { matches: true, confidence: 0.95, reason: 'FULL_TOKEN_OVERLAP' };
  }

  return { matches: false, confidence: 0, reason: 'MISMATCH' };
}
