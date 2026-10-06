import type { ContentItem } from './types';

export function applyPersonalization(items: ContentItem[]): ContentItem[] {
  let algo: any = null;
  try {
    const algoStr = localStorage.getItem('youapp_user_algorithm');
    if (algoStr) algo = JSON.parse(algoStr);
  } catch (e) {}

  return items.sort((a, b) => {
    let scoreA = a.youScore || 0;
    let scoreB = b.youScore || 0;

    if (algo) {
      if (a.isLive) scoreA += algo.actualidad * 2;
      if (b.isLive) scoreB += algo.actualidad * 2;

      if (a.viewsText && a.viewsText.includes('M')) scoreA += algo.popularidad;
      if (b.viewsText && b.viewsText.includes('M')) scoreB += algo.popularidad;

      if (a.isVerified) scoreA += algo.expertos;
      if (b.isVerified) scoreB += algo.expertos;

      // Diversidad (Random factor)
      scoreA += (Math.random() * algo.diversidad) + (Math.random() * algo.descubrimiento);
      scoreB += (Math.random() * algo.diversidad) + (Math.random() * algo.descubrimiento);
    }

    return scoreB - scoreA;
  });
}
