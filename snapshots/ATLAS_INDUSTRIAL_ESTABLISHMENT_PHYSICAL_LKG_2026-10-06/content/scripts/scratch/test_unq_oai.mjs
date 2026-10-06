import https from 'https';
import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

https.get('https://ridaa.unq.edu.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc', {
  headers: { 'User-Agent': 'Atlas-Industrial-Discovery/2.0' },
  timeout: 10000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', async () => {
    const creatorRegex = /<dc:creator>([^<]+)<\/dc:creator>/g;
    let match;
    const authors = [];
    while ((match = creatorRegex.exec(body)) !== null) {
      authors.push(match[1].trim());
    }
    
    const pool = new pg.Pool(parseDbUrl());
    const client = await pool.connect();
    const hmacSecret = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
    
    let existingCount = 0;
    let newCount = 0;
    for (const author of authors) {
      const docHmac = crypto.createHmac('sha256', hmacSecret).update(`ARG:UNQ:${author.toLowerCase()}`).digest('hex');
      const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
      const check = await client.query('SELECT 1 FROM public.atlas_people_discovery_candidates WHERE atlas_person_id = $1 LIMIT 1', [atlasPersonId]);
      if (check.rows.length > 0) existingCount++;
      else newCount++;
    }
    console.log(`TOTAL UNQ AUTHORS: ${authors.length} | NEW: ${newCount} | EXISTING: ${existingCount} | NOVELTY YIELD: ${((newCount / authors.length) * 100).toFixed(1)}%`);
    client.release();
    await pool.end();
  });
}).on('error', e => console.error('ERR:', e.message));
