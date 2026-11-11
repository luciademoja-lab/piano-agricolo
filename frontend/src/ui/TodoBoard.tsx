// Le mie cose da fare (solo admin), in cima alla scheda Task: quello che devi fare tu, quello che hai
// fatto e aspetta una risposta da qualcun altro, e quello che è chiuso. Il login in sola lettura non le vede.
import { useEffect, useState, type FormEvent } from 'react';
import type { Repo } from '../data/repo';
import { dateLabel, todayInRome, type DateStr } from '../lib/dates';
import {
  EMPTY_TODO, NUDGE_AFTER_DAYS, TODO_STATUSES, checkTodo, daysBetween, toInput, todoGroups,
  type Todo, type TodoInput, type TodoStatus,
} from '../lib/todo';
import { errorText } from './errors';
import { Modal } from './Modal';
import '../todos.css';

type Props = { repo: Repo; isAdmin: boolean; today: DateStr; refreshKey: number };

export function TodoBoard(props: Props) {
  return props.isAdmin ? <Board {...props} /> : null;
}

const DONE_SHOWN = 8;

function Board({ repo, today, refreshKey }: Props) {
  const [list, setList] = useState<Todo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Todo | 'new' | null>(null);
  const [allDone, setAllDone] = useState(false);
  useEffect(() => {
    let alive = true;
    repo.loadTodos().then((l) => { if (alive) { setList(l); setError(null); } }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo, refreshKey]);

  const move = (t: Todo, status: TodoStatus) => { setError(null); repo.setTodoStatus(t.id, status).catch((e) => setError(errorText(e))); };
  const groups = todoGroups(list ?? []);

  return (
    <section className="panel todos" aria-labelledby="todos-h">
      <div className="panel-head">
        <div><div className="eyebrow">Solo per te</div><h2 id="todos-h">Le mie cose da fare</h2></div>
        <button className="btn primary" type="button" onClick={() => setEditing('new')}>Nuova con dettagli</button>
      </div>
      <QuickAdd repo={repo} />
      {error && <p className="err" role="alert">{error}</p>}
      {!list && !error && <p className="muted">Caricamento…</p>}
      {list && (
        <div className="todo-cols">
          {TODO_STATUSES.map((s) => {
            const items = s.id === 'fatto' && !allDone ? groups.fatto.slice(0, DONE_SHOWN) : groups[s.id];
            return (
              <div key={s.id} className={'todo-col ' + s.id} role="region" aria-label={s.label}>
                <h3>{s.label} <span className="count">{groups[s.id].length}</span></h3>
                {!groups[s.id].length && <p className="empty">{s.id === 'in_attesa' ? 'Nessuna risposta da aspettare.' : s.id === 'da_fare' ? 'Niente da fare. Davvero?' : 'Ancora niente.'}</p>}
                <ul className="todo-list">
                  {items.map((t) => <Item key={t.id} t={t} today={today} onMove={(st) => move(t, st)} onEdit={() => setEditing(t)} />)}
                </ul>
                {s.id === 'fatto' && groups.fatto.length > DONE_SHOWN && (
                  <button className="linkbtn" type="button" onClick={() => setAllDone(!allDone)}>{allDone ? 'Mostra solo le ultime' : `Mostra tutte (${groups.fatto.length})`}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && <TodoModal repo={repo} todo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Item({ t, today, onMove, onEdit }: { t: Todo; today: DateStr; onMove: (s: TodoStatus) => void; onEdit: () => void }) {
  const left = t.due ? daysBetween(today, t.due) : null;
  const waited = t.waitingSince ? daysBetween(t.waitingSince, today) : null;
  const urgency = t.status === 'da_fare' && left !== null ? (left < 0 ? 'late' : left <= 3 ? 'soon' : '') : '';
  return (
    <li className={'todo ' + urgency}>
      <div className="todo-title">{t.title}</div>
      <div className="todo-meta">
        {t.who && <span className="todo-who">{t.who}</span>}
        {t.status === 'da_fare' && t.due && (
          <span className={'todo-when ' + urgency}>{left! < 0 ? `scaduta il ${dateLabel(t.due, false)}` : left === 0 ? 'entro oggi' : `entro il ${dateLabel(t.due, false)}`}</span>
        )}
        {t.status === 'in_attesa' && waited !== null && (
          <span className="todo-when">{waited <= 0 ? 'aspetti da oggi' : waited === 1 ? 'aspetti da ieri' : `aspetti da ${waited} giorni`}</span>
        )}
        {t.status === 'in_attesa' && waited !== null && waited >= NUDGE_AFTER_DAYS && <span className="todo-nudge">sollecita</span>}
        {t.status === 'fatto' && t.doneAt && <span className="todo-when">fatta il {dateLabel(todayInRome(t.doneAt), false)}</span>}
      </div>
      {t.note && <p className="todo-note">{t.note}</p>}
      {t.link && <a className="todo-link" href={t.link} target="_blank" rel="noreferrer">Apri il collegamento ↗</a>}
      <div className="todo-actions">
        {t.status === 'da_fare' && <>
          <button className="btn small primary" type="button" onClick={() => onMove('fatto')} aria-label={`Fatto: ${t.title}`}>Fatto</button>
          <button className="btn small" type="button" onClick={() => onMove('in_attesa')} aria-label={`Aspetto risposta: ${t.title}`}>Aspetto risposta</button>
        </>}
        {t.status === 'in_attesa' && <>
          <button className="btn small primary" type="button" onClick={() => onMove('fatto')} aria-label={`Risposta arrivata: ${t.title}`}>Risposta arrivata</button>
          <button className="btn small" type="button" onClick={() => onMove('da_fare')} aria-label={`Torna da fare: ${t.title}`}>Torna da fare</button>
        </>}
        {t.status === 'fatto' && <button className="btn small" type="button" onClick={() => onMove('da_fare')} aria-label={`Riapri: ${t.title}`}>Riapri</button>}
        <span className="spacer" />
        <button className="linkbtn" type="button" onClick={onEdit} aria-label={`Modifica: ${t.title}`}>Modifica</button>
      </div>
    </li>
  );
}

function QuickAdd({ repo }: { repo: Repo }) {
  const [title, setTitle] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: TodoInput = { ...EMPTY_TODO, title, who, due };
    const bad = checkTodo(input);
    if (bad) return setError(bad);
    setError(null);
    try { await repo.saveTodo(null, input); setTitle(''); setWho(''); setDue(''); } catch (err) { setError(errorText(err)); }
  }
  return (
    <form className="todo-quick" onSubmit={submit} noValidate>
      <input type="text" aria-label="Cosa devi fare" placeholder="Cosa devi fare? es. Chiamare il CAA" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <input type="text" aria-label="Con chi" placeholder="Con chi" value={who} maxLength={120} onChange={(e) => setWho(e.target.value)} />
      <input type="date" aria-label="Entro il" value={due} onChange={(e) => setDue(e.target.value)} />
      <button className="btn" type="submit">Aggiungi</button>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  );
}

function TodoModal({ repo, todo, onClose }: { repo: Repo; todo: Todo | null; onClose: () => void }) {
  const [f, setF] = useState<TodoInput>(todo ? toInput(todo) : EMPTY_TODO);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<TodoInput>) => setF({ ...f, ...patch });
  async function save(e: FormEvent) {
    e.preventDefault();
    const bad = checkTodo(f);
    if (bad) return setError(bad);
    setBusy(true); setError(null);
    try { await repo.saveTodo(todo?.id ?? null, f); onClose(); } catch (err) { setError(errorText(err)); setBusy(false); }
  }
  async function remove() {
    if (!todo) return;
    setBusy(true); setError(null);
    try { await repo.deleteTodo(todo.id); onClose(); } catch (err) { setError(errorText(err)); setBusy(false); }
  }
  return (
    <Modal label={todo ? 'Modifica cosa da fare' : 'Nuova cosa da fare'} onClose={onClose}>
      <form className="todo-form" onSubmit={save} noValidate>
        <div><div className="eyebrow">Le mie cose da fare</div><h2>{todo ? 'Modifica' : 'Nuova cosa da fare'}</h2></div>
        <div className="field">
          <label htmlFor="todo-title">Cosa c'è da fare</label>
          <input id="todo-title" type="text" maxLength={200} value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="todo-grid">
          <div className="field">
            <label htmlFor="todo-status">Stato</label>
            <select id="todo-status" value={f.status} onChange={(e) => set({ status: e.target.value as TodoStatus })}>
              {TODO_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.id === 'fatto' ? 'Fatta' : s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="todo-who">Con chi</label>
            <input id="todo-who" type="text" maxLength={120} value={f.who} onChange={(e) => set({ who: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="todo-due">Entro il</label>
            <input id="todo-due" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} />
          </div>
          {f.status === 'in_attesa' && (
            <div className="field">
              <label htmlFor="todo-since">Aspetti risposta dal</label>
              <input id="todo-since" type="date" value={f.waitingSince} onChange={(e) => set({ waitingSince: e.target.value })} />
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="todo-link">Collegamento (per esempio la mail in Gmail)</label>
          <input id="todo-link" type="url" maxLength={500} placeholder="https://" value={f.link} onChange={(e) => set({ link: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="todo-note">Nota</label>
          <textarea id="todo-note" rows={3} maxLength={2000} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        {confirmDelete ? (
          <div className="actions">
            <span>La cancello per sempre?</span>
            <span className="spacer" />
            <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>No</button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => void remove()}>Sì, cancella</button>
          </div>
        ) : (
          <div className="actions">
            {todo && <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>Cancella</button>}
            <span className="spacer" />
            <button className="btn" type="button" onClick={onClose}>Annulla</button>
            <button className="btn primary" type="submit" disabled={busy}>Salva</button>
          </div>
        )}
      </form>
    </Modal>
  );
}
