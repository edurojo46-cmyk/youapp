/**
 * priorityHarvestFrontier.ts — Cola de Prioridad Particionada V4 (Direct First + True Novelty Score)
 */

import { calculateExpectedNetNewScore } from './pageProbabilityScorer';
import type { YouTubeHarvestReference } from './types';

export interface PriorityFrontierItem {
  url: string;
  domain: string;
  publisherId: string;
  publisherName: string;
  sitemapName: string;
  partitionKey: string;
  country: string;
  language: string;
  category: string;
  expectedScore: number;
  isExploration: boolean;
}

export class PriorityHarvestFrontier {
  private directRefsQueue: YouTubeHarvestReference[] = [];
  private htmlPriorityQueue: PriorityFrontierItem[] = [];
  private explorationQueue: PriorityFrontierItem[] = [];
  private seenUrls: Set<string> = new Set();

  public pagesAvoidedCount = 0;
  public totalQueuedCount = 0;

  pushDirectReference(ref: YouTubeHarvestReference): void {
    this.directRefsQueue.push(ref);
    this.pagesAvoidedCount++;
  }

  pushHtmlTarget(
    url: string,
    domain: string,
    publisherId: string,
    publisherName: string,
    sitemapName: string,
    partitionKey: string,
    country: string,
    language: string,
    category: string,
    partitionNoveltyRate: number,
    sourceScore: number,
    isExploration = false
  ): boolean {
    if (this.seenUrls.has(url)) return false;
    this.seenUrls.add(url);

    const expectedScore = calculateExpectedNetNewScore(url, partitionNoveltyRate, sourceScore);
    const item: PriorityFrontierItem = {
      url,
      domain,
      publisherId,
      publisherName,
      sitemapName,
      partitionKey,
      country,
      language,
      category,
      expectedScore,
      isExploration
    };

    if (isExploration) {
      this.explorationQueue.push(item);
    } else {
      this.htmlPriorityQueue.push(item);
    }

    this.totalQueuedCount++;
    return true;
  }

  sortPriorityQueue(): void {
    this.htmlPriorityQueue.sort((a, b) => b.expectedScore - a.expectedScore);
  }

  getPendingDirectRefs(count = 100): YouTubeHarvestReference[] {
    return this.directRefsQueue.splice(0, count);
  }

  getPendingHtmlBatch(totalCount = 35): PriorityFrontierItem[] {
    // 80% Exploit (High Score) / 20% Explore (New Partitions)
    const exploitCount = Math.round(totalCount * 0.80);
    const exploreCount = totalCount - exploitCount;

    const exploitBatch = this.htmlPriorityQueue.splice(0, exploitCount);
    const exploreBatch = this.explorationQueue.splice(0, exploreCount);

    if (exploitBatch.length < exploitCount) {
      const remaining = exploitCount - exploitBatch.length;
      exploitBatch.push(...this.explorationQueue.splice(0, remaining));
    } else if (exploreBatch.length < exploreCount) {
      const remaining = exploreCount - exploreBatch.length;
      exploreBatch.push(...this.htmlPriorityQueue.splice(0, remaining));
    }

    return [...exploitBatch, ...exploreBatch];
  }

  getDirectQueueSize(): number {
    return this.directRefsQueue.length;
  }

  getHtmlQueueSize(): number {
    return this.htmlPriorityQueue.length + this.explorationQueue.length;
  }

  getTotalRemainingSize(): number {
    return this.getDirectQueueSize() + this.getHtmlQueueSize();
  }
}
