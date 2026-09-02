/**
 * publisherSourceDiscoverer.ts — Descubridor Automático de Sitemaps y Feeds por Dominio
 */

import type { PublisherHarvestSource, HarvestSourceType } from './types';

const PROBE_PATHS = [
  { path: '/sitemap.xml', type: 'sitemap_index' as HarvestSourceType },
  { path: '/sitemap_index.xml', type: 'sitemap_index' as HarvestSourceType },
  { path: '/video-sitemap.xml', type: 'video_sitemap' as HarvestSourceType },
  { path: '/video-sitemap_index.xml', type: 'sitemap_index' as HarvestSourceType },
  { path: '/news-sitemap.xml', type: 'video_sitemap' as HarvestSourceType },
  { path: '/feed/', type: 'rss' as HarvestSourceType },
  { path: '/rss/', type: 'rss' as HarvestSourceType },
  { path: '/rss.xml', type: 'rss' as HarvestSourceType },
  { path: '/feed.xml', type: 'rss' as HarvestSourceType }
];

export async function discoverEndpointsForDomain(domain: string): Promise<{ url: string; type: HarvestSourceType }[]> {
  const discovered: { url: string; type: HarvestSourceType }[] = [];
  const baseProtocol = domain.startsWith('http') ? domain : `https://${domain}`;

  for (const probe of PROBE_PATHS) {
    const fullUrl = `${baseProtocol.replace(/\/+$/, '')}${probe.path}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(fullUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'YouAppTV-AtlasHarvester/1.0' }
      });
      clearTimeout(timeout);

      if (res.ok) {
        discovered.push({ url: fullUrl, type: probe.type });
      }
    } catch {
      // Ignorar timeouts de probe
    }
  }

  return discovered;
}

export async function expandSitemapIndex(indexUrl: string): Promise<string[]> {
  const subSitemaps: string[] = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(indexUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'YouAppTV-AtlasHarvester/1.0' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = await res.text();
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(text)) !== null) {
        const sub = match[1].trim();
        if (/(video|media|post|news|article|202\d|201\d)/i.test(sub)) {
          subSitemaps.push(sub);
        }
      }
    }
  } catch {
    // Fallback silencioso
  }

  return subSitemaps;
}
