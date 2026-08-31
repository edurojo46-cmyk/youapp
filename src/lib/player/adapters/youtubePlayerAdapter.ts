import type { PlayerAdapter, PlaybackItem, PlaybackCapabilities, PlayerEventListener, PlayerEvent } from '../playerTypes';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Shared promise for YT API initialization
let ytApiPromise: Promise<void> | null = null;

export class YouTubePlayerAdapter implements PlayerAdapter {
  private player: any = null;
  private container: HTMLElement;
  private listeners: Set<PlayerEventListener> = new Set();
  private progressInterval: any = null;
  private playerDiv: HTMLElement | null = null;
  
  constructor(container: HTMLElement) {
    this.container = container;
  }

  private loadYoutubeApi(): Promise<void> {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }
    
    if (!ytApiPromise) {
      ytApiPromise = new Promise((resolve) => {
        const existingScript = document.getElementById('youtube-api-script');
        if (!existingScript) {
          const script = document.createElement('script');
          script.id = 'youtube-api-script';
          script.src = 'https://www.youtube.com/iframe_api';
          document.body.appendChild(script);
        }

        const prevCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          resolve();
        };
      });
    }
    
    return ytApiPromise;
  }

  async load(item: PlaybackItem): Promise<void> {
    await this.destroy();

    if (!item.providerContentId) {
      this.emit({ type: 'unavailable', payload: 'No YouTube ID provided' });
      return;
    }

    await this.loadYoutubeApi();

    return new Promise((resolve) => {
      this.playerDiv = document.createElement('div');
      this.playerDiv.id = `yt-player-${Math.random().toString(36).substring(2, 11)}`;
      this.playerDiv.style.width = '100%';
      this.playerDiv.style.height = '100%';
      this.container.appendChild(this.playerDiv);

      let vidId = item.providerContentId;
      if (vidId.includes('youtube.com') || vidId.includes('youtu.be')) {
        const match = vidId.match(/[?&]v=([^&]+)/) || vidId.match(/youtu\.be\/([^?]+)/);
        if (match && match[1]) {
          vidId = match[1];
        }
      }

      const playerVars: any = {
        autoplay: 1,
        mute: item.muted ? 1 : 0,
        controls: 1, // User rule: Do not hide controls to comply with YT terms
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin,
        enablejsapi: 1
      };

      if (item.startOffsetSec !== undefined) {
        playerVars.start = Math.floor(item.startOffsetSec);
      }
      if (item.endOffsetSec !== undefined) {
        playerVars.end = Math.ceil(item.endOffsetSec);
      }

      // Stagger initialization sequentially to prevent YouTube API race conditions when loading 4 players
      const delay = (window as any).__ytStagger = ((window as any).__ytStagger || 0) + 150;
      setTimeout(() => {
        this.player = new window.YT.Player(this.playerDiv!.id, {
          width: '100%',
          height: '100%',
          videoId: vidId,
          playerVars,
          events: {
            onReady: (e: any) => {
              // We rely on playerVars.mute to mute the video.
              // Calling e.target.mute() here triggers a premature postMessage that fails.
              this.emit({ type: 'ready' });
              resolve();
            },
            onStateChange: (e: any) => this.handleStateChange(e.data),
            onError: (e: any) => {
              console.error("YT Player Error:", e.data);
              this.emit({ type: 'error', payload: e.data });
            }
          }
        });
      }, delay % 600);

    });
  }

  private handleStateChange(state: number) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued).
    switch (state) {
      case 1:
        this.emit({ type: 'play' });
        this.startProgressTracking();
        break;
      case 2:
        this.emit({ type: 'pause' });
        this.stopProgressTracking();
        break;
      case 0:
        this.emit({ type: 'ended' });
        this.stopProgressTracking();
        break;
      default:
        break;
    }
  }

  private startProgressTracking() {
    this.stopProgressTracking();
    this.progressInterval = setInterval(() => {
      if (this.player && this.player.getCurrentTime) {
        this.emit({ 
          type: 'progress', 
          payload: { 
            currentTime: this.player.getCurrentTime(), 
            duration: this.player.getDuration() 
          } 
        });
      }
    }, 1000);
  }

  private stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  async play(): Promise<void> {
    if (this.player && this.player.playVideo) {
      this.player.playVideo();
    }
  }

  async pause(): Promise<void> {
    if (this.player && this.player.pauseVideo) {
      this.player.pauseVideo();
    }
  }

  async seek(seconds: number): Promise<void> {
    if (this.player && this.player.seekTo) {
      this.player.seekTo(seconds, true);
    }
  }

  async mute(): Promise<void> {
    if (this.player && this.player.mute) {
      this.player.mute();
    }
  }

  async unmute(): Promise<void> {
    if (this.player && this.player.unMute) {
      this.player.unMute();
    }
  }

  getCurrentTime(): number {
    return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
  }

  getDuration(): number {
    return this.player && this.player.getDuration ? this.player.getDuration() : 0;
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
    this.stopProgressTracking();
    this.listeners.clear();
    
    if (this.player && this.player.destroy) {
      this.player.destroy();
    }
    
    this.player = null;
    
    // The YT API replaces our div with an iframe. We must clean up the container's children.
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
