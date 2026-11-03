import { useState, type FormEvent } from 'react';
import type { Repo } from '../data/repo';
import { errorText } from './errors';
import { Field } from './Modal';

export function Login({ repo, onBack }: { repo: Repo; onBack?: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await repo.signIn(username, password); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <div className="auth">
      <div>
        <div className="eyebrow">Cinquefrondi · Calabria</div>
        <h1>Piano agricolo</h1>
      </div>
      {onBack && <button className="linkbtn" type="button" onClick={onBack}>← Torna al catalogo</button>}
      <form className="card" onSubmit={submit}>
        <Field label="Nome utente" htmlFor="login-user">
          <input id="login-user" type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="login-pass">
          <input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions"><button className="btn primary" type="submit" disabled={busy}>Entra</button></div>
        {repo.mode === 'demo' && <p className="note">Demo: entra come <b>lucia</b> (admin) o <b>socio</b> (sola lettura), password <span className="mono">demo2026pass</span>. Niente viene salvato.</p>}
      </form>
    </div>
  );
}
