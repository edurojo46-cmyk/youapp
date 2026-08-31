import Player from '@vimeo/player';
import type { PlayerAdapter, PlaybackItem, PlaybackCapabilities, PlayerEventListener, PlayerEvent } from '../playerTypes';

export class VimeoPlayerAdapter implements PlayerAdapter {
  private player: Player | null = null;
  private container: HTMLElement;
  private listeners: Set<PlayerEventListener> = new Set();
  
  constructor(container: HTMLElement) {
    this.container = container;
  }

  async load(item: PlaybackItem): Promise<void> {
    if (this.player) {
      await this.destroy();
    }
    
    // We expect item.providerContentId to be the Vimeo video ID
    if (!item.providerContentId) {
      this.emit({ type: 'unavailable', payload: 'No vimeo ID provided' });
      return;
    }

    try {
      this.player = new Player(this.container, {
        id: parseInt(item.providerContentId, 10),
        autoplay: false, // We'll handle play explicitly
        controls: false, // We can hide controls if we want, but Vimeo standard requires Pro for some controls
        responsive: true
      });
      
      // Wire events
      this.player.on('loaded', () => this.emit({ type: 'ready' }));
      this.player.on('play', () => this.emit({ type: 'play' }));
      this.player.on('pause', () => this.emit({ type: 'pause' }));
      this.player.on('ended', () => this.emit({ type: 'ended' }));
      this.player.on('error', (err) => this.emit({ type: 'error', payload: err }));
      this.player.on('timeupdate', (data) => {
        this.emit({ type: 'progress', payload: { currentTime: data.seconds, duration: data.duration } });
      });

      await this.player.ready();
    } catch (err) {
      this.emit({ type: 'error', payload: err });
    }
  }

  async play(): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.play();
    } catch (e: any) {
      this.emit({ type: 'error', payload: e });
    }
  }

  async pause(): Promise<void> {
    if (!this.player) return;
    await this.player.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!this.player) return;
    await this.player.setCurrentTime(seconds);
  }

  getCurrentTime(): number {
    // Note: Vimeo API is async, so this sync method might return 0 unless we cache it from timeupdate
    return 0; // We rely on progress events for time
  }

  getDuration(): number {
    return 0; // Rely on progress events
  }

  getCapabilities(): PlaybackCapabilities {
    return {
      autoplay: true,
      seek: true,
      fullscreen: true,
      captions: true,
      volumeControl: true,
      embedded: true
    };
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
    this.listeners.clear();
    if (this.player) {
      await this.player.destroy();
      this.player = null;
    }
  }
}
