import https from 'https';

// Type representing the physical test output
interface OrcidTestReport {
  QUERY: string;
  ORCID_RESULTS: number;
  AFFILIATION_OBSERVATIONS: number;
  FALSE_CABA_PERSON_LOCATION_INFERENCES: number;
}

function fetchOrcid(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'pub.orcid.org',
      path: `/v3.0/expanded-search/?q=${encodeURIComponent('affiliation-org-name:"' + query + '"')}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runOrcidTest() {
  console.log('Initiating ORCID Physical Test...');

  const queries = ['Universidad de Buenos Aires', 'CONICET'];

  for (const q of queries) {
    const report: OrcidTestReport = {
      QUERY: q,
      ORCID_RESULTS: 0,
      AFFILIATION_OBSERVATIONS: 0,
      FALSE_CABA_PERSON_LOCATION_INFERENCES: 0
    };

    try {
      const data = await fetchOrcid(q);
      
      if (data && data['expanded-result']) {
        const results = data['expanded-result'];
        report.ORCID_RESULTS = data['num-found'] || results.length;
        
        for (const res of results) {
          if (res['institution-name'] && res['institution-name'].length > 0) {
            report.AFFILIATION_OBSERVATIONS++;
          }
        }
      }
      
      console.log(`\n--- PHYSICAL TEST REPORT: ORCID (${q}) ---`);
      console.log(`ORCID_RESULTS = ${report.ORCID_RESULTS}`);
      console.log(`AFFILIATION_OBSERVATIONS = ${report.AFFILIATION_OBSERVATIONS}`);
      console.log(`FALSE_CABA_PERSON_LOCATION_INFERENCES = ${report.FALSE_CABA_PERSON_LOCATION_INFERENCES}`);
      
    } catch (e) {
      console.error('Error fetching ORCID for', q, e);
    }
  }
}

runOrcidTest();
