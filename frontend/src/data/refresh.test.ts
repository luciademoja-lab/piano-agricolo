import { describe, it, expect } from 'vitest';
import { withRefresh } from './refresh';
import type { Repo } from './repo';

describe('withRefresh (the page updates right after your own changes, even without realtime)', () => {
  const base = {
    mode: 'demo',
    async loadFarm() { return {}; },
    async loadPeople() { return {}; },
    async addPlanting() { return 'p1'; },
    async setTaskDone() { /* ok */ },
    async deleteTask() { throw new Error('nope'); },
    subscribe() { return () => undefined; },
  } as unknown as Repo;

  it('refreshes after every successful write, and passes the result through', async () => {
    let refreshed = 0;
    const repo = withRefresh(base, () => { refreshed++; });
    expect(await repo.addPlanting({ cropId: 'x', m2: 1, heads: null, start: '2026-11-02', soldPct: 100, note: '' })).toBe('p1');
    await repo.setTaskDone('t', true);
    expect(refreshed).toBe(2);
    await repo.loadFarm();
    await repo.loadPeople();
    expect(refreshed).toBe(2); // reads never refresh (or the page would reload forever)
    await expect(repo.deleteTask('x')).rejects.toThrow('nope');
    expect(refreshed).toBe(2);
  });
});
