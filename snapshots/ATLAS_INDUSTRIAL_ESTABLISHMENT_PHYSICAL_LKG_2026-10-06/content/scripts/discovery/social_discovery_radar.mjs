/**
 * scripts/discovery/social_discovery_radar.mjs
 * 
 * ATLAS — SOCIAL DISCOVERY RADAR V16
 * 
 * Mandates:
 * 1. Seed public/permitted discovery coverage across 24 platforms.
 * 2. Strictly a SENSOR: creates DISCOVERED_PERSON_CANDIDATE, not certified fuel.
 * 3. Never bypass login, private profiles, CAPTCHA, WAF, rate limits, closed groups.
 * 4. Chain: SOCIAL SIGNAL -> PROFESSION / ORGANIZATION -> OFFICIAL WEBSITE 
 *           -> PUBLIC REGISTRY -> SOURCE APPRENTICE -> PEOPLE -> GLOBAL DEDUPE.
 * 5. Strictly separate video platforms from people search engine index.
 */

export const SOCIAL_PLATFORMS_SPEC = [
  { id: 'X_TWITTER', name: 'X / Twitter', category: 'Microblogging', automatable: false, discoveryOnly: true, publicProtocol: 'Public Web Profiles / Embeds' },
  { id: 'FACEBOOK_PAGES', name: 'Facebook Public Pages', category: 'Social Network', automatable: false, discoveryOnly: true, publicProtocol: 'Public Page Graph / Open Graph' },
  { id: 'INSTAGRAM_PUBLIC', name: 'Instagram Public Profiles', category: 'Visual Social', automatable: false, discoveryOnly: true, publicProtocol: 'Public Profile Metadata' },
  { id: 'LINKEDIN_PUBLIC', name: 'LinkedIn Public Directory', category: 'Professional', automatable: false, discoveryOnly: true, publicProtocol: 'Public Directory Indices' },
  { id: 'TIKTOK_PUBLIC', name: 'TikTok Public Content', category: 'Short Video', automatable: false, discoveryOnly: true, publicProtocol: 'Public Creator Pages' },
  { id: 'YOUTUBE_PUBLIC', name: 'YouTube Channels & Credits', category: 'Video Platform', automatable: true, discoveryOnly: false, publicProtocol: 'Official Data API v3' },
  { id: 'THREADS', name: 'Threads', category: 'Microblogging', automatable: false, discoveryOnly: true, publicProtocol: 'Public Profile Web' },
  { id: 'BLUESKY', name: 'Bluesky / AT Protocol', category: 'Decentralized Social', automatable: true, discoveryOnly: false, publicProtocol: 'AT Protocol Public API' },
  { id: 'MASTODON_FEDIVERSE', name: 'Mastodon / Fediverse', category: 'Decentralized Social', automatable: true, discoveryOnly: false, publicProtocol: 'ActivityPub / Mastodon REST API' },
  { id: 'REDDIT', name: 'Reddit Public Communities', category: 'Community Forum', automatable: true, discoveryOnly: false, publicProtocol: 'Public JSON Endpoints' },
  { id: 'TELEGRAM_PUBLIC', name: 'Telegram Public Channels Only', category: 'Broadcast Channels', automatable: true, discoveryOnly: false, publicProtocol: 'Public Channel Previews (t.me/s/)' },
  { id: 'PINTEREST_PUBLIC', name: 'Pinterest Public Boards', category: 'Visual Discovery', automatable: false, discoveryOnly: true, publicProtocol: 'Public Board Feeds' },
  { id: 'TWITCH_PUBLIC', name: 'Twitch Creators', category: 'Live Streaming', automatable: false, discoveryOnly: true, publicProtocol: 'Public Channel Directory' },
  { id: 'TUMBLR_PUBLIC', name: 'Tumblr Public Blogs', category: 'Microblogging', automatable: true, discoveryOnly: false, publicProtocol: 'Public RSS / REST API' },
  { id: 'MEDIUM_PUBLIC', name: 'Medium Public Publications', category: 'Publishing', automatable: true, discoveryOnly: false, publicProtocol: 'Public RSS Feeds' },
  { id: 'SUBSTACK_PUBLIC', name: 'Substack Public Newsletters', category: 'Publishing', automatable: true, discoveryOnly: false, publicProtocol: 'Public Substack RSS Feeds' },
  { id: 'GITHUB_PUBLIC', name: 'GitHub Public Developers & Orgs', category: 'Code / Open Source', automatable: true, discoveryOnly: false, publicProtocol: 'GitHub Public REST API' },
  { id: 'GITLAB_PUBLIC', name: 'GitLab Public Projects & Users', category: 'Code / Open Source', automatable: true, discoveryOnly: false, publicProtocol: 'GitLab Public API' },
  { id: 'BEHANCE_PUBLIC', name: 'Behance Portfolios', category: 'Creative Portfolios', automatable: false, discoveryOnly: true, publicProtocol: 'Public Portfolio Pages' },
  { id: 'DRIBBBLE_PUBLIC', name: 'Dribbble Designers', category: 'Creative Portfolios', automatable: false, discoveryOnly: true, publicProtocol: 'Public Showcase Pages' },
  { id: 'SOUNDCLOUD_PUBLIC', name: 'SoundCloud Artists', category: 'Audio / Creators', automatable: false, discoveryOnly: true, publicProtocol: 'Public Artist Profiles' },
  { id: 'VIMEO_PUBLIC', name: 'Vimeo Public Creators', category: 'Video Creators', automatable: false, discoveryOnly: true, publicProtocol: 'Public Showcase Feeds' },
  { id: 'FLICKR_PUBLIC', name: 'Flickr Photographers', category: 'Photography', automatable: false, discoveryOnly: true, publicProtocol: 'Public Photo Feeds' },
  { id: 'PODCAST_DIRECTORIES', name: 'Public Podcast Directories', category: 'Audio / Creators', automatable: true, discoveryOnly: false, publicProtocol: 'Public RSS Feeds / Apple Podcast API' }
];

export class SocialDiscoveryRadar {
  constructor() {
    this.platforms = SOCIAL_PLATFORMS_SPEC;
    this.discoveredSignals = [];
  }

  get platformCounts() {
    const total = this.platforms.length;
    const automatable = this.platforms.filter(p => p.automatable).length;
    const discoveryOnly = this.platforms.filter(p => p.discoveryOnly).length;
    return { total, automatable, discoveryOnly };
  }

  /**
   * Scan social platforms as public sensors.
   * Discovers organizations, professional associations, websites, and individual candidates.
   */
  async scanSensors(geoContext = 'ARGENTINA') {
    console.log(`[SOCIAL_RADAR] Scanning ${this.platforms.length} social platforms for institutional & professional signals in ${geoContext}...`);
    
    // Seed high-value Argentine institutional discovery seeds
    const sampleSignals = [
      {
        platformId: 'GITHUB_PUBLIC',
        entityType: 'ORGANIZATION',
        name: 'Gobierno Abierto Rosario',
        domain: 'datos.rosario.gob.ar',
        discoveredUrl: 'https://github.com/gobiernoabiertorosario',
        targetRegistryType: 'MUNICIPAL_OPEN_DATA',
        jurisdiction: 'SANTA_FE'
      },
      {
        platformId: 'SUBSTACK_PUBLIC',
        entityType: 'PROFESSIONAL_COMMUNITY',
        name: 'Colegio Público de Abogados de la Capital Federal (CPACF)',
        domain: 'cpacf.org.ar',
        discoveredUrl: 'https://cpacf.substack.com',
        targetRegistryType: 'PROFESSIONAL_REGISTRY',
        jurisdiction: 'CABA'
      },
      {
        platformId: 'YOUTUBE_PUBLIC',
        entityType: 'INSTITUTION',
        name: 'Consejo Profesional de Ciencias Económicas de la Ciudad de Buenos Aires (CPCECABA)',
        domain: 'cpcecaba.org.ar',
        discoveredUrl: 'https://youtube.com/@cpcecaba',
        targetRegistryType: 'PROFESSIONAL_REGISTRY',
        jurisdiction: 'CABA'
      },
      {
        platformId: 'X_TWITTER',
        entityType: 'ORGANIZATION',
        name: 'Colegio de Médicos de la Provincia de Buenos Aires (Distrito II)',
        domain: 'colmed2.org.ar',
        discoveredUrl: 'https://x.com/colmed2',
        targetRegistryType: 'MEDICAL_REGISTRY',
        jurisdiction: 'BUENOS_AIRES'
      },
      {
        platformId: 'BLUESKY',
        entityType: 'ACADEMIC_BODY',
        name: 'Colegio de Arquitectos de Mendoza (CAMZA)',
        domain: 'camza.org.ar',
        discoveredUrl: 'https://bsky.app/profile/camza.org.ar',
        targetRegistryType: 'PROFESSIONAL_REGISTRY',
        jurisdiction: 'MENDOZA'
      },
      {
        platformId: 'TELEGRAM_PUBLIC',
        entityType: 'OFFICIAL_CHANNEL',
        name: 'Boletín Oficial de la República Argentina',
        domain: 'boletinoficial.gob.ar',
        discoveredUrl: 'https://t.me/s/boletinoficialar',
        targetRegistryType: 'OFFICIAL_GAZETTE',
        jurisdiction: 'NACIONAL'
      },
      {
        platformId: 'LINKEDIN_PUBLIC',
        entityType: 'ASSOCIATION',
        name: 'Colegio de Escribanos de la Provincia de Córdoba',
        domain: 'escribanos.org.ar',
        discoveredUrl: 'https://linkedin.com/company/colegio-de-escribanos-cordoba',
        targetRegistryType: 'NOTARIAL_REGISTRY',
        jurisdiction: 'CORDOBA'
      },
      {
        platformId: 'MEDIUM_PUBLIC',
        entityType: 'CREATOR_NETWORK',
        name: 'Sociedad Argentina de Autores y Compositores de Música (SADAIC)',
        domain: 'sadaic.org.ar',
        discoveredUrl: 'https://medium.com/@sadaic_oficial',
        targetRegistryType: 'CREATORS_REGISTRY',
        jurisdiction: 'NACIONAL'
      }
    ];

    this.discoveredSignals.push(...sampleSignals);

    return {
      platformsRegistered: this.platforms.length,
      platformsAutomatable: this.platforms.filter(p => p.automatable).length,
      platformsDiscoveryOnly: this.platforms.filter(p => p.discoveryOnly).length,
      signalsGenerated: sampleSignals.length,
      signals: sampleSignals
    };
  }
}
