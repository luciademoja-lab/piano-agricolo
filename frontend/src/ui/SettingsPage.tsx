import { useState, type FormEvent } from 'react';
import { m2 } from '../lib/format';
import { usedSpace } from '../lib/plan';
import type { PageProps } from './shared';
import { errorText } from './errors';
import { Field } from './Modal';

export function SettingsPage({ repo, farm, isAdmin }: PageProps) {
  const s = farm.settings;
  const [out, setOut] = useState(String(s.outdoorM2));
  const [inn, setInn] = useState(s.indoorM2 === null ? '' : String(s.indoorM2));
  const [deadline, setDeadline] = useState(s.grantDeadline ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    try {
      await repo.setSettings({ outdoorM2: Number(out.replace(',', '.')), indoorM2: inn.trim() ? Number(inn.replace(',', '.')) : null, grantDeadline: deadline || null });
      setMsg('Impostazioni salvate.');
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <section className="page" aria-labelledby="set-h">
      <div><div className="eyebrow">Progetto</div><h2 id="set-h">Impostazioni</h2></div>
      <form className="panel" onSubmit={save}>
        <div className="fields two">
          <Field label="Spazio esterno disponibile (m²)" htmlFor="set-out">
            <input id="set-out" type="number" inputMode="decimal" min="1" step="1" value={out} onChange={(e) => setOut(e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Spazio interno disponibile (m²)" htmlFor="set-in">
            <input id="set-in" type="number" inputMode="decimal" min="0" step="0.1" value={inn} onChange={(e) => setInn(e.target.value)} disabled={!isAdmin} placeholder="non indicato" />
          </Field>
        </div>
        <p className="note">In uso: {m2(usedSpace(farm.plantings, farm.catalog, 'outdoor'))} esterni, {m2(usedSpace(farm.plantings, farm.catalog, 'indoor'))} interni. Lo spazio non può scendere sotto quello già assegnato alle colture.</p>
        <Field label="Ultimo giorno per la domanda di primo insediamento" htmlFor="set-deadline">
          <input id="set-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!isAdmin} />
        </Field>
        <p className="note">Il bando chiede meno di 41 anni alla domanda: indica il giorno prima del tuo 41° compleanno. Compare in Panoramica come conto alla rovescia.</p>
        {msg && <p className="ok" role="status">{msg}</p>}
        {error && <p className="err" role="alert">{error}</p>}
        {isAdmin && <div className="actions start"><button className="btn primary" type="submit">Salva</button></div>}
      </form>
    </section>
  );
}
