import { useSignalStore } from '../../tv/signalStore';
import { logSignalEvent } from '../../tv/signalPersistence';

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

export const logAudienceEvent = (event: AudienceEvent) => {
  const activeSignal = useSignalStore.getState().activeSignal;
  if (
    activeSignal?.id &&
    (event.type === 'block_started' ||
      event.type === 'block_completed' ||
      event.type === '50_percent' ||
      event.type === 'you4_moment_selected')
  ) {
    void logSignalEvent(activeSignal.id, event.blockId, event.type, event.payload);
  }
};
