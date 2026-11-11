// Repository backed by Supabase: reads tables through RLS, writes through the Postgres functions
// in backend/supabase/migrations, logins via the admin-users Edge Function.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cropById, type Crop } from '../lib/catalog';
import { todayInRome } from '../lib/dates';
import { generateExpenses, generateTasks, type Expense, type FarmTask, type Planting } from '../lib/plan';
import { filePath, rulesFromRows, type ApplyResult, type EntryRow, type LogRow, type SectionRow } from '../lib/rules';
import { loginEmail } from '../../../backend/supabase/functions/_shared/username.ts';
import { parseDbError, RepoError, signInError, type Profile, type Repo } from './repo';
import type { Param, PublicVariety, Variety, VarietyRow } from '../lib/pricing';
import type { Interest, InterestOption } from '../lib/interest';

type ProfileRow = { id: string; username: string; full_name: string; role: Profile['role']; active: boolean };
type CatalogRow = { id: string; position: number; data: Crop };
type SettingsRow = { outdoor_m2: number | string; indoor_m2: number | string | null; grant_deadline: string | null };
type PlantingRow = { id: string; crop_id: string; m2: number | string; heads: number | null; start_date: string; sold_pct: number | string; note: string; created_at: string };
type TaskRow = { id: string; planting_id: string | null; title: string; due: string; done: boolean; done_at: string | null; source: FarmTask['source'] };
type ExpenseRow = { id: string; planting_id: string | null; title: string; date: string; amount_min: number | string; amount_max: number | string; kind: Expense['kind']; paid: boolean; actual_amount: number | string | null; source: Expense['source'] };

type VarietyDbRow = { id: string; position: number; public: boolean; data: Omit<Variety, 'id' | 'public'>; list_wholesale: number | string | null; list_retail: number | string | null; list_updated_at: string | null };
type PublicDbRow = { id: string; position: number; data: Omit<PublicVariety, 'id' | 'list'>; list_wholesale: number | string | null; list_retail: number | string | null; list_updated_at: string | null };
type OptionDbRow = { id: string; position: number; common_name: string; scientific_name: string; sellable: boolean };
type InterestDbRow = {
  id: string; created_at: string; kind: Interest['kind']; name: string; business: string | null; town: string; email: string; phone: string | null;
  frequency: Interest['frequency']; note: string | null; updates_at: string | null; updates_stopped_at: string | null; status: Interest['status'];
  admin_note: string | null; interest_items: Array<{ position: number; variety_id: string | null; label: string; kg: number | string }>;
};
type ParamDbRow = { key: string; position: number; grp: string; label: string; unit: string; value: number | string; source: string; source_url: string | null; source_date: string | null };

export const REALTIME_TABLES = ['profiles', 'crop_catalog', 'farm_settings', 'plantings', 'farm_tasks', 'expenses', 'rules_sections', 'rules_entries', 'rules_log', 'varieties', 'price_params', 'interests', 'interest_items'];
const RULES_BUCKET = 'rules-files';
const num = (v: number | string) => Number(v);
const time = (v: string | null) => (v ? Date.parse(v) : null);
const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));
const listOf = (r: { list_wholesale: number | string | null; list_retail: number | string | null; list_updated_at: string | null }) =>
  ({ wholesale: numOrNull(r.list_wholesale), retail: numOrNull(r.list_retail), updatedAt: r.list_updated_at ? Date.parse(r.list_updated_at) : null });

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw parseDbError(res.error.message);
  return res.data;
}

export function createSupabaseRepo(url: string, anonKey: string): Repo {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  async function callAdmin(body: Record<string, unknown>) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (!error) return data as Record<string, unknown>;
    const ctx = (error as { context?: Response }).context;
    let msg = error.message, status = 0;
    if (ctx && typeof ctx.json === 'function') {
      status = ctx.status;
      try { msg = ((await ctx.json()) as { error?: string }).error || msg; } catch { /* keep message */ }
    }
    throw new RepoError(status === 409 ? 'conflict' : status === 403 ? 'forbidden' : status === 400 ? 'invalid' : 'network', msg);
  }
  const catalog = async () => (check(await sb.from('crop_catalog').select('id, position, data').order('position')) as CatalogRow[]).map((r) => r.data);

  return {
    mode: 'live',
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async signIn(username, password) {
      let error: { message: string } | null = null;
      try { ({ error } = await sb.auth.signInWithPassword({ email: loginEmail(username), password })); }
      catch (e) { throw signInError(e instanceof Error ? e.message : String(e)); }
      if (error) throw signInError(error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
    subscribe(onChange) {
      // one channel per table: if a table is missing from the realtime publication, only that table stops updating
      const channels = REALTIME_TABLES.map((table) =>
        sb.channel(`farm-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange()).subscribe());
      return () => { for (const ch of channels) void sb.removeChannel(ch); };
    },

    async loadPeople() {
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id ?? null;
      const rows = check(await sb.from('profiles').select('id, username, full_name, role, active').order('full_name')) as ProfileRow[];
      const profiles = Object.fromEntries(rows.map((r) => [r.id, { id: r.id, username: r.username, fullName: r.full_name, role: r.role, active: r.active }]));
      return { me: uid ? profiles[uid] ?? null : null, profiles };
    },
    async loadFarm() {
      const [c, s, p, t, e] = await Promise.all([
        catalog(),
        sb.from('farm_settings').select('outdoor_m2, indoor_m2, grant_deadline').single(),
        sb.from('plantings').select('id, crop_id, m2, heads, start_date, sold_pct, note, created_at').order('created_at'),
        sb.from('farm_tasks').select('id, planting_id, title, due, done, done_at, source').order('due').limit(20000),
        sb.from('expenses').select('id, planting_id, title, date, amount_min, amount_max, kind, paid, actual_amount, source').order('date'),
      ]);
      const st = check(s) as SettingsRow;
      return {
        catalog: c,
        settings: { outdoorM2: num(st.outdoor_m2), indoorM2: numOrNull(st.indoor_m2), grantDeadline: st.grant_deadline },
        plantings: (check(p) as PlantingRow[]).map((r): Planting => ({
          id: r.id, cropId: r.crop_id, m2: num(r.m2), heads: r.heads, start: r.start_date, soldPct: num(r.sold_pct), note: r.note, createdAt: Date.parse(r.created_at),
        })),
        tasks: (check(t) as TaskRow[]).map((r): FarmTask => ({
          id: r.id, plantingId: r.planting_id, title: r.title, due: r.due, done: r.done, doneAt: r.done_at ? Date.parse(r.done_at) : null, source: r.source,
        })),
        expenses: (check(e) as ExpenseRow[]).map((r): Expense => ({
          id: r.id, plantingId: r.planting_id, title: r.title, date: r.date, amountMin: num(r.amount_min), amountMax: num(r.amount_max), kind: r.kind,
          paid: r.paid, actualAmount: numOrNull(r.actual_amount), source: r.source,
        })),
      };
    },

    async setSettings(s) {
      check(await sb.rpc('farm_set_settings', { p_outdoor: s.outdoorM2, p_indoor: s.indoorM2, p_deadline: s.grantDeadline }));
    },
    async addPlanting(input) {
      const crop = cropById(await catalog(), input.cropId);
      if (!crop) throw new RepoError('invalid', 'Scegli una coltura dal catalogo.');
      const today = todayInRome();
      return check(await sb.rpc('plan_add', {
        p_crop: input.cropId, p_m2: input.m2, p_heads: input.heads, p_start: input.start, p_sold_pct: input.soldPct, p_note: input.note,
        p_tasks: generateTasks(crop, input.start, today), p_expenses: generateExpenses(crop, input),
      })) as string;
    },
    async deletePlanting(id) { check(await sb.rpc('plan_delete', { p_id: id })); },
    async setTaskDone(id, done) { check(await sb.rpc('task_set_done', { p_id: id, p_done: done })); },
    async addTask(title, due, plantingId) { return check(await sb.rpc('task_add', { p_title: title, p_due: due, p_planting: plantingId })) as string; },
    async deleteTask(id) { check(await sb.rpc('task_delete', { p_id: id })); },
    async addExpense(e) {
      return check(await sb.rpc('expense_add', { p_title: e.title, p_date: e.date, p_min: e.amountMin, p_max: e.amountMax, p_kind: e.kind, p_planting: e.plantingId })) as string;
    },
    async setExpensePaid(id, paid, actual) { check(await sb.rpc('expense_set_paid', { p_id: id, p_paid: paid, p_actual: actual })); },
    async deleteExpense(id) { check(await sb.rpc('expense_delete', { p_id: id })); },

    async createLogin(l) {
      const r = await callAdmin({ action: 'create', username: l.username, fullName: l.fullName, password: l.password, role: l.role });
      return { id: String(r.id), username: String(r.username) };
    },
    async resetPassword(userId, password) { await callAdmin({ action: 'reset_password', userId, password }); },
    async updateProfile(id, fullName, role, active) {
      check(await sb.rpc('admin_update_profile', { p_id: id, p_full_name: fullName, p_role: role, p_active: active }));
    },

    async loadPublicCatalog() {
      const rows = check(await sb.rpc('catalog_public')) as PublicDbRow[];
      return rows.map((r): PublicVariety => ({ ...r.data, id: r.id, list: listOf(r) }));
    },
    async loadMushrooms() {
      const [v, p] = await Promise.all([
        sb.from('varieties').select('id, position, public, data, list_wholesale, list_retail, list_updated_at').order('position'),
        sb.from('price_params').select('key, position, grp, label, unit, value, source, source_url, source_date').order('position'),
      ]);
      const varieties = (check(v) as VarietyDbRow[]).map((r): VarietyRow => ({ variety: { ...r.data, id: r.id, public: r.public }, position: r.position, list: listOf(r) }));
      const params = (check(p) as ParamDbRow[]).map((r): Param => ({
        key: r.key, position: r.position, group: r.grp, label: r.label, unit: r.unit, value: Number(r.value), source: r.source, url: r.source_url, date: r.source_date,
      }));
      if (!varieties.length || !params.length) throw new RepoError('forbidden', 'Non hai accesso al listino dei funghi.');
      return { varieties, params };
    },
    async saveVariety(v, position) {
      const { id, public: pub, ...data } = v;
      check(await sb.rpc('variety_save', { p_id: id, p_position: position, p_public: pub, p_data: data }));
    },
    async publishPrices(id, wholesale, retail) { check(await sb.rpc('variety_publish', { p_id: id, p_wholesale: wholesale, p_retail: retail })); },
    async setParam(key, value, source, url, date) { check(await sb.rpc('param_set', { p_key: key, p_value: value, p_source: source, p_url: url, p_date: date })); },

    async loadInterestOptions() {
      return (check(await sb.rpc('interest_options')) as OptionDbRow[]).map((r): InterestOption => ({ id: r.id, commonName: r.common_name, scientificName: r.scientific_name, sellable: r.sellable }));
    },
    async submitInterest(i) {
      const p = {
        kind: i.kind, name: i.name, business: i.kind === 'ristorante' ? i.business : '', town: i.town, email: i.email, phone: i.phone,
        frequency: i.frequency, note: i.note, privacy: i.privacy, updates: i.updates,
        items: i.items.map((it) => (it.variety ? { variety: it.variety, kg: it.kg } : { other: it.other, kg: it.kg })),
      };
      return check(await sb.rpc('interest_submit', { p })) as string;
    },
    async loadInterests() {
      const rows = check(await sb.from('interests')
        .select('id, created_at, kind, name, business, town, email, phone, frequency, note, updates_at, updates_stopped_at, status, admin_note, interest_items (position, variety_id, label, kg)')
        .order('created_at', { ascending: false })) as InterestDbRow[];
      return rows.map((r): Interest => ({
        id: r.id, createdAt: Date.parse(r.created_at), kind: r.kind, name: r.name, business: r.business, town: r.town, email: r.email, phone: r.phone,
        frequency: r.frequency, note: r.note, updatesAt: time(r.updates_at), updatesStoppedAt: time(r.updates_stopped_at), status: r.status, adminNote: r.admin_note,
        items: [...r.interest_items].sort((a, b) => a.position - b.position).map((it) => ({ varietyId: it.variety_id, label: it.label, kg: num(it.kg) })),
      }));
    },
    async updateInterest(id, status, note) { check(await sb.rpc('interest_update', { p_id: id, p_status: status, p_note: note })); },
    async stopInterestUpdates(id) { check(await sb.rpc('interest_stop_updates', { p_id: id })); },
    async deleteInterest(id) { return check(await sb.rpc('interest_delete', { p_id: id })) as number; },

    async loadRules() {
      const [s, e, l] = await Promise.all([
        sb.from('rules_sections').select('id, title, position, updated_at'),
        sb.from('rules_entries').select('id, section_id, title, body, status, source, source_url, tags, position, updated_by, updated_at'),
        sb.from('rules_log').select('id, at, actor, entry_id, title, action, via, fields').order('at', { ascending: false }).limit(200),
      ]);
      return rulesFromRows(check(s) as SectionRow[], check(e) as EntryRow[], check(l) as LogRow[]);
    },
    async applyRuleChanges(changes, via) {
      return check(await sb.rpc('rules_apply', { p_changes: changes, p_via: via })) as ApplyResult;
    },
    async uploadRuleFile(file, name) {
      const path = filePath(name, Date.now(), crypto.randomUUID().replace(/-/g, '').slice(0, 10));
      const { error } = await sb.storage.from(RULES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        if (/row-level security|unauthorized|403/i.test(error.message)) throw new RepoError('forbidden', 'Solo l’admin può aggiungere file ai regolamenti.');
        if (/bucket not found/i.test(error.message)) throw new RepoError('invalid', 'Manca l’archivio dei file: esegui l’ultimo aggiornamento del database (supabase db push).');
        if (/size|too large|413/i.test(error.message)) throw new RepoError('invalid', 'Il file è troppo grande (100 MB al massimo).');
        if (/mime|type/i.test(error.message)) throw new RepoError('invalid', 'Si possono aggiungere solo immagini, video e PDF.');
        throw new RepoError('network', `Impossibile caricare il file (${error.message}).`);
      }
      return path;
    },
    async ruleFileUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await sb.storage.from(RULES_BUCKET).createSignedUrls(paths, 6 * 3600);
      if (error) throw new RepoError('network', `Impossibile aprire i file (${error.message}).`);
      return Object.fromEntries((data || []).filter((d) => d.signedUrl && !d.error && d.path).map((d) => [d.path as string, d.signedUrl as string]));
    },
  };
}
