// Il marchio: quello che fa un servizio come Tailor Brands, dentro l'app e senza abbonamento.
// Logo (file vettoriali e PNG), colori e caratteri; post per i social fatti dai funghi del catalogo;
// biglietti da visita e volantini da stampare, con il QR code che porta al questionario dei preordini.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Repo } from '../data/repo';
import { BRAND } from '../lib/brand';
import {
  LOGO_DEFAULTS, PALETTE, POST_FORMATS, POST_TEMPLATES, TYPEFACES, breaksRules, caption, logoSvg, markSvg, preorderUrl, qrSvg, shortUrl,
  type LogoFonts, type LogoLayout, type LogoVariant, type PostFormat, type PostTemplate,
} from '../lib/brandkit';
import type { PublicVariety } from '../lib/pricing';
import { storyOf } from '../lib/stories';
import { loadBrandFonts } from './brandFonts';
import { drawPost } from './postCanvas';
import { errorText } from './errors';
import '../brand.css';

type Section = 'logo' | 'post' | 'stampa';
const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: 'logo', label: 'Logo e colori' },
  { id: 'post', label: 'Post per i social' },
  { id: 'stampa', label: 'Biglietto e volantino' },
];

/** a remembered choice, in this browser only (it may be unavailable: then the default) */
function useRemembered(key: string, initial: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) ?? initial; } catch { return initial; } });
  return [v, (next) => { setV(next); try { localStorage.setItem(key, next); } catch { /* not remembered */ } }];
}

export function BrandPage({ repo }: { repo: Repo }) {
  const [section, setSection] = useState<Section>('logo');
  const [fonts, setFonts] = useState<LogoFonts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useRemembered('brand-name', LOGO_DEFAULTS.name);
  const [tagline, setTagline] = useRemembered('brand-tagline', LOGO_DEFAULTS.tagline);
  useEffect(() => {
    let alive = true;
    loadBrandFonts().then((f) => { if (alive) setFonts(f); }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="panel brandpage" aria-labelledby="brand-h">
      <div className="panel-head">
        <div><div className="eyebrow">Il tuo marchio</div><h2 id="brand-h">Marchio</h2></div>
        <div className="seg" role="group" aria-label="Sezione">
          {SECTIONS.map((s) => <button key={s.id} type="button" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>)}
        </div>
      </div>
      <div className="brand-names">
        <label>Nome<input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label>Sottotitolo<input type="text" value={tagline} maxLength={40} onChange={(e) => setTagline(e.target.value)} /></label>
        <p className="muted">Valgono per logo, post e stampe. Sul sito pubblico resta «{BRAND.name}»: per cambiarlo anche lì, chiedilo.</p>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {!fonts && !error && <p className="muted">Caricamento dei caratteri…</p>}
      {fonts && section === 'logo' && <LogoKit fonts={fonts} name={name} tagline={tagline} />}
      {fonts && section === 'post' && <Posts repo={repo} fonts={fonts} name={name} tagline={tagline} />}
      {fonts && section === 'stampa' && <Prints fonts={fonts} name={name} tagline={tagline} />}
    </section>
  );
}

// ---- Logo e colori ----

const LAYOUTS: ReadonlyArray<{ id: LogoLayout; label: string; where: string; png: number }> = [
  { id: 'orizzontale', label: 'Orizzontale', where: 'Intestazioni, biglietti da visita, firma delle email.', png: 2400 },
  { id: 'verticale', label: 'Verticale', where: 'Volantini, etichette, cassette.', png: 1600 },
  { id: 'simbolo', label: 'Solo simbolo', where: 'Foto profilo di Instagram, Facebook e WhatsApp.', png: 1024 },
];
const VARIANTS: ReadonlyArray<{ id: LogoVariant; label: string }> = [
  { id: 'colore', label: 'A colori' },
  { id: 'negativo', label: 'Su fondo oliva' },
  { id: 'mono', label: 'Un solo colore' },
];

function LogoKit({ fonts, name, tagline }: { fonts: LogoFonts; name: string; tagline: string }) {
  const [variant, setVariant] = useState<LogoVariant>('colore');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (hex: string) => {
    navigator.clipboard?.writeText(hex).then(() => { setCopied(hex); setTimeout(() => setCopied(null), 1500); }, () => setCopied(null));
  };
  return (
    <div className="brand-section">
      <div className="brand-row">
        <h3>Il logo</h3>
        <div className="seg" role="group" aria-label="Versione del logo">
          {VARIANTS.map((v) => <button key={v.id} type="button" aria-pressed={variant === v.id} onClick={() => setVariant(v.id)}>{v.label}</button>)}
        </div>
      </div>
      <p className="muted">Il cappello del fungo è anche un sole che sorge: raccolti stamattina. Il file SVG è vettoriale, si ingrandisce senza perdere qualità ed è quello da dare alla tipografia. Il PNG va bene per i social e i documenti.</p>
      <div className="logo-grid">
        {LAYOUTS.map((l) => {
          const logo = logoSvg(fonts, { layout: l.id, variant, name, tagline }, `kit-${l.id}`);
          const base = `logo-${l.id}-${variant}`;
          return (
            <figure key={l.id} className={`logo-card ${variant}`}>
              <div className="logo-art" dangerouslySetInnerHTML={{ __html: logo.svg }} />
              <figcaption>
                <b>{l.label}</b>
                <span className="muted">{l.where}</span>
                <span className="logo-actions">
                  <button className="btn small" type="button" onClick={() => download(new Blob([logo.svg], { type: 'image/svg+xml' }), `${base}.svg`)}>Scarica SVG</button>
                  <button className="btn small" type="button" onClick={() => {
                    setError(null);
                    svgToPng(logo.svg, logo.width, logo.height, l.png / logo.width).then((b) => download(b, `${base}.png`), (e) => setError(errorText(e)));
                  }}>Scarica PNG</button>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {error && <p className="err" role="alert">{error}</p>}

      <h3>I colori</h3>
      <ul className="swatches">
        {PALETTE.map((c) => (
          <li key={c.id}>
            <span className="swatch" style={{ background: c.hex }} />
            <span><b>{c.name}</b> <button className="linkbtn mono" type="button" onClick={() => copy(c.hex)} aria-label={`Copia il codice di ${c.name}`}>{copied === c.hex ? 'copiato' : c.hex}</button><br /><span className="muted">{c.use}</span></span>
          </li>
        ))}
      </ul>
      <h3>I caratteri</h3>
      <ul className="typefaces">
        {TYPEFACES.map((t, i) => (
          <li key={t.name}>
            <span className={i === 0 ? 'tf-serif' : 'tf-sans'}>{t.name}</span>
            <span className="muted">{t.role} · gratuito, licenza libera (OFL) · <a href={t.url} target="_blank" rel="noreferrer">scaricalo</a></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Post per i social ----

function Posts({ repo, fonts, name, tagline }: { repo: Repo; fonts: LogoFonts; name: string; tagline: string }) {
  const [items, setItems] = useState<PublicVariety[] | null>(null);
  const [template, setTemplate] = useState<PostTemplate>('storia');
  const [formatId, setFormatId] = useState<PostFormat>('verticale');
  const [mushroomId, setMushroomId] = useState('');
  const [offerKind, setOfferKind] = useState<string>(BRAND.offers[0].kind);
  const [own, setOwn] = useState<{ url: string; name: string } | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const format = POST_FORMATS.find((f) => f.id === formatId)!;
  const mushroom = items?.find((v) => v.id === mushroomId) ?? items?.[0] ?? null;
  const offer = BRAND.offers.find((o) => o.kind === offerKind) ?? BRAND.offers[0];

  useEffect(() => {
    let alive = true;
    repo.loadPublicCatalog().then((v) => { if (alive) setItems(v); }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo]);
  useEffect(() => () => { if (own) URL.revokeObjectURL(own.url); }, [own]);

  // the photo: yours if you chose one, otherwise the catalogue's (with its author's name on it)
  const photoUrl = own?.url ?? (template !== 'offerta' ? mushroom?.photo?.url : undefined) ?? null;
  useEffect(() => {
    setPhoto(null); setPhotoNote(null);
    if (!photoUrl) return;
    let alive = true;
    loadImage(photoUrl, !own).then((img) => { if (alive) setPhoto(img); }, () => { if (alive) setPhotoNote('Questa foto non si carica: scegline una tua.'); });
    return () => { alive = false; };
  }, [photoUrl, own]);

  // the caption follows the choices; you can still change it before copying
  useEffect(() => { setText(caption(template, mushroom, offer)); }, [template, mushroom, offer]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let alive = true;
    Promise.all([
      loadImage(svgUrl(logoSvg(fonts, { layout: 'orizzontale', variant: 'colore', name, tagline }, 'post-logo').svg), false),
      loadImage(svgUrl(markSvg('colore', 'post-mark')), false),
    ]).then(([logo, mark]) => {
      if (!alive) return;
      c.width = format.width; c.height = format.height;
      drawPost(c.getContext('2d')!, {
        template, width: format.width, height: format.height, name: mushroom?.commonName ?? null,
        story: mushroom ? storyOf(mushroom.id) ?? null : null, offer, photo,
        credit: own ? null : mushroom?.photo?.credit ?? null, logo, mark,
      });
    }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [fonts, name, tagline, template, format, mushroom, offer, photo, own]);

  const save = () => {
    setError(null);
    try {
      canvas.current!.toBlob((b) => (b ? download(b, `post-${template}-${template === 'offerta' ? offer.kind : mushroom?.id ?? 'funghi'}.png`) : setError('Immagine non creata.')), 'image/png');
    } catch {
      setError('Il browser non permette di salvare questa immagine con la foto del catalogo: carica una tua foto.');
    }
  };
  const tpl = POST_TEMPLATES.find((t) => t.id === template)!;
  const bad = breaksRules(text);

  return (
    <div className="brand-section post-maker">
      <div className="post-controls">
        <fieldset>
          <legend>Che post</legend>
          {POST_TEMPLATES.map((t) => (
            <label key={t.id} className="choice"><input type="radio" name="tpl" checked={template === t.id} onChange={() => setTemplate(t.id)} /> {t.label}</label>
          ))}
          <p className="muted small">{tpl.note}</p>
        </fieldset>
        {template === 'offerta' ? (
          <label>Offerta
            <select value={offerKind} onChange={(e) => setOfferKind(e.target.value)}>
              {BRAND.offers.map((o) => <option key={o.kind} value={o.kind}>{o.name}</option>)}
            </select>
          </label>
        ) : (
          <label>Fungo
            <select value={mushroom?.id ?? ''} onChange={(e) => setMushroomId(e.target.value)} disabled={!items}>
              {items?.map((v) => <option key={v.id} value={v.id}>{v.commonName}</option>)}
            </select>
          </label>
        )}
        <label>Formato
          <select value={formatId} onChange={(e) => setFormatId(e.target.value as PostFormat)}>
            {POST_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.width}×{f.height})</option>)}
          </select>
        </label>
        {template !== 'offerta' && (
          <div className="post-photo">
            <label className="btn small">{own ? 'Cambia la tua foto' : 'Usa una tua foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setOwn({ url: URL.createObjectURL(f), name: f.name });
                e.target.value = '';
              }} />
            </label>
            {own
              ? <button className="linkbtn" type="button" onClick={() => setOwn(null)}>Torna alla foto del catalogo</button>
              : <span className="muted small">{mushroom?.photo ? `Foto del catalogo: ${mushroom.photo.credit} (il nome dell'autore resta sull'immagine)` : 'Nessuna foto nel catalogo per questo fungo.'}</span>}
            {photoNote && <span className="err small">{photoNote}</span>}
          </div>
        )}
        <label>Testo del post
          <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {bad && <p className="err" role="alert">Il testo contiene una parola da evitare: niente promesse sulla salute, e niente «compra» o «acquista» finché la vendita non parte.</p>}
        <div className="actions start">
          <button className="btn primary" type="button" onClick={save}>Scarica l'immagine</button>
          <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copiato' : 'Copia il testo'}</button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="post-preview">
        <canvas ref={canvas} width={format.width} height={format.height} aria-label="Anteprima del post" />
      </div>
    </div>
  );
}

// ---- Biglietto e volantino ----

type PrintKind = 'biglietti' | 'volantini';

function Prints({ fonts, name, tagline }: { fonts: LogoFonts; name: string; tagline: string }) {
  const [kind, setKind] = useState<PrintKind>('biglietti');
  const [email, setEmail] = useRemembered('brand-email', BRAND.email ?? '');
  const [phone, setPhone] = useRemembered('brand-phone', '');
  const [printing, setPrinting] = useState(false);
  const url = preorderUrl(location.origin, location.pathname);
  const sheet = (id: string) => <Sheet id={id} kind={kind} fonts={fonts} name={name} tagline={tagline} email={email} phone={phone} url={url} />;

  useEffect(() => {
    if (!printing) return;
    const style = document.createElement('style');
    style.textContent = `@page { size: A4 ${kind === 'volantini' ? 'landscape' : 'portrait'}; margin: 0 }`;
    document.head.appendChild(style);
    document.body.classList.add('printing');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); style.remove(); document.body.classList.remove('printing'); };
  }, [printing, kind]);

  return (
    <div className="brand-section">
      <div className="brand-row">
        <div className="seg" role="group" aria-label="Cosa stampare">
          <button type="button" aria-pressed={kind === 'biglietti'} onClick={() => setKind('biglietti')}>Biglietti da visita</button>
          <button type="button" aria-pressed={kind === 'volantini'} onClick={() => setKind('volantini')}>Volantini A5</button>
        </div>
        <button className="btn primary" type="button" onClick={() => setPrinting(true)}>Stampa o salva in PDF</button>
      </div>
      <div className="brand-names">
        <label>Email<input type="email" value={email} maxLength={80} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Telefono (facoltativo)<input type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <p className="muted">
        {kind === 'biglietti' ? '10 biglietti da 85×55 mm su un foglio A4, da ritagliare lungo le linee.' : '2 volantini A5 su un foglio A4 orizzontale, da tagliare a metà.'}
        {' '}Il QR code porta al questionario dei preordini: <span className="mono">{shortUrl(url)}</span>. Nella finestra di stampa scegli «dimensioni effettive» o «100%», non «adatta alla pagina».
      </p>
      <div className="sheet-preview" aria-label="Anteprima del foglio">{sheet('preview')}</div>
      {/* printed from a copy outside the app, with its own ids: the hidden preview can't lend it its masks */}
      {printing && createPortal(<div className="print-root">{sheet('print')}</div>, document.body)}
    </div>
  );
}

function Sheet({ id, kind, fonts, name, tagline, email, phone, url }: { id: string; kind: PrintKind; fonts: LogoFonts; name: string; tagline: string; email: string; phone: string; url: string }) {
  const qr = qrSvg(url).svg;
  if (kind === 'biglietti') {
    const logo = logoSvg(fonts, { layout: 'orizzontale', variant: 'colore', name, tagline }, `${id}-card`).svg;
    return (
      <div className="sheet cards">
        {Array.from({ length: 10 }, (_, i) => (
          <div className="card" key={i}>
            <Art className="card-logo" svg={logo} />
            <div className="card-foot">
              <div className="card-contacts">
                {email && <span>{email}</span>}
                {phone && <span>{phone}</span>}
                <span className="card-url">{shortUrl(url)}</span>
              </div>
              <div className="card-qr"><Art svg={qr} /><span>Preordina</span></div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  const logo = logoSvg(fonts, { layout: 'verticale', variant: 'colore', name, tagline }, `${id}-flyer`).svg;
  const flyer = (i: number) => (
    <div className="flyer" key={i}>
      <Art className="flyer-logo" svg={logo} />
      <span className="flyer-kicker">Funghi freschi di Cinquefrondi</span>
      <h1>Raccolti stamattina. Nel tuo piatto stasera.</h1>
      <p className="flyer-lead">Li coltivo io, con il rigore di un laboratorio, e li consegno il giorno stesso della raccolta. Per i ristoranti e le famiglie della Piana.</p>
      <div className="flyer-offers">
        {BRAND.offers.map((o) => (
          <div key={o.kind}>
            <span className="flyer-who">{o.who}</span>
            <b>{o.name}</b>
            <span>{o.promise}</span>
            <i>{o.guarantee}</i>
          </div>
        ))}
      </div>
      <div className="flyer-qr">
        <Art svg={qr} />
        <div>
          <b>Inquadra il codice e preordina senza impegno.</b>
          <span className="mono">{shortUrl(url)}</span>
          {email && <span>{email}</span>}
          {phone && <span>{phone}</span>}
        </div>
      </div>
      <p className="flyer-small">Preordini aperti: ti avviso io quando parte la vendita. I funghi coltivati freschi vanno consumati previa cottura.</p>
    </div>
  );
  return <div className="sheet flyers">{[0, 1].map(flyer)}</div>;
}

function Art({ svg, className }: { svg: string; className?: string }) {
  return <span className={`art ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ---- piccoli aiuti ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Immagine non caricata.'));
    img.src = src;
  });
}

async function svgToPng(svg: string, w: number, h: number, scale: number): Promise<Blob> {
  const img = await loadImage(svgUrl(svg), false);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG non creato.'))), 'image/png'));
}
