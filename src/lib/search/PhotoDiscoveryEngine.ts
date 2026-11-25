import type { ExternalPersonObservation } from './IExternalPersonSourceAdapter';

export class PhotoDiscoveryEngine {
  static discover(obs: ExternalPersonObservation): ExternalPersonObservation {
    // Only verify photos from highly trusted sources (e.g. GitHub avatar, institutional page)
    if (obs.source_system === 'GITHUB' && obs.external_data) {
       const gh = obs.external_data.find(d => d.source === 'GITHUB' && d.avatar_url);
       if (gh) {
           obs.photo = {
               url: gh.avatar_url,
               status: 'PUBLIC_PROFILE_CANDIDATE_PHOTO',
               source: 'GITHUB'
           };
       }
    }
    // Organization official person pages
    else if (obs.source_system === 'ORGANIZATION_WEBSITE' && obs.raw_payload?.photo_url) {
       obs.photo = {
           url: obs.raw_payload.photo_url,
           status: 'VERIFIED_SOURCE_PHOTO',
           source: 'ORGANIZATION_WEBSITE'
       };
    }
    else {
       obs.photo = { status: 'NO_PHOTO' };
    }
    
    return obs;
  }
}
