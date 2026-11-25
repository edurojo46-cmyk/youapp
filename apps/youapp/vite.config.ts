import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../../');

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  envDir: projectRoot,
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [projectRoot]
    },
    proxy: {
      '/api/youtubei': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/youtubei/, '/youtubei'),
        headers: {
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20231201.00.00'
        }
      },
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  }
});
