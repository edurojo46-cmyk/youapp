export type AudienceEventType = 
  | 'block_started'
  | 'block_completed'
  | 'user_skip'
  | 'playback_error'
  | 'autoplay_advanced'
  | 'player_loaded'
  | '25_percent'
  | '50_percent'
  | '75_percent'
  | 'you4_moment_selected';

export type AudienceEvent = {
  type: AudienceEventType;
  blockId: string;
  payload?: any;
};

// Simplified telemetry logger for Phase 5.1
export const logAudienceEvent = (event: AudienceEvent) => {
  console.log(`[Audience Telemetry] ${event.type}:`, event.blockId, event.payload || '');
  // Here we would wire it to the actual Audience Graph in the future
};
