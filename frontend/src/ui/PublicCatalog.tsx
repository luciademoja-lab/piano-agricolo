// La homepage pubblica: il catalogo preliminare da mostrare ai ristoratori, al tavolo, dal telefono o dal tablet.
// Non si vende: listino provvisorio, preordini e manifestazioni di interesse. Niente costi né fornitori:
// arriva solo quello che restituisce catalog_public() nel database.
import { useEffect, useState } from 'react';
import type { Repo } from '../data/repo';
import { BRAND } from '../lib/brand';
import { eurKg, span } from '../lib/format';
import { daysToFirstHarvest, type PublicVariety } from '../lib/pricing';
import { errorText } from './errors';

export function PublicCatalog({ repo, signedIn, onLogin, onDashboard }: { repo: Repo; signedIn: boolean; onLogin: () => void; onDashboard: () => void }) {
  const [items, setItems] = useState<PublicVariety[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the page has its own warm background, edge to edge
  useEffect(() => { document.body.dataset.page = 'shop'; return () => { delete document.body.dataset.page; }; }, []);
  useEffect(() => {
    let alive = true;
    repo.loadPublicCatalog().then((v) => { if (alive) setItems(v); }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo]);

  return (
    <div className="shop">
      <header className="shop-top">
        <div className="shop-brand">
          <span className="shop-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><path d="M4 15c0-6 5.4-10 12-10s12 4 12 10c0 1.2-.9 2-2 2H6c-1.1 0-2-.8-2-2Z" fill="currentColor" /><path d="M12.5 17h7l1 9.2c.1.9-.6 1.8-1.6 1.8h-5.8c-1 0-1.7-.9-1.6-1.8l1-9.2Z" fill="currentColor" opacity=".55" /></svg>
          </span>
          <div>
            <div className="shop-name">{BRAND.name}</div>
            <div className="shop-place">{BRAND.place}</div>
          </div>
        </div>
        {signedIn
          ? <button className="shop-btn" type="button" onClick={onDashboard}>Dashboard</button>
          : <button className="shop-btn" type="button" onClick={onLogin}>Accedi</button>}
      </header>

      <section className="shop-hero">
        <h1>{BRAND.title}</h1>
        <p>{BRAND.tagline}</p>
        <div className="shop-notice" role="note">
          <span className="shop-tag">Listino provvisorio</span>
          <span>Raccolgo <b>preordini e manifestazioni di interesse</b>: la vendita partirà solo dopo le autorizzazioni sanitarie. I prezzi sono indicativi e mi servono a capire cosa vi serve.</span>
        </div>
      </section>

      {repo.mode === 'demo' && <p className="shop-demo">Demo: i prezzi pubblicati qui restano solo in questa pagina.</p>}
      {error && <p className="shop-err" role="alert">{error}</p>}
      {!items && !error && <p className="shop-muted">Caricamento del catalogo…</p>}
      {items && items.length === 0 && <p className="shop-muted">Il catalogo è in preparazione.</p>}

      {items && items.length > 0 && (
        <ul className="shop-grid" aria-label="Varietà">
          {items.map((v) => <Card key={v.id} v={v} />)}
        </ul>
      )}

      <footer className="shop-foot">
        <p>I funghi coltivati freschi vanno consumati previa cottura.</p>
        <p>Foto da Wikimedia Commons, con licenza libera: autore e licenza nella pagina di ogni foto.</p>
      </footer>
    </div>
  );
}

function Card({ v }: { v: PublicVariety }) {
  const [broken, setBroken] = useState(false);
  const days = daysToFirstHarvest(v);
  const priced = v.list.wholesale !== null || v.list.retail !== null;
  return (
    <li className="shop-card">
      <figure className="shop-photo">
        {v.photo && !broken
          ? <img src={v.photo.url} alt={`${v.commonName} (${v.scientificName})`} loading="lazy" onError={() => setBroken(true)} />
          : <div className="shop-photo-none" aria-hidden="true">{v.commonName.charAt(0)}</div>}
        {v.photo && <figcaption><a href={v.photo.page} target="_blank" rel="noreferrer">Foto: {v.photo.credit}</a></figcaption>}
      </figure>
      <div className="shop-body">
        <h2>{v.commonName}</h2>
        <p className="shop-sci"><i>{v.scientificName}</i>{v.otherNames && <span> · {v.otherNames}</span>}</p>
        <p className="shop-use">{v.kitchen}</p>
        <dl className="shop-facts">
          <div>
            <dt>Prima raccolta</dt>
            <dd>{days ? `${span(days.min, days.max)} giorni dall'ordine` : 'tempi da definire'}</dd>
          </div>
        </dl>
        <div className={'shop-price' + (priced ? '' : ' none')}>
          {priced ? (<>
            <div><span>Ristoranti</span><b>{v.list.wholesale !== null ? eurKg(v.list.wholesale) : '—'}</b></div>
            <div><span>Privati</span><b>{v.list.retail !== null ? eurKg(v.list.retail) : '—'}</b></div>
            <small>prezzo provvisorio</small>
          </>) : <span>Prezzo in definizione</span>}
        </div>
      </div>
    </li>
  );
}
