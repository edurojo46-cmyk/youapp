import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
const secret = 'test_secret_for_bench';
const t0 = performance.now();
for (let i = 0; i < 50000; i++) {
  const dni = String(20000000 + i);
  const val = crypto.createHmac('sha256', secret).update('ARG:DNI:' + dni).digest('hex');
}
const ms = performance.now() - t0;
console.log('50k HMACs took:', ms.toFixed(1), 'ms (', (50000 / (ms / 1000)).toFixed(0), 'HMAC/sec )');
