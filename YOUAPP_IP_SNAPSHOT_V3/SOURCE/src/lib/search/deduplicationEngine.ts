import type { ContentItem } from './types';

export function deduplicateItems(items: ContentItem[]): ContentItem[] {
  const seenUrls = new Set<string>();
  
  return items.filter(v => {
    // 1. Deduplicar por URL exacta (ya normalizada)
    if (seenUrls.has(v.videoUrl)) return false;
    
    // 2. Extraer IDs de Youtube de distintos formatos para deduplicar
    if (v.videoUrl.includes('youtube.com/embed/')) {
       const idMatch = v.videoUrl.match(/embed\/([^?]+)/);
       if (idMatch && idMatch[1]) {
         const ytKey = `yt-${idMatch[1]}`;
         if (seenUrls.has(ytKey)) return false;
         seenUrls.add(ytKey);
       }
    }
    
    seenUrls.add(v.videoUrl);
    return true;
  });
}
