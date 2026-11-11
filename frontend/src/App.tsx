import { useEffect, useMemo, useState } from 'react';
import { withRefresh } from './data/refresh';
import { loadErrorText, type People, type Repo } from './data/repo';
import type { Farm } from './lib/plan';
import { todayInRome } from './lib/dates';
import { applyTheme, currentTheme, nextTheme, type Theme } from './lib/theme';
import { Login } from './ui/Login';
import { Overview } from './ui/Overview';
import { CropsPage } from './ui/CropsPage';
import { PlantingDetail } from './ui/PlantingDetail';
import { ProjectionsPage } from './ui/ProjectionsPage';
import { ExpensesPage } from './ui/ExpensesPage';
import { CalendarPage } from './ui/CalendarPage';
import { TasksPage } from './ui/TasksPage';
import { SettingsPage } from './ui/SettingsPage';
import { RulesPage } from './ui/RulesPage';
import { TeamModal } from './ui/TeamModal';
import { FunghiPage } from './ui/FunghiPage';
import { PublicCatalog } from './ui/PublicCatalog';
import { ChiSono } from './ui/ChiSono';
import { InterestForm } from './ui/InterestForm';
import { InterestsPage } from './ui/InterestsPage';
import { TABS, parseHash, publicPage, routeHash, type Route } from './lib/route';

export function App({ repo }: { repo: Repo }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const check = () => { repo.session().then(setUid, () => setUid(null)); };
    check();
    return repo.onAuthChange(check);
  }, [repo]);

  // the public pages: the catalogue for everyone, the login on #/accedi
  const [page, setPage] = useState(() => publicPage(location.hash));
  // every visit to the questionnaire starts it again, even from its own thank-you page
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    const on = () => { setPage(publicPage(location.hash)); setVisit((v) => v + 1); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const open = (hash: string) => { history.pushState(null, '', hash); setPage(publicPage(hash)); setVisit((v) => v + 1); window.scrollTo({ top: 0 }); };

  if (uid === undefined) return <div className="wrap"><p className="muted">Caricamento…</p></div>;
  if (page === 'chi-sono') return <ChiSono nav={{ page, signedIn: !!uid, open }} />;
  if (page === 'interesse') return <InterestForm key={visit} repo={repo} nav={{ page, signedIn: !!uid, open }} />;
  if (page === 'catalogo' || (!uid && page !== 'accedi')) {
    return <PublicCatalog repo={repo} nav={{ page: 'catalogo', signedIn: !!uid, open }} />;
  }
  if (!uid) return <Login repo={repo} onBack={() => open('#/catalogo')} />;
  return <SignedIn key={uid} repo={repo} />;
}

function SignedIn({ repo: base }: { repo: Repo }) {
  const [people, setPeople] = useState<People | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [team, setTeam] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  // every change made here reloads the data at once; realtime brings changes made elsewhere
  const repo = useMemo(() => withRefresh(base, () => setTick((t) => t + 1)), [base]);

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const off = repo.subscribe(() => { clearTimeout(pending); pending = setTimeout(() => setTick((t) => t + 1), 150); });
    const again = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { clearTimeout(pending); off(); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [repo]);

  useEffect(() => {
    let alive = true;
    Promise.all([repo.loadPeople(), repo.loadFarm()]).then(
      ([p, f]) => { if (alive) { setPeople(p); setFarm(f); setError(null); } },
      (e) => { if (alive) setError(loadErrorText(e)); },
    );
    return () => { alive = false; };
  }, [repo, tick]);

  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    const h = routeHash(r);
    if (location.hash !== h) history.pushState(null, '', h);
    setRoute(r);
    window.scrollTo({ top: 0 });
  };

  if (!people || !farm) return <div className="wrap"><p className={error ? 'err' : 'muted'}>{error || 'Caricamento del piano…'}</p></div>;
  const me = people.me;
  if (!me) return <div className="wrap"><p className="err">Questo login non ha un profilo. Chiedi all'admin di controllarlo.</p></div>;
  const isAdmin = me.role === 'admin' && me.active;
  const today = todayInRome();
  const props = { repo, farm, isAdmin, today, go };
  const planting = route.planting ? farm.plantings.find((p) => p.id === route.planting) : undefined;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="eyebrow">Cinquefrondi · Calabria</div>
          <h1>Piano agricolo</h1>
        </div>
        <div className="userbar">
          <span className="muted">{me.fullName}{!isAdmin && ' · sola lettura'}</span>
          <a className="btn" href="#/catalogo">Catalogo</a>
          {isAdmin && <button className="btn" type="button" onClick={() => setTeam(true)}>Persone</button>}
          <button className="btn" type="button" aria-label="Cambia tema" onClick={() => { const t = nextTheme(theme); applyTheme(t); setTheme(t); }}>{theme === 'dark' ? 'Chiaro' : 'Scuro'}</button>
          <button className="btn" type="button" onClick={() => repo.signOut()}>Esci</button>
        </div>
      </header>
      {repo.mode === 'demo' && <div className="banner">Demo: i dati restano in questa pagina e si perdono ricaricandola.</div>}
      {error && <div className="banner err" role="alert">{error}</div>}

      <nav className="maintabs" aria-label="Sezioni">
        {TABS.map((t) => (
          <a key={t.id} href={routeHash({ tab: t.id })} aria-current={route.tab === t.id ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go({ tab: t.id }); }}>{t.label}</a>
        ))}
      </nav>

      <main>
        {route.tab === 'panoramica' && <Overview {...props} />}
        {route.tab === 'coltivazioni' && (route.planting
          ? (planting ? <PlantingDetail {...props} planting={planting} /> : <div className="panel"><p className="empty">Questa coltura non è più nel piano.</p><div className="actions start"><button className="btn" type="button" onClick={() => go({ tab: 'coltivazioni' })}>Torna alle coltivazioni</button></div></div>)
          : <CropsPage {...props} />)}
        {route.tab === 'prospetti' && <ProjectionsPage {...props} />}
        {route.tab === 'spese' && <ExpensesPage {...props} />}
        {route.tab === 'calendario' && <CalendarPage {...props} filter={route.filter} />}
        {route.tab === 'task' && <TasksPage {...props} filter={route.filter} />}
        {route.tab === 'funghi' && <FunghiPage repo={repo} isAdmin={isAdmin} refreshKey={tick} />}
        {route.tab === 'richieste' && <InterestsPage repo={repo} isAdmin={isAdmin} refreshKey={tick} />}
        {route.tab === 'regolamenti' && <RulesPage repo={repo} me={me} profiles={people.profiles} refreshKey={tick} />}
        {route.tab === 'impostazioni' && <SettingsPage {...props} />}
      </main>

      {team && <TeamModal repo={repo} me={me} profiles={people.profiles} onClose={() => setTeam(false)} />}
    </div>
  );
}
