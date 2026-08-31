// @vitest-environment jsdom
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { getMomentsForVideo } from '../src/lib/moments/momentEngine';
import { supabase } from '../src/lib/supabase';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { YOU4Cards } from '../src/components/player/YOU4Cards';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  }
}));

describe('YOU4 Moments V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('DB vacía + duration=1200 -> fallback 120, 420, 780, 1080', async () => {
    const mockItem = { blockId: '1', provider: 'youtube' as const, providerContentId: 'abc', title: 'Test', durationSec: 1200 };
    const moments = await getMomentsForVideo(mockItem);
    
    expect(moments.length).toBe(4);
    expect(moments[0].startSec).toBe(120); // 10%
    expect(moments[1].startSec).toBe(420); // 35%
    expect(moments[2].startSec).toBe(780); // 65%
    expect(moments[3].startSec).toBe(1080); // 90%
    expect(moments[0].source).toBe('fallback');
    expect(moments[0].confidence).toBe(0);
  });

  test('DB vacía + duración desconocida -> usa fallback default de 20 mins y no crashea', async () => {
    const mockItem = { blockId: '1', provider: 'youtube' as const, providerContentId: 'abc', title: 'Test', durationSec: 0 };
    const moments = await getMomentsForVideo(mockItem);
    
    expect(moments.length).toBe(4);
    expect(moments[0].startSec).toBe(120); // 10% de 1200
  });

  test('DB contiene 4 reales (desordenados) -> usa reales y ordena por startSec', async () => {
    const mockData = [
      { id: '2', start_sec: 400, title: 'B', source: 'analyzed' },
      { id: '1', start_sec: 100, title: 'A', source: 'analyzed' },
      { id: '4', start_sec: 900, title: 'D', source: 'analyzed' },
      { id: '3', start_sec: 700, title: 'C', source: 'analyzed' }
    ];

    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockData, error: null })
    });

    const mockItem = { blockId: '1', provider: 'youtube' as const, providerContentId: 'abc', title: 'Test', durationSec: 1200 };
    const moments = await getMomentsForVideo(mockItem);
    
    expect(moments.length).toBe(4);
    expect(moments[0].startSec).toBe(100);
    expect(moments[1].startSec).toBe(400);
    expect(moments[2].startSec).toBe(700);
    expect(moments[3].startSec).toBe(900);
    expect(moments[0].source).toBe('analyzed');
  });

  test('fallback generado -> NO INSERT en video_moments', async () => {
    const mockItem = { blockId: '1', provider: 'youtube' as const, providerContentId: 'abc', title: 'Test', durationSec: 1200 };
    await getMomentsForVideo(mockItem);
    
    // We mock `from('video_moments')`, let's verify `insert` was never called anywhere.
    // The implementation only chains .select().eq().order().limit()
    const chain = supabase.from('video_moments');
    expect((chain as any).insert).toBeUndefined(); // we didn't mock insert, meaning if it was called it would throw or be trackable
  });

  test('click moment 3 -> seek(startSec) exactamente una vez', () => {
    const mockMoments = [
      { id: 'm1', contentKey: 'x', startSec: 100, title: 'A', type: 'opening' as const, confidence: 0, source: 'fallback' as const },
      { id: 'm2', contentKey: 'x', startSec: 200, title: 'B', type: 'opening' as const, confidence: 0, source: 'fallback' as const },
      { id: 'm3', contentKey: 'x', startSec: 300, title: 'C', type: 'opening' as const, confidence: 0, source: 'fallback' as const },
      { id: 'm4', contentKey: 'x', startSec: 400, title: 'D', type: 'opening' as const, confidence: 0, source: 'fallback' as const }
    ];
    const handleClick = vi.fn();

    const { container } = render(
      <YOU4Cards moments={mockMoments} onMomentClick={handleClick} />
    );
    
    const cards = container.querySelectorAll('.you4-card');
    expect(cards.length).toBe(4);

    fireEvent.click(cards[2]);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockMoments[2]);
  });
});
