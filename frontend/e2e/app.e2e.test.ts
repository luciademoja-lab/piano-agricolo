// End-to-end tests: the built app (dist/) in demo mode, in a headless browser.
// Run with `npm run test:e2e` (builds first). Needs `npx playwright install chromium` once.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(process.env.PROJECT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..'), 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const PASSWORD = 'demo2026pass';

let server: Server, base = '', browser: Browser, page: Page;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    const file = join(DIST, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(await readFile(join(DIST, 'index.html')));
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise((r) => server?.close(r));
});

beforeEach(async () => {
  const ctx = await browser.newContext({ timezoneId: 'Europe/Rome', viewport: { width: 1280, height: 900 } });
  // fonts come from Google: not needed for the tests, and the test machine may be offline
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // photos come from Wikimedia Commons: the cards must stay readable when they do not load
  await ctx.route(/wikimedia\.org/, (r) => r.abort());
  page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(base);
});

async function signIn(username = 'lucia') {
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.getByLabel('Nome utente').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entra' }).click();
  await page.getByRole('heading', { name: 'Piano agricolo' }).waitFor();
}
const tab = (name: string) => page.getByRole('navigation', { name: 'Sezioni' }).getByRole('link', { name, exact: true });

async function openAdd(crop: string) {
  await tab('Coltivazioni').click();
  await page.getByRole('button', { name: '+ Aggiungi', exact: true }).click();
  await page.getByLabel('Coltura', { exact: true }).selectOption(crop);
}

describe('the public catalogue', () => {
  it('is the homepage, without signing in, as a provisional list and never a shop', async () => {
    await page.getByRole('heading', { name: 'Funghi raccolti stamattina.', level: 1 }).waitFor();
    await page.getByText('Listino provvisorio').waitFor();
    await page.getByText('preordini e manifestazioni di interesse').waitFor();
    const names = await page.locator('.shop-card h3').allInnerTexts();
    expect(names).toEqual(['Pleurotus (orecchione, gelone)', 'Cardoncello', 'Pioppino', 'Shiitake', 'Gialletto']);
    expect(await page.getByText(/acquista/i).count()).toBe(0);
    expect(await page.getByText(/Criniera di leone/).count()).toBe(0);
    await page.locator('.shop-card', { hasText: 'Cardoncello' }).getByText("17–25 giorni dall'ordine").waitFor();
    expect(await page.getByText('Prezzo in definizione').count()).toBe(4);
    const oyster = page.locator('.shop-card', { hasText: 'Pleurotus (orecchione, gelone)' });
    await oyster.getByText('€ 3,90/kg').waitFor();
    await oyster.getByText('€ 5,60/kg').waitFor();
    // without the photo the card keeps its letter, and the source of each photo is linked
    await page.locator('.shop-card', { hasText: 'Pioppino' }).locator('.shop-photo-none').waitFor();
    expect(await page.locator('.shop-photo figcaption a').first().getAttribute('href')).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  });
  it('shows what each mushroom brings, only with the claims the law allows', async () => {
    const oyster = page.locator('.shop-card', { hasText: 'Pleurotus (orecchione, gelone)' });
    for (const t of ['Poche calorie', 'Fonte di proteine', 'Fonte di fibre']) await oyster.locator('.shop-tags').getByText(t, { exact: true }).waitFor();
    await oyster.getByText('Valori e benefici').click();
    await oyster.getByText('Il folato contribuisce alla normale funzione del sistema immunitario.').waitFor();
    await oyster.getByText('33 kcal').waitFor();
    await page.getByText(/Una dieta varia ed equilibrata/).first().waitFor();
    // no data for the gialletto: no claims at all
    expect(await page.locator('.shop-card', { hasText: 'Gialletto' }).locator('.shop-tags, .shop-more').count()).toBe(0);
    expect(await page.locator('.shop').getByText(/difese immunitarie|antitumoral|colesterolo/i).count()).toBe(0);
  });
  it('has a Chi sono page with the degrees, the method and no claim of being authorised', async () => {
    await page.getByRole('navigation', { name: 'Pagine' }).getByRole('link', { name: 'Chi sono' }).click();
    await page.getByRole('heading', { name: 'Lucia De Mojà', level: 1 }).waitFor();
    await page.getByText('Laurea magistrale in Biologia Molecolare').waitFor();
    await page.getByText('Högskolan i Skövde, Svezia').waitFor();
    await page.getByText(/Una laurea non è un'autorizzazione/).waitFor();
    // the story appears only once it is written in Lucia's words
    expect(await page.getByRole('heading', { name: 'La mia storia' }).count()).toBe(0);
    await page.getByRole('navigation', { name: 'Pagine' }).getByRole('link', { name: 'Funghi' }).click();
    await page.locator('.shop-card').first().waitFor();
  });
  it('fits a phone screen without sideways scrolling', async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.locator('.shop-card').first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.goto(base + '#/chi-sono');
    await page.getByText('Il metodo del laboratorio, in cantina').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
  it('shows the prices the admin publishes', async () => {
    await signIn();
    await tab('Funghi').click();
    const row = page.locator('tr[data-variety="pioppino"]');
    await row.getByText('Non conveniente').waitFor();
    await row.getByRole('button', { name: 'Listino' }).click();
    await page.getByLabel('Ristoranti (€/kg)').fill('18,50');
    await page.getByLabel('Privati (€/kg)').fill('26');
    await page.getByRole('button', { name: 'Pubblica' }).click();
    await row.getByText('€ 18,50 / € 26,00').waitFor();
    await page.getByRole('link', { name: 'Apri il catalogo pubblico' }).click();
    const card = page.locator('.shop-card', { hasText: 'Pioppino' });
    await card.getByText('€ 18,50/kg').waitFor();
    await card.getByText('€ 26,00/kg').waitFor();
    await card.getByText('prezzo provvisorio').waitFor();
  });
});

describe('signing in', () => {
  it('starts with an empty plan', async () => {
    await signIn();
    await page.getByText('Il piano è vuoto.').waitFor();
    expect(await tab('Panoramica').getAttribute('aria-current')).toBe('page');
  });
  it('rejects a wrong password', async () => {
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.getByLabel('Nome utente').fill('lucia');
    await page.getByLabel('Password').fill('sbagliata-123');
    await page.getByRole('button', { name: 'Entra' }).click();
    await page.getByText('Nome utente o password sbagliati.').waitFor();
  });
});

describe('Coltivazioni > Aggiungi', () => {
  it('adds a crop with Enter and opens its projections, expenses and calendar', async () => {
    await signIn();
    await openAdd('microgreens');
    await page.getByLabel(/m² da assegnare/).fill('1,5'.replace(',', '.'));
    await page.getByLabel('Spazio interno totale disponibile (m²)').fill('6');
    await page.getByLabel(/m² da assegnare/).press('Enter');
    await page.getByRole('heading', { name: 'Microgreens', level: 2 }).waitFor();
    await page.getByRole('heading', { name: 'Prospetto da 1 mese a 3 anni' }).waitFor();
    await page.getByText('Investimento iniziale — Microgreens').waitFor();
    expect(await page.locator('.calendar .chip.task.todo').count()).toBeGreaterThan(0);
    expect(await page.locator('.pchart svg').count()).toBe(1);
  });

  it('only offers start dates inside the crop window', async () => {
    await signIn();
    await openAdd('zafferano');
    const date = page.getByLabel(/Data di inizio/);
    const [min, max] = [await date.getAttribute('min'), await date.getAttribute('max')];
    expect(min!.slice(5)).toBe('08-01');
    expect(max!.slice(5)).toBe('09-15');
    // a date typed outside the window is refused with the reason
    await page.getByLabel(/m² da assegnare/).fill('100');
    await date.fill(`${min!.slice(0, 4)}-10-01`);
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click();
    await page.getByText('Zafferano non si può avviare in questa data: è fuori dalla finestra di avvio.').waitFor();
    // the next period moves the date range
    const period = page.getByLabel('Periodo di avvio');
    const current = await period.evaluate((el) => (el as HTMLSelectElement).selectedIndex);
    expect(await period.locator('option').nth(current).innerText()).toMatch(/il prossimo/);
    await period.selectOption({ index: current + 1 });
    expect(Number((await date.getAttribute('min'))!.slice(0, 4))).toBe(Number(min!.slice(0, 4)) + 1);
  });

  it('refuses more space than is left', async () => {
    await signIn();
    await openAdd('orto-eterno');
    await page.getByLabel(/m² da assegnare/).fill('1200');
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click();
    await page.getByText('Spazio esterno insufficiente: ne restano 1.000 m² su 1.000.').waitFor();
  });

  it('asks for the number of hens for the hen house', async () => {
    await signIn();
    await openAdd('pollaio');
    await page.getByLabel(/m² da assegnare/).fill('50');
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click();
    await page.getByText('Indica il numero di capi (almeno 1).').waitFor();
    await page.getByLabel('Numero di galline').fill('6');
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click();
    await page.getByRole('heading', { name: 'Pollaio da reddito', level: 2 }).waitFor();
    await page.getByText('6 capi su 50 m²').waitFor();
  });
});

describe('the calendar', () => {
  it('shows tasks not done in red and done in green, and ticks them with a click', async () => {
    await signIn();
    await openAdd('orto-eterno');
    await page.getByLabel(/m² da assegnare/).fill('250');
    await page.getByLabel(/m² da assegnare/).press('Enter');
    await page.getByRole('heading', { name: 'Orto eterno (no-dig)', level: 2 }).waitFor();
    await tab('Calendario').click();
    const first = page.locator('.cal-grid .chip.task').first();
    await expect.poll(() => first.getAttribute('class')).toContain('todo');
    const color = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    expect(await color('.cal-grid .chip.task.todo')).toBe('rgb(198, 40, 40)');
    await first.click();
    await page.locator('.cal-grid .chip.task.done').first().waitFor();
    expect(await color('.cal-grid .chip.task.done')).toBe('rgb(30, 123, 62)');
  });
});

describe('Regolamenti', () => {
  it('starts with the PDF schema as a rule to confirm', async () => {
    await signIn();
    await tab('Regolamenti').click();
    const card = page.locator('article', { has: page.getByRole('heading', { name: 'Schema operativo coltivazioni (Rendita Agricola)' }) });
    await card.waitFor();
    expect(await card.locator('.rule-status').innerText()).toMatch(/da confermare/i);
    expect(await card.locator('table').count()).toBe(1);
  });
});

describe('Funghi (staff)', () => {
  it('lists every variety with its cost, flags the unsellable ones and keeps a source on each parameter', async () => {
    await signIn();
    await tab('Funghi').click();
    expect(await page.locator('.funghi-table tbody tr').count()).toBe(8);
    await page.locator('tr[data-variety="hericium"]').getByText("Non nell'elenco vendibili").waitFor();
    await page.locator('tr[data-variety="hericium"]').getByText(/Mancano: peso della balla/).waitFor();
    await page.locator('li[data-param="energy_eur_kwh"]').getByText(/ARERA/).waitFor();
    // a change to a parameter needs a source, and moves the prices
    const before = await page.locator('tr[data-variety="cardoncello"] td.mono b').first().innerText();
    const p = page.locator('li[data-param="margin_wholesale_pct"]');
    await p.getByRole('button', { name: 'Modifica' }).click();
    await p.getByLabel(/Margine all'ingrosso/).fill('10');
    await p.getByLabel('Fonte', { exact: true }).fill('');
    await p.getByRole('button', { name: 'Salva' }).click();
    await p.getByText(/Indica la fonte/).waitFor();
    await p.getByLabel('Fonte', { exact: true }).fill('Prova');
    await p.getByRole('button', { name: 'Salva' }).click();
    await p.getByText('Prova').waitFor();
    expect(await page.locator('tr[data-variety="cardoncello"] td.mono b').first().innerText()).not.toBe(before);
  });
  it('refuses to put an unsellable species in the public catalogue', async () => {
    await signIn();
    await tab('Funghi').click();
    await page.locator('tr[data-variety="hericium"]').getByRole('button', { name: 'Dettagli' }).click();
    await page.getByText('Nome, cucina e vendita').click();
    await page.getByLabel('Nel catalogo pubblico').check();
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByRole('alert').getByText(/non può stare nel catalogo pubblico/).waitFor();
  });
});

describe('read-only login', () => {
  it('sees the plan and cannot change it', async () => {
    await signIn('socio');
    await tab('Coltivazioni').click();
    await page.getByRole('heading', { name: 'Catalogo' }).waitFor();
    expect(await page.getByRole('button', { name: '+ Aggiungi', exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Persone' }).count()).toBe(0);
  });
});
