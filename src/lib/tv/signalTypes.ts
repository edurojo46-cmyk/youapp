import type { ContentItem } from '../search/types';

import type { IntentType } from '../search/types';

export type SignalRequest = {
  originalPrompt: string;

  mainTopic: string;
  durationTargetMin?: number;

  subQueries: Array<{
    id: string;
    query: string;

    role: BlockRole;

    intentHint?: IntentType;
    freshness?: "news" | "recent" | "evergreen" | "live" | "unknown";
    needsDocumentary?: boolean;

    parentContext: string;
    entities?: Array<{
      canonical: string;
      aliases: string[];
    }>;
  }>;

  language?: string;
  mode?: "balanced" | "deep" | "discovery";
};

export type BlockRole = 
  | "opening"
  | "deep_dive"
  | "news"
  | "explainer"
  | "discovery"
  | "closing";

export interface ScheduleBlock {
  id: string;

  position: number;
  startOffsetSec: number;
  durationSec: number;

  contentItem: ContentItem;

  topic: string;
  role: BlockRole;

  locked?: boolean;
  
  generationReason?: {
    topic: string;
    reason: string;
    relevance: number;
    diversityBoost: number;
  };
}

export interface CustomSignal {
  id: string;
  user_id?: string;
  name: string;
  prompt: string;
  description?: string;
  visibility: "private" | "public";
  cover_url?: string;

  duration_target?: number;
  language?: string;

  created_at: string;
  updated_at: string;
  radarConsumed?: number;
  independentSemanticCoverage?: number;
  
  schedule: ScheduleBlock[];
}
