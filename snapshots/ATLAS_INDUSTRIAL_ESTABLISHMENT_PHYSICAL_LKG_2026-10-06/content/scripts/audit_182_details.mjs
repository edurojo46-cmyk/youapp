import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function audit182() {
  const pool = new pg.Pool(parseDbUrl());
  
  // Find all emails from those domains in the 1m table
  const query = `
    SELECT 
      CASE 
        WHEN email_normalized LIKE '%exactas.uba.ar%' OR email_normalized LIKE '%uba.ar%' THEN 'uba.ar'
        WHEN email_normalized LIKE '%mdp.edu.ar%' THEN 'mdp.edu.ar'
        WHEN email_normalized LIKE '%unt.edu.ar%' THEN 'unt.edu.ar'
        WHEN email_normalized LIKE '%unvm.edu.ar%' THEN 'unvm.edu.ar'
        WHEN email_normalized LIKE '%unsj.edu.ar%' THEN 'unsj.edu.ar'
        WHEN email_normalized LIKE '%neuquen.gov.ar%' THEN 'neuquen.gov.ar'
        WHEN email_normalized LIKE '%misiones.gob.ar%' THEN 'misiones.gob.ar'
        WHEN email_normalized LIKE '%buenosaires.gob.ar%' THEN 'buenosaires.gob.ar'
        ELSE 'OTHER'
      END as domain_group,
      source_id,
      COUNT(*) as count
    FROM public.atlas_public_email_contacts_1m
    WHERE 
      email_normalized LIKE '%exactas.uba.ar%' 
      OR email_normalized LIKE '%mdp.edu.ar%'
      OR email_normalized LIKE '%unt.edu.ar%'
      OR email_normalized LIKE '%unvm.edu.ar%'
      OR email_normalized LIKE '%unsj.edu.ar%'
      OR email_normalized LIKE '%neuquen.gov.ar%'
      OR email_normalized LIKE '%misiones.gob.ar%'
    GROUP BY domain_group, source_id
    ORDER BY domain_group, count DESC;
  `;
  
  const res = await pool.query(query);
  console.log('Breakdown of existing contacts by domain group and source_id:');
  console.table(res.rows);
  
  await pool.end();
}

audit182().catch(console.error);
