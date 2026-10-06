import { execSync } from 'node:child_process';
import os from 'node:os';

export function getDetailedSystemPressure() {
  const GIB = 1024 * 1024 * 1024;
  try {
    const ps = `
      $os = Get-CimInstance Win32_OperatingSystem;
      $perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory;
      $pf = Get-CimInstance Win32_PageFileUsage;
      $disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | Where-Object { $_.Name -eq 'C:' };
      [PSCustomObject]@{
        TotalRamGiB = [math]::Round($os.TotalVisibleMemorySize / 1024 / 1024, 4);
        AvailableRamGiB = [math]::Round($os.FreePhysicalMemory / 1024 / 1024, 4);
        CommitGiB = [math]::Round($perf.CommittedBytes / 1GB, 4);
        CommitLimitGiB = [math]::Round($perf.CommitLimit / 1GB, 4);
        CommitPercent = [math]::Round(($perf.CommittedBytes / $perf.CommitLimit) * 100, 2);
        PagefileUsageGiB = [math]::Round($pf.CurrentUsage / 1024, 4);
        PagefileAllocatedGiB = [math]::Round($pf.AllocatedBaseSize / 1024, 4);
        DiskCurrentQueue = [math]::Round($disk.CurrentDiskQueueLength, 2);
        DiskWriteLatencySec = [math]::Round($disk.AvgDiskSecPerWrite, 4);
        DiskReadLatencySec = [math]::Round($disk.AvgDiskSecPerRead, 4);
      } | ConvertTo-Json
    `;
    const out = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, ' ')}"`, { encoding: 'utf-8', timeout: 8000 });
    return JSON.parse(out);
  } catch (err) {
    return {
      AvailableRamGiB: parseFloat((os.freemem() / GIB).toFixed(4)),
      CommitGiB: 0,
      CommitLimitGiB: 0,
      CommitPercent: 0,
      PagefileUsageGiB: 0,
      DiskCurrentQueue: 0,
      DiskWriteLatencySec: 0,
      error: err.message
    };
  }
}

if (process.argv[1].endsWith('measure_system_pressure.mjs')) {
  console.log(JSON.stringify(getDetailedSystemPressure(), null, 2));
}
