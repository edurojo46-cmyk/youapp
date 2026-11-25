/**
 * ATLAS — OAI-PMH PAGINATOR
 * Implements full protocol pagination via resumptionToken across academic and scientific repositories
 */

import fetch from 'node-fetch';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';
import type { EcosystemJob } from './types.ts';

export class OaiPmhPaginator {
  /**
   * Paginates an OAI-PMH endpoint until exhaustion or page budget limit
   */
  public static async harvestBatch(
    job: EcosystemJob,
    onEmailsDiscovered: (emails: string[], context: string, recordId: string) => Promise<void>,
    maxBatches: number = 20
  ): Promise<{ pagesHarvested: number; rawEmailsHarvested: number; hasMore: boolean }> {
    let pagesHarvested = 0;
    let rawEmailsHarvested = 0;
    let token = typeof job.paginationCursor === 'string' ? job.paginationCursor : '';

    const baseUrl = job.rootUrl.split('?')[0];

    while (pagesHarvested < maxBatches) {
      let requestUrl = '';
      if (token) {
        requestUrl = `${baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
      } else {
        requestUrl = `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
      }

      job.visited.add(requestUrl);
      pagesHarvested++;
      job.urlsHarvested++;

      try {
        const res = await fetch(requestUrl, {
          headers: { 'User-Agent': 'AtlasRecursiveHarvester/2.0 (OAI Harvester)' },
          timeout: 8000
        });

        if (!res.ok) {
          job.stopReason = `HTTP_${res.status}`;
          break;
        }

        const xml = await res.text();

        // 1. Extract records and contact info
        let pageHadEmails = false;
        const recordBlocks = xml.split(/<record>/i).slice(1);
        for (const block of recordBlocks) {
          const idMatch = block.match(/<identifier>(.*?)<\/identifier>/i);
          const recId = idMatch ? idMatch[1] : `rec_${pagesHarvested}`;

          const matches = block.match(EMAIL_EXTRACTION_REGEX) || [];
          if (matches.length > 0) {
            rawEmailsHarvested += matches.length;
            const valid = [];
            for (const raw of matches) {
              const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
              if (norm) valid.push(norm);
            }
            if (valid.length > 0) {
              pageHadEmails = true;
              await onEmailsDiscovered(valid, block.slice(0, 300), recId);
            }
          }
        }
        if (pageHadEmails) {
          job.productivePages++;
        }

        // 2. Extract resumptionToken for next batch
        const tokenMatch = xml.match(/<resumptionToken[^>]*>(.*?)<\/resumptionToken>/i);
        const nextToken = tokenMatch ? tokenMatch[1].trim() : '';

        if (nextToken && nextToken.length > 0) {
          token = nextToken;
          job.paginationCursor = nextToken;
          job.hasMorePages = true;
        } else {
          // No more resumption tokens, OAI repository fully consumed
          job.hasMorePages = false;
          job.isExhausted = true;
          job.stopReason = 'OAI_RESUMPTION_TOKEN_EXHAUSTED';
          break;
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
