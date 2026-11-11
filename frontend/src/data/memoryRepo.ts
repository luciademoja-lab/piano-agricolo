// In-memory repository with the same rules as the database functions.
// Used for demo mode (no Supabase configured) and for end-to-end tests.
import { CATALOG, cropById, type Catalog } from '../lib/catalog';
import { isDate, todayInRome, type DateStr } from '../lib/dates';
import {
  checkManualExpense, checkManualTask, checkPlanting, generateExpenses, generateTasks, usedSpace,
  type Expense, type FarmTask, type Planting, type Settings,
} from '../lib/plan';
import { filePath, type RuleChange } from '../lib/rules';
import { SEED_LIST, SEED_PARAMS, SEED_VARIETIES, toPublic, validateParam, validateVariety, type Param, type VarietyRow } from '../lib/pricing';
import { normalizeUsername, validatePassword, validateUsername } from '../../../backend/supabase/functions/_shared/username.ts';
import { STATUSES, validateInterest, type Interest, type InterestOption } from '../lib/interest';
import { RepoError, type NewLogin, type Profile, type Repo, type Role } from './repo';
import { createMemoryRules } from './memoryRules';

export type SeedUser = { username: string; fullName: string; role: Role; password: string };
export type Seed = {
  users: SeedUser[];
  now?: () => number;
  catalog?: Catalog;
  settings?: Partial<Settings>;
  /** demo Regolamenti, as the changes an admin would apply */
  rules?: RuleChange[];
};

let counter = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;
const fail = (code: ConstructorParameters<typeof RepoError>[0], msg: string): never => { throw new RepoError(code, msg); };
const fmt = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);

export function createMemoryRepo(seed: Seed): Repo {
  const now = seed.now || Date.now;
  const today = (): DateStr => todayInRome(now());
  const catalog = structuredClone(seed.catalog || CATALOG);
  const profiles = new Map<string, Profile>();
  const passwords = new Map<string, string>();
  const settings: Settings = { outdoorM2: 1000, indoorM2: null, grantDeadline: null, ...seed.settings };
  let plantings: Planting[] = [];
  let tasks: FarmTask[] = [];
  let expenses: Expense[] = [];
  let me: string | null = null;
  const listeners = new Set<() => void>();
  const authListeners = new Set<() => void>();
  const rules = createMemoryRules(now, newId);
  const varieties: VarietyRow[] = SEED_VARIETIES.map((v, i) => ({
    variety: structuredClone(v), position: i + 1,
    list: SEED_LIST[v.id] ? { ...SEED_LIST[v.id], updatedAt: now() } : { wholesale: null, retail: null, updatedAt: null },
  }));
  const params: Param[] = structuredClone(SEED_PARAMS);
  let interests: Interest[] = [];
  const DAY = 86_400_000;

  for (const u of seed.users) {
    const id = newId('u');
    profiles.set(id, { id, username: normalizeUsername(u.username), fullName: u.fullName, role: u.role, active: true });
    passwords.set(id, u.password);
  }
  if (seed.rules) rules.apply(seed.rules, null, 'editor');

  const byUsername = (u: string) => [...profiles.values()].find((p) => p.username === normalizeUsername(u));
  const changed = () => listeners.forEach((f) => f());
  const current = (): Profile => {
    if (!me) return fail('not_signed_in', 'Entra di nuovo.');
    const p = profiles.get(me);
    if (!p || !p.active) return fail('forbidden', 'Questo login non è attivo.');
    return p;
  };
  const admin = (msg = 'Hai accesso in sola lettura.') => { const p = current(); if (p.role !== 'admin') fail('forbidden', msg); return p; };
  const staff = () => { const p = current(); if (p.role !== 'admin' && p.role !== 'viewer') fail('forbidden', 'Non hai accesso a questa parte.'); return p; };
  const options = (): InterestOption[] => [...varieties]
    .filter((r) => (r.variety.public && r.variety.legal === 'ammesso') || r.variety.legal === 'non_in_elenco')
    .map((r) => ({ r, sellable: r.variety.public && r.variety.legal === 'ammesso' }))
    .sort((a, b) => Number(b.sellable) - Number(a.sellable) || a.r.position - b.r.position || (a.r.variety.id < b.r.variety.id ? -1 : 1))
    .map(({ r, sellable }) => ({ id: r.variety.id, commonName: r.variety.commonName, scientificName: r.variety.scientificName, sellable }));
  /** like the database policy: only an active admin sees the requests */
  const isAdminNow = () => { const p = me ? profiles.get(me) : undefined; return !!p && p.active && p.role === 'admin'; };
  const interestById = (id: string) => interests.find((r) => r.id === id) ?? fail('not_found', 'Questa richiesta non esiste più.');
  const plantingExists = (id: string | null) => { if (id !== null && !plantings.some((p) => p.id === id)) fail('not_found', 'Questa coltura non è più nel piano.'); };

  const repo: Repo = {
    mode: 'demo',
    async session() { return me; },
    async signIn(username, password) {
      const p = byUsername(username);
      if (!p || !p.active || passwords.get(p.id) !== password) fail('bad_login', 'Nome utente o password sbagliati.');
      me = p!.id;
      authListeners.forEach((f) => f());
    },
    async signOut() { me = null; authListeners.forEach((f) => f()); },
    onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async loadPeople() {
      current();
      return { me: { ...profiles.get(me!)! }, profiles: Object.fromEntries([...profiles.values()].map((p) => [p.id, { ...p }])) };
    },
    async loadFarm() {
      current();
      return structuredClone({ catalog, settings, plantings, tasks: [...tasks].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)), expenses });
    },

    async setSettings(s) {
      admin();
      if (!(s.outdoorM2 > 0)) fail('invalid', 'Indica i m² esterni disponibili (più di 0).');
      if (s.indoorM2 !== null && !(s.indoorM2 >= 0)) fail('invalid', 'I m² interni non possono essere negativi.');
      if (s.grantDeadline !== null && !isDate(s.grantDeadline)) fail('invalid', 'Data non valida.');
      const out = usedSpace(plantings, catalog, 'outdoor'), inn = usedSpace(plantings, catalog, 'indoor');
      if (s.outdoorM2 < out) fail('invalid', `Le colture nel piano usano già ${fmt(out)} m² esterni.`);
      if (inn > 0 && (s.indoorM2 === null || s.indoorM2 < inn)) fail('invalid', `Le colture nel piano usano già ${fmt(inn)} m² interni.`);
      Object.assign(settings, s); changed();
    },
    async addPlanting(input) {
      admin();
      const check = checkPlanting(input, { catalog, settings, plantings }, today());
      if (check.errors.length) fail('invalid', check.errors[0]);
      const crop = cropById(catalog, input.cropId)!;
      const id = newId('p');
      plantings.push({ ...input, id, heads: crop.scale === 'capi' ? input.heads : null, note: input.note.trim(), createdAt: now() });
      for (const t of generateTasks(crop, input.start, today())) tasks.push({ ...t, id: newId('t'), plantingId: id, done: false, doneAt: null });
      for (const e of generateExpenses(crop, input)) expenses.push({ ...e, id: newId('e'), plantingId: id, paid: false, actualAmount: null });
      changed();
      return id;
    },
    async deletePlanting(id) {
      admin();
      plantingExists(id);
      plantings = plantings.filter((p) => p.id !== id);
      tasks = tasks.filter((t) => t.plantingId !== id);
      expenses = expenses.filter((e) => e.plantingId !== id);
      changed();
    },
    async setTaskDone(id, done) {
      admin();
      const t = tasks.find((x) => x.id === id) ?? fail('not_found', 'Questo task non esiste più.');
      t.done = done; t.doneAt = done ? now() : null; changed();
    },
    async addTask(title, due, plantingId) {
      admin();
      const e = checkManualTask(title, due); if (e) fail('invalid', e);
      plantingExists(plantingId);
      const id = newId('t');
      tasks.push({ id, plantingId, title: title.trim(), due, done: false, doneAt: null, source: 'manual' }); changed();
      return id;
    },
    async deleteTask(id) {
      admin();
      if (!tasks.some((t) => t.id === id)) fail('not_found', 'Questo task non esiste più.');
      tasks = tasks.filter((t) => t.id !== id); changed();
    },
    async addExpense(x) {
      admin();
      const e = checkManualExpense(x.title, x.date, x.amountMin, x.amountMax); if (e) fail('invalid', e);
      plantingExists(x.plantingId);
      const id = newId('e');
      expenses.push({ ...x, id, title: x.title.trim(), paid: false, actualAmount: null, source: 'manual' }); changed();
      return id;
    },
    async setExpensePaid(id, paid, actual) {
      admin();
      if (paid && !(actual !== null && actual >= 0)) fail('invalid', 'Indica quanto hai pagato.');
      const e = expenses.find((x) => x.id === id) ?? fail('not_found', 'Questa spesa non esiste più.');
      e.paid = paid; e.actualAmount = paid ? actual : null; changed();
    },
    async deleteExpense(id) {
      admin();
      if (!expenses.some((e) => e.id === id)) fail('not_found', 'Questa spesa non esiste più.');
      expenses = expenses.filter((e) => e.id !== id); changed();
    },

    async createLogin(l: NewLogin) {
      admin('Solo l’admin può gestire i login.');
      const username = normalizeUsername(l.username);
      const e = validateUsername(username) || (!l.fullName.trim() ? 'Il nome completo è obbligatorio.' : null) || validatePassword(l.password);
      if (e) fail('invalid', e);
      if (byUsername(username)) fail('conflict', 'Questo nome utente è già in uso.');
      const id = newId('u');
      profiles.set(id, { id, username, fullName: l.fullName.trim(), role: l.role, active: true });
      passwords.set(id, l.password); changed();
      return { id, username };
    },
    async resetPassword(userId, password) {
      admin('Solo l’admin può gestire i login.');
      const e = validatePassword(password); if (e) fail('invalid', e);
      if (!profiles.has(userId)) fail('not_found', 'Questa persona non esiste.');
      passwords.set(userId, password);
    },
    async updateProfile(id, fullName, role, active) {
      const p = admin('Solo l’admin può cambiare le persone.');
      if (id === p.id && (role !== 'admin' || !active)) fail('invalid', 'Non puoi togliere a te stessa l’accesso da admin.');
      const t = profiles.get(id) ?? fail('not_found', 'Questa persona non esiste.');
      Object.assign(t, { fullName: fullName.trim(), role, active }); changed();
    },

    async loadPublicCatalog() {
      return varieties.filter((r) => r.variety.public && r.variety.legal === 'ammesso')
        .sort((a, b) => a.position - b.position || (a.variety.id < b.variety.id ? -1 : 1))
        .map((r) => structuredClone(toPublic(r)));
    },
    async loadMushrooms() {
      staff();
      return structuredClone({ varieties: [...varieties].sort((a, b) => a.position - b.position), params: [...params].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) });
    },
    async saveVariety(v, position) {
      admin();
      const e = validateVariety(v); if (e.length) fail('invalid', e[0]);
      const row = varieties.find((r) => r.variety.id === v.id);
      if (row) { row.variety = structuredClone(v); row.position = position; }
      else varieties.push({ variety: structuredClone(v), position, list: { wholesale: null, retail: null, updatedAt: null } });
      changed();
    },
    async publishPrices(id, wholesale, retail) {
      admin();
      if ((wholesale !== null && !(wholesale > 0)) || (retail !== null && !(retail > 0))) fail('invalid', 'I prezzi del listino devono essere più di 0.');
      const row = varieties.find((r) => r.variety.id === id) ?? fail('not_found', 'Questa varietà non esiste più.');
      row.list = { wholesale, retail, updatedAt: wholesale === null && retail === null ? null : now() };
      changed();
    },
    async setParam(key, value, source, url, date) {
      admin();
      const e = validateParam(key, value, source); if (e.length) fail('invalid', e[0]);
      if (url && !/^https?:\/\//.test(url.trim())) fail('invalid', 'Il link della fonte deve iniziare con http:// o https://.');
      if (date !== null && !isDate(date)) fail('invalid', 'Data non valida.');
      const p = params.find((x) => x.key === key)!;
      Object.assign(p, { value, source: source.trim(), url: url?.trim() || null, date });
      changed();
    },

    async loadInterestOptions() { return options(); },
    async submitInterest(i) {
      const opts = options();
      const problems = validateInterest(i, opts);
      if (problems.length) fail('invalid', problems[0].message);
      const email = i.email.trim().toLowerCase();
      if (interests.filter((r) => r.email === email && r.createdAt > now() - DAY).length >= 3) {
        fail('invalid', 'Oggi hai già inviato tre richieste con questa email: se devi cambiare qualcosa, scrivimi.');
      }
      const id = newId('i');
      const t = now();
      interests.push({
        id, createdAt: t, kind: i.kind, name: i.name.trim(), business: i.kind === 'ristorante' ? i.business.trim() || null : null,
        town: i.town.trim(), email, phone: i.phone.trim() || null, frequency: i.frequency, note: i.note.trim() || null,
        updatesAt: i.updates ? t : null, updatesStoppedAt: null, status: 'nuova', adminNote: null,
        items: i.items.map((it) => ({
          varietyId: it.variety, label: it.variety ? opts.find((o) => o.id === it.variety)!.commonName : (it.other || '').trim(), kg: Math.round(it.kg * 100) / 100,
        })),
      });
      changed();
      return id;
    },
    async loadInterests() {
      current();
      if (!isAdminNow()) return [];
      return structuredClone([...interests].sort((a, b) => b.createdAt - a.createdAt));
    },
    async updateInterest(id, status, note) {
      admin();
      if (!STATUSES.some((s) => s.id === status)) fail('invalid', 'Stato non valido.');
      if (note.length > 2000) fail('invalid', 'La nota è troppo lunga (al massimo 2000 caratteri).');
      const r = interestById(id);
      r.status = status; r.adminNote = note.trim() || null; changed();
    },
    async stopInterestUpdates(id) {
      admin();
      const email = interestById(id).email;
      for (const r of interests) if (r.email === email && r.updatesStoppedAt === null) r.updatesStoppedAt = now();
      changed();
    },
    async deleteInterest(id) {
      admin();
      const email = interestById(id).email;
      const before = interests.length;
      interests = interests.filter((r) => r.email !== email);
      changed();
      return before - interests.length;
    },

    async loadRules() { current(); return rules.load(); },
    async applyRuleChanges(changes, via) {
      const p = admin('Solo l’admin può cambiare i regolamenti.');
      const res = rules.apply(changes, p.id, via);
      changed();
      return res;
    },
    async uploadRuleFile(file, name) {
      admin('Solo l’admin può aggiungere file ai regolamenti.');
      const path = filePath(name, now(), Math.random().toString(36).slice(2, 10));
      rules.files.set(path, typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : `https://demo.invalid/${path}`);
      return path;
    },
    async ruleFileUrls(paths) {
      current();
      return Object.fromEntries(paths.filter((p) => rules.files.has(p)).map((p) => [p, rules.files.get(p)!]));
    },
  };
  return repo;
}
