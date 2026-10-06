import { execSync } from 'node:child_process';
import os from 'node:os';

try {
  const psScript = `
    $os = Get-CimInstance Win32_OperatingSystem;
    $perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory;
    $pagefile = Get-CimInstance Win32_PageFileUsage;
    [PSCustomObject]@{
      TotalPhysical_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2);
      AvailablePhysical_GB = [math]::Round($os.FreePhysicalMemory / 1MB, 2);
      TotalVirtual_GB = [math]::Round($os.TotalVirtualMemorySize / 1MB, 2);
      FreeVirtual_GB = [math]::Round($os.FreeVirtualMemory / 1MB, 2);
      CommittedBytes_GB = [math]::Round($perf.CommittedBytes / 1GB, 2);
      CommitLimit_GB = [math]::Round($perf.CommitLimit / 1GB, 2);
      PercentCommittedInUse = $perf.PercentCommittedBytesInUse;
      PageFileName = $pagefile.Name;
      PageFileAllocatedMB = $pagefile.AllocatedBaseSize;
      PageFileCurrentUsageMB = $pagefile.CurrentUsage;
    } | ConvertTo-Json
  `;
  const res = execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' });
  console.log('MEMORY_COMMIT_TELEMETRY:');
  console.log(res);
} catch (e) {
  console.error('ERROR:', e.message);
}
