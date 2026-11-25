/**
 * ATLAS — HTML RECURSIVE HARVESTER
 * Crawls and expands web ecosystems from HTML pages, extracting internal links and contact emails
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';
import { SemanticUrlScorer } from './SemanticUrlScorer.ts';
import type { EcosystemJob, HarvestedPageResult } from './types.ts';

export class HtmlRecursiveHarvester {
  /**
   * Harvests a single page within an ecosystem job and discovers outbound links
   */
  public static async harvestPage(
    job: EcosystemJob,
    url: string,
    depth: number
  ): Promise<HarvestedPageResult> {
    const t0 = Date.now();
    let httpStatus = 0;
    let bytesReceived = 0;
    const discoveredLinks: string[] = [];
    const extractedEmails: string[] = [];
    const validEmails: string[] = [];

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AtlasRecursiveHarvester/2.0 (Institutional Ecosystem Explorer)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(3500)
      });

      httpStatus = res.status;
      if (!res.ok) {
        return {
          url,
          httpStatus,
          latencyMs: Date.now() - t0,
          bytesReceived: 0,
          discoveredLinks,
          extractedEmails,
          validEmails,
          netNewEmails: []
        };
      }

      const html = await res.text();
      bytesReceived = Buffer.byteLength(html, 'utf8');

      // 1. Extract emails from raw HTML text (including basic HTML entity decode)
      let cleanText = html;
      if (html.includes('&#')) {
        cleanText = html
          .replace(/&#64;/gi, '@')
          .replace(/&#x40;/gi, '@')
          .replace(/&#46;/gi, '.')
          .replace(/&#x2e;/gi, '.')
          .replace(/&amp;/gi, '&');
      }

      const rawMatches = cleanText.match(EMAIL_EXTRACTION_REGEX) || [];
      for (const raw of rawMatches) {
        extractedEmails.push(raw);
        const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
        if (norm) {
          validEmails.push(norm);
        }
      }

      // Also check mailto: links specifically
      const $ = cheerio.load(html);
      $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const mail = href.replace(/^mailto:/i, '').split('?')[0].trim();
        const norm = EmailNormalizerAndClassifier.normalizeEmail(mail);
        if (norm && !validEmails.includes(norm)) {
          extractedEmails.push(mail);
          validEmails.push(norm);
        }
      });

      // 2. Discover internal links for recursive frontier expansion
      if (depth < job.maxDepth) {
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) {
            return;
          }

          try {
            const absoluteUrl = new URL(href, url).href;
            const cleanUrl = absoluteUrl.split('#')[0].split('?utm_')[0]; // Strip fragment & tracking

            // Check if within ecosystem scope
            if (SemanticUrlScorer.isWithinEcosystemScope(cleanUrl, job.domain)) {
              if (!job.visited.has(cleanUrl) && !job.discoveredUrls.has(cleanUrl)) {
                const score = SemanticUrlScorer.scoreUrl(cleanUrl, depth + 1);
                if (score > 0) {
                  job.discoveredUrls.add(cleanUrl);
                  discoveredLinks.push(cleanUrl);
                  job.frontier.push({
                    url: cleanUrl,
                    depth: depth + 1,
                    priorityScore: score,
                    discoveredFrom: url
                  });
                }
              }
            }
          } catch (e) {
            // Invalid URL format ignored
          }
        });

        // Re-sort frontier so highest priority URLs are harvested first
        job.frontier.sort((a, b) => b.priorityScore - a.priorityScore);
        job.reachableUrlsDiscovered = job.discoveredUrls.size;
      }
    } catch (err: any) {
      httpStatus = 599; // Client timeout or connection error
    }

    return {
      url,
      httpStatus,
      latencyMs: Date.now() - t0,
      bytesReceived,
      discoveredLinks,
      extractedEmails,
      validEmails,
      netNewEmails: []
    };
  }
}
