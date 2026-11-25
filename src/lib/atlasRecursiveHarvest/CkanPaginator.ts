/**
 * ATLAS — CKAN PAGINATOR
 * Paginates open data catalogs via CKAN API package_search, extracting metadata, contacts, and resources
 */

import fetch from 'node-fetch';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';
import type { EcosystemJob } from './types.ts';

export class CkanPaginator {
  /**
   * Paginates a CKAN catalog endpoint until all packages consumed or page budget reached
   */
  public static async harvestBatch(
    job: EcosystemJob,
    onEmailsDiscovered: (emails: string[], context: string, packageId: string) => Promise<void>,
    maxBatches: number = 20,
    rowsPerPage: number = 50
  ): Promise<{ pagesHarvested: number; rawEmailsHarvested: number; hasMore: boolean }> {
    let pagesHarvested = 0;
    let rawEmailsHarvested = 0;
    let currentStart = typeof job.paginationCursor === 'number' ? job.paginationCursor : 0;

    const baseUrl = job.rootUrl.includes('/package_search')
      ? job.rootUrl.split('?')[0]
      : `${job.rootUrl.replace(/\/$/, '')}/api/3/action/package_search`;

    while (pagesHarvested < maxBatches) {
      const requestUrl = `${baseUrl}?start=${currentStart}&rows=${rowsPerPage}`;
      job.visited.add(requestUrl);
      pagesHarvested++;
      job.urlsHarvested++;

      try {
        const res = await fetch(requestUrl, {
          headers: { 'User-Agent': 'AtlasRecursiveHarvester/2.0 (CKAN Harvester)' },
          timeout: 6000
        });

        if (!res.ok) {
          job.stopReason = `HTTP_${res.status}`;
          break;
        }

        const data: any = await res.json();
        if (!data || !data.success || !data.result) {
          job.stopReason = 'CKAN_INVALID_RESPONSE';
          break;
        }

        const totalPackages = data.result.count || 0;
        const packages: any[] = data.result.results || [];
        job.reachableUrlsDiscovered = totalPackages;

        if (packages.length === 0) {
          job.hasMorePages = false;
          job.isExhausted = true;
          job.stopReason = 'CKAN_PACKAGES_EXHAUSTED';
          break;
        }

        let pageHadEmails = false;
        // Process each package in batch
        for (const pkg of packages) {
          const pkgString = JSON.stringify(pkg);
          const matches = pkgString.match(EMAIL_EXTRACTION_REGEX) || [];

          if (matches.length > 0) {
            rawEmailsHarvested += matches.length;
            const valid: string[] = [];
            for (const raw of matches) {
              const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
              if (norm) valid.push(norm);
            }
            if (valid.length > 0) {
              pageHadEmails = true;
              await onEmailsDiscovered(
                valid,
                `Dataset: ${pkg.title || pkg.name} (${pkg.notes?.slice(0, 150) || ''})`,
                pkg.id || pkg.name
              );
            }
          }
        }

        if (pageHadEmails) {
          job.productivePages++;
        }

        currentStart += packages.length;
        job.paginationCursor = currentStart;

        if (currentStart >= totalPackages) {
          job.hasMorePages = false;
          job.isExhausted = true;
          job.stopReason = 'CKAN_ALL_PACKAGES_CONSUMED';
          break;
        } else {
          job.hasMorePages = true;
        }
      } catch (err: any) {
        job.stopReason = `NETWORK_ERROR: ${err.message}`;
        break;
      }
    }

    job.rawEmailsHarvested += rawEmailsHarvested;
    return {
      pagesHarvested,
      rawEmailsHarvested,
      hasMore: job.hasMorePages
    };
  }
}
