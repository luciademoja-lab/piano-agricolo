// Il questionario pubblico (#/interesse): preordini e manifestazioni di interesse, in quattro passi.
// Non è un acquisto: non si paga niente e non ci si impegna. Si salva nel database con interest_submit(),
// che ricontrolla tutto; solo l'admin può rileggere le richieste.
// Due consensi separati: l'informativa (obbligatoria) e gli aggiornamenti via email (facoltativi).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Repo } from '../data/repo';
import { BRAND } from '../lib/brand';
import { num } from '../lib/format';
import {
  FREQUENCIES, MAX_ITEMS, parseKg, qty, validateInterest,
  type Frequency, type InterestInput, type InterestKind, type InterestOption, type Step,
} from '../lib/interest';
import { storyOf } from '../lib/stories';
import { errorText } from './errors';
import { ShopShell, type ShopNav } from './Shop';

type Pick = { variety: string | null; other: string; kg: string };
const STEPS: Array<[Step, string]> = [[1, 'Chi sei'], [2, 'Funghi'], [3, 'Quantità'], [4, 'Contatti']];
const QUICK: Record<InterestKind, number[]> = { privato: [0.25, 0.5, 1], ristorante: [1, 2, 5] };

/** a value from the address: #/interesse?fungo=<id> ticks that mushroom, ?chi=ristorante|privato answers the first question */
function fromHash(name: 'fungo' | 'chi'): string | null {
  const q = decodeURIComponent(location.hash).split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
}
const kindFromHash = (): InterestKind | null => {
  const k = fromHash('chi');
  return k === 'ristorante' || k === 'privato' ? k : null;
};

export function InterestForm({ repo, nav }: { repo: Repo; nav: ShopNav }) {
  const [options, setOptions] = useState<InterestOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<InterestKind | null>(kindFromHash);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [freq, setFreq] = useState<Frequency | null>(null);
  const [f, setF] = useState({ name: '', business: '', town: '', email: '', phone: '', note: '' });
  const [privacy, setPrivacy] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [trap, setTrap] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | { name: string; email: string; updates: boolean }>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    repo.loadInterestOptions().then((o) => {
      if (!alive) return;
      setOptions(o);
      const preset = fromHash('fungo');
      if (preset && o.some((x) => x.id === preset)) setPicks([{ variety: preset, other: '', kg: '' }]);
    }, (e) => { if (alive) setLoadError(errorText(e)); });
    return () => { alive = false; };
  }, [repo]);

  // a new step: back to the top of the form, with the reader on its question
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step, sent]);

  const input = (): InterestInput => ({
    kind: kind ?? ('' as InterestKind), name: f.name, business: kind === 'ristorante' ? f.business : '', town: f.town, email: f.email, phone: f.phone,
    frequency: freq ?? ('' as Frequency), note: f.note, privacy, updates,
    items: picks.map((p) => ({ variety: p.variety, other: p.variety ? null : p.other, kg: parseKg(p.kg) ?? NaN })),
  });
  const problemsAt = (s: Step) => validateInterest(input(), options ?? []).filter((p) => p.step === s).map((p) => p.message);

  const next = () => {
    const ps = problemsAt(step);
    setProblems(ps);
    if (!ps.length) setStep((step + 1) as Step);
  };
  const back = () => { setProblems([]); setStep((step - 1) as Step); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step < 4) { next(); return; }
    const all = validateInterest(input(), options ?? []);
    if (all.length) {
      const at = Math.min(...all.map((p) => p.step)) as Step;
      setStep(at);
      setProblems(all.filter((p) => p.step === at).map((p) => p.message));
      return;
    }
    // a hidden field that only robots fill in: they get a thank you and nothing is saved
    if (trap) { setSent({ name: f.name.trim(), email: f.email.trim(), updates }); return; }
    setBusy(true); setProblems([]);
    try {
      await repo.submitInterest(input());
      setSent({ name: f.name.trim(), email: f.email.trim(), updates });
    } catch (err) {
      setProblems([errorText(err)]);
    } finally {
      setBusy(false);
    }
  }

  const picked = (id: string) => picks.some((p) => p.variety === id);
  const otherPick = picks.find((p) => p.variety === null);
  const full = picks.length >= MAX_ITEMS;
  const toggle = (id: string | null) => {
    setProblems([]);
    setPicks((ps) => {
      const has = ps.some((p) => p.variety === id);
      if (has) return ps.filter((p) => p.variety !== id);
      return ps.length >= MAX_ITEMS ? ps : [...ps, { variety: id, other: '', kg: '' }];
    });
  };
  const setPick = (i: number, patch: Partial<Pick>) => setPicks((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const labelOf = (p: Pick) => (p.variety ? options?.find((o) => o.id === p.variety)?.commonName ?? p.variety : p.other.trim() || 'Altro fungo');

  if (sent) {
    return (
      <ShopShell nav={nav}>
        <section className="shop-hero about iq-done">
          <div className="shop-hero-text">
            <span className="shop-kicker">Richiesta ricevuta</span>
            <h1 ref={heading} tabIndex={-1}>Grazie{sent.name ? `, ${sent.name.split(' ')[0]}` : ''}!</h1>
            <p>Ho ricevuto la tua richiesta. Ti scrivo io a <b>{sent.email}</b> per capire insieme quantità e giorni di consegna.</p>
            {sent.updates && <p>Ti avviserò quando parte la coltivazione, quando arrivano nuove balle e quando si avvicina la raccolta.</p>}
            <p className="iq-reminder">Non hai acquistato niente e non hai impegni: quando la vendita partirà, deciderai tu.</p>
            <div className="shop-cta">
              <button className="shop-btn big" type="button" onClick={() => nav.open('#/catalogo')}>Torna ai funghi</button>
            </div>
          </div>
        </section>
      </ShopShell>
    );
  }

  const sellable = options?.filter((o) => o.sellable) ?? [];
  const future = options?.filter((o) => !o.sellable) ?? [];

  return (
    <ShopShell nav={nav}>
      <section className="shop-hero about">
        <div className="shop-hero-text">
          <span className="shop-kicker">Preordini e manifestazioni di interesse</span>
          <h1>Dimmi cosa ti serve</h1>
          <p>Quattro domande, due minuti. Non è un acquisto: non paghi niente e non ti impegni. Mi serve per decidere quali funghi coltivare e quanti.</p>
        </div>
      </section>

      {loadError && <p className="shop-err" role="alert">{loadError}</p>}
      {!options && !loadError && <p className="shop-muted">Caricamento…</p>}

      {options && (
        <form className="iq" onSubmit={submit} noValidate aria-labelledby="iq-q">
          <ol className="iq-steps" aria-label="Passi">
            {STEPS.map(([n, label]) => (
              <li key={n} aria-current={n === step ? 'step' : undefined} className={n < step ? 'done' : undefined}>
                <span className="iq-n">{n}</span><span className="iq-l">{label}</span>
              </li>
            ))}
          </ol>

          {step === 1 && (
            <fieldset className="iq-step">
              <legend><h2 id="iq-q" ref={heading} tabIndex={-1}>Chi sei?</h2></legend>
              <div className="iq-kinds">
                <label className={'iq-kind' + (kind === 'ristorante' ? ' on' : '')}>
                  <input type="radio" name="kind" checked={kind === 'ristorante'} onChange={() => { setKind('ristorante'); setProblems([]); }} />
                  <b>Ho un locale</b><span>Ristorante, pizzeria, bar, negozio o agriturismo</span>
                </label>
                <label className={'iq-kind' + (kind === 'privato' ? ' on' : '')}>
                  <input type="radio" name="kind" checked={kind === 'privato'} onChange={() => { setKind('privato'); setProblems([]); }} />
                  <b>Sono un privato</b><span>Per la mia famiglia</span>
                </label>
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="iq-step">
              <legend><h2 id="iq-q" ref={heading} tabIndex={-1}>Quali funghi vorresti nel tuo piatto?</h2></legend>
              <p className="iq-hint">Scegline fino a {MAX_ITEMS}. Non coltivo per un magazzino: coltivo per chi li mangerà. I più scelti saranno i primi a nascere nella mia cantina.{full && <b> Ne hai scelti {MAX_ITEMS}.</b>}</p>
              <div className="iq-choices">
                {sellable.map((o) => <Choice key={o.id} o={o} on={picked(o.id)} disabled={full && !picked(o.id)} onToggle={() => toggle(o.id)} />)}
              </div>
              {future.length > 0 && (<>
                <h3 className="iq-sub">Le rarità che sogno di portare qui</h3>
                <p className="iq-hint">Rosa come un fiore, d'oro come il sole, bianco come una criniera. Se li scegliete in tanti, saranno i prossimi a nascere.</p>
                <div className="iq-choices">
                  {future.map((o) => <Choice key={o.id} o={o} on={picked(o.id)} disabled={full && !picked(o.id)} onToggle={() => toggle(o.id)} />)}
                </div>
              </>)}
              <div className="iq-choices">
                <label className={'iq-choice' + (otherPick ? ' on' : '')}>
                  <input type="checkbox" checked={!!otherPick} disabled={full && !otherPick} onChange={() => toggle(null)} />
                  <span><b>Un altro fungo</b><em className="iq-hook">Hai un fungo del cuore? Scrivimi qual è.</em></span>
                </label>
              </div>
              {otherPick && (
                <div className="iq-field">
                  <label htmlFor="iq-other">Quale altro fungo?</label>
                  <input id="iq-other" type="text" maxLength={80} value={otherPick.other}
                    onChange={(e) => setPick(picks.indexOf(otherPick), { other: e.target.value })} />
                </div>
              )}
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="iq-step">
              <legend><h2 id="iq-q" ref={heading} tabIndex={-1}>Quanti e ogni quanto?</h2></legend>
              <p className="iq-hint">Un'idea basta: la potrai cambiare quando ci sentiamo.</p>
              {picks.map((p, i) => (
                <div className="iq-qty" key={p.variety ?? 'altro'}>
                  <label htmlFor={`iq-kg-${i}`}><b>{labelOf(p)}</b>: kg a ogni consegna</label>
                  <div className="iq-qty-row">
                    <input id={`iq-kg-${i}`} type="text" inputMode="decimal" placeholder="es. 1,5" value={p.kg} onChange={(e) => setPick(i, { kg: e.target.value })} />
                    {QUICK[kind ?? 'privato'].map((k) => (
                      <button key={k} type="button" className={'iq-quick' + (parseKg(p.kg) === k ? ' on' : '')} onClick={() => setPick(i, { kg: num(k, 2) })}>{qty(k)}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="iq-freq" role="radiogroup" aria-label="Ogni quanto">
                <p className="iq-label">Ogni quanto li vorresti?</p>
                {FREQUENCIES.map((fr) => (
                  <label key={fr.id} className={'iq-radio' + (freq === fr.id ? ' on' : '')}>
                    <input type="radio" name="freq" checked={freq === fr.id} onChange={() => { setFreq(fr.id); setProblems([]); }} />
                    {fr.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <fieldset className="iq-step">
              <legend><h2 id="iq-q" ref={heading} tabIndex={-1}>Come ti contatto?</h2></legend>
              <div className="iq-grid">
                <Text id="iq-name" label="Nome e cognome" value={f.name} onChange={(v) => setF({ ...f, name: v })} auto="name" />
                {kind === 'ristorante' && <Text id="iq-business" label="Nome del locale" value={f.business} onChange={(v) => setF({ ...f, business: v })} auto="organization" />}
                <Text id="iq-town" label="Comune di consegna" value={f.town} onChange={(v) => setF({ ...f, town: v })} auto="address-level2" />
                <Text id="iq-email" label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} auto="email" />
                <Text id="iq-phone" label="Telefono (facoltativo)" type="tel" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} auto="tel" />
              </div>
              <div className="iq-field">
                <label htmlFor="iq-note">Note (facoltative)</label>
                <textarea id="iq-note" rows={3} maxLength={1000} placeholder="Giorni preferiti per la consegna, domande…" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
              </div>
              <div className="iq-trap" aria-hidden="true">
                <label htmlFor="iq-site">Sito web</label>
                <input id="iq-site" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </div>

              <div className="iq-consents">
                <label className="iq-check">
                  <input type="checkbox" checked={privacy} onChange={(e) => { setPrivacy(e.target.checked); setProblems([]); }} />
                  <span>Ho letto l'informativa sulla privacy qui sotto. <em>Obbligatorio</em></span>
                </label>
                <details className="iq-privacy">
                  <summary>Leggi l'informativa sulla privacy</summary>
                  <Privacy />
                </details>
                <label className="iq-check">
                  <input type="checkbox" checked={updates} onChange={(e) => setUpdates(e.target.checked)} />
                  <span>Voglio ricevere aggiornamenti via email: quando parte la coltivazione, quando arrivano nuove balle, quando si avvicina la raccolta. Posso smettere quando voglio. <em>Facoltativo</em></span>
                </label>
              </div>
            </fieldset>
          )}

          {problems.length > 0 && (
            <ul className="iq-problems" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}

          <div className="iq-actions">
            {step > 1 && <button className="iq-back" type="button" onClick={back}>← Indietro</button>}
            <span className="iq-spacer" />
            {step < 4
              ? <button className="shop-btn big" type="submit">Avanti</button>
              : <button className="shop-btn big" type="submit" disabled={busy}>{busy ? 'Invio…' : 'Invia la richiesta'}</button>}
          </div>
        </form>
      )}
    </ShopShell>
  );
}

function Choice({ o, on, disabled, onToggle }: { o: InterestOption; on: boolean; disabled: boolean; onToggle: () => void }) {
  const s = storyOf(o.id);
  return (
    <label className={'iq-choice' + (on ? ' on' : '') + (disabled ? ' off' : '') + (s ? ' rich' : '')}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={onToggle} />
      <span>
        {s && <small className="iq-badge">{s.badge}</small>}
        <b>{o.commonName}</b>
        {s && <em className="iq-hook">{s.hook}</em>}
        <i>{o.scientificName}</i>
      </span>
    </label>
  );
}

function Text({ id, label, value, onChange, type = 'text', auto }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; auto?: string }) {
  return (
    <div className="iq-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} autoComplete={auto} maxLength={200} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** L'informativa (art. 13 GDPR), in parole semplici. */
export function Privacy() {
  const mail = BRAND.email;
  return (
    <div className="iq-privacy-text">
      <p><b>Chi tratta i tuoi dati.</b> {BRAND.name}, Cinquefrondi (RC){mail ? <>, <a href={`mailto:${mail}`}>{mail}</a></> : null}.</p>
      <p><b>Quali dati.</b> Nome, nome del locale, comune, email, telefono se lo lasci, i funghi e le quantità che mi indichi, le note.</p>
      <p><b>Perché.</b> Per risponderti, capire quanti funghi coltivare e organizzare le consegne: lo fai tu chiedendomelo (art. 6.1.b del GDPR). Le email di aggiornamento solo se metti la seconda spunta (il tuo consenso, art. 6.1.a): puoi ritirarlo quando vuoi, senza conseguenze.</p>
      <p><b>Chi li vede.</b> Solo io. Il sito e il database stanno su servizi tecnici (Vercel per il sito, Supabase per il database, con i dati a Parigi, nell'Unione Europea) che li conservano per conto mio. Non li cedo e non li vendo a nessuno.</p>
      <p><b>Per quanto.</b> Finché servono per la tua richiesta e le consegne, e non oltre 24 mesi dal nostro ultimo contatto. Poi li cancello.</p>
      <p><b>I tuoi diritti.</b> Puoi chiedermi di vedere, correggere o cancellare i tuoi dati, ritirare il consenso o opporti{mail ? <>, scrivendo a <a href={`mailto:${mail}`}>{mail}</a></> : ', rispondendo a una mia email'}. Puoi anche fare reclamo al <a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">Garante per la protezione dei dati personali</a>.</p>
    </div>
  );
}
