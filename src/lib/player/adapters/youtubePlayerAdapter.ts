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
  private host: HTMLElement | null = null;
  private listeners: Set<PlayerEventListener> = new Set();
  private progressInterval: any = null;
  private isDestroyed: boolean = false;
  private generation: number = 0;
  private videoId: string = '';
  
  constructor(container: HTMLElement) {
    this.container = container;
  }

  private loadYoutubeApi(): Promise<void> {
    if (typeof window !== 'undefined' && window.YT && typeof window.YT.Player === 'function') {
      return Promise.resolve();
    }
    
    if (!ytApiPromise) {
      ytApiPromise = new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (typeof window !== 'undefined' && window.YT && typeof window.YT.Player === 'function') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);

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
          clearInterval(checkInterval);
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
    this.isDestroyed = false;
    const currentGen = ++this.generation;

    return new Promise((resolve) => {
      if (this.container) {
        this.container.replaceChildren();
      }

      const host = document.createElement('div');
      host.dataset.youtubePlayer = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      host.style.width = '100%';
      host.style.height = '100%';
      this.container.appendChild(host);
      this.host = host;

      let rawId = item.providerContentId || item.playbackUrl || '';
      rawId = rawId.replace(/^yt-/, '').replace(/^mood-/, '').replace(/^live-/, '');
      
      let vidId = rawId;
      if (rawId.includes('youtube.com') || rawId.includes('youtu.be')) {
        const embedMatch = rawId.match(/embed\/([a-zA-Z0-9_-]{11})/);
        const vMatch = rawId.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        const shortMatch = rawId.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        const liveMatch = rawId.match(/live\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch) vidId = embedMatch[1];
        else if (vMatch) vidId = vMatch[1];
        else if (shortMatch) vidId = shortMatch[1];
        else if (liveMatch) vidId = liveMatch[1];
      } else {
        vidId = rawId.split('?')[0].split('&')[0];
      }

      this.videoId = vidId;

      const playerVars: any = {
        autoplay: item.autoplay ? 1 : 0,
        mute: item.muted ? 1 : 0,
        controls: 1, // User rule: Do not hide controls to comply with YT terms
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1
      };

      if (item.startOffsetSec !== undefined) {
        playerVars.start = Math.floor(item.startOffsetSec);
      }
      if (item.endOffsetSec !== undefined) {
        playerVars.end = Math.ceil(item.endOffsetSec);
      }

      this.player = new window.YT.Player(host, {
        width: '100%',
        height: '100%',
        videoId: vidId,
        playerVars,
        events: {
          onReady: (e: any) => {
            if (this.isDestroyed || currentGen !== this.generation) return;
            const st = e.target?.getPlayerState?.();
            const vd = e.target?.getVideoData?.();
            const dur = e.target?.getDuration?.() || 0;
            const cur = e.target?.getCurrentTime?.() || 0;
            console.log(`[YT] READY (gen=${currentGen}) -> state: ${st}, video_id: "${vd?.video_id || ''}", duration: ${dur}`);
            this.emit({ type: 'ready' });
            if (dur > 0) {
              this.emit({ type: 'progress', payload: { currentTime: cur, duration: dur } });
            }
            if (st === 1) this.emit({ type: 'state', state: 'playing' });
            else if (st === 2) this.emit({ type: 'state', state: 'paused' });
            else this.emit({ type: 'state', state: 'ready' });
            resolve();
          },
          onStateChange: (e: any) => {
            if (this.isDestroyed || currentGen !== this.generation) return;
            const vd = e.target?.getVideoData?.();
            const stateLabels: Record<number, string> = {
              [-1]: 'UNSTARTED',
              0: 'ENDED',
              1: 'PLAYING',
              2: 'PAUSED',
              3: 'BUFFERING',
              5: 'CUED'
            };
            console.log(`[YT] STATE CHANGE (gen=${currentGen}) -> state: ${e.data} (${stateLabels[e.data] || 'UNKNOWN'}), video_id: "${vd?.video_id || ''}"`);
            this.handleStateChange(e.data);
          },
          onError: (e: any) => {
            if (this.isDestroyed || currentGen !== this.generation) return;
            console.error(`[YT] ERROR (gen=${currentGen}) -> code: ${e.data}, expectedVideoId: "${this.videoId}"`);
            this.emit({ type: 'error', payload: e.data });
          }
        }
      });
    });
  }

  private handleStateChange(state: number) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued).
    switch (state) {
      case 1:
        this.emit({ type: 'state', state: 'playing' });
        this.emit({ type: 'play' });
        this.startProgressTracking();
        break;
      case 2:
        this.emit({ type: 'state', state: 'paused' });
        this.emit({ type: 'pause' });
        this.stopProgressTracking();
        break;
      case 0:
        this.emit({ type: 'state', state: 'ended' });
        this.emit({ type: 'ended' });
        this.stopProgressTracking();
        break;
      case 3:
        this.emit({ type: 'state', state: 'buffering' });
        this.emit({ type: 'buffering' });
        break;
      case 5:
      case -1:
        this.emit({ type: 'state', state: 'ready' });
        this.emit({ type: 'cued' });
        this.stopProgressTracking();
        break;
      default:
        break;
    }
  }

  private startProgressTracking() {
    this.stopProgressTracking();
    const tick = () => {
      if (this.player && typeof this.player.getCurrentTime === 'function') {
        const cur = this.player.getCurrentTime() || 0;
        const dur = (typeof this.player.getDuration === 'function' ? this.player.getDuration() : 0) || 0;
        this.emit({ 
          type: 'progress', 
          payload: { 
            currentTime: cur, 
            duration: dur 
          } 
        });
      }
    };
    tick();
    this.progressInterval = setInterval(tick, 250);
  }

  private stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  async play(): Promise<void> {
    const p = this.player;
    console.log(`[YouTubeAdapter] playVideo() -> playerAvailable: ${!!p}, videoId: "${this.videoId}"`);

    if (!p) return;

    try {
      const state = p.getPlayerState ? p.getPlayerState() : 'no-fn';
      const videoData = p.getVideoData ? p.getVideoData() : {};
      console.log(`[YouTubeAdapter] BEFORE PLAY -> state: ${state}, video_id: "${videoData?.video_id || ''}", duration: ${p.getDuration?.()}`);

      if (typeof p.playVideo === 'function') {
        p.playVideo();
      }

      const beforeTime = p.getCurrentTime ? p.getCurrentTime() : 0;
      setTimeout(() => {
        const afterTime = p.getCurrentTime ? p.getCurrentTime() : 0;
        const delta = (typeof afterTime === 'number' && typeof beforeTime === 'number') ? (afterTime - beforeTime).toFixed(2) : '0.00';
        console.log(`[PLAYBACK MOTION TEST] before=${beforeTime.toFixed(2)} after=${afterTime.toFixed(2)} delta=${delta}`);
      }, 1500);

      setTimeout(() => {
        const stateAfter = p.getPlayerState ? p.getPlayerState() : 'no-fn';
        const videoDataAfter = p.getVideoData ? p.getVideoData() : {};
        console.log(`[YouTubeAdapter] AFTER PLAY 500ms -> state: ${stateAfter}, video_id: "${videoDataAfter?.video_id || ''}", duration: ${p.getDuration?.()}`);
      }, 500);
    } catch (error) {
      console.error('[YouTubeAdapter] PLAY THREW', error);
    }
  }

  async pause(): Promise<void> {
    console.log('[YouTubeAdapter] pauseVideo()', { playerAvailable: !!this.player });
    if (this.player && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
        const cur = this.player.getCurrentTime?.() || 0;
        const dur = this.player.getDuration?.() || 0;
        this.emit({ type: 'progress', payload: { currentTime: cur, duration: dur } });
      } catch (e) {
        console.warn('YT pauseVideo error:', e);
      }
    }
  }

  async seek(seconds: number): Promise<void> {
    if (this.player && typeof this.player.seekTo === 'function') {
      this.player.seekTo(seconds, true);
      const dur = this.player.getDuration?.() || 0;
      this.emit({ type: 'progress', payload: { currentTime: seconds, duration: dur } });
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
    this.isDestroyed = true;
    ++this.generation;
    this.stopProgressTracking();
    
    if (this.player && typeof this.player.destroy === 'function') {
      try {
        this.player.destroy();
      } catch (e) {}
    }
    
    this.player = null;
    
    if (this.host && this.host.parentElement) {
      this.host.parentElement.removeChild(this.host);
    }
    this.host = null;
  }
}
