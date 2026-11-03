// The in-memory repository follows the same rules as the database (see backend/supabase/tests/farm.test.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepo } from './memoryRepo';
import { demoSeed, DEMO_PASSWORD } from './demoSeed';
import type { Repo } from './repo';

const NOW = Date.UTC(2026, 10, 2, 10); // 2 Nov 2026
let repo: Repo;

beforeEach(async () => {
  repo = createMemoryRepo({ ...demoSeed(), now: () => NOW, settings: { indoorM2: 10 } });
  await repo.signIn('lucia', DEMO_PASSWORD);
});

describe('the demo', () => {
  it('starts with an empty plan, the catalogue and the first Regolamenti', async () => {
    const farm = await repo.loadFarm();
    expect(farm.plantings).toEqual([]);
    expect(farm.catalog).toHaveLength(10);
    const rules = await repo.loadRules();
    expect(rules.rules.find((r) => r.id === 'schema-operativo-coltivazioni')).toMatchObject({ status: 'to_confirm' });
    expect(rules.rules.every((r) => r.status === 'to_confirm' || r.id === 'stati')).toBe(true);
  });
});

describe('adding a crop', () => {
  it('adds it with the tasks of its cycle and its initial investment', async () => {
    const id = await repo.addPlanting({ cropId: 'microgreens', m2: 1.5, heads: null, start: '2026-11-02', soldPct: 80, note: '' });
    const farm = await repo.loadFarm();
    expect(farm.plantings).toMatchObject([{ id, cropId: 'microgreens', m2: 1.5, soldPct: 80 }]);
    expect(farm.tasks.filter((t) => t.plantingId === id)[0]).toMatchObject({ title: 'Semina vassoi microgreens', due: '2026-11-02', done: false, source: 'cycle' });
    expect(farm.expenses).toMatchObject([{ plantingId: id, amountMin: 200, amountMax: 500, kind: 'investment', source: 'catalog', paid: false }]);
  });
  it('refuses a date outside the window and more space than is left', async () => {
    await expect(repo.addPlanting({ cropId: 'zafferano', m2: 100, heads: null, start: '2027-01-10', soldPct: 100, note: '' }))
      .rejects.toThrow('Zafferano non si può avviare in questa data: è fuori dalla finestra di avvio.');
    await repo.addPlanting({ cropId: 'orto-eterno', m2: 900, heads: null, start: '2026-11-02', soldPct: 100, note: '' });
    await expect(repo.addPlanting({ cropId: 'orto-eterno', m2: 200, heads: null, start: '2026-11-02', soldPct: 100, note: '' }))
      .rejects.toThrow('Spazio esterno insufficiente: ne restano 100 m² su 1.000.');
  });
  it('removes a crop with its tasks and expenses', async () => {
    const id = await repo.addPlanting({ cropId: 'funghi', m2: 2, heads: null, start: '2026-11-02', soldPct: 100, note: '' });
    await repo.deletePlanting(id);
    const farm = await repo.loadFarm();
    expect([farm.plantings.length, farm.tasks.length, farm.expenses.length]).toEqual([0, 0, 0]);
  });
});

describe('tasks, expenses and settings', () => {
  it('ticks tasks and records what was paid', async () => {
    const t = await repo.addTask('Comprare semi', '2026-11-05', null);
    await repo.setTaskDone(t, true);
    expect((await repo.loadFarm()).tasks.find((x) => x.id === t)).toMatchObject({ done: true, doneAt: NOW });
    const e = await repo.addExpense({ title: 'Scaffale', date: '2026-11-10', amountMin: 50, amountMax: 80, kind: 'other', plantingId: null });
    await expect(repo.setExpensePaid(e, true, null)).rejects.toThrow('Indica quanto hai pagato.');
    await repo.setExpensePaid(e, true, 65);
    expect((await repo.loadFarm()).expenses.find((x) => x.id === e)).toMatchObject({ paid: true, actualAmount: 65 });
  });
  it('will not shrink the space below what the plan uses', async () => {
    await repo.addPlanting({ cropId: 'microgreens', m2: 4, heads: null, start: '2026-11-02', soldPct: 100, note: '' });
    await expect(repo.setSettings({ outdoorM2: 1000, indoorM2: 3, grantDeadline: null })).rejects.toThrow('Le colture nel piano usano già 4 m² interni.');
    await repo.setSettings({ outdoorM2: 800, indoorM2: 4, grantDeadline: '2029-08-04' });
    expect((await repo.loadFarm()).settings).toEqual({ outdoorM2: 800, indoorM2: 4, grantDeadline: '2029-08-04' });
  });
  it('lets a read-only login see everything and change nothing', async () => {
    await repo.signOut();
    await repo.signIn('socio', DEMO_PASSWORD);
    expect((await repo.loadFarm()).catalog).toHaveLength(10);
    await expect(repo.addPlanting({ cropId: 'microgreens', m2: 1, heads: null, start: '2026-11-02', soldPct: 100, note: '' })).rejects.toThrow('Hai accesso in sola lettura.');
    await expect(repo.applyRuleChanges([], 'editor')).rejects.toThrow('Solo l’admin può cambiare i regolamenti.');
  });
});

describe('the mushroom catalogue (same rules as backend/supabase/tests/funghi.test.ts)', () => {
  it('shows the public catalogue without signing in, without costs', async () => {
    await repo.signOut();
    const pub = await repo.loadPublicCatalog();
    expect(pub.map((v) => v.id)).toEqual(['pleurotus-ostreatus', 'cardoncello', 'pioppino', 'shiitake', 'pleurotus-cornucopiae']);
    expect(pub[0]).not.toHaveProperty('supply');
    await expect(repo.loadMushrooms()).rejects.toMatchObject({ code: 'not_signed_in' });
  });
  it('lets the read-only login read costs but not change them', async () => {
    await repo.signOut();
    await repo.signIn('socio', DEMO_PASSWORD);
    expect((await repo.loadMushrooms()).varieties).toHaveLength(8);
    await expect(repo.publishPrices('pioppino', 20, 30)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(repo.setParam('loss_pct', 5, 'misura mia', null, null)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('publishes the provisional list for the public', async () => {
    await repo.publishPrices('pioppino', 21.2, 30.3);
    const pub = await repo.loadPublicCatalog();
    expect(pub.find((v) => v.id === 'pioppino')!.list).toEqual({ wholesale: 21.2, retail: 30.3, updatedAt: NOW });
    await expect(repo.publishPrices('pioppino', 0, 30)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('refuses a species off the official list in the public catalogue, and a parameter without source', async () => {
    const { varieties } = await repo.loadMushrooms();
    const h = varieties.find((r) => r.variety.id === 'hericium')!;
    await expect(repo.saveVariety({ ...h.variety, public: true }, h.position)).rejects.toThrow(/catalogo pubblico/);
    await expect(repo.setParam('loss_pct', 5, ' ', null, null)).rejects.toThrow(/fonte/);
    await repo.setParam('temp_01', 9.5, 'misura in cantina', null, '2026-12-01');
    expect((await repo.loadMushrooms()).params.find((p) => p.key === 'temp_01')).toMatchObject({ value: 9.5, source: 'misura in cantina', date: '2026-12-01' });
  });
});
