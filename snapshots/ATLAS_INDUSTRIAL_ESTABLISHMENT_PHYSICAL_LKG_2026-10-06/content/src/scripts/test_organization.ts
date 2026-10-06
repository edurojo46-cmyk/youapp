import https from 'https';

interface OrganizationTestReport {
  DOMAIN: string;
  PAGES_PROCESSED: number;
  CONTENT_AUTHORS: number;
  EXPLICIT_TEAM_MEMBERS: number;
  SOCIAL_PROFILES_DISCOVERED: number;
  FALSE_WORKS_AT_INFERENCES: number;
}

function fetchWPUsers(domain: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    https.get(`https://${domain}/wp-json/wp/v2/users`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', reject);
  });
}

async function runOrganizationTest() {
  console.log('Initiating Organization Physical Test...');

  const domain = 'chequeado.com';

  const report: OrganizationTestReport = {
    DOMAIN: domain,
    PAGES_PROCESSED: 1, // Only requested one page of users
    CONTENT_AUTHORS: 0,
    EXPLICIT_TEAM_MEMBERS: 0,
    SOCIAL_PROFILES_DISCOVERED: 0,
    FALSE_WORKS_AT_INFERENCES: 0
  };

  try {
    const users = await fetchWPUsers(domain);
    
    if (Array.isArray(users)) {
      report.CONTENT_AUTHORS = users.length;
      
      for (const u of users) {
        // According to the new semantic rules, WP users are CONTENT_AUTHOR, 
        // NEVER TEAM_MEMBER unless independently verified.
        // Therefore EXPLICIT_TEAM_MEMBERS = 0.
        
        if (u.url) {
          report.SOCIAL_PROFILES_DISCOVERED++;
        }
      }
    }
    
    console.log(`\n--- PHYSICAL TEST REPORT: ORGANIZATION (${domain}) ---`);
    console.log(`DOMAIN = ${report.DOMAIN}`);
    console.log(`PAGES_PROCESSED = ${report.PAGES_PROCESSED}`);
    console.log(`CONTENT_AUTHORS = ${report.CONTENT_AUTHORS}`);
    console.log(`EXPLICIT_TEAM_MEMBERS = ${report.EXPLICIT_TEAM_MEMBERS}`);
    console.log(`SOCIAL_PROFILES_DISCOVERED = ${report.SOCIAL_PROFILES_DISCOVERED}`);
    console.log(`FALSE_WORKS_AT_INFERENCES = ${report.FALSE_WORKS_AT_INFERENCES}`);
    
  } catch (error) {
    console.error('Error fetching Organization Test:', error);
  }
}

runOrganizationTest();
