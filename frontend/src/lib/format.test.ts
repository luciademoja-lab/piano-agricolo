import { describe, it, expect } from 'vitest';
import { eur, eurRange, eurShort, hoursRange, m2 } from './format';

describe('Italian number formats', () => {
  it('writes euros, areas and ranges', () => {
    expect(eur(1234.6)).toBe('€ 1.235');
    expect(eurRange(200, 500)).toBe('€ 200–500');
    expect(eurRange(500, 500.2)).toBe('€ 500');
    expect(m2(1.5)).toBe('1,5 m²');
    expect(m2(1000)).toBe('1.000 m²');
    expect(eurShort(12500)).toBe('€ 13k');
    expect(eurShort(-3200)).toBe('€ -3,2k');
    expect(hoursRange(0, 7)).toBe('0–7 h');
  });
});
