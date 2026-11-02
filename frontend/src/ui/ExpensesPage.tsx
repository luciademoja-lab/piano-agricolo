// Spese: everything planned and paid, by date. The initial investment of each crop comes from the
// catalogue; the rest is added by hand. A paid expense counts with its real amount in every scenario.
import { useState, type FormEvent } from 'react';
import { dateLabel, monthLabel, monthOf } from '../lib/dates';
import { eur, eurRange } from '../lib/format';
import { EXPENSE_KIND_LABEL, checkManualExpense, type Expense, type ExpenseKind } from '../lib/plan';
import { cropName } from './CalendarPage';
import type { PageProps } from './shared';
import { errorText } from './errors';
import { Field, Modal } from './Modal';

export function ExpenseList({ repo, farm, isAdmin, expenses, showCrop = false }: PageProps & { expenses: Expense[]; showCrop?: boolean }) {
  const [paying, setPaying] = useState<{ id: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => { setError(null); fn().catch((e) => setError(errorText(e))); };
  if (!expenses.length) return <p className="empty">Nessuna spesa.</p>;
  return (<>
    <ul className="expenses">
      {expenses.map((e) => (
        <li key={e.id} className={e.paid ? 'paid' : ''}>
          <span className="mono when">{dateLabel(e.date)}</span>
          <span className="what"><b>{e.title}</b><span className="sub">{EXPENSE_KIND_LABEL[e.kind]}{showCrop ? ` · ${cropName(farm, e.plantingId)}` : ''}{e.source === 'catalog' ? ' · dallo schema' : ''}</span></span>
          <span className="mono amount">{e.paid && e.actualAmount !== null ? <>{eur(e.actualAmount)} <span className="pill paid">pagata</span></> : <>{eurRange(e.amountMin, e.amountMax)} <span className="pill">prevista</span></>}</span>
          {isAdmin && (
            <span className="inline acts">
              {paying?.id === e.id ? (
                <form className="inline" onSubmit={(ev) => { ev.preventDefault(); run(async () => { await repo.setExpensePaid(e.id, true, Number(paying.amount.replace(',', '.'))); setPaying(null); }); }}>
                  <input type="number" inputMode="decimal" min="0" step="0.01" aria-label={`Quanto hai pagato per ${e.title}`} value={paying.amount} onChange={(ev) => setPaying({ id: e.id, amount: ev.target.value })} autoFocus required />
                  <button className="btn small primary" type="submit">Salva</button>
                  <button className="btn small" type="button" onClick={() => setPaying(null)}>Annulla</button>
                </form>
              ) : e.paid
                ? <button className="btn small" type="button" onClick={() => run(() => repo.setExpensePaid(e.id, false, null))}>Torna prevista</button>
                : <button className="btn small" type="button" onClick={() => setPaying({ id: e.id, amount: String(Math.round((e.amountMin + e.amountMax) / 2)) })}>Segna pagata</button>}
              <button className="btn small icon" type="button" aria-label={`Cancella ${e.title}`} title="Cancella" onClick={() => run(() => repo.deleteExpense(e.id))}>✕</button>
            </span>
          )}
        </li>
      ))}
    </ul>
    {error && <p className="err" role="alert">{error}</p>}
  </>);
}

export function ExpensesPage(props: PageProps) {
  const { farm, isAdmin } = props;
  const [adding, setAdding] = useState(false);
  const months = [...new Set(farm.expenses.map((e) => monthOf(e.date)))].sort();
  const planned = farm.expenses.filter((e) => !e.paid);
  const paid = farm.expenses.filter((e) => e.paid);

  return (
    <section className="page" aria-labelledby="exp-h">
      <div className="panel-head">
        <div><div className="eyebrow">Piano d'azione</div><h2 id="exp-h">Spese</h2></div>
        {isAdmin && <button className="btn primary" type="button" onClick={() => setAdding(true)}>+ Aggiungi spesa</button>}
      </div>
      <div className="strip">
        <div className="stat"><span className="sub">Previste</span><span className="v">{eurRange(planned.reduce((s, e) => s + e.amountMin, 0), planned.reduce((s, e) => s + e.amountMax, 0))}</span><span className="sub">{planned.length} spese</span></div>
        <div className="stat"><span className="sub">Pagate</span><span className="v">{eur(paid.reduce((s, e) => s + (e.actualAmount ?? 0), 0))}</span><span className="sub">{paid.length} spese</span></div>
      </div>
      <p className="note">I costi ricorrenti (semi, substrato, mangime, energia, imballaggi) non sono nello schema: aggiungili qui quando li conosci, e i prospetti li conteranno.</p>
      {!months.length && <div className="panel"><p className="empty">Nessuna spesa. Quando aggiungi una coltura, l'investimento iniziale dello schema compare qui.</p></div>}
      {months.map((m) => (
        <div className="panel" key={m}>
          <h3>{monthLabel(m)}</h3>
          <ExpenseList {...props} expenses={farm.expenses.filter((e) => monthOf(e.date) === m)} showCrop />
        </div>
      ))}
      {adding && <AddExpense {...props} onClose={() => setAdding(false)} />}
    </section>
  );
}

function AddExpense({ repo, farm, today, onClose }: PageProps & { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [kind, setKind] = useState<ExpenseKind>('other');
  const [planting, setPlanting] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lo = Number(min.replace(',', '.')), hi = max.trim() ? Number(max.replace(',', '.')) : lo;
    const bad = checkManualExpense(title, date, lo, hi);
    if (bad) return setError(bad);
    setBusy(true); setError(null);
    try { await repo.addExpense({ title, date, amountMin: lo, amountMax: hi, kind, plantingId: planting || null }); onClose(); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <Modal label="Aggiungi spesa" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2>Aggiungi spesa</h2>
        <Field label="A cosa serve" htmlFor="ex-title"><input id="ex-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Semi di ravanello per microgreens" required /></Field>
        <div className="fields two">
          <Field label="Data" htmlFor="ex-date"><input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Tipo" htmlFor="ex-kind">
            <select id="ex-kind" value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)}>
              {(Object.keys(EXPENSE_KIND_LABEL) as ExpenseKind[]).map((k) => <option key={k} value={k}>{EXPENSE_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Importo minimo (€)" htmlFor="ex-min"><input id="ex-min" type="number" inputMode="decimal" min="0" step="0.01" value={min} onChange={(e) => setMin(e.target.value)} required /></Field>
          <Field label="Importo massimo (€, se diverso)" htmlFor="ex-max"><input id="ex-max" type="number" inputMode="decimal" min="0" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        </div>
        <Field label="Coltura" htmlFor="ex-pl">
          <select id="ex-pl" value={planting} onChange={(e) => setPlanting(e.target.value)}>
            <option value="">Generale (nessuna coltura)</option>
            {farm.plantings.map((p) => <option key={p.id} value={p.id}>{cropName(farm, p.id)} · dal {dateLabel(p.start, false)}</option>)}
          </select>
        </Field>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions"><button className="btn" type="button" onClick={onClose}>Annulla</button><button className="btn primary" type="submit" disabled={busy}>Aggiungi</button></div>
      </form>
    </Modal>
  );
}
