import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const DB_PATH = path.resolve('data_delta_motor2.ms');
const MEILI_BIN = path.resolve('bin/meilisearch.exe');

if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

console.log(`Starting Meilisearch Motor 2 on 127.0.0.1:7701 (db-path: ${DB_PATH})`);
const args = [
  '--http-addr', '127.0.0.1:7701',
  '--db-path', DB_PATH,
  '--no-analytics'
];

const child = spawn(MEILI_BIN, args, {
  stdio: 'inherit',
  detached: false,
  env: process.env
});

child.on('exit', (code, signal) => {
  console.log(`Motor 2 exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});
