export type MomentType = 'opening' | 'key_point' | 'turning_point' | 'closing' | 'unknown';

export type MomentSource = 'analyzed' | 'fallback';

export type VideoMoment = {
  id: string;
  contentKey: string;

  startSec: number;
  endSec?: number;

  title: string;
  summary?: string;

  type: MomentType;

  confidence: number;
  source: MomentSource;
};
