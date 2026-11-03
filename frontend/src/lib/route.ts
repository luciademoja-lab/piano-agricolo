// Navigation in the address bar, so a crop or a filtered calendar can be bookmarked and Back works.
export const TABS = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'coltivazioni', label: 'Coltivazioni' },
  { id: 'prospetti', label: 'Prospetti' },
  { id: 'spese', label: 'Spese' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'task', label: 'Task' },
  { id: 'funghi', label: 'Funghi' },
  { id: 'regolamenti', label: 'Regolamenti' },
  { id: 'impostazioni', label: 'Impostazioni' },
] as const;
export type TabId = (typeof TABS)[number]['id'];
/** Where we are: a tab, or one crop of the plan; `filter` narrows calendar and tasks to one crop. */
export type Route = { tab: TabId; planting?: string; filter?: string };

/** The pages anyone sees without signing in. */
export type PublicPage = 'catalogo' | 'accedi';
/** #/catalogo is public for everyone; #/accedi is the login. Signed out, any other address shows the catalogue. */
export function publicPage(hash: string): PublicPage | null {
  const first = decodeURIComponent(hash.replace(/^#/, '')).replace(/^\//, '').split(/[/?]/)[0];
  return first === 'catalogo' ? 'catalogo' : first === 'accedi' ? 'accedi' : null;
}

/** #/coltivazioni, #/coltura/<id>, #/calendario?coltura=<id>; a #rule-<id> link opens the Regolamenti. */
export function parseHash(hash: string): Route {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('rule-')) return { tab: 'regolamenti' };
  const [path, query] = h.replace(/^\//, '').split('?');
  const [first, second] = path.split('/');
  const filter = new URLSearchParams(query || '').get('coltura') || undefined;
  if (first === 'coltura' && second) return { tab: 'coltivazioni', planting: second };
  const tab = TABS.find((t) => t.id === first)?.id ?? 'panoramica';
  return { tab, ...(filter && { filter }) };
}
export function routeHash(r: Route): string {
  if (r.planting) return `#/coltura/${encodeURIComponent(r.planting)}`;
  return `#/${r.tab}${r.filter ? `?coltura=${encodeURIComponent(r.filter)}` : ''}`;
}

