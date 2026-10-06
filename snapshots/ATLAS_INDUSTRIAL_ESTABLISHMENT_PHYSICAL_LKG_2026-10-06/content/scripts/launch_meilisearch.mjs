import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('data_discovery_delta.ms');
const MEILI_BIN = path.resolve('bin/meilisearch.exe');

if (!fs.existsSync(MEILI_BIN)) {
  console.error(`FATAL: Meilisearch binary not found at ${MEILI_BIN}`);
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`FATAL: Persistent DB path not found at ${DB_PATH}`);
  process.exit(1);
}

console.log(`Starting Meilisearch with persistent DB: ${DB_PATH}`);
const args = [
  '--http-addr', '127.0.0.1:7700',
  '--db-path', DB_PATH,
  '--no-analytics'
];

const child = spawn(MEILI_BIN, args, {
  stdio: 'inherit',
  detached: false
});

child.on('exit', (code, signal) => {
  console.log(`Meilisearch exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});
