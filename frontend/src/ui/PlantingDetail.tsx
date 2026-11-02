// One crop of the plan: what was added, its projections, its expenses and its calendar.
import { useState } from 'react';
import { SPACE_LABEL, cropById } from '../lib/catalog';
import { dateLabel, monthOf, type DateStr } from '../lib/dates';
import { eur, eurRange, hoursRange } from '../lib/format';
import { quantityLabel, scaleFactor, type Planting } from '../lib/plan';
import { firstIncomeDate, project } from '../lib/projection';
import { MonthCalendar, TaskChip, useToggleTask } from './CalendarPage';
import { CropFacts } from './AddCropModal';
import { ProjectionChart } from './ProjectionChart';
import { HorizonTable, MissingList } from './ProjectionTables';
import { ExpenseList } from './ExpensesPage';
import type { PageProps } from './shared';
import { errorText } from './errors';

export function PlantingDetail(props: PageProps & { planting: Planting }) {
  const { repo, farm, isAdmin, today, go, planting: p } = props;
  const crop = cropById(farm.catalog, p.cropId)!;
  const [month, setMonth] = useState(monthOf(p.start > today ? p.start : today));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toggle, error: toggleError } = useToggleTask(repo);
  const tasks = farm.tasks.filter((t) => t.plantingId === p.id);
  const expenses = farm.expenses.filter((e) => e.plantingId === p.id);
  const pr = project([p], farm.catalog, expenses, monthOf(today));
  const late = tasks.filter((t) => !t.done && t.due < today);
  const next = tasks.filter((t) => !t.done && t.due >= today).slice(0, 6);
  const f = scaleFactor(crop, p);

  async function remove() {
    try { await repo.deletePlanting(p.id); go({ tab: 'coltivazioni' }); } catch (e) { setError(errorText(e)); }
  }

  return (
    <section className="page" aria-labelledby="pl-h">
      <div className="panel-head">
        <div>
          <a className="eyebrow backlink" href="#/coltivazioni" onClick={(e) => { e.preventDefault(); go({ tab: 'coltivazioni' }); }}>‹ Coltivazioni</a>
          <h2 id="pl-h">{crop.name}</h2>
        </div>
        {isAdmin && (confirm
          ? <span className="inline"><span className="note">Togliere {crop.name} dal piano, con i suoi {tasks.length} task e {expenses.length} spese?</span><button className="btn danger" type="button" onClick={remove}>Sì, togli</button><button className="btn" type="button" onClick={() => setConfirm(false)}>No</button></span>
          : <button className="btn danger" type="button" onClick={() => setConfirm(true)}>Togli dal piano</button>)}
      </div>
      {error && <p className="err" role="alert">{error}</p>}

      <div className="strip">
        <div className="stat"><span className="sub">Quantità</span><span className="v">{quantityLabel(crop, p)}</span><span className="sub">{SPACE_LABEL[crop.space]}</span></div>
        <div className="stat"><span className="sub">Inizio</span><span className="v">{dateLabel(p.start)}</span><span className="sub">primo ricavo verso il {crop.income ? dateLabel(firstIncomeDate(crop, p.start, 'base')) : '— (dato mancante)'}</span></div>
        <div className="stat"><span className="sub">Quota venduta</span><span className="v">{p.soldPct}%</span><span className="sub">della produzione</span></div>
        <div className="stat"><span className="sub">Ore a settimana</span><span className="v">{crop.hoursPerWeek ? hoursRange(crop.hoursPerWeek.min * f, crop.hoursPerWeek.max * f) : '—'}</span><span className="sub">{crop.hoursPerWeek ? 'stima dello schema' : 'dato mancante'}</span></div>
        <div className={'stat' + (late.length ? ' bad' : '')}><span className="sub">Task</span><span className="v">{tasks.filter((t) => t.done).length} / {tasks.length}</span><span className="sub">{late.length ? `${late.length} in ritardo` : 'nessuno in ritardo'}</span></div>
      </div>
      {p.note && <p className="note">Nota: {p.note}</p>}

      <div className="panel">
        <h3>Prospetto da 1 mese a 3 anni</h3>
        {!crop.income && <p className="warnbanner banner">Il ricavo di {crop.name} è un dato mancante: questo prospetto mostra solo le spese.</p>}
        <ProjectionChart months={pr.months} title={`Prospetto di ${crop.name}`} />
        <HorizonTable pr={pr} />
        <details><summary>Cosa manca a questo prospetto</summary><MissingList missing={pr.missing} /></details>
      </div>

      <div className="panels">
        <div className="panel">
          <div className="panel-head"><h3>Spese</h3><a href="#/spese" onClick={(e) => { e.preventDefault(); go({ tab: 'spese' }); }}>Tutte le spese</a></div>
          <ExpenseList {...props} expenses={expenses} />
          <p className="note">Investimento previsto: {eurRange(expenses.reduce((s, e) => s + e.amountMin, 0), expenses.reduce((s, e) => s + e.amountMax, 0))}. Pagato finora: {eur(expenses.reduce((s, e) => s + (e.paid ? e.actualAmount ?? 0 : 0), 0))}.</p>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Prossimi task</h3><a href={`#/task?coltura=${p.id}`} onClick={(e) => { e.preventDefault(); go({ tab: 'task', filter: p.id }); }}>Tutti i task</a></div>
          {toggleError && <p className="err" role="alert">{toggleError}</p>}
          <TaskRows tasks={[...late, ...next]} {...props} onToggle={toggle} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Calendario</h3><a href={`#/calendario?coltura=${p.id}`} onClick={(e) => { e.preventDefault(); go({ tab: 'calendario', filter: p.id }); }}>Apri il calendario di {crop.name}</a></div>
        <MonthCalendar farm={farm} tasks={tasks} expenses={expenses} month={month} onMonth={setMonth} isAdmin={isAdmin} today={today} onToggle={toggle} />
      </div>

      <div className="panel">
        <h3>Ciclo di vendita</h3>
        <p>{crop.salesCycle}</p>
        <p className="sub">Canali: {crop.channels.join(' · ')} · {crop.priceNote}</p>
        <CropFacts crop={crop} />
        {crop.notes.length > 0 && <ul className="warnlist">{crop.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="note">Task del ciclo: {crop.sources.tasks}.</p>
      </div>
    </section>
  );
}

function TaskRows({ tasks, farm, isAdmin, today, onToggle }: PageProps & { tasks: PageProps['farm']['tasks']; onToggle: (t: PageProps['farm']['tasks'][number]) => void }) {
  if (!tasks.length) return <p className="empty">Nessun task da fare.</p>;
  return (
    <ul className="tasklist">
      {tasks.map((t) => (
        <li key={t.id}>
          <span className={'mono when' + (!t.done && t.due < today ? ' late' : '')}>{shortDate(t.due, today)}</span>
          <TaskChip t={t} farm={farm} isAdmin={isAdmin} onToggle={onToggle} today={today} showCrop={false} />
        </li>
      ))}
    </ul>
  );
}

export function shortDate(d: DateStr, today: DateStr): string {
  return d === today ? 'oggi' : dateLabel(d, d.slice(0, 4) !== today.slice(0, 4));
}
