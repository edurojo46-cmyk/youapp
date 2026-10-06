import crypto from 'crypto';

export interface YouTubeAdapterOptions {
    apiKey?: string;
    isTestMode?: boolean;
    fetchImpl?: typeof fetch;
}

export interface YouTubeSearchResult {
    videoId: string;
    channelId: string;
    title: string;
    description: string;
    publishedAt: string;
    canonicalUrl: string;
    channelTitle: string;
    engagement: {
        viewCount?: number;
        likeCount?: number;
        commentCount?: number;
    };
    contentHash: string;
}

export class YouTubeReadOnlyAdapter {
    private apiKey: string;
    private isTestMode: boolean;
    private fetch: typeof fetch;
    private baseUrl = 'https://www.googleapis.com/youtube/v3';

    public readonly capabilities = {
        READ_SEARCH: true,
        READ_VIDEO: true,
        READ_CHANNEL: true,
        WRITE_COMMENT: false,
        WRITE_LIKE: false,
        WRITE_SUBSCRIBE: false,
        WRITE_UPLOAD: false,
    } as const;

    constructor(options: YouTubeAdapterOptions) {
        this.isTestMode = options.isTestMode ?? false;
        this.fetch = options.fetchImpl ?? globalThis.fetch;

        // In real mode, a missing key is a FATAL_CONFIG.
        // In test mode, we allow a dummy key if provided by mocks.
        if (!options.apiKey && !this.isTestMode) {
            throw new Error('FATAL_CONFIG: YOUTUBE_API_KEY is missing in production mode.');
        }
        
        if (!options.apiKey && this.isTestMode) {
            this.apiKey = 'test_key';
        } else {
            this.apiKey = options.apiKey!;
        }
    }

    private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
        // Log intentionally sanitizes the URL to avoid leaking keys even if passed in query string by accident,
        // but we exclusively use headers for auth.
        const url = new URL(`${this.baseUrl}${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        const headers = {
            'x-goog-api-key': this.apiKey,
            'Accept': 'application/json'
        };

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            let errorText = response.statusText;
            try {
                const errJson = await response.json();
                errorText = JSON.stringify(errJson);
            } catch (e) {}

            if (response.status === 403 || response.status === 429) {
                throw new Error(`QUOTA_EXCEEDED: ${errorText}`);
            }
            if (response.status >= 400 && response.status < 500) {
                 throw new Error(`MALFORMED_API_RESULT: ${errorText}`);
            }
            throw new Error(`API_ERROR: ${errorText}`);
        }

        return await response.json();
    }

    public async search(query: string, maxResults: number = 10, pageToken?: string): Promise<{ items: YouTubeSearchResult[], nextPageToken?: string }> {
        // 1. Search List
        const searchParams: Record<string, string> = {
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: maxResults.toString()
        };
        if (pageToken) searchParams.pageToken = pageToken;

        const searchData = await this.request<any>('/search', searchParams);
        
        if (!searchData.items || searchData.items.length === 0) {
            return { items: [], nextPageToken: searchData.nextPageToken };
        }

        // 2. Batch Video List
        const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
        const videoData = await this.request<any>('/videos', {
            part: 'snippet,statistics',
            id: videoIds
        });

        // 3. Batch Channel List (Unique)
        const channelIds = [...new Set(videoData.items.map((item: any) => item.snippet.channelId))].join(',');
        let channelData: any = { items: [] };
        if (channelIds) {
            channelData = await this.request<any>('/channels', {
                part: 'snippet,statistics',
                id: channelIds
            });
        }

        // 4. Map & Normalize
        const channelMap = new Map(channelData.items.map((c: any) => [c.id, c]));
        
        const normalizedItems: YouTubeSearchResult[] = videoData.items.map((video: any) => {
            const channel = channelMap.get(video.snippet.channelId);
            
            const result: YouTubeSearchResult = {
                videoId: video.id,
                channelId: video.snippet.channelId,
                title: video.snippet.title,
                description: video.snippet.description,
                publishedAt: video.snippet.publishedAt,
                canonicalUrl: `https://youtube.com/watch?v=${video.id}`,
                channelTitle: channel?.snippet?.title || video.snippet.channelTitle,
                engagement: {
                    viewCount: video.statistics?.viewCount ? parseInt(video.statistics.viewCount, 10) : undefined,
                    likeCount: video.statistics?.likeCount ? parseInt(video.statistics.likeCount, 10) : undefined,
                    commentCount: video.statistics?.commentCount ? parseInt(video.statistics.commentCount, 10) : undefined
                },
                contentHash: ''
            };

            // Calculate deterministic hash
            result.contentHash = crypto.createHash('sha256')
                .update(result.title)
                .update(result.description)
                .update(result.channelId)
                .digest('hex');

            return result;
        });

        return {
            items: normalizedItems,
            nextPageToken: searchData.nextPageToken
        };
    }
}
