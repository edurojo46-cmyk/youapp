import { searchYouTubeVideos } from './src/lib/youtubeChannelSearch';
import { rankCandidates } from './src/lib/youappRanking';
import fs from 'fs';

// Mock localStorage
(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

// Mock import.meta.env
(global as any).import = { meta: { env: { VITE_SUPABASE_URL: '' } } };
const mod = require('module');
const originalCompile = mod.prototype._compile;
mod.prototype._compile = function (code: string, filename: string) {
  if (code.includes('import.meta.env')) {
    code = code.replace(/import\.meta\.env/g, '({ VITE_SUPABASE_URL: "" })');
  }
  return originalCompile.call(this, code, filename);
};

async function run() {
  const q1 = 'noticias de inteligencia artificial';
  const q2 = 'historia de entre rios';
  
  const raw1 = await searchYouTubeVideos(q1, 20);
  const ranked1 = rankCandidates(q1, raw1);
  
  const raw2 = await searchYouTubeVideos(q2, 20);
  const ranked2 = rankCandidates(q2, raw2);
  
  fs.writeFileSync('audit_results.json', JSON.stringify({ q1: ranked1, q2: ranked2 }, null, 2));
  console.log('done');
}
run();
