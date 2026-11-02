// Calendario: the tasks of the plan day by day (red = not done, green = done) and the planned expenses.
// Clicking a task ticks it (admin). A day with more than fits opens below the month.
import { useState } from 'react';
import { cropById } from '../lib/catalog';
import { addDays, dateLabel, monthLabel, monthOf, monthStart, daysInMonth, nextMonth, addMonths, weekday, type DateStr } from '../lib/dates';
import { eurRange, eur } from '../lib/format';
import type { Expense, Farm, FarmTask } from '../lib/plan';
import type { PageProps } from './shared';
import { errorText } from './errors';

const DOW = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const PER_CELL = 3;

export function cropName(farm: Farm, plantingId: string | null): string {
  if (!plantingId) return 'Generale';
  const p = farm.plantings.find((x) => x.id === plantingId);
  return (p && cropById(farm.catalog, p.cropId)?.name) || 'Coltura rimossa';
}

export function TaskChip({ t, farm, isAdmin, onToggle, today, showCrop = true }: { t: FarmTask; farm: Farm; isAdmin: boolean; onToggle: (t: FarmTask) => void; today: DateStr; showCrop?: boolean }) {
  const state = t.done ? 'fatto' : t.due < today ? 'in ritardo' : 'da fare';
  const label = `${t.title}${showCrop ? ` · ${cropName(farm, t.plantingId)}` : ''} · ${state}`;
  return (
    <button type="button" className={'chip task ' + (t.done ? 'done' : 'todo') + (!t.done && t.due < today ? ' late' : '')} title={label}
      aria-label={label} aria-pressed={t.done} disabled={!isAdmin} onClick={() => onToggle(t)}>
      <span aria-hidden="true">{t.done ? '✓' : '○'}</span> {t.title}
    </button>
  );
}

function ExpenseChip({ e, farm }: { e: Expense; farm: Farm }) {
  const amount = e.paid && e.actualAmount !== null ? eur(e.actualAmount) : eurRange(e.amountMin, e.amountMax);
  return <span className={'chip expense' + (e.paid ? ' paid' : '')} title={`${e.title} · ${cropName(farm, e.plantingId)} · ${amount}${e.paid ? ' · pagata' : ' · prevista'}`}>€ {e.title.replace(/^Investimento iniziale — /, 'Inv. ')}</span>;
}

/** A month grid, Monday first. */
export function MonthCalendar({ farm, tasks, expenses, month, onMonth, isAdmin, today, onToggle, compact = false }: {
  farm: Farm; tasks: FarmTask[]; expenses: Expense[]; month: string; onMonth: (m: string) => void; isAdmin: boolean; today: DateStr;
  onToggle: (t: FarmTask) => void; compact?: boolean;
}) {
  const [day, setDay] = useState<DateStr | null>(null);
  const first = monthStart(month), dim = daysInMonth(month);
  const lead = weekday(first);
  const cells: Array<DateStr | null> = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<DateStr, { tasks: FarmTask[]; expenses: Expense[] }>();
  const slot = (d: DateStr) => { let v = byDay.get(d); if (!v) { v = { tasks: [], expenses: [] }; byDay.set(d, v); } return v; };
  for (const t of tasks) if (monthOf(t.due) === month) slot(t.due).tasks.push(t);
  for (const e of expenses) if (monthOf(e.date) === month) slot(e.date).expenses.push(e);
  const monthTasks = tasks.filter((t) => monthOf(t.due) === month);
  const done = monthTasks.filter((t) => t.done).length;
  const sel = day && monthOf(day) === month ? byDay.get(day) : undefined;

  return (
    <div className={'calendar' + (compact ? ' compact' : '')}>
      <div className="cal-nav">
        <button className="btn small" type="button" aria-label="Mese precedente" onClick={() => onMonth(monthOf(addMonths(first, -1)))}>‹</button>
        <h3 className="cal-title" aria-live="polite">{monthLabel(month)}</h3>
        <button className="btn small" type="button" aria-label="Mese successivo" onClick={() => onMonth(nextMonth(month))}>›</button>
        <button className="btn small" type="button" onClick={() => onMonth(monthOf(today))}>Oggi</button>
        <span className="sub">{monthTasks.length ? `${done} di ${monthTasks.length} task fatti` : 'Nessun task questo mese'}</span>
      </div>
      <div className="cal-grid" role="grid" aria-label={`Calendario di ${monthLabel(month)}`}>
        {DOW.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={'x' + i} className="cal-cell empty" />;
          const v = byDay.get(d);
          const items = v ? v.tasks.length + v.expenses.length : 0;
          return (
            <div key={d} role="gridcell" className={'cal-cell' + (d === today ? ' today' : '') + (d === day ? ' selected' : '')}>
              <button type="button" className="cal-day" aria-label={`${dateLabel(d)}: ${items} elementi`} onClick={() => setDay(d === day ? null : d)}>{Number(d.slice(8))}</button>
              {v && !compact && (<>
                {v.tasks.slice(0, PER_CELL).map((t) => <TaskChip key={t.id} t={t} farm={farm} isAdmin={isAdmin} onToggle={onToggle} today={today} />)}
                {v.tasks.length < PER_CELL && v.expenses.slice(0, PER_CELL - v.tasks.length).map((e) => <ExpenseChip key={e.id} e={e} farm={farm} />)}
                {items > PER_CELL && <button type="button" className="linkbtn more" onClick={() => setDay(d)}>+{items - PER_CELL}</button>}
              </>)}
              {v && compact && (
                <span className="dots" aria-hidden="true">
                  {v.tasks.map((t) => <i key={t.id} className={t.done ? 'done' : 'todo'} />)}
                  {v.expenses.map((e) => <i key={e.id} className="exp" />)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="cal-key"><span className="chip task todo">○ da fare</span> <span className="chip task done">✓ fatto</span> <span className="chip expense">€ spesa</span>{isAdmin && ' · clicca un task per segnarlo fatto o da fare'}</p>
      {day && (
        <div className="cal-daypanel" aria-live="polite">
          <h4>{dateLabel(day)}</h4>
          {!sel && <p className="empty">Niente in questo giorno.</p>}
          {sel?.tasks.map((t) => <div key={t.id} className="dayrow"><TaskChip t={t} farm={farm} isAdmin={isAdmin} onToggle={onToggle} today={today} /><span className="sub">{cropName(farm, t.plantingId)}</span></div>)}
          {sel?.expenses.map((e) => <div key={e.id} className="dayrow"><ExpenseChip e={e} farm={farm} /><span className="sub">{e.title} · {e.paid && e.actualAmount !== null ? `${eur(e.actualAmount)} pagata` : `${eurRange(e.amountMin, e.amountMax)} prevista`}</span></div>)}
        </div>
      )}
    </div>
  );
}

export function useToggleTask(repo: PageProps['repo']) {
  const [error, setError] = useState<string | null>(null);
  const toggle = (t: FarmTask) => { setError(null); repo.setTaskDone(t.id, !t.done).catch((e) => setError(errorText(e))); };
  return { toggle, error };
}

export function CalendarPage({ repo, farm, isAdmin, today, go, filter }: PageProps & { filter?: string }) {
  const [month, setMonth] = useState(monthOf(today));
  const { toggle, error } = useToggleTask(repo);
  const tasks = filter ? farm.tasks.filter((t) => t.plantingId === filter) : farm.tasks;
  const expenses = filter ? farm.expenses.filter((e) => e.plantingId === filter) : farm.expenses;
  const late = tasks.filter((t) => !t.done && t.due < today).length;

  return (
    <section className="page" aria-labelledby="cal-h">
      <div className="panel-head">
        <div><div className="eyebrow">Piano d'azione</div><h2 id="cal-h">Calendario</h2></div>
        <label className="inline">Coltura{' '}
          <select value={filter ?? ''} onChange={(e) => go({ tab: 'calendario', ...(e.target.value && { filter: e.target.value }) })}>
            <option value="">Tutte</option>
            <option value="__none" disabled>──</option>
            {farm.plantings.map((p) => <option key={p.id} value={p.id}>{cropName(farm, p.id)} · dal {dateLabel(p.start, false)}</option>)}
          </select>
        </label>
      </div>
      {late > 0 && <p className="banner warnbanner">{late} task in ritardo. <a href="#/task" onClick={(e) => { e.preventDefault(); go({ tab: 'task', ...(filter && { filter }) }); }}>Vedili nella lista</a></p>}
      {error && <p className="err" role="alert">{error}</p>}
      <div className="panel">
        <MonthCalendar farm={farm} tasks={tasks} expenses={expenses} month={month} onMonth={setMonth} isAdmin={isAdmin} today={today} onToggle={toggle} />
      </div>
      {!farm.plantings.length && <p className="note">Il calendario si riempie quando aggiungi una coltura in Coltivazioni.</p>}
    </section>
  );
}
