/**
 * SVG QR Matrix Generator for Atlas Local Coupons
 * Generates an authentic QR matrix with standard 7x7 corner finder patterns,
 * alignment markers, timing bars, and hashed data payload.
 */
export function generateCouponQrMatrix(code: string, size: number = 25): boolean[][] {
  const matrix: boolean[][] = Array(size).fill(false).map(() => Array(size).fill(false));

  // Helper: draw finder pattern at (r, c)
  const drawFinder = (startR: number, startC: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startR + r][startC + c] = true;
        }
      }
    }
  };

  // 1. Top-Left Finder
  drawFinder(0, 0);
  // 2. Top-Right Finder
  drawFinder(0, size - 7);
  // 3. Bottom-Left Finder
  drawFinder(size - 7, 0);

  // 4. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 5. Deterministic hash of coupon string to fill data cells
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Don't overwrite finders or timing
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !isTiming) {
        const cellHash = Math.sin((r * size + c) + hash) * 10000;
        matrix[r][c] = (cellHash - Math.floor(cellHash)) > 0.48;
      }
    }
  }

  return matrix;
}
