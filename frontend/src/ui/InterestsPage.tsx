// Richieste (solo admin): le risposte al questionario pubblico, quanti kg a settimana chiedono
// fungo per fungo, chi vuole gli aggiornamenti, e per ognuno lo stato e una nota.
// Il login in sola lettura non le vede: contengono nomi, email e telefoni (lo impone anche il database).
import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../data/repo';
import { num } from '../lib/format';
import {
  FREQUENCIES, STATUSES, demand, latestPerEmail, qty, subscribers, wantsUpdates,
  type Interest, type InterestOption, type InterestStatus,
} from '../lib/interest';
import { errorText } from './errors';
import { Modal } from './Modal';
import '../requests.css';

const when = (t: number) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
const freqLabel = (id: string) => FREQUENCIES.find((f) => f.id === id)?.label ?? id;
type Filter = 'tutte' | 'ristorante' | 'privato';

export function InterestsPage({ repo, isAdmin, refreshKey }: { repo: Repo; isAdmin: boolean; refreshKey: number }) {
  const [list, setList] = useState<Interest[] | null>(null);
  const [options, setOptions] = useState<InterestOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('tutte');
  const [archived, setArchived] = useState(false);
  const [deleting, setDeleting] = useState<Interest | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    Promise.all([repo.loadInterests(), repo.loadInterestOptions()]).then(
      ([l, o]) => { if (alive) { setList(l); setOptions(o); setError(null); } },
      (e) => { if (alive) setError(errorText(e)); },
    );
    return () => { alive = false; };
  }, [repo, isAdmin, refreshKey]);
  const latest = useMemo(() => new Set(latestPerEmail(list ?? []).map((r) => r.id)), [list]);

  if (!isAdmin) {
    return (
      <section className="panel">
        <h2>Richieste</h2>
        <p className="note">Le richieste del questionario contengono nomi, email e telefoni: le vede solo l'admin.</p>
      </section>
    );
  }
  if (error) return <div className="panel"><p className="err" role="alert">{error}</p></div>;
  if (!list) return <p className="muted">Caricamento delle richieste…</p>;

  const people = latestPerEmail(list);
  const subs = subscribers(list);
  const rows = demand(list);
  const sellable = new Map(options.map((o) => [o.id, o.sellable]));
  const shown = list.filter((r) => (filter === 'tutte' || r.kind === filter) && (archived || r.status !== 'archiviata'));
  const link = `${location.origin}${location.pathname}#/interesse`;

  return (
    <div className="requests">
      <section className="panel">
        <div className="panel-head">
          <h2>Richieste dal questionario</h2>
          <a className="btn" href="#/interesse">Apri il questionario</a>
        </div>
        <div className="req-stats">
          <div className="stat"><span className="eyebrow">Persone</span><span className="v">{people.length}</span></div>
          <div className="stat"><span className="eyebrow">Locali</span><span className="v">{people.filter((r) => r.kind === 'ristorante').length}</span></div>
          <div className="stat"><span className="eyebrow">Privati</span><span className="v">{people.filter((r) => r.kind === 'privato').length}</span></div>
          <div className="stat"><span className="eyebrow">Vogliono aggiornamenti</span><span className="v">{subs.length}</span></div>
        </div>
        <p className="note">Ogni persona conta una volta, con la sua ultima richiesta. Il link da condividere: <CopyText text={link} label="Copia il link" /></p>
      </section>

      {rows.length > 0 && (
        <section className="panel">
          <h2>Cosa chiedono</h2>
          <div className="tablewrap">
            <table className="numtable req-demand">
              <thead><tr><th>Fungo</th><th>Persone</th><th className="col-split">Locali</th><th className="col-split">Privati</th><th>Kg a settimana</th><th>Ogni tanto</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.key}>
                    <th scope="row">
                      {d.label}
                      {d.varietyId === null ? <span className="pill">altro</span> : sellable.get(d.varietyId) === false ? <span className="pill off">da chiedere all'ASL</span> : null}
                    </th>
                    <td className="mono">{d.people}</td>
                    <td className="mono col-split">{d.ristoranti}</td>
                    <td className="mono col-split">{d.privati}</td>
                    <td className="mono"><b>{d.kgPerWeek > 0 ? num(d.kgPerWeek, 2) : '—'}</b></td>
                    <td className="mono">{d.occasionalKg > 0 ? `${num(d.occasionalKg, 2)} kg a volta` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">Kg a settimana: i kg a consegna × quante consegne a settimana (ogni due settimane conta mezza, una volta al mese circa un quarto). Chi li vuole "ogni tanto" è nell'ultima colonna. Le archiviate non contano.</p>
        </section>
      )}

      <section className="panel">
        <h2>Aggiornamenti via email</h2>
        {subs.length === 0
          ? <p className="note">Nessuno ha ancora chiesto gli aggiornamenti.</p>
          : (<>
            <p>{subs.length === 1 ? '1 persona vuole' : `${subs.length} persone vogliono`} ricevere gli aggiornamenti. <CopyText text={subs.join(', ')} label="Copia gli indirizzi" /></p>
            <p className="note">Incollali nel campo <b>Ccn</b> (copia nascosta), mai in A o Cc: così nessuno vede gli indirizzi degli altri. In fondo all'email scrivi che basta rispondere "basta aggiornamenti" per non riceverne più, e quando qualcuno lo chiede premi "Stop aggiornamenti" sulla sua richiesta.</p>
          </>)}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Tutte le richieste</h2>
          <div className="req-filters">
            <div className="seg" role="group" aria-label="Chi">
              {(['tutte', 'ristorante', 'privato'] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'tutte' ? 'Tutte' : f === 'ristorante' ? 'Locali' : 'Privati'}</button>
              ))}
            </div>
            <label className="req-toggle"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Mostra le archiviate</label>
          </div>
        </div>
        {list.length === 0 && <p className="empty">Nessuna richiesta per ora. Condividi il link del questionario.</p>}
        {list.length > 0 && shown.length === 0 && <p className="empty">Nessuna richiesta con questi filtri.</p>}
        <ul className="req-list">
          {shown.map((r) => <RequestCard key={r.id} repo={repo} r={r} older={!latest.has(r.id)} onDelete={() => setDeleting(r)} />)}
        </ul>
      </section>

      {deleting && <DeleteModal repo={repo} r={deleting} count={list.filter((x) => x.email === deleting.email).length} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function RequestCard({ repo, r, older, onDelete }: { repo: Repo; r: Interest; older: boolean; onDelete: () => void }) {
  const [status, setStatus] = useState<InterestStatus>(r.status);
  const [note, setNote] = useState(r.adminNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setStatus(r.status); setNote(r.adminNote ?? ''); }, [r.status, r.adminNote]);
  const dirty = status !== r.status || note.trim() !== (r.adminNote ?? '');
  async function run(f: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await f(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const title = r.business ? `${r.business} · ${r.name}` : r.name;
  return (
    <li className={'req-card' + (r.status === 'archiviata' ? ' archived' : '')} data-request={r.id}>
      <div className="req-head">
        <h3>{title}</h3>
        <span className={'pill ' + (r.kind === 'ristorante' ? 'admin' : '')}>{r.kind === 'ristorante' ? 'Locale' : 'Privato'}</span>
        {older && <span className="pill">richiesta precedente</span>}
        <span className="req-when">{when(r.createdAt)} · {r.town}</span>
      </div>
      <p className="req-contacts">
        <a href={`mailto:${r.email}`}>{r.email}</a>
        {r.phone && <> · <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}>{r.phone}</a></>}
      </p>
      <p className="req-items">
        {r.items.map((it, i) => <span key={i}><b>{it.label}</b> {qty(it.kg)}</span>)}
        <span className="req-freq">{freqLabel(r.frequency).toLowerCase()}</span>
      </p>
      {r.note && <blockquote className="req-note">{r.note}</blockquote>}
      <p className="req-consent">
        Aggiornamenti: {r.updatesStoppedAt ? <span className="pill">ha smesso</span> : wantsUpdates(r) ? <span className="pill approved">sì</span> : <span className="pill">no</span>}
      </p>
      <div className="req-admin">
        <div className="field">
          <label htmlFor={`st-${r.id}`}>Stato</label>
          <select id={`st-${r.id}`} value={status} onChange={(e) => setStatus(e.target.value as InterestStatus)}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor={`nt-${r.id}`}>La tua nota</label>
          <textarea id={`nt-${r.id}`} rows={1} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn danger small" type="button" disabled={busy} onClick={onDelete}>Cancella i suoi dati</button>
        {wantsUpdates(r) && <button className="btn small" type="button" disabled={busy} onClick={() => void run(() => repo.stopInterestUpdates(r.id))}>Stop aggiornamenti</button>}
        <span className="spacer" />
        {dirty && <button className="btn primary small" type="button" disabled={busy} onClick={() => void run(() => repo.updateInterest(r.id, status, note))}>Salva</button>}
      </div>
    </li>
  );
}

function DeleteModal({ repo, r, count, onClose }: { repo: Repo; r: Interest; count: number; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try { await repo.deleteInterest(r.id); onClose(); } catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return (
    <Modal label="Cancella i dati" onClose={onClose}>
      <div><div className="eyebrow">Cancella i dati</div><h2>{r.business || r.name}</h2></div>
      <p>Cancello {count === 1 ? 'la richiesta' : `tutte le ${count} richieste`} con l'email <b>{r.email}</b>. Non si può annullare.</p>
      <p className="note">Serve quando una persona ti chiede di cancellare i suoi dati. Per toglierla solo dall'elenco, mettila in "Archiviata".</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" onClick={onClose}>Annulla</button>
        <button className="btn danger" type="button" disabled={busy} onClick={() => void go()}>Cancella</button>
      </div>
    </Modal>
  );
}

/** a button that copies text; if the browser does not allow it, the text appears to copy by hand */
function CopyText({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'manual'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState('done'); setTimeout(() => setState('idle'), 2000); }
    catch { setState('manual'); }
  };
  return (<>
    <button className="btn small" type="button" onClick={() => void copy()}>{state === 'done' ? 'Copiato' : label}</button>
    {state === 'manual' && <textarea className="req-copy" readOnly rows={2} value={text} onFocus={(e) => e.currentTarget.select()} aria-label={label} />}
  </>);
}
