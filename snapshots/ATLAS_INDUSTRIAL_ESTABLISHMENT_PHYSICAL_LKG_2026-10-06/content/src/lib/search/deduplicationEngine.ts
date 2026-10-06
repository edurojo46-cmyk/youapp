import type { ContentItem } from './types';

export function deduplicateItems(items: ContentItem[]): ContentItem[] {
  const seenKeys = new Set<string>();
  
  return items.filter(v => {
    const key = v.videoUrl || v.id || `${v.provider}_${v.title}`;
    if (!key) return true;

    // 1. Deduplicar por URL exacta o ID
    if (seenKeys.has(key)) return false;
    
    // 2. Extraer IDs de Youtube de distintos formatos para deduplicar
    if (v.videoUrl && v.videoUrl.includes('youtube.com/embed/')) {
       const idMatch = v.videoUrl.match(/embed\/([^?]+)/);
       if (idMatch && idMatch[1]) {
         const ytKey = `yt-${idMatch[1]}`;
         if (seenKeys.has(ytKey)) return false;
         seenKeys.add(ytKey);
       }
    }
    
    seenKeys.add(key);
    return true;
  });
}
