// Funghi (staff): il listino calcolato per ogni varietà, cosa costa e perché, cosa paga il mercato,
// il listino pubblicato nel catalogo, e tutti i parametri con la loro fonte. Cambia solo l'admin.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Mushrooms, Repo } from '../data/repo';
import { isDate, type DateStr } from '../lib/dates';
import { eurCents, eurKg, num, span } from '../lib/format';
import {
  MONTHS, VERDICT_LABEL, daysToFirstHarvest, listUpToDate, monthEnergy, paramsByKey, priceVariety, validateVariety,
  type Param, type Params, type Pricing, type Range, type Source, type Variety, type VarietyRow,
} from '../lib/pricing';
import { errorText } from './errors';
import { Field, Modal } from './Modal';

export function FunghiPage({ repo, isAdmin, refreshKey }: { repo: Repo; isAdmin: boolean; refreshKey: number }) {
  const [data, setData] = useState<Mushrooms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    repo.loadMushrooms().then((d) => { if (alive) { setData(d); setError(null); } }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo, refreshKey]);
  const params = useMemo(() => (data ? paramsByKey(data.params) : null), [data]);

  if (error) return <div className="panel"><p className="err" role="alert">{error}</p></div>;
  if (!data || !params) return <p className="muted">Caricamento del listino…</p>;
  const priced = data.varieties.map((r) => ({ r, pr: priceVariety(r.variety, params) }));
  const row = priced.find((x) => x.r.variety.id === open);
  const pub = priced.find((x) => x.r.variety.id === publishing);

  return (
    <div className="funghi">
      <section className="panel">
        <div className="panel-head">
          <h2>Listino funghi</h2>
          <a className="btn" href="#/catalogo">Apri il catalogo pubblico</a>
        </div>
        <p className="note">
          Costo al kg = (balla + spedizione + energia e acqua del locale per la durata del ciclo) ÷ kg venduti, più l'imballaggio.
          Kg venduti = peso della balla × resa attesa (la media tra minima e massima) × (1 − scarto del {num(params.loss_pct.value, 0)}%).
          Prezzo minimo = costo × (1 + margine): {num(params.margin_wholesale_pct.value, 0)}% ai ristoranti, {num(params.margin_retail_pct.value, 0)}% ai privati.
          "Non conveniente" vuol dire che il tuo minimo ai ristoranti supera il prezzo all'ingrosso più alto trovato.
        </p>
        <p className="note">Il catalogo pubblico mostra solo il listino che pubblichi tu, mai i costi. Una specie fuori dall'elenco di quelle vendibili non può andare nel catalogo.</p>
      </section>

      <section className="panel">
        <div className="tablewrap">
          <table className="numtable funghi-table">
            <thead>
              <tr>
                <th>Varietà</th><th>Rifornimento</th><th>Costo al kg</th><th>Minimo ristoranti</th><th>Minimo privati</th>
                <th>Ingrosso di mercato</th><th>Esito</th><th>Listino pubblicato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {priced.map(({ r, pr }) => (
                <tr key={r.variety.id} data-variety={r.variety.id}>
                  <th scope="row">
                    <span className="vname">{r.variety.commonName}</span>
                    <span className="vsci"><i>{r.variety.scientificName}</i></span>
                    <span className="vpills">
                      {r.variety.legal === 'ammesso' ? null : <span className="pill off">Non nell'elenco vendibili</span>}
                      {r.variety.public ? <span className="pill admin">Nel catalogo</span> : <span className="pill">Nascosta</span>}
                    </span>
                  </th>
                  <td>{r.variety.supply.mode === 'ingrosso' ? 'Substrato all\'ingrosso' : 'Balla pronta'}</td>
                  {pr.ok ? (<>
                    <td className="mono">{eurKg(pr.cost.costPerKg.expected)}<span className="sub">da {eurCents(pr.cost.costPerKg.best)} a {eurCents(pr.cost.costPerKg.worst)}</span></td>
                    <td className="mono"><b>{eurKg(pr.cost.minWholesale)}</b></td>
                    <td className="mono"><b>{eurKg(pr.cost.minRetail)}</b></td>
                  </>) : (
                    <td colSpan={3}><span className="missing-tag">Mancano: {pr.missing.map((m) => m.label).join(', ')}</span></td>
                  )}
                  <td className="mono">{r.variety.market.wholesale ? `${eurCents(r.variety.market.wholesale.min)}–${eurCents(r.variety.market.wholesale.max).slice(2)}` : <span className="missing-tag">dato mancante</span>}</td>
                  <td>{pr.ok ? <span className={'verdict ' + pr.verdict}>{VERDICT_LABEL[pr.verdict]}</span> : '—'}</td>
                  <td className="mono">
                    {r.list.wholesale === null && r.list.retail === null ? <span className="muted">non pubblicato</span> : (<>
                      {r.list.wholesale !== null ? eurCents(r.list.wholesale) : '—'} / {r.list.retail !== null ? eurCents(r.list.retail) : '—'}
                      {pr.ok && !listUpToDate(r.list, pr) && <span className="sub">diverso dai minimi di adesso</span>}
                    </>)}
                  </td>
                  <td className="rowactions">
                    <button className="btn small" type="button" onClick={() => setOpen(r.variety.id)}>Dettagli</button>
                    {isAdmin && r.variety.public && <button className="btn small" type="button" onClick={() => setPublishing(r.variety.id)}>Listino</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ParamsPanel repo={repo} params={data.params} isAdmin={isAdmin} />

      {row && <VarietyModal repo={repo} row={row.r} pr={row.pr} params={params} isAdmin={isAdmin} onClose={() => setOpen(null)} />}
      {pub && <PublishModal repo={repo} row={pub.r} pr={pub.pr} onClose={() => setPublishing(null)} />}
    </div>
  );
}

function PublishModal({ repo, row, pr, onClose }: { repo: Repo; row: VarietyRow; pr: Pricing; onClose: () => void }) {
  const fmt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  const [w, setW] = useState(fmt(row.list.wholesale ?? (pr.ok ? pr.cost.minWholesale : null)));
  const [r, setR] = useState(fmt(row.list.retail ?? (pr.ok ? pr.cost.minRetail : null)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parse = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  async function save(wh: number | null, re: number | null) {
    setBusy(true); setError(null);
    try { await repo.publishPrices(row.variety.id, wh, re); onClose(); } catch (e) { setError(errorText(e)); setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void save(parse(w), parse(r)); };
  return (
    <Modal label={`Listino: ${row.variety.commonName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div><div className="eyebrow">Listino provvisorio</div><h2>{row.variety.commonName}</h2></div>
        <p className="note">Questi prezzi al kg compaiono nel catalogo pubblico. {pr.ok ? <>I minimi calcolati adesso sono {eurKg(pr.cost.minWholesale)} ai ristoranti e {eurKg(pr.cost.minRetail)} ai privati.</> : 'Il calcolo non è completo: mancano dei dati.'}</p>
        {pr.ok && pr.verdict === 'non_conveniente' && <p className="err">Il tuo minimo ai ristoranti è sopra il prezzo all'ingrosso più alto trovato: con questo rifornimento la varietà non è conveniente.</p>}
        <div className="fields two">
          <Field label="Ristoranti (€/kg)" htmlFor="pub-w"><input id="pub-w" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></Field>
          <Field label="Privati (€/kg)" htmlFor="pub-r"><input id="pub-r" inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} /></Field>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          {(row.list.wholesale !== null || row.list.retail !== null) && <button className="btn danger" type="button" disabled={busy} onClick={() => void save(null, null)}>Togli dal listino</button>}
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>Annulla</button>
          <button className="btn primary" type="submit" disabled={busy}>Pubblica</button>
        </div>
      </form>
    </Modal>
  );
}

// --- Dettagli e modifica di una varietà --------------------------------------------------------

type Kind = 'text' | 'long' | 'num' | 'range' | 'bool' | 'url';
type F = { path: string; label: string; kind: Kind; options?: Array<[string, string]> };
type Group = { title: string; fields: F[]; sources: Array<[string, string]> };

const GROUPS: Group[] = [
  { title: 'Nome, cucina e vendita', sources: [['legal', 'Fonte: si può vendere?']], fields: [
    { path: 'commonName', label: 'Nome comune', kind: 'text' },
    { path: 'scientificName', label: 'Nome scientifico', kind: 'text' },
    { path: 'otherNames', label: 'Altri nomi', kind: 'text' },
    { path: 'kitchen', label: 'Uso in cucina (pubblico)', kind: 'long' },
    { path: 'legal', label: 'Elenco delle specie vendibili', kind: 'text', options: [['ammesso', 'Nell\'elenco'], ['non_in_elenco', 'Non nell\'elenco']] },
    { path: 'legalNote', label: 'Nota sulla vendita', kind: 'long' },
    { path: 'public', label: 'Nel catalogo pubblico', kind: 'bool' },
    { path: 'photo.url', label: 'Foto: indirizzo dell\'immagine', kind: 'url' },
    { path: 'photo.page', label: 'Foto: pagina con autore e licenza', kind: 'url' },
    { path: 'photo.credit', label: 'Foto: credito', kind: 'text' },
  ] },
  { title: 'Rifornimento', sources: [['supply', 'Fonte: balla e spedizione'], ['bulk', 'Fonte: substrato all\'ingrosso']], fields: [
    { path: 'supply.mode', label: 'Calcola con', kind: 'text', options: [['balla', 'Balla pronta'], ['ingrosso', 'Substrato all\'ingrosso']] },
    { path: 'supply.supplier', label: 'Fornitore della balla', kind: 'text' },
    { path: 'supply.supplierUrl', label: 'Pagina del fornitore', kind: 'url' },
    { path: 'supply.baleKg', label: 'Peso della balla (kg)', kind: 'num' },
    { path: 'supply.balePrice', label: 'Prezzo della balla (€)', kind: 'num' },
    { path: 'supply.shippingPerOrder', label: 'Spedizione per ordine (€)', kind: 'num' },
    { path: 'supply.balesPerOrder', label: 'Balle per ordine', kind: 'num' },
    { path: 'supply.bulkEurPerKg', label: 'Ingrosso: € per kg di substrato, trasporto compreso', kind: 'num' },
    { path: 'supply.bulkSupplier', label: 'Ingrosso: fornitori e note', kind: 'long' },
  ] },
  { title: 'Tempi (giorni)', sources: [['shipDays', 'Fonte: spedizione'], ['incubationDays', 'Fonte: incubazione'], ['firstHarvestDays', 'Fonte: prima raccolta'], ['fruitingDays', 'Fonte: produzione']], fields: [
    { path: 'shipDays', label: 'Dall\'ordine all\'arrivo della balla', kind: 'range' },
    { path: 'incubationDays', label: 'Incubazione ancora da fare', kind: 'range' },
    { path: 'firstHarvestDays', label: 'Dall\'inizio della fruttificazione alla prima raccolta', kind: 'range' },
    { path: 'fruitingDays', label: 'Produzione dalla prima raccolta alla fine', kind: 'range' },
    { path: 'flushes', label: 'Numero di raccolte (volate)', kind: 'num' },
  ] },
  { title: 'Resa', sources: [['yieldPct', 'Fonte: resa']], fields: [
    { path: 'yieldPct', label: 'Resa sull\'intero ciclo (% del peso umido della balla)', kind: 'range' },
  ] },
  { title: 'Clima', sources: [['incubation', 'Fonte: incubazione'], ['fruiting', 'Fonte: fruttificazione']], fields: [
    { path: 'incubation.t', label: 'Incubazione: temperatura (°C)', kind: 'range' },
    { path: 'incubation.rh', label: 'Incubazione: umidità (%)', kind: 'range' },
    { path: 'fruiting.t', label: 'Fruttificazione: temperatura (°C)', kind: 'range' },
    { path: 'fruiting.rh', label: 'Fruttificazione: umidità (%)', kind: 'range' },
  ] },
  { title: 'Prezzi di mercato (€/kg)', sources: [['marketWholesale', 'Fonte: ingrosso'], ['marketRetail', 'Fonte: dettaglio']], fields: [
    { path: 'market.wholesale', label: 'All\'ingrosso', kind: 'range' },
    { path: 'market.retail', label: 'Al dettaglio', kind: 'range' },
  ] },
];

const getAt = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
function setAt<T>(o: T, path: string, value: unknown): T {
  const copy = structuredClone(o) as Record<string, unknown>;
  const keys = path.split('.');
  let cur = copy;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return copy as T;
}
const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const show = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

function VarietyModal({ repo, row, pr, params, isAdmin, onClose }: { repo: Repo; row: VarietyRow; pr: Pricing; params: Params; isAdmin: boolean; onClose: () => void }) {
  const [v, setV] = useState<Variety>(() => structuredClone(row.variety));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useMemo(() => priceVariety(v, params), [v, params]);
  const id = (p: string) => `v-${p.replace(/\./g, '-')}`;

  function field(f: F): ReactNode {
    const value = getAt(v, f.path);
    if (f.kind === 'bool') {
      return <label className="addon" key={f.path}><input type="checkbox" checked={!!value} onChange={(e) => setV(setAt(v, f.path, e.target.checked))} /> {f.label}</label>;
    }
    if (f.kind === 'range') {
      const r = value as Range | null;
      const set = (which: 'min' | 'max', s: string) => {
        const n = toNum(s);
        const other = r ? r[which === 'min' ? 'max' : 'min'] : null;
        const next = n === null && (other === null || other === undefined) ? null : { min: r?.min ?? NaN, max: r?.max ?? NaN, [which]: n === null ? NaN : n };
        setV(setAt(v, f.path, next));
      };
      return (
        <Field key={f.path} label={f.label} htmlFor={id(f.path) + '-min'}>
          <div className="inline">
            <input id={id(f.path) + '-min'} aria-label={`${f.label}: minimo`} inputMode="decimal" placeholder="min" value={r && Number.isFinite(r.min) ? show(r.min) : ''} onChange={(e) => set('min', e.target.value)} />
            <input id={id(f.path) + '-max'} aria-label={`${f.label}: massimo`} inputMode="decimal" placeholder="max" value={r && Number.isFinite(r.max) ? show(r.max) : ''} onChange={(e) => set('max', e.target.value)} />
          </div>
        </Field>
      );
    }
    if (f.options) {
      return (
        <Field key={f.path} label={f.label} htmlFor={id(f.path)}>
          <select id={id(f.path)} value={String(value ?? '')} onChange={(e) => setV(setAt(v, f.path, e.target.value))}>
            {f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      );
    }
    if (f.kind === 'num') {
      return <Field key={f.path} label={f.label} htmlFor={id(f.path)}><input id={id(f.path)} inputMode="decimal" value={show(value as number | null)} onChange={(e) => setV(setAt(v, f.path, toNum(e.target.value)))} /></Field>;
    }
    if (f.kind === 'long') {
      return <Field key={f.path} label={f.label} htmlFor={id(f.path)}><textarea id={id(f.path)} rows={2} value={String(value ?? '')} onChange={(e) => setV(setAt(v, f.path, e.target.value))} /></Field>;
    }
    const str = (value ?? '') as string;
    const onChange = (s: string) => {
      if (f.path.startsWith('photo.')) {
        const photo = v.photo ?? { url: '', page: '', credit: '' };
        const next = { ...photo, [f.path.slice(6)]: s };
        setV({ ...v, photo: next.url.trim() || next.page.trim() || next.credit.trim() ? next : null });
      } else setV(setAt(v, f.path, f.kind === 'url' && s.trim() === '' ? null : s));
    };
    return <Field key={f.path} label={f.label} htmlFor={id(f.path)}><input id={id(f.path)} type={f.kind === 'url' ? 'url' : 'text'} value={str} onChange={(e) => onChange(e.target.value)} /></Field>;
  }

  function source(key: string, label: string): ReactNode {
    const s: Source = v.sources[key] ?? { text: '' };
    const set = (patch: Partial<Source>) => {
      const next = { ...s, ...patch };
      const sources = { ...v.sources };
      if (!next.text.trim() && !next.url && !next.date) delete sources[key]; else sources[key] = next;
      setV({ ...v, sources });
    };
    return (
      <div className="srcrow" key={key}>
        <Field label={label} htmlFor={`src-${key}`}><textarea id={`src-${key}`} rows={2} value={s.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <div className="fields two">
          <Field label="Link" htmlFor={`src-${key}-url`}><input id={`src-${key}-url`} type="url" value={s.url ?? ''} onChange={(e) => set({ url: e.target.value.trim() || undefined })} /></Field>
          <Field label="Data" htmlFor={`src-${key}-date`}><input id={`src-${key}-date`} type="date" value={s.date ?? ''} onChange={(e) => set({ date: (isDate(e.target.value) ? e.target.value : undefined) as DateStr | undefined })} /></Field>
        </div>
      </div>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const errs = validateVariety(v);
    if (errs.length) { setError(errs[0]); return; }
    setBusy(true); setError(null);
    try { await repo.saveVariety(v, row.position); onClose(); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  const days = daysToFirstHarvest(v);
  return (
    <Modal label={`Varietà: ${row.variety.commonName}`} wide onClose={onClose} className="variety-modal">
      <form onSubmit={save} noValidate>
        <div><div className="eyebrow">Varietà</div><h2>{row.variety.commonName} <i className="muted">{row.variety.scientificName}</i></h2></div>
        <Breakdown v={v} pr={live} params={params} />
        {days && <p className="note">Dall'ordine alla prima raccolta: {span(days.min, days.max)} giorni. Questo numero compare nel catalogo pubblico.</p>}
        {v.notes && <p className="note"><b>Nota:</b> {v.notes}</p>}
        {!isAdmin && <p className="note">Hai accesso in sola lettura.</p>}
        <fieldset disabled={!isAdmin} className="vgroups">
          {GROUPS.map((g) => (
            <details key={g.title} className="vgroup">
              <summary>{g.title}</summary>
              <div className="vgrid">{g.fields.map(field)}</div>
              {g.sources.map(([k, l]) => source(k, l))}
            </details>
          ))}
          <details className="vgroup">
            <summary>Note</summary>
            <Field label="Note per te" htmlFor="v-notes"><textarea id="v-notes" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
          </details>
        </fieldset>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" onClick={onClose}>{isAdmin ? 'Annulla' : 'Chiudi'}</button>
          {isAdmin && <button className="btn primary" type="submit" disabled={busy}>Salva</button>}
        </div>
        {pr.ok && live.ok && pr.cost.minWholesale !== live.cost.minWholesale && <p className="note">Con le modifiche il minimo ai ristoranti passa da {eurKg(pr.cost.minWholesale)} a {eurKg(live.cost.minWholesale)}.</p>}
      </form>
    </Modal>
  );
}

/** Dove va ogni euro di una balla, e i mesi buoni dell'anno nel locale. */
function Breakdown({ v, pr, params }: { v: Variety; pr: Pricing; params: Params }) {
  if (!pr.ok) return <p className="missing-tag">Per calcolare il costo mancano: {pr.missing.map((m) => m.label).join(', ')}.</p>;
  const c = pr.cost;
  const unit = c.supply === 'ingrosso' ? 'per kg di substrato' : `per balla da ${num(c.substrateKg)} kg`;
  return (
    <div className="breakdown">
      <dl>
        <div><dt>{c.supply === 'ingrosso' ? 'Substrato' : 'Balla'}</dt><dd>{eurCents(c.substrateEur)}</dd></div>
        {c.supply !== 'ingrosso' && <div><dt>Quota di spedizione</dt><dd>{eurCents(c.shippingEur)}</dd></div>}
        <div><dt>Energia e acqua ({num(c.cycleMonths)} mesi)</dt><dd>{eurCents(c.energyEur)}</dd></div>
        <div><dt>Funghi venduti {unit}</dt><dd>{num(c.kgSold.min, 2)}–{num(c.kgSold.max, 2)} kg (attesi {num(c.kgSold.expected, 2)})</dd></div>
        <div><dt>Costo al kg (con imballaggio)</dt><dd><b>{eurKg(c.costPerKg.expected)}</b></dd></div>
        <div><dt>Esito</dt><dd><span className={'verdict ' + pr.verdict}>{VERDICT_LABEL[pr.verdict]}</span></dd></div>
      </dl>
      <div className="months" aria-label="Mesi nel locale">
        {MONTHS.map((m, i) => {
          const e = monthEnergy(v, params, i);
          const label = e.need === 'cool' ? 'troppo caldo: servirebbe raffrescare' : e.need === 'heat' ? `serve riscaldare, ${eurCents(e.eur)} al mese` : `ok, ${eurCents(e.eur)} al mese`;
          return <span key={m} className={'month ' + e.need} title={`${m}: ${num(e.temp)} °C, ${label}`}>{m}</span>;
        })}
      </div>
      <p className="note">Verde: il locale sta nella temperatura giusta. Arancio: serve riscaldare (costo compreso). Grigio: servirebbe raffrescare, mese fuori stagione e fuori dai conti. Energia media del locale nella stagione: {eurCents(c.spaceEnergyEurMonth)} al mese.</p>
    </div>
  );
}

// --- Parametri ----------------------------------------------------------------------------

function ParamsPanel({ repo, params, isAdmin }: { repo: Repo; params: Param[]; isAdmin: boolean }) {
  const groups = [...new Set(params.map((p) => p.group))];
  return (
    <section className="panel">
      <h2>Parametri dei prezzi</h2>
      <p className="note">Ogni numero ha la sua fonte. "Ipotesi" vuol dire una stima da sostituire con un dato vero: per esempio le temperature della tua cantina appena le misuri.</p>
      {groups.map((g) => (
        <div key={g} className="pgroup">
          <h3>{g}</h3>
          <ul className="plist">{params.filter((p) => p.group === g).map((p) => <ParamRow key={p.key} repo={repo} p={p} isAdmin={isAdmin} />)}</ul>
        </div>
      ))}
    </section>
  );
}

function ParamRow({ repo, p, isAdmin }: { repo: Repo; p: Param; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(show(p.value));
  const [source, setSource] = useState(p.source);
  const [url, setUrl] = useState(p.url ?? '');
  const [date, setDate] = useState(p.date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    const n = toNum(value);
    if (n === null || !Number.isFinite(n)) { setError('Indica un numero.'); return; }
    setBusy(true); setError(null);
    try { await repo.setParam(p.key, n, source, url.trim() || null, isDate(date) ? date : null); setEditing(false); }
    catch (err) { setError(errorText(err)); }
    setBusy(false);
  }
  if (!editing) {
    return (
      <li data-param={p.key}>
        <div className="prow">
          <span className="plabel">{p.label}</span>
          <span className="mono pval">{num(p.value, 4)} {p.unit}</span>
          {isAdmin && <button className="btn small" type="button" onClick={() => setEditing(true)}>Modifica</button>}
        </div>
        <span className="psrc">{p.source}{p.url && <> · <a href={p.url} target="_blank" rel="noreferrer">fonte</a></>}{p.date && <> · {p.date.split('-').reverse().join('/')}</>}</span>
      </li>
    );
  }
  return (
    <li data-param={p.key}>
      <form className="pedit" onSubmit={save} noValidate>
        <div className="fields">
          <Field label={`${p.label} (${p.unit})`} htmlFor={`p-${p.key}`}><input id={`p-${p.key}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field label="Link della fonte" htmlFor={`p-${p.key}-url`}><input id={`p-${p.key}-url`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Data della fonte" htmlFor={`p-${p.key}-date`}><input id={`p-${p.key}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Fonte" htmlFor={`p-${p.key}-src`}><textarea id={`p-${p.key}-src`} rows={2} value={source} onChange={(e) => setSource(e.target.value)} /></Field>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => { setEditing(false); setError(null); setValue(show(p.value)); setSource(p.source); setUrl(p.url ?? ''); setDate(p.date ?? ''); }}>Annulla</button>
          <button className="btn primary" type="submit" disabled={busy}>Salva</button>
        </div>
      </form>
    </li>
  );
}
