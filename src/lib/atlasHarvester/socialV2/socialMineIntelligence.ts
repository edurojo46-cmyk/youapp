/**
 * socialMineIntelligence.ts & socialScaleScore.ts — Inteligencia y Clasificación por Tópicos en Redes Sociales
 */

export interface SocialTopicMetric {
  topic: string;
  postsScanned: number;
  youtubeRefsFound: number;
  uniqueIds: number;
  knownAtlas: number;
  netNew: number;
  noveltyRate: number;
  throughputPerSec: number;
  socialScaleScore: number;
}

export class SocialMineIntelligence {
  private topicMetrics: Map<string, {
    posts: number;
    refs: number;
    uniqueSet: Set<string>;
    known: number;
    netNew: number;
  }> = new Map();

  recordDiscovery(topic: string, videoId: string, isDuplicate: boolean) {
    const current = this.topicMetrics.get(topic) || {
      posts: 0,
      refs: 0,
      uniqueSet: new Set<string>(),
      known: 0,
      netNew: 0
    };

    current.refs++;
    if (!current.uniqueSet.has(videoId)) {
      current.uniqueSet.add(videoId);
      if (isDuplicate) {
        current.known++;
      } else {
        current.netNew++;
      }
    }

    this.topicMetrics.set(topic, current);
  }

  incrementPosts(topic: string, count = 1) {
    const current = this.topicMetrics.get(topic) || {
      posts: 0,
      refs: 0,
      uniqueSet: new Set<string>(),
      known: 0,
      netNew: 0
    };
    current.posts += count;
    this.topicMetrics.set(topic, current);
  }

  getMetricsReport(durationSeconds: number): SocialTopicMetric[] {
    const results: SocialTopicMetric[] = [];

    for (const [topic, data] of this.topicMetrics.entries()) {
      const uniqueCount = data.uniqueSet.size;
      const noveltyRate = uniqueCount > 0 ? +((data.netNew / uniqueCount) * 100).toFixed(1) : 0;
      const throughputPerSec = +(data.netNew / Math.max(1, durationSeconds)).toFixed(2);
      const uniqueRate = data.refs > 0 ? +(uniqueCount / data.refs).toFixed(2) : 0;

      // SocialScaleScore = NoveltyRate * LinkVolume * UniqueRate * Throughput
      const scaleScore = +((noveltyRate / 100) * data.refs * uniqueRate * Math.max(1, throughputPerSec)).toFixed(0);

      results.push({
        topic,
        postsScanned: data.posts,
        youtubeRefsFound: data.refs,
        uniqueIds: uniqueCount,
        knownAtlas: data.known,
        netNew: data.netNew,
        noveltyRate,
        throughputPerSec,
        socialScaleScore: scaleScore
      });
    }

    results.sort((a, b) => b.socialScaleScore - a.socialScaleScore);
    return results;
  }
}
