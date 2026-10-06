/**
 * scripts/discovery/geo_discovery_engine.mjs
 * 
 * ATLAS — GEO DISCOVERY ENGINE V16
 * 
 * Mandates:
 * 1. Build geographic coverage hierarchy:
 *    ARGENTINA -> PROVINCE (24) -> DEPARTMENT/PARTIDO -> MUNICIPALITY -> CITY
 * 2. Calculate cell metrics:
 *    KNOWN_HUMANS, KNOWN_ORGANIZATIONS, KNOWN_PUBLIC_SOURCES, KNOWN_MEDIA, 
 *    KNOWN_REGISTRIES, SOURCE_DENSITY, PERSON_DISCOVERY_DENSITY, NOVELTY_RATE, FUEL_YIELD.
 * 3. Detect GEO_COVERAGE_GAPS:
 *    Prioritize HIGH_POPULATION + LOW_SOURCE_COVERAGE + HIGH_EXPECTED_NOVELTY.
 * 4. STRICT PRIVACY BOUNDARY:
 *    - Geolocation ONLY for public businesses, institutions, government offices.
 *    - NO private home address inference or residential tracking.
 */

export const ARGENTINE_GEO_HIERARCHY = [
  { province: 'CABA', population: 3120612, departments: 15, knownSources: 42, knownHumans: 3450000, expectedNovelty: 0.12 },
  { province: 'Buenos Aires (PBA)', population: 17569053, departments: 135, knownSources: 28, knownHumans: 2150000, expectedNovelty: 0.78 },
  { province: 'Córdoba', population: 3978984, departments: 26, knownSources: 12, knownHumans: 480000, expectedNovelty: 0.82 },
  { province: 'Santa Fe', population: 3556522, departments: 19, knownSources: 14, knownHumans: 420000, expectedNovelty: 0.85 },
  { province: 'Mendoza', population: 2014533, departments: 18, knownSources: 11, knownHumans: 185000, expectedNovelty: 0.89 },
  { province: 'Tucumán', population: 1703186, departments: 17, knownSources: 4, knownHumans: 85000, expectedNovelty: 0.91 },
  { province: 'Salta', population: 1440672, departments: 23, knownSources: 3, knownHumans: 62000, expectedNovelty: 0.93 },
  { province: 'Entre Ríos', population: 1426426, departments: 17, knownSources: 6, knownHumans: 75000, expectedNovelty: 0.90 },
  { province: 'Misiones', population: 1280960, departments: 17, knownSources: 3, knownHumans: 48000, expectedNovelty: 0.94 },
  { province: 'Corrientes', population: 1197553, departments: 25, knownSources: 3, knownHumans: 45000, expectedNovelty: 0.92 },
  { province: 'Chaco', population: 1142963, departments: 25, knownSources: 2, knownHumans: 40000, expectedNovelty: 0.94 },
  { province: 'Santiago del Estero', population: 1054028, departments: 27, knownSources: 2, knownHumans: 35000, expectedNovelty: 0.95 },
  { province: 'San Juan', population: 818234, departments: 19, knownSources: 3, knownHumans: 38000, expectedNovelty: 0.93 },
  { province: 'Jujuy', population: 797955, departments: 16, knownSources: 2, knownHumans: 32000, expectedNovelty: 0.94 },
  { province: 'Río Negro', population: 762067, departments: 13, knownSources: 4, knownHumans: 34000, expectedNovelty: 0.91 },
  { province: 'Neuquén', population: 726590, departments: 16, knownSources: 4, knownHumans: 41000, expectedNovelty: 0.90 },
  { province: 'Formosa', population: 606041, departments: 9, knownSources: 1, knownHumans: 18000, expectedNovelty: 0.96 },
  { province: 'Chubut', population: 603120, departments: 15, knownSources: 3, knownHumans: 29000, expectedNovelty: 0.92 },
  { province: 'San Luis', population: 540905, departments: 9, knownSources: 2, knownHumans: 24000, expectedNovelty: 0.93 },
  { province: 'Catamarca', population: 429556, departments: 16, knownSources: 1, knownHumans: 16000, expectedNovelty: 0.95 },
  { province: 'La Rioja', population: 384607, departments: 18, knownSources: 1, knownHumans: 14000, expectedNovelty: 0.95 },
  { province: 'La Pampa', population: 366022, departments: 22, knownSources: 2, knownHumans: 19000, expectedNovelty: 0.92 },
  { province: 'Santa Cruz', population: 333473, departments: 7, knownSources: 1, knownHumans: 15000, expectedNovelty: 0.94 },
  { province: 'Tierra del Fuego', population: 190641, departments: 3, knownSources: 2, knownHumans: 12000, expectedNovelty: 0.91 }
];

export class GeoDiscoveryEngine {
  constructor() {
    this.hierarchy = ARGENTINE_GEO_HIERARCHY;
  }

  /**
   * Scan all geographic cells and detect coverage gaps.
   */
  analyzeGeoCoverage() {
    console.log(`[GEO_ENGINE] Scanning ${this.hierarchy.length} provincial cells across Argentina...`);

    let totalCells = 0;
    const gaps = [];

    for (const prov of this.hierarchy) {
      totalCells += prov.departments;
      const sourceDensity = (prov.knownSources / (prov.population / 100000)).toFixed(2);
      const humanDensity = (prov.knownHumans / prov.population).toFixed(2);

      // Gap detection rule: High population (> 1,000,000) with low source count (< 10)
      if (prov.population >= 1000000 && prov.knownSources < 10) {
        gaps.push({
          province: prov.province,
          population: prov.population,
          knownSources: prov.knownSources,
          sourceDensity,
          expectedNovelty: prov.expectedNovelty,
          priority: 'URGENT_HIGH_YIELD'
        });
      } else if (prov.population >= 500000 && prov.knownSources <= 3) {
        gaps.push({
          province: prov.province,
          population: prov.population,
          knownSources: prov.knownSources,
          sourceDensity,
          expectedNovelty: prov.expectedNovelty,
          priority: 'MEDIUM_HIGH_NOVELTY'
        });
      }
    }

    return {
      geoCellsScanned: totalCells,
      provincesScanned: this.hierarchy.length,
      geoGapsFound: gaps.length,
      topGaps: gaps.sort((a, b) => b.population - a.population)
    };
  }
}
