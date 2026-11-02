import { describe, it, expect } from 'vitest';
import { parseHash, routeHash } from './route';

describe('addresses', () => {
  it('opens tabs, one crop of the plan, and a calendar filtered on one crop', () => {
    expect(parseHash('')).toEqual({ tab: 'panoramica' });
    expect(parseHash('#/spese')).toEqual({ tab: 'spese' });
    expect(parseHash('#/coltura/p123')).toEqual({ tab: 'coltivazioni', planting: 'p123' });
    expect(parseHash('#/calendario?coltura=p123')).toEqual({ tab: 'calendario', filter: 'p123' });
    expect(parseHash('#rule-esonero-iva')).toEqual({ tab: 'regolamenti' });
    expect(parseHash('#/nonesiste')).toEqual({ tab: 'panoramica' });
  });
  it('writes them back', () => {
    expect(routeHash({ tab: 'coltivazioni', planting: 'p1' })).toBe('#/coltura/p1');
    expect(routeHash({ tab: 'task', filter: 'p1' })).toBe('#/task?coltura=p1');
  });
});
