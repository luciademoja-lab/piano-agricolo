// Panoramica: where the project stands, in one screen.
import { useEffect, useState } from 'react';
import { addDays, dateLabel, daysBetween, monthOf } from '../lib/dates';
import { eur, eurRange, hoursRange, m2, num } from '../lib/format';
import { spaceAvailable, usedSpace } from '../lib/plan';
import { THRESHOLDS, project, standardOutput, totals, weeklyHours } from '../lib/projection';
import { TaskChip, cropName, useToggleTask } from './CalendarPage';
import { shortDate } from './PlantingDetail';
import type { PageProps } from './shared';

export function Overview({ repo, farm, isAdmin, today, go }: PageProps) {
  const { toggle, error } = useToggleTask(repo);
  const [toConfirm, setToConfirm] = useState<number | null>(null);
  useEffect(() => { repo.loadRules().then((r) => setToConfirm(r.rules.filter((x) => x.status === 'to_confirm').length), () => setToConfirm(null)); }, [repo, farm]);

  const pr = project(farm.plantings, farm.catalog, farm.expenses, monthOf(today));
  const y1 = totals(pr, 12), y3 = totals(pr, 36);
  const hours = weeklyHours(farm.plantings, farm.catalog);
  const ps = standardOutput(farm.plantings, farm.catalog);
  const out = usedSpace(farm.plantings, farm.catalog, 'outdoor'), inn = usedSpace(farm.plantings, farm.catalog, 'indoor');
  const inAvail = spaceAvailable(farm.settings, 'indoor');
  const late = farm.tasks.filter((t) => !t.done && t.due < today);
  const week = farm.tasks.filter((t) => !t.done && t.due >= today && t.due <= addDays(today, 7));
  const nextExpenses = farm.expenses.filter((e) => !e.paid && e.date >= today).slice(0, 5);
  const daysLeft = farm.settings.grantDeadline ? daysBetween(today, farm.settings.grantDeadline) : null;
  const missingCount = new Set(pr.missing.map((m) => m.crop + m.what)).size;

  return (
    <section className="page" aria-labelledby="ov-h">
      <h2 id="ov-h" className="sr-only">Panoramica</h2>
      {!farm.plantings.length && (
        <div className="panel emptystate">
          <p><b>Il piano è vuoto.</b> Aggiungi la prima coltura da Coltivazioni: il tool prepara prospetti, spese e task del ciclo.</p>
          <button className="btn primary" type="button" onClick={() => go({ tab: 'coltivazioni' })}>Vai a Coltivazioni</button>
        </div>
      )}

      <div className="strip">
        <Stat label="Colture nel piano" value={String(farm.plantings.length)} sub={farm.plantings.map((p) => cropName(farm, p.id)).join(', ') || 'nessuna'} />
        <Stat label="Spazio esterno" value={`${m2(out)} / ${m2(farm.settings.outdoorM2)}`} sub={`${num((out / farm.settings.outdoorM2) * 100, 0)}% assegnato`} />
        <Stat label="Spazio interno" value={inAvail === null ? `${m2(inn)} / ?` : `${m2(inn)} / ${m2(inAvail)}`} sub={inAvail === null ? 'totale da indicare' : 'assegnato'} />
        <Stat label="Ricavi primi 12 mesi" value={eur(y1.income.base)} sub={`scenario base · da ${eur(y1.income.pess)} a ${eur(y1.income.opt)}`} />
        <Stat label="Saldo a 3 anni" value={eur(y3.net.base)} sub={`base · da ${eur(y3.net.pess)} a ${eur(y3.net.opt)}`} tone={y3.net.base < 0 ? 'bad' : undefined} />
        <Stat label="Ore a settimana" value={hoursRange(hours.min, hours.max)} sub="stima dello schema" />
        <Stat label="Task in ritardo" value={String(late.length)} sub={`${week.length} nei prossimi 7 giorni`} tone={late.length ? 'bad' : 'good'} />
        <Stat label="Dati mancanti" value={String(missingCount)} sub={toConfirm === null ? '' : `${toConfirm} regole da confermare`} tone={missingCount ? 'attn' : undefined} />
      </div>
      <p className="note">Numeri dallo schema di Rendita Agricola, da confermare. I costi ricorrenti non sono ancora nel piano.</p>

      <div className="panels">
        <div className="panel">
          <h3>Verso il bando giovani agricoltori</h3>
          <ul className="checks-list">
            <li><b>Produzione Standard</b>: {eur(ps.known)} su {eur(THRESHOLDS.psMin)} minimi{ps.unknown.length ? <> · senza valore: {ps.unknown.join(', ')}</> : null}</li>
            <li><b>Ore di lavoro</b>: circa {num(hours.max * 52, 0)} l'anno su {num(THRESHOLDS.hoursMin, 0)} richieste (zone ordinarie)</li>
            <li><b>Ricavi del 1° anno</b>: {eur(y1.income.base)} · esonero IVA fino a {eur(THRESHOLDS.vatExemption)}</li>
            <li><b>Scadenza per l'età</b>: {daysLeft === null ? <>da impostare in <a href="#/impostazioni" onClick={(e) => { e.preventDefault(); go({ tab: 'impostazioni' }); }}>Impostazioni</a></> : daysLeft >= 0 ? <>{dateLabel(farm.settings.grantDeadline!)}, tra {num(daysLeft / 30.44, 0)} mesi</> : 'passata'}</li>
          </ul>
          <p className="note">Requisiti del bando 2025: il prossimo può cambiare. Vedi <a href="#rule-sre01-requisiti" onClick={(e) => { e.preventDefault(); history.pushState(null, '', '#rule-sre01-requisiti'); go({ tab: 'regolamenti' }); }}>Regolamenti › Bando</a>.</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Da fare</h3><a href="#/task" onClick={(e) => { e.preventDefault(); go({ tab: 'task' }); }}>Tutti i task</a></div>
          {error && <p className="err" role="alert">{error}</p>}
          {!late.length && !week.length && <p className="empty">Niente in ritardo e niente nei prossimi 7 giorni.</p>}
          <ul className="tasklist">
            {[...late, ...week].slice(0, 10).map((t) => (
              <li key={t.id}>
                <span className={'mono when' + (t.due < today ? ' late' : '')}>{shortDate(t.due, today)}</span>
                <TaskChip t={t} farm={farm} isAdmin={isAdmin} onToggle={toggle} today={today} showCrop={false} />
                <span className="sub">{cropName(farm, t.plantingId)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Prossime spese</h3><a href="#/spese" onClick={(e) => { e.preventDefault(); go({ tab: 'spese' }); }}>Tutte le spese</a></div>
          {!nextExpenses.length && <p className="empty">Nessuna spesa prevista.</p>}
          <ul className="tasklist">
            {nextExpenses.map((e) => <li key={e.id}><span className="mono when">{shortDate(e.date, today)}</span><span>{e.title}</span><span className="mono sub">{eurRange(e.amountMin, e.amountMax)}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' | 'attn' }) {
  return <div className={'stat' + (tone ? ' ' + tone : '')}><span className="sub">{label}</span><span className="v">{value}</span>{sub && <span className="sub">{sub}</span>}</div>;
}
