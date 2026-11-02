import { useState } from 'react';
import type { Profile, Repo, Role } from '../data/repo';
import { generatePassword } from '../../../backend/supabase/functions/_shared/username.ts';
import { errorText } from './errors';
import { Field, Modal } from './Modal';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'created'; username: string; password: string } | { kind: 'reset'; person: Profile } | { kind: 'reset-done'; person: Profile; password: string };

/** L'admin crea nomi utente e password: per un socio, il CAA o un consulente in sola lettura. */
export function TeamModal({ repo, me, profiles, onClose }: { repo: Repo; me: Profile; profiles: Record<string, Profile>; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = Object.values(profiles).sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName));
  const go = (v: View) => { setError(null); setBusy(false); setView(v); };

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal label="Persone" wide onClose={onClose}>
      {view.kind === 'list' && (<>
        <div className="panel-head">
          <div><div className="eyebrow">Admin</div><h2>Persone</h2></div>
          <button className="btn primary" type="button" onClick={() => go({ kind: 'create' })}>Crea login</button>
        </div>
        <table>
          <thead><tr><th>Persona</th><th>Ruolo</th><th /></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.fullName} {!p.active && <span className="pill off">disattivato</span>}<span className="sub mono">{p.username}</span></td>
                <td>{p.role === 'admin' ? <span className="pill admin">admin</span> : <span className="pill">sola lettura</span>}</td>
                <td>
                  <span className="inline" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn small" type="button" onClick={() => go({ kind: 'reset', person: p })}>Nuova password</button>
                    {p.id !== me.id && (
                      <button className="btn small" type="button" disabled={busy} onClick={() => run(() => repo.updateProfile(p.id, p.fullName, p.role, !p.active))}>{p.active ? 'Disattiva' : 'Riattiva'}</button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions"><button className="btn" type="button" onClick={onClose}>Chiudi</button></div>
      </>)}

      {view.kind === 'create' && <CreateLogin repo={repo} onBack={() => go({ kind: 'list' })} onCreated={(username, password) => go({ kind: 'created', username, password })} />}

      {view.kind === 'created' && (<>
        <div><div className="eyebrow">Persone</div><h2>Login creato</h2><p className="note">Mandali alla persona in privato. La password non verrà più mostrata.</p></div>
        <Credentials username={view.username} password={view.password} />
        <div className="actions"><button className="btn primary" type="button" onClick={() => go({ kind: 'list' })}>Fatto</button></div>
      </>)}

      {view.kind === 'reset' && (
        <ResetPassword person={view.person} repo={repo} onBack={() => go({ kind: 'list' })} onDone={(password) => go({ kind: 'reset-done', person: view.person, password })} />
      )}

      {view.kind === 'reset-done' && (<>
        <div><div className="eyebrow">Persone</div><h2>Password cambiata</h2><p className="note">Manda la nuova password a {view.person.fullName} in privato.</p></div>
        <Credentials username={view.person.username} password={view.password} />
        <div className="actions"><button className="btn primary" type="button" onClick={() => go({ kind: 'list' })}>Fatto</button></div>
      </>)}
    </Modal>
  );
}

function Credentials({ username, password }: { username: string; password: string }) {
  const text = `Piano agricolo: ${location.origin}\nNome utente: ${username}\nPassword: ${password}`;
  const [copied, setCopied] = useState(false);
  return (<>
    <div className="creds" data-testid="credentials">{text}</div>
    <div className="actions" style={{ justifyContent: 'flex-start' }}>
      <button className="btn small" type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {}); }}>{copied ? 'Copiato' : 'Copia'}</button>
    </div>
  </>);
}

function CreateLogin({ repo, onBack, onCreated }: { repo: Repo; onBack: () => void; onCreated: (username: string, password: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await repo.createLogin({ username, fullName, password, role });
      onCreated(r.username, password);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (<>
    <div><div className="eyebrow">Persone</div><h2>Crea login</h2></div>
    <Field label="Nome completo" htmlFor="nl-name"><input id="nl-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} /></Field>
    <div className="fields two">
      <Field label="Nome utente" htmlFor="nl-user"><input id="nl-user" type="text" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="es. socio" /></Field>
      <Field label="Ruolo" htmlFor="nl-role">
        <select id="nl-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="viewer">Sola lettura (socio, CAA, consulente)</option><option value="admin">Admin</option>
        </select>
      </Field>
    </div>
    <Field label="Password" htmlFor="nl-pass">
      <div className="inline">
        <input id="nl-pass" type="text" className="mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button className="btn" type="button" onClick={() => setPassword(generatePassword())}>Genera</button>
      </div>
    </Field>
    <p className="note">Almeno 10 caratteri, con una lettera e un numero. Il nome utente usa lettere, numeri, punti e trattini.</p>
    {error && <p className="err" role="alert">{error}</p>}
    <div className="actions">
      <button className="btn" type="button" onClick={onBack}>Indietro</button>
      <button className="btn primary" type="button" disabled={busy} onClick={create}>Crea</button>
    </div>
  </>);
}

function ResetPassword({ person, repo, onBack, onDone }: { person: Profile; repo: Repo; onBack: () => void; onDone: (password: string) => void }) {
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (<>
    <div><div className="eyebrow">Persone</div><h2>Nuova password</h2><p className="note">Per {person.fullName} ({person.username}).</p></div>
    <Field label="Nuova password" htmlFor="rp-pass">
      <div className="inline">
        <input id="rp-pass" type="text" className="mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button className="btn" type="button" onClick={() => setPassword(generatePassword())}>Genera</button>
      </div>
    </Field>
    {error && <p className="err" role="alert">{error}</p>}
    <div className="actions">
      <button className="btn" type="button" onClick={onBack}>Indietro</button>
      <button className="btn primary" type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await repo.resetPassword(person.id, password); onDone(password); } catch (e) { setError(errorText(e)); setBusy(false); }
      }}>Cambia password</button>
    </div>
  </>);
}
