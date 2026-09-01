import type { PlaybackItem, PlaybackState, PlayerAdapter, PlayerEvent, PlayerEventListener } from './playerTypes';
import { createPlayerAdapter } from './adapterFactory';

export class PlayerController {
  private adapter: PlayerAdapter | null = null;
  private container: HTMLElement;
  private generation = 0;
  private listeners: Set<PlayerEventListener> = new Set();
  
  // Milestones per block
  private milestones = {
    25: false,
    50: false,
    75: false
  };

  private pendingSeekSec: number | null = null;
  private pendingPlay: boolean = false;
  private pendingPause: boolean = false;
  private playbackState: PlaybackState = 'idle';
  private currentContentKey: string | null = null;
  private isReady: boolean = false;

  private unsubscribeAdapter: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async load(item: PlaybackItem): Promise<void> {
    const contentKey = `${item.provider}_${item.providerContentId}_${item.startOffsetSec || 0}`;
    if (this.currentContentKey === contentKey && this.adapter) {
      console.log('[PlayerController] Item already loaded, skipping duplicate load:', contentKey);
      return;
    }
    this.currentContentKey = contentKey;
    const currentGeneration = ++this.generation;

    // Reset state for new block
    this.milestones = { 25: false, 50: false, 75: false };
    this.isReady = false;
    this.pendingSeekSec = null;
    this.pendingPlay = false;
    this.pendingPause = false;
    this.setPlaybackState('idle');

    if (this.adapter) {
      if (this.unsubscribeAdapter) this.unsubscribeAdapter();
      const oldAdapter = this.adapter;
      this.adapter = null;
      await oldAdapter.destroy();
    }

    // Protection: If generation changed while destroying, abort.
    if (currentGeneration !== this.generation) return;

    this.adapter = createPlayerAdapter(item.provider, this.container);
    
    this.unsubscribeAdapter = this.adapter.subscribe((event) => {
      this.handleAdapterEvent(currentGeneration, event);
    });

    try {
      await this.adapter.load(item);
    } catch (e: any) {
      if (currentGeneration === this.generation) {
        this.emit({ type: 'error', payload: e });
      }
      return;
    }

    if (currentGeneration !== this.generation) {
      if (this.adapter) {
        const oldAdapter = this.adapter;
        this.adapter = null;
        await oldAdapter.destroy();
      }
      return;
    }
  }

  private handleAdapterEvent(generation: number, event: PlayerEvent) {
    console.log(`[PlayerController] event received from adapter: ${event.type} (gen=${generation}, currentGen=${this.generation})`, event);
    // Drop late events from previous generations (Fast Zapping protection)
    if (generation !== this.generation) return;
    
    if (event.type === 'ready') {
      this.isReady = true;
      console.log('[PlayerController] READY -> isReady=true');
      this.setPlaybackState('ready');
      if (this.pendingSeekSec !== null && this.adapter) {
        this.adapter.seek(this.pendingSeekSec);
        this.pendingSeekSec = null;
      }
      if (this.pendingPlay && this.adapter) {
        this.pendingPlay = false;
        this.adapter.play();
      } else if (this.pendingPause && this.adapter) {
        this.pendingPause = false;
        this.adapter.pause();
      }
      this.emit(event);
      return;
    }

    if (event.type === 'state') {
      this.setPlaybackState(event.state);
      return;
    }

    if (event.type === 'ended') {
      this.setPlaybackState('ended');
      this.emit(event);
      return;
    }

    if (event.type === 'error' || event.type === 'unavailable') {
      this.setPlaybackState('error');
      this.emit(event);
      return;
    }

    // Process milestones
    if (event.type === 'progress' && event.payload) {
      const { currentTime, duration } = event.payload;
      if (duration > 0) {
        const percent = (currentTime / duration) * 100;
        
        if (percent >= 25 && !this.milestones[25]) {
          this.milestones[25] = true;
          this.emit({ type: 'progress', payload: { milestone: 25 } });
        }
        if (percent >= 50 && !this.milestones[50]) {
          this.milestones[50] = true;
          this.emit({ type: 'progress', payload: { milestone: 50 } });
        }
        if (percent >= 75 && !this.milestones[75]) {
          this.milestones[75] = true;
          this.emit({ type: 'progress', payload: { milestone: 75 } });
        }
      }
    }

    this.emit(event);
  }

  private setPlaybackState(state: PlaybackState) {
    if (this.playbackState === state) return;
    this.playbackState = state;
    console.log('[PlayerController] PLAYBACK STATE ->', state);
    this.emit({ type: 'state', state });
  }

  getPlaybackState(): PlaybackState {
    return this.playbackState;
  }

  async play(): Promise<void> {
    console.log('[PlayerController] PLAY', { isReady: this.isReady, adapter: !!this.adapter });
    this.pendingPause = false;
    if (!this.isReady) {
      this.pendingPlay = true;
    } else {
      this.pendingPlay = false;
    }
    if (this.adapter) await this.adapter.play();
  }

  async pause(reason: string = 'unknown'): Promise<void> {
    console.log('[PlayerController] PAUSE', { reason, isReady: this.isReady, adapter: !!this.adapter });
    this.pendingPlay = false;
    if (!this.isReady) {
      this.pendingPause = true;
    } else {
      this.pendingPause = false;
    }
    if (this.adapter) await this.adapter.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!this.isReady) {
      this.pendingSeekSec = seconds;
      return;
    }
    if (this.adapter) await this.adapter.seek(seconds);
  }

  async mute(): Promise<void> {
    if (this.adapter && this.adapter.mute) {
      await this.adapter.mute();
    }
  }

  async unmute(): Promise<void> {
    if (this.adapter && this.adapter.unmute) {
      await this.adapter.unmute();
    }
  }

  getDuration(): number {
    return this.adapter ? this.adapter.getDuration() : 0;
  }

  subscribe(listener: PlayerEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: PlayerEvent) {
    this.listeners.forEach(l => l(event));
  }

  async destroy(): Promise<void> {
    this.generation++;
    this.currentContentKey = null;
    this.listeners.clear();
    
    if (this.unsubscribeAdapter) {
      this.unsubscribeAdapter();
      this.unsubscribeAdapter = null;
    }
    
    if (this.adapter) {
      const oldAdapter = this.adapter;
      this.adapter = null;
      await oldAdapter.destroy();
    }
  }
}
