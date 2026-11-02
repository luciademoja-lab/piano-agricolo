import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createRepo } from './data';
import './styles.css';

const repo = createRepo();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {repo ? <App repo={repo} /> : (
      <div className="auth">
        <div><div className="eyebrow">Cinquefrondi · Calabria</div><h1>Piano agricolo</h1></div>
        <div className="banner err" role="alert">
          Il sito non è ancora collegato al suo database: mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nella build.
          Aggiungile nelle variabili d'ambiente (es. Vercel → Settings → Environment Variables) e rifai il deploy.
        </div>
      </div>
    )}
  </StrictMode>,
);
