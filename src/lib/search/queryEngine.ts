import { getCache, setCache } from './cache/indexedDb';

export const norm = (str: string) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

export const getLevenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

import type { SearchQuery, QueryFreshness } from './types';

export function parseQuery(rawQuery: string): SearchQuery {
  const normalized = norm(rawQuery);
  let freshness: QueryFreshness = 'evergreen';
  
  if (normalized.includes('en vivo') || normalized.includes('live')) {
    freshness = 'live';
  } else if (normalized.includes('noticias') || normalized.includes('hoy') || normalized.includes('news')) {
    freshness = 'news';
  } else if (normalized.includes('tendencia') || normalized.includes('2026')) {
    freshness = 'trending';
  }

  return {
    rawQuery,
    normalizedQuery: normalized,
    freshness
  };
}

export function fetchYouTubeSingleSuggest(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);

  return new Promise((resolve) => {
    const callbackName = `yt_sug_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&jsonp=${callbackName}&hl=es`;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        delete (window as any)[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 1800);

    (window as any)[callbackName] = (data: any) => {
      clearTimeout(timer);
      cleanup();
      try {
        if (data && Array.isArray(data[1])) {
          const list = data[1].map((item: any) => (Array.isArray(item) ? item[0] : item)).filter(Boolean);
          resolve(list);
          return;
        }
      } catch {}
      resolve([]);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve([]);
    };

    document.head.appendChild(script);
  });
}

export async function fetchYouTubeAutocomplete(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  const cached = await getCache<string[]>(`suggest_multi_${norm(q)}`);
  if (cached) return cached;

  const baseSuggestions = await fetchYouTubeSingleSuggest(q);
  if (baseSuggestions.length > 0) {
    await setCache(`suggest_multi_${norm(q)}`, baseSuggestions, 14400000); // 4 hours
    return baseSuggestions;
  }

  return [
    `${q} en vivo`,
    `${q} documental`,
    `${q} resumen`,
    `${q} oficial`,
    `lo mejor de ${q}`
  ];
}
