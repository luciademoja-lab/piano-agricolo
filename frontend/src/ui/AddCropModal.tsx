// Coltivazioni > Aggiungi: choose the crop, the m² (and the hens), a start date that the form only
// accepts inside the crop's start window, the share sold. Enter adds it to the plan with its tasks
// and its initial investment, then the crop's page opens with its projections, expenses and calendar.
import { useMemo, useState, type FormEvent } from 'react';
import { SPACE_LABEL, cropById, inWindow, isAllYear, startRange, windowLabel, windowOptions, type Crop } from '../lib/catalog';
import { dateLabel } from '../lib/dates';
import { eur, eurRange, hoursRange, m2 } from '../lib/format';
import { checkPlanting, generateExpenses, generateTasks, spaceAvailable, usedSpace, type PlantingInput } from '../lib/plan';
import { firstIncomeDate, incomeInMonth } from '../lib/projection';
import { addMonths, monthOf } from '../lib/dates';
import type { PageProps } from './shared';
import { errorText } from './errors';
import { Field, Modal } from './Modal';

export function AddCropModal({ repo, farm, today, onClose, onAdded, initialCrop }: PageProps & { onClose: () => void; onAdded: (id: string) => void; initialCrop?: string }) {
  const range = startRange(today);
  const initial = firstStart(initialCrop ? cropById(farm.catalog, initialCrop) : undefined, today);
  const [cropId, setCropId] = useState(initialCrop ?? '');
  const [area, setArea] = useState('');
  const [heads, setHeads] = useState('');
  const [indoor, setIndoor] = useState('');
  const [period, setPeriod] = useState(initial.period);
  const [start, setStart] = useState(initial.start);
  const [sold, setSold] = useState('100');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const crop = cropById(farm.catalog, cropId);
  const options = useMemo(() => (crop ? windowOptions(crop.windows, range.from, range.to) : []), [crop, range.from, range.to]);
  // the period that contains today, or the next one
  const defaultPeriod = Math.max(0, options.findIndex((o) => o.max >= today));
  const opt = options[Math.min(period, options.length - 1)];
  const needsIndoor = crop?.space === 'indoor' && farm.settings.indoorM2 === null;
  const settings = needsIndoor && Number(indoor) >= 0 && indoor.trim() !== '' ? { ...farm.settings, indoorM2: Number(indoor) } : farm.settings;

  const input: PlantingInput = {
    cropId, m2: Number(area.replace(',', '.')), heads: crop?.scale === 'capi' ? Number(heads) : null,
    start, soldPct: Number(sold.replace(',', '.')), note,
  };
  const check = crop ? checkPlanting(input, { catalog: farm.catalog, settings, plantings: farm.plantings }, today) : { errors: ['Scegli una coltura.'], warnings: [] };
  const free = crop ? (spaceAvailable(settings, crop.space) ?? 0) - usedSpace(farm.plantings, farm.catalog, crop.space) : 0;

  function pickCrop(id: string) {
    setCropId(id); setError(null); setTried(false);
    const f = firstStart(cropById(farm.catalog, id), today);
    setPeriod(f.period); setStart(f.start);
  }
  function pickPeriod(i: number) {
    setPeriod(i);
    const o = options[i];
    if (o && !(start >= o.min && start <= o.max)) setStart(o.min <= today && today <= o.max ? today : o.min);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (check.errors.length || !crop) return;
    setBusy(true); setError(null);
    try {
      if (needsIndoor) await repo.setSettings(settings);
      const id = await repo.addPlanting(input);
      onAdded(id);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <Modal label="Aggiungi una coltura" wide onClose={onClose} className="add-modal">
      <form onSubmit={submit} noValidate>
        <div><div className="eyebrow">Coltivazioni</div><h2>Aggiungi al piano</h2></div>

        <Field label="Coltura" htmlFor="add-crop">
          <select id="add-crop" value={cropId} onChange={(e) => pickCrop(e.target.value)} required>
            <option value="" disabled>Scegli dal catalogo…</option>
            {farm.catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · {SPACE_LABEL[c.space].toLowerCase()} · {windowLabel(c.windows)}</option>)}
          </select>
        </Field>

        {crop && (<>
          <CropFacts crop={crop} />

          <div className="fields two">
            <Field label={`m² da assegnare · liberi: ${m2(Math.max(0, free))}${crop.space === 'indoor' ? ' interni' : ' esterni'}`} htmlFor="add-m2">
              <input id="add-m2" type="number" inputMode="decimal" min="0" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} placeholder={crop.minM2 ? `consigliati almeno ${crop.minM2}` : ''} required />
            </Field>
            {crop.scale === 'capi' && (
              <Field label="Numero di galline" htmlFor="add-heads">
                <input id="add-heads" type="number" inputMode="numeric" min="1" step="1" value={heads} onChange={(e) => setHeads(e.target.value)} required />
              </Field>
            )}
            {needsIndoor && (
              <Field label="Spazio interno totale disponibile (m²)" htmlFor="add-indoor">
                <input id="add-indoor" type="number" inputMode="decimal" min="0" step="0.1" value={indoor} onChange={(e) => setIndoor(e.target.value)} required />
              </Field>
            )}
          </div>
          {needsIndoor && <p className="note">Non hai ancora indicato quanto spazio interno hai: lo salvo nelle Impostazioni insieme alla coltura.</p>}

          <div className="fields two">
            {!isAllYear(crop.windows) && (
              <Field label="Periodo di avvio" htmlFor="add-period">
                <select id="add-period" value={Math.min(period, options.length - 1)} onChange={(e) => pickPeriod(Number(e.target.value))}>
                  {options.map((o, i) => <option key={o.min} value={i}>{o.label}{o.max < today ? ' (passato)' : ''}{i === defaultPeriod ? ' · il prossimo' : ''}</option>)}
                </select>
              </Field>
            )}
            <Field label={opt && !isAllYear(crop.windows) ? `Data di inizio (dal ${dateLabel(opt.min)} al ${dateLabel(opt.max)})` : 'Data di inizio'} htmlFor="add-start">
              <input id="add-start" type="date" value={start} min={opt?.min} max={opt?.max} onChange={(e) => setStart(e.target.value)} required
                aria-invalid={!!start && !inWindow(crop.windows, start)} />
            </Field>
          </div>

          <div className="fields two">
            <Field label="Quota della produzione che pensi di vendere (%)" htmlFor="add-sold">
              <input id="add-sold" type="number" inputMode="decimal" min="0" max="100" step="5" value={sold} onChange={(e) => setSold(e.target.value)} />
            </Field>
            <Field label="Nota (facoltativa)" htmlFor="add-note">
              <input id="add-note" type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="es. vassoi sullo scaffale in cucina" />
            </Field>
          </div>
          <p className="note">Lo schema dà per scontato che tu venda tutto. Se non hai ancora clienti, una quota più bassa rende i prospetti più realistici.</p>

          {!check.errors.length && <Preview crop={crop} input={input} today={today} />}
          {tried && check.errors.length > 0 && <ul className="errlist" role="alert">{check.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
          {check.warnings.length > 0 && <ul className="warnlist">{check.warnings.map((x) => <li key={x}>{x}</li>)}</ul>}
        </>)}

        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" onClick={onClose}>Annulla</button>
          <button className="btn primary" type="submit" disabled={busy || !crop}>{busy ? 'Aggiunta…' : 'Aggiungi al piano'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The first start the form proposes: today if the crop can start today, otherwise the start of its next window. */
function firstStart(crop: Crop | undefined, today: string): { period: number; start: string } {
  if (!crop) return { period: 0, start: '' };
  const r = startRange(today);
  const opts = windowOptions(crop.windows, r.from, r.to);
  const i = Math.max(0, opts.findIndex((o) => o.max >= today));
  const o = opts[i];
  return { period: i, start: o ? (o.min <= today && today <= o.max ? today : o.min) : '' };
}

/** What the catalogue says about a crop, with where it comes from. */
export function CropFacts({ crop }: { crop: Crop }) {
  const inc = crop.income;
  const per = crop.scale === 'capi' ? `${crop.refQty} galline` : m2(crop.refQty);
  return (
    <div className="facts">
      <dl>
        <div><dt>Finestra di avvio</dt><dd>{windowLabel(crop.windows)}</dd></div>
        <div><dt>Primo ricavo</dt><dd>dopo {crop.firstIncomeDays.min === crop.firstIncomeDays.max ? crop.firstIncomeDays.min : `${crop.firstIncomeDays.min}–${crop.firstIncomeDays.max}`} giorni</dd></div>
        <div><dt>Ricavo (schema)</dt><dd>{inc ? <>{eurRange(inc.min, inc.max)} {inc.kind === 'monthly' ? 'al mese' : inc.kind === 'yearly' ? "all'anno" : `ogni ciclo di ${inc.cycleDays.min}–${inc.cycleDays.max} giorni`} su {per}</> : <span className="missing-tag">dato mancante</span>}</dd></div>
        <div><dt>Investimento iniziale</dt><dd>{crop.budget ? <>{eurRange(crop.budget.min, crop.budget.max)} per {crop.scale === 'capi' ? `${crop.budget.refQty} galline` : m2(crop.budget.refQty)}</> : <span className="missing-tag">dato mancante</span>}</dd></div>
        <div><dt>Costi ricorrenti</dt><dd>{crop.recurringMonthly ? eurRange(crop.recurringMonthly.min, crop.recurringMonthly.max) : <span className="missing-tag">dato mancante</span>}</dd></div>
        <div><dt>Ore a settimana</dt><dd>{crop.hoursPerWeek ? `${hoursRange(crop.hoursPerWeek.min, crop.hoursPerWeek.max)} su ${per}` : <span className="missing-tag">dato mancante</span>}</dd></div>
      </dl>
      <p className="note"><span className="pill rule-status to_confirm">Da confermare</span> {crop.sources.data}. Finestra: {crop.sources.windows}.</p>
    </div>
  );
}

function Preview({ crop, input, today }: { crop: Crop; input: PlantingInput; today: string }) {
  const tasks = generateTasks(crop, input.start, today);
  const exp = generateExpenses(crop, input)[0];
  const p = { ...input, id: 'preview', createdAt: 0 };
  const first = firstIncomeDate(crop, input.start, 'base');
  // a full month after the first income: what the crop brings in at full pace (base scenario)
  const full = crop.income?.kind === 'yearly' ? incomeInMonth(crop, p, monthOf(first), 'base') : crop.income ? incomeInMonth(crop, p, monthOf(addMonths(first, 1)), 'base') : 0;
  return (
    <div className="preview" aria-live="polite">
      <b>Entrando nel piano:</b>
      <ul>
        <li>Investimento iniziale il {dateLabel(input.start)}: {exp ? eurRange(exp.amountMin, exp.amountMax) : <span className="missing-tag">dato mancante</span>}</li>
        <li>Primo ricavo (scenario base): {crop.income ? <>verso il {dateLabel(first)}, poi {eur(full)} {crop.income.kind === 'yearly' ? "all'anno" : 'al mese'}</> : <span className="missing-tag">dato mancante</span>}</li>
        <li>{tasks.length} task del ciclo sul calendario, dal {tasks[0] ? dateLabel(tasks[0].due) : '—'}</li>
      </ul>
    </div>
  );
}
