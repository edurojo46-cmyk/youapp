import dotenv from 'dotenv';
dotenv.config();
const url = process.env.DATABASE_URL;
// Build direct connection URL for DDL: port 5432, user=postgres (without project suffix)
const m = url.match(/postgresql:\/\/([^:]+):(.+)@([^:\/]+):(\d+)\/(.+)/);
const projectRef = m ? m[1].split('.')[1] : '';
const directUrl = url
  .replace(':6543/', ':5432/')
  .replace(`postgres.${projectRef}`, 'postgres');
console.log('direct_url prefix:', directUrl.substring(0, 55) + '...');
console.log('user:', m?.[1]);
