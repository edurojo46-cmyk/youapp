import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeReadOnlyAdapter } from '../src/social/adapters/YouTubeReadOnlyAdapter';
import crypto from 'crypto';

describe('ATLAS 10B.5 - YouTube Read-Only Adapter Local Certification', () => {
    
    let fetchMock: any;
    
    beforeEach(() => {
        fetchMock = vi.fn();
    });

    it('1. missing real credential in production => FATAL_CONFIG', () => {
        expect(() => {
            new YouTubeReadOnlyAdapter({ isTestMode: false });
        }).toThrow(/FATAL_CONFIG/);
    });

    it('2. fixtures cannot escape TEST mode', () => {
        const adapter = new YouTubeReadOnlyAdapter({ isTestMode: true });
        expect((adapter as any).apiKey).toBe('test_key');
        
        expect(() => {
            new YouTubeReadOnlyAdapter({ isTestMode: false });
        }).toThrow(/FATAL_CONFIG/);
    });

    it('3. no social write method exists in capabilities', () => {
        const adapter = new YouTubeReadOnlyAdapter({ isTestMode: true });
        expect(adapter.capabilities.WRITE_COMMENT).toBe(false);
        expect(adapter.capabilities.WRITE_LIKE).toBe(false);
        expect(adapter.capabilities.WRITE_SUBSCRIBE).toBe(false);
        expect(adapter.capabilities.WRITE_UPLOAD).toBe(false);
        
        // Assert absence of any methods on the prototype
        const proto = Object.getPrototypeOf(adapter);
        const methods = Object.getOwnPropertyNames(proto);
        expect(methods).not.toContain('comment');
        expect(methods).not.toContain('like');
        expect(methods).not.toContain('upload');
    });

    it('4. batching, normalization and API key via header', async () => {
        fetchMock.mockImplementation(async (url: string, options: any) => {
            // Verify auth header
            expect(options.headers['x-goog-api-key']).toBe('test_key');
            expect(url).not.toContain('test_key'); // Never in URL

            if (url.includes('/search')) {
                return {
                    ok: true,
                    json: async () => ({
                        items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }],
                        nextPageToken: 'token123'
                    })
                };
            }
            if (url.includes('/videos')) {
                // Verify batching
                const u = new URL(url);
                expect(u.searchParams.get('id')).toBe('v1,v2');
                return {
                    ok: true,
                    json: async () => ({
                        items: [
                            { id: 'v1', snippet: { channelId: 'c1', title: 't1', description: 'd1', publishedAt: 'p1' }, statistics: { viewCount: '10' } },
                            { id: 'v2', snippet: { channelId: 'c1', title: 't2', description: 'd2', publishedAt: 'p2' }, statistics: { viewCount: '20' } }
                        ]
                    })
                };
            }
            if (url.includes('/channels')) {
                const u = new URL(url);
                expect(u.searchParams.get('id')).toBe('c1'); // Deduplicated channel batch
                return {
                    ok: true,
                    json: async () => ({
                        items: [{ id: 'c1', snippet: { title: 'Channel 1' } }]
                    })
                };
            }
            return { ok: false, status: 404 };
        });

        const adapter = new YouTubeReadOnlyAdapter({ isTestMode: true, fetchImpl: fetchMock });
        const res = await adapter.search('test query', 2);
        
        expect(res.items).toHaveLength(2);
        expect(res.items[0].videoId).toBe('v1');
        expect(res.items[0].channelTitle).toBe('Channel 1'); // normalized
        expect(res.items[0].engagement.viewCount).toBe(10);
        expect(res.nextPageToken).toBe('token123');
        expect(res.items[0].contentHash).toBeDefined();
    });

    it('5. quota/rate errors -> controlled halt', async () => {
        fetchMock.mockImplementation(async () => {
            return { ok: false, status: 429, statusText: 'Too Many Requests' };
        });
        const adapter = new YouTubeReadOnlyAdapter({ isTestMode: true, fetchImpl: fetchMock });
        
        await expect(adapter.search('test')).rejects.toThrow(/QUOTA_EXCEEDED/);
    });

    it('6. malformed response -> safe reject', async () => {
        fetchMock.mockImplementation(async () => {
            return { ok: false, status: 400, statusText: 'Bad Request' };
        });
        const adapter = new YouTubeReadOnlyAdapter({ isTestMode: true, fetchImpl: fetchMock });
        
        await expect(adapter.search('test')).rejects.toThrow(/MALFORMED_API_RESULT/);
    });
});
