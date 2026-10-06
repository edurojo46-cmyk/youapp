import { execSync } from 'node:child_process';
import os from 'node:os';

export class ResourceMonitor {
  constructor(meiliPid = 19724) {
    this.meiliPid = meiliPid;
    this.intervalId = null;
    this.samples = [];
    this.numCores = os.cpus().length;
    this.prevMeiliCpuSec = null;
    this.prevNodeCpuUsage = null;
    this.prevTime = null;
  }

  start(intervalMs = 1000) {
    this.samples = [];
    this.prevTime = Date.now();
    this.prevNodeCpuUsage = process.cpuUsage();
    this.prevMeiliCpuSec = this.getMeiliCpuSec();

    this.intervalId = setInterval(() => {
      this.collectSample();
    }, intervalMs);
  }

  getMeiliCpuSec() {
    try {
      const out = execSync(`powershell -NoProfile -Command "Get-Process -Id ${this.meiliPid} -ErrorAction SilentlyContinue | Select-Object CPU, WorkingSet64 | ConvertTo-Json"`, { timeout: 800 }).toString();
      const parsed = JSON.parse(out);
      return parsed;
    } catch {
      return null;
    }
  }

  collectSample() {
    const now = Date.now();
    const elapsedSec = (now - this.prevTime) / 1000;
    if (elapsedSec <= 0) return;

    // Node CPU
    const nodeCpu = process.cpuUsage(this.prevNodeCpuUsage);
    const nodeCpuSec = (nodeCpu.user + nodeCpu.system) / 1e6;
    const nodeCpuPercentRaw = (nodeCpuSec / elapsedSec) * 100;
    const nodeCpuPercentNormalized = nodeCpuPercentRaw / this.numCores;

    // Meili CPU & RSS
    const meiliInfo = this.getMeiliCpuSec();
    let meiliCpuPercentRaw = 0;
    let meiliCpuPercentNormalized = 0;
    let meiliRssMb = 0;

    if (meiliInfo && this.prevMeiliCpuSec) {
      const deltaMeiliCpu = meiliInfo.CPU - this.prevMeiliCpuSec.CPU;
      meiliCpuPercentRaw = Math.max(0, (deltaMeiliCpu / elapsedSec) * 100);
      meiliCpuPercentNormalized = meiliCpuPercentRaw / this.numCores;
      meiliRssMb = Math.round((meiliInfo.WorkingSet64 || 0) / (1024 * 1024));
    }
    if (meiliInfo) {
      this.prevMeiliCpuSec = meiliInfo;
    }

    const nodeRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    // Disk perf
    let diskReadBytesSec = 0;
    let diskWriteBytesSec = 0;
    let diskActivePercent = 0;
    let diskQueueLength = 0;

    try {
      const diskOut = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -like \'*C:*\' } | Select-Object DiskReadBytesPersec, DiskWriteBytesPersec, PercentDiskTime, CurrentDiskQueueLength | ConvertTo-Json"', { timeout: 800 }).toString();
      const diskParsed = JSON.parse(diskOut);
      if (diskParsed) {
        diskReadBytesSec = Number(diskParsed.DiskReadBytesPersec || 0);
        diskWriteBytesSec = Number(diskParsed.DiskWriteBytesPersec || 0);
        diskActivePercent = Number(diskParsed.PercentDiskTime || 0);
        diskQueueLength = Number(diskParsed.CurrentDiskQueueLength || 0);
      }
    } catch {}

    const sample = {
      timestamp: new Date(now).toISOString(),
      elapsed_sec: Number(elapsedSec.toFixed(2)),
      meili_cpu_percent_raw: Number(meiliCpuPercentRaw.toFixed(1)),
      meili_cpu_percent_normalized: Number(meiliCpuPercentNormalized.toFixed(1)),
      meili_rss_mb: meiliRssMb,
      node_cpu_percent_raw: Number(nodeCpuPercentRaw.toFixed(1)),
      node_cpu_percent_normalized: Number(nodeCpuPercentNormalized.toFixed(1)),
      node_rss_mb: nodeRssMb,
      total_cpu_percent_normalized: Number((meiliCpuPercentNormalized + nodeCpuPercentNormalized).toFixed(1)),
      disk_read_bytes_sec: diskReadBytesSec,
      disk_write_bytes_sec: diskWriteBytesSec,
      disk_active_percent: diskActivePercent,
      disk_queue_length: diskQueueLength
    };

    this.samples.push(sample);
    this.prevTime = now;
    this.prevNodeCpuUsage = process.cpuUsage();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    return this.getSummary();
  }

  getSummary() {
    if (this.samples.length === 0) {
      return { sample_count: 0 };
    }
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr) => Math.max(...arr);

    return {
      sample_count: this.samples.length,
      duration_sec: this.samples.length,
      meili_cpu_percent_raw_avg: Number(avg(this.samples.map(s => s.meili_cpu_percent_raw)).toFixed(1)),
      meili_cpu_percent_raw_max: Number(max(this.samples.map(s => s.meili_cpu_percent_raw)).toFixed(1)),
      meili_cpu_percent_normalized_avg: Number(avg(this.samples.map(s => s.meili_cpu_percent_normalized)).toFixed(1)),
      meili_cpu_percent_normalized_max: Number(max(this.samples.map(s => s.meili_cpu_percent_normalized)).toFixed(1)),
      meili_rss_mb_max: max(this.samples.map(s => s.meili_rss_mb)),
      node_cpu_percent_raw_avg: Number(avg(this.samples.map(s => s.node_cpu_percent_raw)).toFixed(1)),
      node_cpu_percent_normalized_avg: Number(avg(this.samples.map(s => s.node_cpu_percent_normalized)).toFixed(1)),
      node_rss_mb_max: max(this.samples.map(s => s.node_rss_mb)),
      total_cpu_normalized_avg: Number(avg(this.samples.map(s => s.total_cpu_percent_normalized)).toFixed(1)),
      total_cpu_normalized_max: Number(max(this.samples.map(s => s.total_cpu_percent_normalized)).toFixed(1)),
      disk_read_mbs_avg: Number((avg(this.samples.map(s => s.disk_read_bytes_sec)) / 1e6).toFixed(2)),
      disk_write_mbs_avg: Number((avg(this.samples.map(s => s.disk_write_bytes_sec)) / 1e6).toFixed(2)),
      disk_write_mbs_max: Number((max(this.samples.map(s => s.disk_write_bytes_sec)) / 1e6).toFixed(2)),
      disk_active_percent_avg: Number(avg(this.samples.map(s => s.disk_active_percent)).toFixed(1)),
      disk_active_percent_max: Number(max(this.samples.map(s => s.disk_active_percent)).toFixed(1)),
      disk_queue_length_avg: Number(avg(this.samples.map(s => s.disk_queue_length)).toFixed(2)),
      disk_queue_length_max: max(this.samples.map(s => s.disk_queue_length))
    };
  }
}
