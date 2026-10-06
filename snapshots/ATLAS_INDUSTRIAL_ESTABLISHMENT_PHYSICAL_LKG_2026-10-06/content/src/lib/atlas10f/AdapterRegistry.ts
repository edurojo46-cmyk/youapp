import { AtlasActionType } from './types';
import { PlatformAdapter } from './PlatformAdapter';
import { EmailAdapter } from './adapters/EmailAdapter';
import { WhatsAppAdapter } from './adapters/WhatsAppAdapter';
import { InstagramAdapter } from './adapters/InstagramAdapter';
import { XAdapter } from './adapters/XAdapter';
import { YouTubeAdapter } from './adapters/YouTubeAdapter';
import { LinkedInAdapter } from './adapters/LinkedInAdapter';

export class AdapterRegistry {
  private static adapters: Map<AtlasActionType, PlatformAdapter<any>> = new Map();

  static {
    const email = new EmailAdapter();
    this.adapters.set('EMAIL_SEND', email);

    const wa = new WhatsAppAdapter();
    this.adapters.set('WHATSAPP_SERVICE_REPLY', wa);
    this.adapters.set('WHATSAPP_MARKETING_MESSAGE', wa);

    const ig = new InstagramAdapter();
    this.adapters.set('INSTAGRAM_DM', ig);
    this.adapters.set('INSTAGRAM_PUBLIC_REPLY', ig);

    const x = new XAdapter();
    this.adapters.set('X_DM', x);
    this.adapters.set('X_PUBLIC_REPLY', x);

    const yt = new YouTubeAdapter();
    this.adapters.set('YOUTUBE_COMMENT', yt);
    this.adapters.set('YOUTUBE_LIVE_CHAT', yt);

    const li = new LinkedInAdapter();
    this.adapters.set('LINKEDIN_COMMENT', li);
  }

  static getAdapter(actionType: AtlasActionType): PlatformAdapter<any> | null {
    return this.adapters.get(actionType) || null;
  }
}
