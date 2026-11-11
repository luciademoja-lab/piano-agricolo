// Task: what is late, what is due this week, what comes next, and what is done.
import { useState, type FormEvent } from 'react';
import { addDays, dateLabel } from '../lib/dates';
import { checkManualTask, type FarmTask } from '../lib/plan';
import { TaskChip, cropName, useToggleTask } from './CalendarPage';
import { shortDate } from './PlantingDetail';
import type { PageProps } from './shared';
import { errorText } from './errors';
import { TodoBoard } from './TodoBoard';

export function TasksPage(props: PageProps & { filter?: string; refreshKey: number }) {
  const { repo, farm, isAdmin, today, go, filter, refreshKey } = props;
  const { toggle, error } = useToggleTask(repo);
  const [showAll, setShowAll] = useState(false);
  const tasks = filter ? farm.tasks.filter((t) => t.plantingId === filter) : farm.tasks;
  const week = addDays(today, 7), month = addDays(today, 30);
  const groups: Array<{ id: string; title: string; list: FarmTask[] }> = [
    { id: 'late', title: 'In ritardo', list: tasks.filter((t) => !t.done && t.due < today) },
    { id: 'week', title: 'Prossimi 7 giorni', list: tasks.filter((t) => !t.done && t.due >= today && t.due <= week) },
    { id: 'later', title: showAll ? 'Più avanti' : 'Fino a 30 giorni', list: tasks.filter((t) => !t.done && t.due > week && (showAll || t.due <= month)) },
    { id: 'done', title: 'Fatti', list: tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30) },
  ];

  return (
    <section className="page" aria-labelledby="tasks-h">
      <TodoBoard repo={repo} isAdmin={isAdmin} today={today} refreshKey={refreshKey} />
      <div className="panel-head">
        <div><div className="eyebrow">Piano d'azione</div><h2 id="tasks-h">Task delle colture</h2></div>
        <label className="inline">Coltura{' '}
          <select value={filter ?? ''} onChange={(e) => go({ tab: 'task', ...(e.target.value && { filter: e.target.value }) })}>
            <option value="">Tutte</option>
            {farm.plantings.map((p) => <option key={p.id} value={p.id}>{cropName(farm, p.id)} · dal {dateLabel(p.start, false)}</option>)}
          </select>
        </label>
      </div>
      {isAdmin && <AddTask {...props} />}
      {error && <p className="err" role="alert">{error}</p>}
      {groups.map((g) => (
        <div className={'panel tasks-' + g.id} key={g.id}>
          <h3>{g.title} <span className="count">{g.list.length}</span></h3>
          {!g.list.length && <p className="empty">{g.id === 'late' ? 'Niente in ritardo.' : 'Nessun task.'}</p>}
          <ul className="tasklist">
            {g.list.map((t) => (
              <li key={t.id}>
                <span className={'mono when' + (g.id === 'late' ? ' late' : '')}>{shortDate(t.due, today)}</span>
                <TaskChip t={t} farm={farm} isAdmin={isAdmin} onToggle={toggle} today={today} showCrop={false} />
                <span className="sub">{cropName(farm, t.plantingId)}{t.source === 'manual' ? ' · aggiunto a mano' : ''}</span>
                {isAdmin && t.source === 'manual' && <button className="btn small icon" type="button" aria-label={`Cancella ${t.title}`} onClick={() => repo.deleteTask(t.id).catch(() => undefined)}>✕</button>}
              </li>
            ))}
          </ul>
          {g.id === 'later' && <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostra solo i prossimi 30 giorni' : 'Mostra tutti i task futuri'}</button>}
        </div>
      ))}
    </section>
  );
}

function AddTask({ repo, farm, today }: PageProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [planting, setPlanting] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = checkManualTask(title, due);
    if (bad) return setError(bad);
    setError(null);
    try { await repo.addTask(title, due, planting || null); setTitle(''); } catch (err) { setError(errorText(err)); }
  }
  return (
    <form className="panel addtask" onSubmit={submit} noValidate>
      <div className="inline wrapline">
        <input type="text" aria-label="Nuovo task" placeholder="Nuovo task, es. Chiamare il SIAN per l'email del referente" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" aria-label="Data del task" value={due} onChange={(e) => setDue(e.target.value)} />
        <select aria-label="Coltura del task" value={planting} onChange={(e) => setPlanting(e.target.value)}>
          <option value="">Generale</option>
          {farm.plantings.map((p) => <option key={p.id} value={p.id}>{cropName(farm, p.id)}</option>)}
        </select>
        <button className="btn primary" type="submit">Aggiungi</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  );
}
