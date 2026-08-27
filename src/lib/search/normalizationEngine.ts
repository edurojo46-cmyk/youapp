import type { ContentItem } from './types';

export function normalizeItems(items: ContentItem[]): ContentItem[] {
  return items.map(v => {
    let finalUrl = v.videoUrl;
    
    // Normalizar URLs embebidas
    if (v.provider === 'tiktok' && finalUrl.includes('/video/')) {
      const videoIdMatch = finalUrl.match(/\/video\/(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        finalUrl = `https://www.tiktok.com/embed/v2/${videoIdMatch[1]}`;
      }
    } else if (v.provider === 'instagram' && finalUrl.includes('/reel/')) {
      if (!finalUrl.endsWith('/embed/')) {
        const cleanUrl = finalUrl.split('?')[0];
        finalUrl = cleanUrl.endsWith('/') ? `${cleanUrl}embed/` : `${cleanUrl}/embed/`;
      }
    } else if (v.provider === 'vimeo' && !finalUrl.includes('player.vimeo.com')) {
      const vimeoMatch = finalUrl.match(/vimeo\.com\/(\d+)/);
      if (vimeoMatch && vimeoMatch[1]) {
        finalUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      }
    }

    return {
      ...v,
      videoUrl: finalUrl
    };
  });
}
