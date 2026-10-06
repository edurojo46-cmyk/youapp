import fs from 'node:fs';
import readline from 'node:readline';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const BENCHMARK_RECORDS = 100000;
const RECORD_SIZE = 52; // 51 bytes + \n

console.log(`=== BENCHMARKING PARSERS ON ${BENCHMARK_RECORDS.toLocaleString()} RECORDS ===\n`);

// 1. Current Readline Line-by-Line
async function benchReadline() {
  const fileStream = fs.createReadStream(SOURCE_FILE, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let count = 0;
  const t0 = performance.now();
  
  for await (const line of rl) {
    count++;
    // Minimal processing: extract cuit & name
    const cuit = line.slice(0, 11);
    const name = line.slice(11, 41);
    if (count >= BENCHMARK_RECORDS) break;
  }
  rl.close();
  fileStream.destroy();
  const t1 = performance.now();
  const elapsed = t1 - t0;
  return {
    mode: 'READLINE_LINE_BY_LINE',
    records: count,
    elapsed_ms: elapsed,
    records_per_sec: (count / (elapsed / 1000)),
    mean_us_per_record: (elapsed * 1000) / count
  };
}

// 2. Chunked Buffer Scanning (\n search)
async function benchChunkedBuffer() {
  const fd = fs.openSync(SOURCE_FILE, 'r');
  const CHUNK_SIZE = 64 * 1024; // 64KB
  const buf = Buffer.alloc(CHUNK_SIZE);
  let count = 0;
  let leftover = '';
  const t0 = performance.now();
  
  while (count < BENCHMARK_RECORDS) {
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, null);
    if (bytesRead === 0) break;
    const str = leftover + buf.toString('latin1', 0, bytesRead);
    let start = 0;
    let newlineIdx;
    while ((newlineIdx = str.indexOf('\n', start)) !== -1) {
      const line = str.substring(start, newlineIdx);
      count++;
      const cuit = line.slice(0, 11);
      const name = line.slice(11, 41);
      start = newlineIdx + 1;
      if (count >= BENCHMARK_RECORDS) break;
    }
    leftover = str.substring(start);
  }
  fs.closeSync(fd);
  const t1 = performance.now();
  const elapsed = t1 - t0;
  return {
    mode: 'CHUNKED_BUFFER_SCAN',
    records: count,
    elapsed_ms: elapsed,
    records_per_sec: (count / (elapsed / 1000)),
    mean_us_per_record: (elapsed * 1000) / count
  };
}

// 3. Exact 52-byte Fixed-Width Buffer Block Slicing
async function benchFixedWidthBlock() {
  const fd = fs.openSync(SOURCE_FILE, 'r');
  const BLOCK_RECORDS = 5000;
  const BLOCK_BYTES = BLOCK_RECORDS * RECORD_SIZE;
  const buf = Buffer.alloc(BLOCK_BYTES);
  let count = 0;
  const t0 = performance.now();
  
  while (count < BENCHMARK_RECORDS) {
    const targetToRead = Math.min(BLOCK_BYTES, (BENCHMARK_RECORDS - count) * RECORD_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, targetToRead, null);
    if (bytesRead === 0) break;
    const recordsInBlock = Math.floor(bytesRead / RECORD_SIZE);
    for (let i = 0; i < recordsInBlock; i++) {
      const offset = i * RECORD_SIZE;
      // Fixed byte offsets: CUIT 0..11, Name 11..41
      const cuit = buf.toString('latin1', offset, offset + 11);
      const name = buf.toString('latin1', offset + 11, offset + 41);
      count++;
    }
  }
  fs.closeSync(fd);
  const t1 = performance.now();
  const elapsed = t1 - t0;
  return {
    mode: 'EXACT_52BYTE_FIXED_WIDTH_BLOCK',
    records: count,
    elapsed_ms: elapsed,
    records_per_sec: (count / (elapsed / 1000)),
    mean_us_per_record: (elapsed * 1000) / count
  };
}

const r1 = await benchReadline();
console.log('1. Readline:', r1);

const r2 = await benchChunkedBuffer();
console.log('2. Chunked Buffer:', r2);

const r3 = await benchFixedWidthBlock();
console.log('3. Fixed-Width Block:', r3);

const speedup = (r1.elapsed_ms / r3.elapsed_ms).toFixed(2);
console.log(`\nFixed-Width Block is ${speedup}x faster than Readline!`);
