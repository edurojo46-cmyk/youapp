import { execSync, spawn } from 'child_process';
import http from 'http';

function getProcessOnPort5174(): number | null {
  try {
    const cmd = `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue).OwningProcess"`;
    const out = execSync(cmd, { encoding: 'utf-8' }).trim();
    const pid = parseInt(out, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

async function pingRuntimeStatus(timeoutMs = 5000): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await new Promise<any>((resolve, reject) => {
        const req = http.get('http://localhost:5174/api/runtime-status', (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Status ${res.statusCode}`));
            return;
          }
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return data;
    } catch {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return null;
}

export async function restartBackendSafely() {
  console.log('[SafeBackendManager] Inspecting port 5174...');
  const currentPid = getProcessOnPort5174();

  if (currentPid) {
    console.log(`[SafeBackendManager] Found PID ${currentPid} on port 5174. Terminating targeted process only...`);
    try {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${currentPid} -Force -ErrorAction SilentlyContinue"`);
      console.log(`[SafeBackendManager] PID ${currentPid} stopped.`);
    } catch (e: any) {
      console.warn(`[SafeBackendManager] Warning stopping PID ${currentPid}:`, e.message);
    }
  } else {
    console.log('[SafeBackendManager] Port 5174 is currently free.');
  }

  // Small delay for socket release
  await new Promise(r => setTimeout(r, 600));

  console.log('[SafeBackendManager] Spawning fresh backend server on port 5174...');
  const child = spawn('cmd.exe', ['/c', 'npx', 'tsx', 'server.ts'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    windowsHide: true
  });
  child.unref();

  console.log('[SafeBackendManager] Waiting for /api/runtime-status readiness...');
  const status = await pingRuntimeStatus(10000);

  if (status) {
    console.log('[SafeBackendManager] Backend successfully started:');
    console.log(`  PID: ${status.PROCESS_PID}`);
    console.log(`  STARTED_AT: ${status.PROCESS_STARTED_AT}`);
    console.log(`  BUILD_ID: ${status.RUNTIME_BUILD_ID}`);
    console.log(`  PORT: ${status.PORT}`);
    return status;
  } else {
    throw new Error('SafeBackendManager: Backend did not respond on /api/runtime-status within 10s');
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  restartBackendSafely().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
