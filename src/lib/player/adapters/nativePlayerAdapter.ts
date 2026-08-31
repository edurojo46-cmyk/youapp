import type { PlayerAdapter, PlaybackItem, PlaybackCapabilities, PlayerEventListener, PlayerEvent } from '../playerTypes';

export class NativePlayerAdapter implements PlayerAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private container: HTMLElement;
  private listeners: Set<PlayerEventListener> = new Set();
  
  constructor(container: HTMLElement) {
    this.container = container;
  }

  async load(item: PlaybackItem): Promise<void> {
    if (this.videoElement) {
      await this.destroy();
    }

    const video = document.createElement('video');
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.backgroundColor = 'black';
    video.controls = false;
    video.playsInline = true;
    
    // We only attach src if we have a valid playbackUrl
    if (item.playbackUrl) {
      video.src = item.playbackUrl;
    } else {
      // If we don't have a playbackUrl for a native adapter, it's unavailable
      this.emit({ type: 'unavailable', payload: 'No playbackUrl provided for native video' });
      return;
    }

    this.videoElement = video;
    this.container.appendChild(video);

    // Wire native events to universal events
    video.addEventListener('canplay', () => this.emit({ type: 'ready' }));
    video.addEventListener('play', () => this.emit({ type: 'play' }));
    video.addEventListener('pause', () => this.emit({ type: 'pause' }));
    video.addEventListener('ended', () => this.emit({ type: 'ended' }));
    video.addEventListener('error', (e) => this.emit({ type: 'error', payload: e }));
    video.addEventListener('timeupdate', () => {
      this.emit({ type: 'progress', payload: { currentTime: video.currentTime, duration: video.duration } });
    });

    video.load();
  }

  async play(): Promise<void> {
    if (!this.videoElement) return;
    try {
      await this.videoElement.play();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        this.emit({ type: 'error', payload: e });
      }
    }
  }

  async pause(): Promise<void> {
    if (!this.videoElement) return;
    this.videoElement.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!this.videoElement) return;
    this.videoElement.currentTime = seconds;
  }

  getCurrentTime(): number {
    return this.videoElement ? this.videoElement.currentTime : 0;
  }

  getDuration(): number {
    return this.videoElement ? this.videoElement.duration || 0 : 0;
  }

  getCapabilities(): PlaybackCapabilities {
    return {
      autoplay: true,
      seek: true,
      fullscreen: true,
      captions: false,
      volumeControl: true,
      embedded: false
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
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      if (this.container.contains(this.videoElement)) {
        this.container.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
  }
}
