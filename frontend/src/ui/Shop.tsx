// Cornice delle pagine pubbliche: intestazione con il menu (Funghi · Chi sono · Accedi) e piè di pagina.
import { useEffect, type ReactNode } from 'react';
import { BRAND } from '../lib/brand';
import { markSvg } from '../lib/mark';
import '../shop.css';

export type ShopNav = { page: 'catalogo' | 'chi-sono' | 'interesse'; signedIn: boolean; open: (hash: string) => void };

export function ShopShell({ nav, children }: { nav: ShopNav; children: ReactNode }) {
  // le pagine pubbliche hanno il loro sfondo caldo, da bordo a bordo
  useEffect(() => { document.body.dataset.page = 'shop'; return () => { delete document.body.dataset.page; }; }, []);
  const link = (hash: string, label: string, here: boolean) => (
    <a href={hash} aria-current={here ? 'page' : undefined} onClick={(e) => { e.preventDefault(); nav.open(hash); }}>{label}</a>
  );
  return (
    <div className="shop">
      <header className="shop-top">
        <a className="shop-brand" href="#/catalogo" onClick={(e) => { e.preventDefault(); nav.open('#/catalogo'); }}>
          <span className="shop-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markSvg('colore', 'shop-mark') }} />
          <span>
            <span className="shop-name">{BRAND.name}</span>
            <span className="shop-place">{BRAND.place}</span>
          </span>
        </a>
        <nav className="shop-nav" aria-label="Pagine">
          {link('#/catalogo', 'Funghi', nav.page === 'catalogo')}
          {link('#/chi-sono', 'Chi sono', nav.page === 'chi-sono')}
          {link('#/interesse', 'Preordina', nav.page === 'interesse')}
          <button className="shop-btn" type="button" onClick={() => nav.open(nav.signedIn ? '#/panoramica' : '#/accedi')}>{nav.signedIn ? 'Dashboard' : 'Accedi'}</button>
        </nav>
      </header>
      {children}
      <footer className="shop-foot">
        <p>I funghi coltivati freschi vanno consumati previa cottura.</p>
        <p>Foto da Wikimedia Commons, con licenza libera: autore e licenza nella pagina di ogni foto. Valori nutrizionali da USDA FoodData Central, fonte indicata sotto ogni fungo.</p>
      </footer>
    </div>
  );
}

export function ContactButton({ className = 'shop-btn big' }: { className?: string }) {
  if (!BRAND.contact) return null;
  const external = !BRAND.contact.href.startsWith('mailto:');
  return <a className={className} href={BRAND.contact.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{BRAND.contact.label}</a>;
}
