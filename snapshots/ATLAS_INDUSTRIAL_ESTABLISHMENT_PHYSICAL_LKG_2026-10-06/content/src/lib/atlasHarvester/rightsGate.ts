export type RightsProfile = {
    canDiscover: boolean;
    canIndex: boolean;
    canStoreMetadata: boolean;
    metadataTtlSeconds: number;
    canSemanticAnalyze: boolean;
    canEmbed: boolean;
    canThumbnail: boolean;
    canCache: boolean;
    canRehost: boolean;
};

export type RightsDecision = {
    decision: 'PASS' | 'FAIL';
    profileId: string;
    policyVersion: string;
    capabilities: RightsProfile;
    reason?: string;
};

export class RightsGate {
    evaluateYouTubeVideo(providerContentId: string, syntheticFail: boolean = false): RightsDecision {
        if (syntheticFail) {
            return {
                decision: 'FAIL',
                profileId: 'YOUTUBE_PUBLIC_V1',
                policyVersion: '1.0',
                reason: 'Synthetic block for Smoke Test',
                capabilities: {
                    canDiscover: true,
                    canIndex: false,
                    canStoreMetadata: false,
                    metadataTtlSeconds: 0,
                    canSemanticAnalyze: false,
                    canEmbed: false,
                    canThumbnail: false,
                    canCache: false,
                    canRehost: false
                }
            };
        }

        return {
            decision: 'PASS',
            profileId: 'YOUTUBE_PUBLIC_V1',
            policyVersion: '1.0',
            capabilities: {
                canDiscover: true,
                canIndex: true,
                canStoreMetadata: true,
                metadataTtlSeconds: 86400, // 24 hours
                canSemanticAnalyze: true,
                canEmbed: true,
                canThumbnail: true,
                canCache: true,
                canRehost: false // Never rehost YouTube videos
            }
        };
    }
}
