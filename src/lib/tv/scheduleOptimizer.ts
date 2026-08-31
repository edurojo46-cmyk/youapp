import type { ContentItem } from '../search/types';
import type { ScheduleBlock, BlockRole } from './signalTypes';

export interface OptimizerOptions {
  durationTargetMin: number;
  maxPerCreator: number;
  maxConsecutiveSameTopic: number;
  maxConsecutiveLongForm: number;
}

const DEFAULT_OPTIONS: OptimizerOptions = {
  durationTargetMin: 60,
  maxPerCreator: 2,
  maxConsecutiveSameTopic: 2,
  maxConsecutiveLongForm: 1
};

export function optimizeSchedule(
  candidatePool: { item: ContentItem, topic: string }[],
  options: Partial<OptimizerOptions> = {}
): ScheduleBlock[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const targetSec = opts.durationTargetMin * 60;
  
  const schedule: ScheduleBlock[] = [];
  let currentDurationSec = 0;
  
  // Trackers for constraints
  const creatorCounts = new Map<string, number>();
  let consecutiveTopicCount = 0;
  let lastTopic = '';
  let consecutiveLongFormCount = 0;
  
  // A simple rhythm pattern to cycle through
  const rhythm: BlockRole[] = [
    'opening',   // Long
    'news',      // Short
    'deep_dive', // Long
    'explainer', // Mid
    'discovery'  // Mid/Short
  ];
  let rhythmIndex = 0;

  // Clone pool so we can mutate it
  let available = [...candidatePool];
  
  while (currentDurationSec < targetSec && available.length > 0) {
    const role = rhythm[rhythmIndex % rhythm.length];
    
    // Find best candidate for this role
    let bestIdx = -1;
    let bestScore = -1;
    
    for (let i = 0; i < available.length; i++) {
      const candidate = available[i];
      const item = candidate.item;
      const duration = (item.durationMs || 0) / 1000;
      
      // Determine if it fits the role (roughly)
      const isLong = duration > 1200; // > 20 mins
      const isShort = duration < 420; // < 7 mins
      
      let roleFitScore = 0;
      if (role === 'opening' || role === 'deep_dive') {
        roleFitScore = isLong ? 10 : (isShort ? 1 : 5);
      } else if (role === 'news' || role === 'discovery') {
        roleFitScore = isShort ? 10 : (isLong ? 1 : 5);
      } else { // explainer
        roleFitScore = (!isLong && !isShort) ? 10 : 5;
      }
      
      // Check constraints
      const creator = item.channelName || 'unknown';
      const creatorCount = creatorCounts.get(creator) || 0;
      if (creatorCount >= opts.maxPerCreator) continue;
      
      if (candidate.topic === lastTopic && consecutiveTopicCount >= opts.maxConsecutiveSameTopic) continue;
      if (isLong && consecutiveLongFormCount >= opts.maxConsecutiveLongForm) continue;
      
      // Add a base relevance score from the router/search
      const relevanceScore = item.relevanceScore || 50;
      const finalScore = roleFitScore * 10 + relevanceScore;
      
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestIdx = i;
      }
    }
    
    // If no candidate fit perfectly under constraints, we relax constraints (or just break for V1)
    if (bestIdx === -1) {
       // Relax constraints for the next loop by just picking the highest relevance available that doesn't completely break duration?
       // For V1, we'll just pick the first available and force it, but skip if it blows up duration wildly.
       bestIdx = 0;
    }
    
    const chosen = available[bestIdx];
    available.splice(bestIdx, 1); // Remove from pool
    
    const itemDurSec = (chosen.item.durationMs || 10 * 60000) / 1000;
    
    schedule.push({
      id: `block-${Date.now()}-${schedule.length}`,
      position: schedule.length,
      startOffsetSec: currentDurationSec,
      durationSec: itemDurSec,
      contentItem: chosen.item,
      topic: chosen.topic,
      role: role,
      generationReason: {
        topic: chosen.topic,
        reason: role,
        relevance: chosen.item.relevanceScore || 50,
        diversityBoost: 0
      }
    });
    
    currentDurationSec += itemDurSec;
    rhythmIndex++;
    
    // Update trackers
    const creator = chosen.item.channelName || 'unknown';
    creatorCounts.set(creator, (creatorCounts.get(creator) || 0) + 1);
    
    if (chosen.topic === lastTopic) {
      consecutiveTopicCount++;
    } else {
      consecutiveTopicCount = 1;
      lastTopic = chosen.topic;
    }
    
    if (itemDurSec > 1200) {
      consecutiveLongFormCount++;
    } else {
      consecutiveLongFormCount = 0;
    }
  }

  // Ensure there's a closing role if we finished
  if (schedule.length > 0) {
    schedule[schedule.length - 1].role = 'closing';
  }

  return schedule;
}
