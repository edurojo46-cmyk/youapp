/**
 * neighborExpansion.ts — Expansor de Particiones Hermanas y Cohortes Temporales Adyacentes (Harvester V4.1)
 */

export interface SisterSitemapCandidate {
  url: string;
  publisherId: string;
  domain: string;
  cohort: string;
}

export function generateAdjacentCohorts(sitemapUrl: string): string[] {
  const candidates: string[] = [];

  // 1. Patrón YYYYMM (ej. post-sitemap202510.xml ➔ 202509, 202508, 202511, 202512, 202601)
  const yyyymmMatch = sitemapUrl.match(/(202\d|201\d)(0[1-9]|1[0-2])/);
  if (yyyymmMatch) {
    const year = parseInt(yyyymmMatch[1], 10);
    const month = parseInt(yyyymmMatch[2], 10);

    for (let delta = -4; delta <= 3; delta++) {
      if (delta === 0) continue;
      let targetMonth = month + delta;
      let targetYear = year;

      while (targetMonth < 1) {
        targetMonth += 12;
        targetYear -= 1;
      }
      while (targetMonth > 12) {
        targetMonth -= 12;
        targetYear += 1;
      }

      const mStr = targetMonth.toString().padStart(2, '0');
      const targetYYYYMM = `${targetYear}${mStr}`;
      const sisterUrl = sitemapUrl.replace(`${yyyymmMatch[1]}${yyyymmMatch[2]}`, targetYYYYMM);
      candidates.push(sisterUrl);
    }
  }

  // 2. Patrón Numérico Secuencial (ej. post-sitemap1.xml ➔ post-sitemap2.xml, post-sitemap3.xml)
  const seqMatch = sitemapUrl.match(/(sitemap|post|video)[-_]?(\d+)\.xml/i);
  if (seqMatch && seqMatch[2].length <= 3) {
    const prefix = seqMatch[1];
    const num = parseInt(seqMatch[2], 10);

    for (let delta = -3; delta <= 5; delta++) {
      if (delta === 0) continue;
      const targetNum = num + delta;
      if (targetNum >= 1) {
        const sisterUrl = sitemapUrl.replace(`${prefix}-${num}.xml`, `${prefix}-${targetNum}.xml`)
                                    .replace(`${prefix}${num}.xml`, `${prefix}${targetNum}.xml`);
        candidates.push(sisterUrl);
      }
    }
  }

  return [...new Set(candidates)];
}
