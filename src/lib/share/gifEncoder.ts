/**
 * Codificador GIF89a puro en TypeScript (cero dependencias externas, 100 % navegador).
 * Usa paleta fija de 256 colores (cubo 6x6x6 + 40 grises para degradados oscuros limpios)
 * y compresión LZW estándar con bucle infinito NETSCAPE2.0, 100 % compatible con WhatsApp.
 */

function buildGlobalPalette(): Uint8Array {
  const palette = new Uint8Array(256 * 3);
  let idx = 0;
  // 216 colores: cubo RGB 6x6x6
  for (let r = 0; r < 6; r += 1) {
    for (let g = 0; g < 6; g += 1) {
      for (let b = 0; b < 6; b += 1) {
        palette[idx++] = r * 51;
        palette[idx++] = g * 51;
        palette[idx++] = b * 51;
      }
    }
  }
  // 40 tonos de gris para degradados oscuros suaves (índices 216..255)
  for (let i = 0; i < 40; i += 1) {
    const v = Math.round((i / 39) * 255);
    palette[idx++] = v;
    palette[idx++] = v;
    palette[idx++] = v;
  }
  return palette;
}

function quantizeRgbaToIndices(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    // Si es casi neutro/gris, mapear a la rampa de 40 grises para degradados suaves
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (maxC - minC <= 14) {
      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      indices[i] = 216 + Math.min(39, Math.round((lum * 39) / 255));
    } else {
      const ri = Math.round((r * 5) / 255);
      const gi = Math.round((g * 5) / 255);
      const bi = Math.round((b * 5) / 255);
      indices[i] = ri * 36 + gi * 6 + bi;
    }
  }
  return indices;
}

function lzwEncode(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out: number[] = [];

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let bitBuffer = 0;
  let bitCount = 0;

  const pushCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  let table = new Map<number, number>();

  const resetTable = () => {
    table = new Map<number, number>();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  pushCode(clearCode);
  if (indices.length === 0) {
    pushCode(eoiCode);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return new Uint8Array(out);
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
    } else {
      pushCode(prefix);
      if (nextCode < 4096) {
        table.set(key, nextCode);
        nextCode += 1;
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize += 1;
        }
      } else {
        pushCode(clearCode);
        resetTable();
      }
      prefix = k;
    }
  }

  pushCode(prefix);
  pushCode(eoiCode);
  if (bitCount > 0) {
    out.push(bitBuffer & 0xff);
  }
  return new Uint8Array(out);
}

export function encodeAnimatedGif(
  width: number,
  height: number,
  framesRgba: Uint8ClampedArray[],
  delayCentiseconds = 12
): Blob {
  const bytes: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i += 1) bytes.push(s.charCodeAt(i));
  };
  const pushU16 = (n: number) => {
    bytes.push(n & 0xff, (n >> 8) & 0xff);
  };

  // 1. Header GIF89a
  pushStr('GIF89a');

  // 2. Logical Screen Descriptor
  pushU16(width);
  pushU16(height);
  bytes.push(0xf7); // Global Color Table = 1, color res = 7, sort = 0, size = 7 (256 colors)
  bytes.push(0); // bg color index
  bytes.push(0); // pixel aspect ratio

  // 3. Global Color Table (256 * 3 = 768 bytes)
  const palette = buildGlobalPalette();
  for (let i = 0; i < palette.length; i += 1) bytes.push(palette[i]);

  // 4. NETSCAPE2.0 Loop Extension (infinite loop)
  bytes.push(0x21, 0xff, 0x0b);
  pushStr('NETSCAPE2.0');
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

  // 5. Frames
  const pixelCount = width * height;
  for (const rgba of framesRgba) {
    // Graphic Control Extension
    bytes.push(0x21, 0xf9, 0x04, 0x04); // disposal=1 (do not dispose), no transparency
    pushU16(delayCentiseconds);
    bytes.push(0x00, 0x00);

    // Image Descriptor
    bytes.push(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(width);
    pushU16(height);
    bytes.push(0x00); // no local color table, not interlaced

    // LZW Image Data
    const minCodeSize = 8;
    bytes.push(minCodeSize);
    const indices = quantizeRgbaToIndices(rgba, pixelCount);
    const compressed = lzwEncode(indices, minCodeSize);

    // Emitir en sub-bloques de máximo 255 bytes
    let offset = 0;
    while (offset < compressed.length) {
      const chunkLen = Math.min(255, compressed.length - offset);
      bytes.push(chunkLen);
      for (let j = 0; j < chunkLen; j += 1) {
        bytes.push(compressed[offset + j]);
      }
      offset += chunkLen;
    }
    bytes.push(0x00); // block terminator
  }

  // 6. GIF Trailer
  bytes.push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}
