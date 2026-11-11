// La homepage pubblica: il catalogo da mostrare ai ristoratori e alle famiglie, dal telefono o dal tablet.
// Non si vende ancora: listino provvisorio, preordini e manifestazioni di interesse. Niente costi né fornitori:
// arriva solo quello che restituisce catalog_public() nel database.
// Le qualità di ogni fungo sono solo quelle che la legge permette di dire (lib/nutrition.ts).
import { useEffect, useState } from 'react';
import type { Repo } from '../data/repo';
import { eurKg, num, span } from '../lib/format';
import { BRAND } from '../lib/brand';
import { VARIED_DIET, claims } from '../lib/nutrition';
import { storyOf } from '../lib/stories';
import { daysToFirstHarvest, type PublicVariety } from '../lib/pricing';
import { errorText } from './errors';
import { ContactButton, ShopShell, type ShopNav } from './Shop';

const VENETO = 'https://www.greatitalianfoodtrade.it/funghi-e-tartufi/funghi-coltivati-italia-micoproteine/';

export function PublicCatalog({ repo, nav }: { repo: Repo; nav: ShopNav }) {
  const [items, setItems] = useState<PublicVariety[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    repo.loadPublicCatalog().then((v) => { if (alive) setItems(v); }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo]);
  const hero = items?.find((v) => v.photo)?.photo;
  const toFunghi = () => document.getElementById('funghi')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <ShopShell nav={nav}>
      <section className="shop-hero">
        <div className="shop-hero-text">
          <span className="shop-kicker">Funghi freschi di Cinquefrondi</span>
          <h1>Raccolti stamattina. Nel tuo piatto stasera.</h1>
          <p>Li coltivo io, con il rigore di un laboratorio, e li consegno il giorno stesso della raccolta. Pochi chilometri invece di mille: per i ristoranti e le famiglie della Piana.</p>
          <div className="shop-cta">
            <button className="shop-btn big" type="button" onClick={() => nav.open('#/interesse')}>Preordina senza impegno</button>
            <button className="shop-link" type="button" onClick={toFunghi}>Scopri i funghi ↓</button>
          </div>
        </div>
        {hero && <HeroPhoto url={hero.url} page={hero.page} />}
      </section>

      <section className="shop-promises" aria-label="Perché sceglierli">
        <article>
          <h2>Dalla raccolta alla tavola in giornata</h2>
          <p>Il fungo fresco dà il meglio nelle prime ore. Raccolgo la mattina della consegna: nessun magazzino, nessun viaggio in camion.</p>
        </article>
        <article>
          <h2>Pochi chilometri, non mille</h2>
          <p>Circa metà dei funghi coltivati in Italia viene dal Veneto, a oltre mille chilometri da qui. <a href={VENETO} target="_blank" rel="noreferrer">I dati</a>. I miei crescono a Cinquefrondi.</p>
        </article>
        <article>
          <h2>Il rigore di un laboratorio</h2>
          <p>Sono biologa molecolare: pulizia, controllo delle contaminazioni e tracciabilità sono il cuore della mia formazione. Li porto nella coltivazione.</p>
        </article>
      </section>

      <section className="shop-section shop-offers" aria-labelledby="offerte">
        <span className="shop-kicker">Quando partirà la vendita</span>
        <h2 id="offerte" className="shop-h2">Due modi per avere i miei funghi</h2>
        <div className="shop-offer-grid">
          {BRAND.offers.map((o) => (
            <article key={o.kind} className="shop-offer">
              <span className="shop-offer-who">{o.who}</span>
              <h3>{o.name}</h3>
              <p className="shop-offer-promise">{o.promise}</p>
              <ul className="shop-offer-points">{o.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="shop-offer-guarantee"><b>Garanzia.</b> {o.guarantee}</p>
              {o.limit && <p className="shop-offer-limit">{o.limit}</p>}
              <button className="shop-btn big" type="button" onClick={() => nav.open(`#/interesse?chi=${o.kind}`)}>{o.cta}</button>
            </article>
          ))}
        </div>
        <p className="shop-small">Sono preordini: non paghi niente e non ti impegni. Mi servono per capire quanti funghi coltivare.</p>
      </section>

      <div className="shop-notice" role="note">
        <span className="shop-tag">Listino provvisorio</span>
        <span>Raccolgo <b>preordini e manifestazioni di interesse</b>: la vendita partirà dopo la registrazione all'ASL. I prezzi sono indicativi e mi aiutano a capire cosa vi serve.</span>
      </div>

      {repo.mode === 'demo' && <p className="shop-demo">Demo: i prezzi pubblicati qui restano solo in questa pagina.</p>}
      {error && <p className="shop-err" role="alert">{error}</p>}
      {!items && !error && <p className="shop-muted">Caricamento del catalogo…</p>}
      {items && items.length === 0 && <p className="shop-muted">Il catalogo è in preparazione.</p>}

      {items && items.length > 0 && (
        <section id="funghi" className="shop-section">
          <h2 className="shop-h2">I funghi che coltivo</h2>
          <p className="shop-lead">Ognuno ha una storia, un carattere e un posto speciale in cucina. Scegli il tuo.</p>
          <ul className="shop-grid" aria-label="Varietà">
            {items.map((v) => <Card key={v.id} v={v} open={nav.open} />)}
          </ul>
          <p className="shop-small">{VARIED_DIET} Le indicazioni nutrizionali seguono il Reg. (CE) 1924/2006 e il Reg. (UE) 432/2012 e sono calcolate sui valori per 100 g di fungo crudo.</p>
        </section>
      )}

      <section className="shop-section shop-how">
        <h2 className="shop-h2">Come funziona</h2>
        <ol>
          <li><b>Scegli i funghi</b> e quanti chili ti servono a settimana.</li>
          <li><b>Dimmi i giorni</b> in cui vuoi la consegna: raccolgo due volte a settimana.</li>
          <li><b>Raccolgo e consegno</b> lo stesso giorno, con etichetta, nome scientifico e data di raccolta.</li>
        </ol>
        <div className="shop-cta">
          <button className="shop-btn big" type="button" onClick={() => nav.open('#/interesse')}>Dimmi cosa ti serve</button>
          <ContactButton className="shop-link" />
        </div>
      </section>
    </ShopShell>
  );
}

function HeroPhoto({ url, page }: { url: string; page: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <figure className="shop-hero-photo">
      <img src={url} alt="Funghi Pleurotus appena raccolti" onError={() => setBroken(true)} />
      <figcaption><a href={page} target="_blank" rel="noreferrer">Foto: Wikimedia Commons</a></figcaption>
    </figure>
  );
}

const SHOW_FIRST = ['Poche calorie', 'Fonte di proteine', 'Fonte di fibre'];

function Card({ v, open }: { v: PublicVariety; open: (hash: string) => void }) {
  const [broken, setBroken] = useState(false);
  const days = daysToFirstHarvest(v);
  const priced = v.list.wholesale !== null || v.list.retail !== null;
  const n = v.nutrition;
  const c = n ? claims(n.per100g) : null;
  const tags = c ? SHOW_FIRST.filter((t) => c.nutrition.includes(t)) : [];
  const vitamins = c ? c.nutrition.filter((t) => t.startsWith('Fonte di') && !SHOW_FIRST.includes(t)).map((t) => t.slice(9)) : [];
  const s = storyOf(v.id);
  const want = `#/interesse?fungo=${encodeURIComponent(v.id)}`;
  return (
    <li className="shop-card">
      <figure className="shop-photo">
        {s && <span className="shop-badge">{s.badge}</span>}
        {v.photo && !broken
          ? <img src={v.photo.url} alt={`${v.commonName} (${v.scientificName})`} loading="lazy" onError={() => setBroken(true)} />
          : <div className="shop-photo-none" aria-hidden="true">{v.commonName.charAt(0)}</div>}
        {v.photo && <figcaption><a href={v.photo.page} target="_blank" rel="noreferrer">Foto: {v.photo.credit}</a></figcaption>}
      </figure>
      <div className="shop-body">
        <h3>{v.commonName}</h3>
        <p className="shop-sci"><i>{v.scientificName}</i>{v.otherNames && <span> · {v.otherNames}</span>}</p>
        {s && <p className="shop-hook">{s.hook}</p>}
        {s && <p className="shop-story">{s.story}</p>}
        <p className="shop-use"><b>In cucina.</b> {v.kitchen}</p>
        {s && <p className="shop-why"><b>Perché sceglierlo.</b> {s.why}</p>}
        {tags.length > 0 && <ul className="shop-tags" aria-label="In tavola">{tags.map((t) => <li key={t}>{t}</li>)}</ul>}
        {vitamins.length > 0 && <p className="shop-vit">Fonte di {listIt(vitamins)}.</p>}
        {n && c && (c.health.length > 0 || n.per100g.kcal !== null) && (
          <details className="shop-more">
            <summary>Valori e benefici</summary>
            <dl className="shop-values">
              {n.per100g.kcal !== null && <div><dt>Energia</dt><dd>{num(n.per100g.kcal, 0)} kcal</dd></div>}
              {n.per100g.protein !== null && <div><dt>Proteine</dt><dd>{num(n.per100g.protein)} g</dd></div>}
              {n.per100g.fiber !== null && <div><dt>Fibre</dt><dd>{num(n.per100g.fiber)} g</dd></div>}
              {n.per100g.fat !== null && <div><dt>Grassi</dt><dd>{num(n.per100g.fat)} g</dd></div>}
              {Object.entries(c.nrvPct).map(([k, pct]) => <div key={k}><dt>{NUTRIENT[k] ?? k}</dt><dd>{pct}% VNR</dd></div>)}
            </dl>
            <ul className="shop-health">{c.health.map((h) => <li key={h}>{h}</li>)}</ul>
            <p className="shop-small">Per 100 g di fungo crudo{n.approximate ? ', valori arrotondati' : ''}. VNR = valore nutritivo di riferimento giornaliero. Fonte: {n.source.url ? <a href={n.source.url} target="_blank" rel="noreferrer">{n.source.text}</a> : n.source.text}.</p>
          </details>
        )}
        <dl className="shop-facts">
          <div><dt>Prima raccolta</dt><dd>{days ? `${span(days.min, days.max)} giorni dall'ordine` : 'tempi da definire'}</dd></div>
        </dl>
        <div className={'shop-price' + (priced ? '' : ' none')}>
          {priced ? (<>
            <div><span>Ristoranti</span><b>{v.list.wholesale !== null ? eurKg(v.list.wholesale) : '—'}</b></div>
            <div><span>Privati</span><b>{v.list.retail !== null ? eurKg(v.list.retail) : '—'}</b></div>
            <small>prezzo provvisorio</small>
          </>) : <span>Prezzo in definizione</span>}
        </div>
        <a className="shop-btn shop-want-btn" href={want} aria-label={`Preordina ${v.commonName}`} onClick={(e) => { e.preventDefault(); open(want); }}>Lo voglio: preordina</a>
      </div>
    </li>
  );
}

const NUTRIENT: Record<string, string> = {
  potassium: 'Potassio', phosphorus: 'Fosforo', copper: 'Rame', selenium: 'Selenio', niacin: 'Vitamina B3',
  riboflavin: 'Vitamina B2', pantothenic: 'Vitamina B5', folate: 'Folato', b6: 'Vitamina B6',
};

/** "a, b e c" */
function listIt(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}
