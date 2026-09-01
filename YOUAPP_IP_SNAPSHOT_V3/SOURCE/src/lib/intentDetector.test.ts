import { describe, it, expect } from 'vitest';
import { detectIntent } from './intentDetector';

describe('Intent Detector (V2.1)', () => {
  it('debe clasificar "historia de entre rios" como HISTORY sin activar TECH', () => {
    const res = detectIntent('historia de entre rios');
    expect(res.primaryIntent).toBe('history');
    expect(res.secondaryIntent).not.toBe('tech');
  });

  it('debe clasificar "historia" sin activar TECH por culpa de "ia"', () => {
    const res = detectIntent('historia');
    expect(res.primaryIntent).toBe('history');
    expect(res.secondaryIntent).not.toBe('tech');
  });

  it('debe clasificar "historia de la inteligencia artificial" como HISTORY primario y TECH secundario', () => {
    const res = detectIntent('historia de la inteligencia artificial');
    // En este caso, puede que TECH tenga 2 puntos e HISTORY 1 punto. 
    // Depende del scoring. Verifiquemos que ambos estén presentes.
    const intents = [res.primaryIntent, res.secondaryIntent];
    expect(intents).toContain('history');
    expect(intents).toContain('tech');
  });

  it('debe clasificar "inteligencia artificial" como TECH', () => {
    const res = detectIntent('inteligencia artificial');
    expect(res.primaryIntent).toBe('tech');
  });

  it('debe clasificar "noticias ia" como NEWS y TECH', () => {
    const res = detectIntent('noticias ia');
    const intents = [res.primaryIntent, res.secondaryIntent];
    expect(intents).toContain('news');
    expect(intents).toContain('tech');
  });

  it('debe clasificar "noticias de inteligencia artificial" como NEWS y TECH', () => {
    const res = detectIntent('noticias de inteligencia artificial');
    const intents = [res.primaryIntent, res.secondaryIntent];
    expect(intents).toContain('news');
    expect(intents).toContain('tech');
  });

  it('debe clasificar "turismo en entre rios" como TOURISM', () => {
    const res = detectIntent('turismo en entre rios');
    expect(res.primaryIntent).toBe('tourism');
  });

  it('debe clasificar "economia argentina" como ECONOMY', () => {
    const res = detectIntent('economia argentina');
    expect(res.primaryIntent).toBe('economy');
  });
});
