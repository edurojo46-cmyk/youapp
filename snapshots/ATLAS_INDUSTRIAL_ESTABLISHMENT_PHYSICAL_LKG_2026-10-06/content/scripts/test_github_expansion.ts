import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

async function testGitHubExpansion() {
  const query = 'location:"Buenos Aires"';
  const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=30&page=2`;
  console.log('Fetching GitHub users...');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AtlasPersonSearch/1.0',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!res.ok) {
    console.error('GitHub API error:', res.status, res.statusText);
    return;
  }

  const data: any = await res.json();
  console.log(`Total count in GitHub: ${data.total_count}, returned: ${data.items.length}`);

  let validPersons = 0;
  for (let i = 0; i < Math.min(data.items.length, 10); i++) {
    const u = data.items[i];
    // Fetch profile details
    const userRes = await fetch(u.url, {
      headers: {
        'User-Agent': 'AtlasPersonSearch/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (userRes.ok) {
      const profile: any = await userRes.json();
      const displayName = profile.name || profile.login;
      const classification = SocialEntityClassifier.classify(displayName, profile.bio || '');
      if (classification.is_person) {
        validPersons++;
        console.log(`[${validPersons}] Login: ${profile.login} | Name: ${profile.name} | Location: ${profile.location} | Email: ${profile.email || 'none'} | Company: ${profile.company || 'none'}`);
      }
    }
  }
}

testGitHubExpansion().catch(console.error);
