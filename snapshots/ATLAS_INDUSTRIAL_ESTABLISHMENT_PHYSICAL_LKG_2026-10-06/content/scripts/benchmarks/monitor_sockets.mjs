import { execSync } from 'node:child_process';
import fs from 'node:fs';

const logFile = 'scratch/socket_monitor_log.json';
const samples = [];

function sampleSockets() {
  try {
    const output = execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 7700 -ErrorAction SilentlyContinue | Group-Object State | Select-Object Name, Count | ConvertTo-Json"', { encoding: 'utf8' });
    let parsed = JSON.parse(output || '[]');
    if (!Array.isArray(parsed)) parsed = [parsed];
    const counts = {
      timestamp: new Date().toISOString(),
      Established: 0,
      CloseWait: 0,
      TimeWait: 0,
      Listen: 0,
      Other: 0
    };
    for (const item of parsed) {
      if (!item || !item.Name) continue;
      if (counts[item.Name] !== undefined) {
        counts[item.Name] = item.Count;
      } else {
        counts.Other += item.Count;
      }
    }
    counts.Total = counts.Established + counts.CloseWait + counts.TimeWait + counts.Listen + counts.Other;
    samples.push(counts);
    fs.writeFileSync(logFile, JSON.stringify(samples, null, 2));
    console.log(`[SOCKET MONITOR ${counts.timestamp.slice(11, 19)}] EST=${counts.Established} | CLOSE_WAIT=${counts.CloseWait} | TIME_WAIT=${counts.TimeWait} | TOTAL=${counts.Total}`);
  } catch (e) {
    // Port might have 0 connections or command error
  }
}

console.log('Starting TCP Socket Monitor on port 7700 (sampling every 30s)...');
sampleSockets();
setInterval(sampleSockets, 30000);
