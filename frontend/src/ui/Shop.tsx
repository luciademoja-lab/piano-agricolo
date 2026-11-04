// Cornice delle pagine pubbliche: intestazione con il menu (Funghi · Chi sono · Accedi) e piè di pagina.
import { useEffect, type ReactNode } from 'react';
import { BRAND } from '../lib/brand';
import '../shop.css';

export type ShopNav = { page: 'catalogo' | 'chi-sono'; signedIn: boolean; open: (hash: string) => void };

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
          <span className="shop-mark" aria-hidden="true"><Mushroom /></span>
          <span>
            <span className="shop-name">{BRAND.name}</span>
            <span className="shop-place">{BRAND.place}</span>
          </span>
        </a>
        <nav className="shop-nav" aria-label="Pagine">
          {link('#/catalogo', 'Funghi', nav.page === 'catalogo')}
          {link('#/chi-sono', 'Chi sono', nav.page === 'chi-sono')}
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

export function Mushroom({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M4 15c0-6 5.4-10 12-10s12 4 12 10c0 1.2-.9 2-2 2H6c-1.1 0-2-.8-2-2Z" fill="currentColor" />
      <path d="M12.5 17h7l1 9.2c.1.9-.6 1.8-1.6 1.8h-5.8c-1 0-1.7-.9-1.6-1.8l1-9.2Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

export function ContactButton({ className = 'shop-btn big' }: { className?: string }) {
  if (!BRAND.contact) return null;
  return <a className={className} href={BRAND.contact.href} target="_blank" rel="noreferrer">{BRAND.contact.label}</a>;
}
