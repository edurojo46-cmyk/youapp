import { describe, it, expect } from 'vitest';
import { calculateNDCG } from '../src/lib/search/metrics';

describe('NDCG@5', () => {
  it('perfect ordering yields 1.0', () => {
    const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    const judgments = { a: 2, b: 2, c: 1, d: 1, e: 0 };
    expect(calculateNDCG(candidates, judgments, 5)).toBe(1.0);
  });

  it('reverse ordering yields < 1.0', () => {
    const candidates = [{ id: 'e' }, { id: 'd' }, { id: 'c' }, { id: 'b' }, { id: 'a' }];
    const judgments = { a: 2, b: 2, c: 1, d: 1, e: 0 };
    const ndcg = calculateNDCG(candidates, judgments, 5);
    expect(ndcg).toBeLessThan(1.0);
    expect(ndcg).toBeGreaterThan(0);
  });

  it('all relevance 0 yields 0', () => {
    const candidates = [{ id: 'a' }, { id: 'b' }];
    const judgments = { a: 0, b: 0 };
    expect(calculateNDCG(candidates, judgments, 5)).toBe(0);
  });

  it('fewer than 5 results does not crash', () => {
    const candidates = [{ id: 'a' }, { id: 'b' }];
    const judgments = { a: 2, b: 1 };
    expect(calculateNDCG(candidates, judgments, 5)).toBe(1.0); // Perfect order
  });

  it('throws on unjudged candidates explicitly', () => {
    const candidates = [{ id: 'a' }, { id: 'b' }];
    const judgments = { a: 2 }; // 'b' is missing
    expect(() => calculateNDCG(candidates, judgments, 5)).toThrowError(/UNJUDGED/);
  });
});
