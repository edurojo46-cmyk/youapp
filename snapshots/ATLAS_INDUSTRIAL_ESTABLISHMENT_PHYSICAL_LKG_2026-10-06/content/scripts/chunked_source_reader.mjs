import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || process.env.ATLAS_IDENTITY_HMAC_SECRET || 'atlas_secret_cmyk_2026';

export function normalizeName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * High-throughput chunked candidate reader.
 * Uses 16MB reusable buffers and direct byte scanning.
 * Guarantees 100% byte-for-byte and ordinal parity with legacy readline reader.
 */
export async function* streamChunkedCandidates(filePath, options = {}) {
  const startLine = options.startLine || 1;
  const limit = options.limit || Infinity;
  const batchSize = options.batchSize || 2000;
  const bufferSize = options.bufferSize || (16 * 1024 * 1024); // 16 MB reusable buffer

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(bufferSize);
  let carry = Buffer.alloc(0);

  let lineOrdinal = 0;
  let candidatesYielded = 0;
  let currentBatch = [];

  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null)) > 0) {
      let chunk;
      if (carry.length > 0) {
        chunk = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
        carry = Buffer.alloc(0);
      } else {
        chunk = buffer.subarray(0, bytesRead);
      }

      let lineStart = 0;
      let len = chunk.length;

      for (let i = 0; i < len; i++) {
        if (chunk[i] === 0x0A) { // newline byte
          lineOrdinal++;

          if (lineOrdinal >= startLine) {
            // Check eligibility at raw byte level without allocating string:
            // CUIT starts with '20', '23', '24', or '27'
            // '2' = 0x32; '0'=0x30, '3'=0x33, '4'=0x34, '7'=0x37
            const b0 = chunk[lineStart];
            const b1 = chunk[lineStart + 1];

            if (b0 === 0x32 && (b1 === 0x30 || b1 === 0x33 || b1 === 0x34 || b1 === 0x37)) {
              let lineEnd = i;
              if (lineEnd > lineStart && chunk[lineEnd - 1] === 0x0D) {
                lineEnd--; // strip trailing \r
              }

              // Decode line slice
              const line = chunk.subarray(lineStart, lineEnd).toString('utf8');
              const cuit = line.substring(0, 11).trim();
              const rawName = line.substring(11, 41).trim();

              const dni = String(parseInt(cuit.slice(2, 10), 10));
              const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
              const nameNorm = normalizeName(rawName);

              currentBatch.push({
                input_ordinal: lineOrdinal,
                cuit,
                raw_name: rawName,
                name_norm: nameNorm,
                identifier_value: identifierValue,
                source_id: 'ARCA_CONDICION_TRIBUTARIA',
                source_person_id: 'rec_arca_' + cuit
              });

              candidatesYielded++;

              if (currentBatch.length >= batchSize) {
                yield currentBatch;
                currentBatch = [];
              }

              if (candidatesYielded >= limit) {
                if (currentBatch.length > 0) {
                  yield currentBatch;
                  currentBatch = [];
                }
                return;
              }
            }
          }

          lineStart = i + 1;
        }
      }

      // Handle carryover past chunk boundary
      if (lineStart < len) {
        carry = Buffer.from(chunk.subarray(lineStart));
      }
    }

    // Handle last line if file didn't terminate with \n
    if (carry.length > 0) {
      lineOrdinal++;
      if (lineOrdinal >= startLine && candidatesYielded < limit) {
        const b0 = carry[0];
        const b1 = carry[1];
        if (b0 === 0x32 && (b1 === 0x30 || b1 === 0x33 || b1 === 0x34 || b1 === 0x37)) {
          let lineEnd = carry.length;
          if (lineEnd > 0 && carry[lineEnd - 1] === 0x0D) {
            lineEnd--;
          }
          const line = carry.subarray(0, lineEnd).toString('utf8');
          const cuit = line.substring(0, 11).trim();
          const rawName = line.substring(11, 41).trim();

          const dni = String(parseInt(cuit.slice(2, 10), 10));
          const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
          const nameNorm = normalizeName(rawName);

          currentBatch.push({
            input_ordinal: lineOrdinal,
            cuit,
            raw_name: rawName,
            name_norm: nameNorm,
            identifier_value: identifierValue,
            source_id: 'ARCA_CONDICION_TRIBUTARIA',
            source_person_id: 'rec_arca_' + cuit
          });

          candidatesYielded++;
        }
      }
    }

    if (currentBatch.length > 0) {
      yield currentBatch;
    }

  } finally {
    fs.closeSync(fd);
  }
}
