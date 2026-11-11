// Chi sono: formazione, metodo e (quando c'è, con le parole di Lucia) la storia.
// La laurea non è presentata come un'autorizzazione: è la competenza; l'autorizzazione è la registrazione ASL.
import { BRAND } from '../lib/brand';
import { ContactButton, ShopShell, type ShopNav } from './Shop';

export function ChiSono({ nav }: { nav: ShopNav }) {
  return (
    <ShopShell nav={nav}>
      <section className="shop-hero about">
        <div className="shop-hero-text">
          <span className="shop-kicker">Chi sono</span>
          <h1>{BRAND.name}</h1>
          <p>Biologa molecolare. Coltivo funghi a Cinquefrondi.</p>
        </div>
      </section>

      {BRAND.story.length > 0 && (
        <section className="shop-section shop-story">
          <h2 className="shop-h2">La mia storia</h2>
          {BRAND.story.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}

      <section className="shop-section">
        <h2 className="shop-h2">La mia formazione</h2>
        <ol className="shop-edu">
          {BRAND.education.map((e) => (
            <li key={e.title}><b>{e.title}</b>{e.where && <span>{e.where}</span>}</li>
          ))}
        </ol>
      </section>

      <section className="shop-section">
        <h2 className="shop-h2">Il metodo del laboratorio, in cantina</h2>
        <p className="shop-lead">In laboratorio una contaminazione rovina un esperimento; in coltivazione rovina un raccolto. Lavoro con le stesse abitudini.</p>
        <ul className="shop-method">
          <li><b>Pulizia prima di ogni ciclo.</b> Locale, scaffali e attrezzi puliti e sanificati prima che entri una balla nuova.</li>
          <li><b>Contaminazioni sotto controllo.</b> Una balla con muffe o odori anomali esce dal locale, non arriva in tavola.</li>
          <li><b>Ogni confezione racconta da dove viene.</b> Nome scientifico, data di raccolta e "da consumarsi previa cottura", come chiede la legge.</li>
          <li><b>Raccolta e consegna lo stesso giorno.</b> Il fungo non passa da magazzini né da celle frigo di altri.</li>
        </ul>
        <p className="shop-honest">Una laurea non è un'autorizzazione: la vendita partirà solo dopo la registrazione all'ASL come produttrice. Fino ad allora raccolgo preordini e manifestazioni di interesse.</p>
        <div className="shop-cta">
          <button className="shop-btn big" type="button" onClick={() => nav.open('#/interesse')}>Preordina senza impegno</button>
          <ContactButton className="shop-link" />
        </div>
      </section>
    </ShopShell>
  );
}
