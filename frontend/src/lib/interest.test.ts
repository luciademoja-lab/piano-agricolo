import { describe, it, expect } from 'vitest';
import { demand, latestPerEmail, parseKg, qty, subscribers, validateInterest, type Interest, type InterestInput, type InterestOption } from './interest';

const OPTIONS: InterestOption[] = [
  { id: 'cardoncello', commonName: 'Cardoncello', scientificName: 'Pleurotus eryngii', sellable: true },
  { id: 'pioppino', commonName: 'Pioppino', scientificName: 'Agrocybe aegerita', sellable: true },
  { id: 'hericium', commonName: 'Criniera di leone', scientificName: 'Hericium erinaceus', sellable: false },
];
const ok: InterestInput = {
  kind: 'ristorante', name: 'Maria Rossi', business: 'Trattoria', town: 'Polistena', email: 'maria@example.it', phone: '',
  frequency: 'settimanale', note: '', privacy: true, updates: false, items: [{ variety: 'cardoncello', other: null, kg: 2 }],
};
const at = (i: Partial<InterestInput>) => validateInterest({ ...ok, ...i }, OPTIONS);

describe('the questionnaire rules', () => {
  it('accepts a complete request', () => {
    expect(at({})).toEqual([]);
    expect(at({ kind: 'privato', business: '', phone: '+39 333 1234567', items: [{ variety: null, other: 'Porcini', kg: 0.5 }] })).toEqual([]);
  });
  it('puts each problem on its step', () => {
    expect(at({ kind: '' as never })).toEqual([{ step: 1, message: 'Dimmi se hai un locale o sei un privato.' }]);
    expect(at({ items: [] })[0]).toEqual({ step: 2, message: 'Scegli almeno un fungo.' });
    expect(at({ items: [{ variety: 'tartufo', other: null, kg: 1 }] })[0].step).toBe(2);
    expect(at({ items: [{ variety: 'cardoncello', other: null, kg: 1 }, { variety: null, other: 'cardoncello', kg: 1 }] }).map((p) => p.message)).toEqual(['Hai scelto due volte lo stesso fungo.']);
    expect(at({ items: [1, 2, 3, 4].map((n) => ({ variety: null, other: `F${n}`, kg: 1 })) })[0].message).toBe('Puoi scegliere al massimo 3 funghi.');
    expect(at({ items: [{ variety: 'pioppino', other: null, kg: NaN }] })).toEqual([{ step: 3, message: 'Indica quanti kg vorresti di Pioppino.' }]);
    expect(at({ items: [{ variety: 'pioppino', other: null, kg: 0 }] })[0].step).toBe(3);
    expect(at({ frequency: '' as never })).toEqual([{ step: 3, message: 'Dimmi ogni quanto li vorresti.' }]);
    expect(at({ business: ' ' })).toEqual([{ step: 4, message: 'Scrivi il nome del locale.' }]);
    expect(at({ email: 'maria@' })[0].message).toBe('Controlla l’indirizzo email.');
    expect(at({ phone: 'chiamami' })[0].message).toBe('Controlla il numero di telefono.');
    expect(at({ privacy: false })[0].message).toMatch(/informativa sulla privacy/);
  });
  it('reads kilos the Italian way', () => {
    expect(parseKg('1,5')).toBe(1.5);
    expect(parseKg(' 2 ')).toBe(2);
    expect(parseKg('')).toBeNull();
    expect(parseKg('due')).toBeNaN();
    expect(qty(0.25)).toBe('250 g');
    expect(qty(1.5)).toBe('1,5 kg');
  });
});

const req = (o: Partial<Interest>): Interest => ({
  id: Math.random().toString(36), createdAt: 1, kind: 'privato', name: 'X', business: null, town: 'Cinquefrondi', email: 'x@example.it',
  phone: null, frequency: 'settimanale', note: null, updatesAt: null, updatesStoppedAt: null, status: 'nuova', adminNote: null, items: [], ...o,
});

describe('what people ask for', () => {
  it('counts each person once, with the latest request', () => {
    const list = [
      req({ email: 'a@x.it', createdAt: 1, items: [{ varietyId: 'cardoncello', label: 'Cardoncello', kg: 5 }] }),
      req({ email: 'A@x.it', createdAt: 2, items: [{ varietyId: 'cardoncello', label: 'Cardoncello', kg: 1 }] }),
    ];
    expect(latestPerEmail(list).map((r) => r.createdAt)).toEqual([2]);
    expect(demand(list)).toMatchObject([{ key: 'cardoncello', people: 1, kgPerWeek: 1 }]);
  });
  it('turns every frequency into kilos a week, keeps the occasional ones apart and leaves out the archived', () => {
    const c = (kg: number) => [{ varietyId: 'cardoncello', label: 'Cardoncello', kg }];
    const list = [
      req({ email: 'a@x.it', kind: 'ristorante', frequency: 'settimanale', items: c(2) }),
      req({ email: 'b@x.it', frequency: 'quindicinale', items: c(1) }),
      req({ email: 'c@x.it', frequency: 'mensile', items: c(5.2) }),
      req({ email: 'd@x.it', frequency: 'occasionale', items: [...c(1), { varietyId: null, label: 'Porcini ', kg: 1 }] }),
      req({ email: 'e@x.it', status: 'archiviata', items: c(10) }),
    ];
    const [card, porcini] = demand(list);
    expect(card).toMatchObject({ people: 4, ristoranti: 1, privati: 3, occasionalKg: 1 });
    expect(card.kgPerWeek).toBeCloseTo(2 + 0.5 + 5.2 * 12 / 52);
    expect(porcini).toMatchObject({ key: 'altro:porcini', people: 1, kgPerWeek: 0, occasionalKg: 1 });
  });
  it('lists the addresses for the updates: consent given, not stopped, by the latest request', () => {
    const list = [
      req({ email: 'si@x.it', updatesAt: 5 }),
      req({ email: 'no@x.it' }),
      req({ email: 'basta@x.it', updatesAt: 5, updatesStoppedAt: 9 }),
      req({ email: 'ripensato@x.it', createdAt: 1, updatesAt: 1 }),
      req({ email: 'ripensato@x.it', createdAt: 2 }),
    ];
    expect(subscribers(list)).toEqual(['si@x.it']);
  });
});
