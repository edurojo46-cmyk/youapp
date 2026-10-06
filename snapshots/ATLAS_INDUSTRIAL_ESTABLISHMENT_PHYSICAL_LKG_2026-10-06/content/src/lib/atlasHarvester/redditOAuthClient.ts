/**
 * redditOAuthClient.ts — Cliente Oficial de Autenticación y Paginación OAuth de Reddit
 *
 * Utiliza el flujo Application-Only (client_credentials) de Reddit sin web scraping.
 * Credenciales leídas exclusivamente de process.env.
 */

export interface RedditListingPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  selftext?: string;
  mediaHtml?: string;
  createdUtc: number;
}

export interface RedditListingResponse {
  posts: RedditListingPost[];
  after: string | null;
  rateLimitRemaining: number;
  rateLimitResetSec: number;
}

export class RedditOAuthClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private clientId: string;
  private clientSecret: string;
  private userAgent: string;

  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID || '';
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET || '';
    this.userAgent = process.env.REDDIT_USER_AGENT || 'YouAppTV-AtlasHarvester/2.0 (by /u/youapp_bot)';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    try {
      const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!res.ok) {
        console.error(`[RedditOAuthClient] Token request failed with HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
      return this.accessToken;
    } catch (err: any) {
      console.error(`[RedditOAuthClient] OAuth token error: ${err?.message || err}`);
      return null;
    }
  }

  async fetchSubredditListing(
    subreddit: string,
    listing: 'top' | 'hot' | 'new' = 'top',
    timeFilter: 'all' | 'year' | 'month' | 'week' = 'all',
    after: string | null = null,
    limit = 100
  ): Promise<RedditListingResponse> {
    const token = await this.getAccessToken();

    // Si hay token OAuth, usar endpoint oficial oauth.reddit.com
    const baseUrl = token
      ? `https://oauth.reddit.com/r/${subreddit}/${listing}`
      : `https://www.reddit.com/r/${subreddit}/${listing}.json`;

    const query = new URLSearchParams({
      limit: limit.toString(),
      t: timeFilter,
      raw_json: '1'
    });
    if (after) query.set('after', after);

    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}?${query.toString()}`, {
      signal: AbortSignal.timeout(7000),
      headers
    });

    const rateLimitRemaining = parseInt(res.headers.get('x-ratelimit-remaining') || '100', 10);
    const rateLimitResetSec = parseInt(res.headers.get('x-ratelimit-reset') || '60', 10);

    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[RedditOAuthClient] Rate limit 429 alcanzado. Reset en ${rateLimitResetSec}s.`);
      }
      return { posts: [], after: null, rateLimitRemaining, rateLimitResetSec };
    }

    const json = await res.json();
    const children = json?.data?.children || [];
    const nextAfter = json?.data?.after || null;

    const posts: RedditListingPost[] = children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      url: c.data.url,
      permalink: c.data.permalink,
      subreddit: c.data.subreddit,
      selftext: c.data.selftext,
      mediaHtml: c.data.media?.oembed?.html,
      createdUtc: c.data.created_utc
    }));

    return {
      posts,
      after: nextAfter,
      rateLimitRemaining,
      rateLimitResetSec
    };
  }
}
