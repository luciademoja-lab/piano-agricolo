// Regolamenti: leggi, regole e fonti del progetto. Tutti li leggono; l'admin li modifica qui o con il proprio Claude
// ("Aggiorna con Claude": copia, incolla in Claude, incolla la risposta). Vedi lib/rules.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Profile, Repo } from '../data/repo';
import { sanitizeHtml } from '../lib/richtext';
import {
  FILE_MAX, LOG_LABEL, RULE_BODY_MAX, RULE_STATUSES, RULE_STATUS_LABEL, exportForClaude, fileRefs, highlight, isImage, isVideo, orderedSections,
  parseClaudeReply, previewChanges, searchRules, slugify, snippet, uniqueId, withFileRefs, withFileUrls,
  type PreviewItem, type Rule, type RuleChange, type RuleStatus, type Rules,
} from '../lib/rules';
import { Field, Modal } from './Modal';
import { RichTextEditor } from './RichTextEditor';
import { errorText } from './errors';
import { rulesSeed } from '../data/rulesSeed';

const ROME = 'Europe/Rome';
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ROME });
const timeLabel = (ms: number) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const anchor = (id: string) => 'rule-' + id;

type Dialog = { kind: 'edit'; rule: Rule | null; section?: string } | { kind: 'sections' } | { kind: 'claude' } | { kind: 'history' } | null;

export function RulesPage({ repo, me, profiles, refreshKey }: { repo: Repo; me: Profile; profiles: Record<string, Profile>; refreshKey: unknown }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showOutdated, setShowOutdated] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const isAdmin = me.role === 'admin' && me.active;

  useEffect(() => {
    let alive = true;
    repo.loadRules().then((r) => { if (alive) { setRules(r); setError(null); } }, (e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [repo, refreshKey]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  // signed links for the files the rules use (they last a few hours; reloading the page renews them)
  const needed = useMemo(() => (rules ? [...new Set(rules.rules.flatMap((r) => fileRefs(r.body)))] : []), [rules]);
  const missing = needed.filter((p) => !(p in urls));
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    repo.ruleFileUrls(missing).then((u) => { if (alive) setUrls((old) => ({ ...old, ...Object.fromEntries(missing.map((p) => [p, ''])), ...u })); }, () => {});
    return () => { alive = false; };
  }, [repo, missing.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // a link to one rule (#rule-<id>) opens it
  const scrolled = useRef(false);
  useEffect(() => {
    if (!rules || scrolled.current) return;
    scrolled.current = true;
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (id.startsWith('rule-')) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, [rules]);

  const searching = q.trim().length > 0;
  const shown = useMemo(() => (rules ? new Set(searchRules(rules, q, showOutdated).map((r) => r.id)) : new Set<string>()), [rules, q, showOutdated]);
  const sections = useMemo(() => (rules ? orderedSections(rules).map((s) => ({ ...s, rules: s.rules.filter((r) => shown.has(r.id)) })) : []), [rules, shown]);
  const outdatedCount = rules ? rules.rules.filter((r) => r.status === 'outdated').length : 0;
  const toConfirm = rules ? rules.rules.filter((r) => r.status === 'to_confirm').length : 0;
  const lastChange = rules?.log[0];

  const jump = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', '#' + id); };
  const copyLink = async (r: Rule) => {
    const link = `${location.origin}${location.pathname}#${anchor(r.id)}`;
    try { await navigator.clipboard.writeText(link); setToast(`Link a “${r.title}” copiato.`); } catch { setToast(link); }
  };
  const apply = useCallback(async (changes: RuleChange[], via: 'editor' | 'claude') => {
    const res = await repo.applyRuleChanges(changes, via);
    const parts = [res.created && `${res.created} aggiunte`, res.changed && `${res.changed} cambiate`, res.deleted && `${res.deleted} cancellate`].filter(Boolean);
    setToast(parts.length ? `Regolamenti aggiornati: ${parts.join(', ')}.` : 'Niente da cambiare.');
    setRules(await repo.loadRules());
  }, [repo]);

  return (
    <section className="rules" aria-labelledby="rules-h">
      <div className="panel-head">
        <div><div className="eyebrow">Progetto</div><h2 id="rules-h">Regolamenti</h2></div>
        <div className="rules-actions">
          <button className="btn" type="button" onClick={() => setDialog({ kind: 'history' })}>Storico</button>
          {isAdmin && <>
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'sections' })}>Sezioni</button>
            <button className="btn" type="button" onClick={() => setDialog({ kind: 'claude' })}>✦ Aggiorna con Claude</button>
            <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'edit', rule: null })}>+ Nuova regola</button>
          </>}
        </div>
      </div>
      <p className="note">
        Cosa dicono leggi, uffici e fonti, in un posto solo. <span className="st-dot confirmed" /> Confermata per iscritto · <span className="st-dot to_confirm" /> Da confermare con l'ufficio giusto
        {lastChange && <> · ultima modifica {timeLabel(lastChange.at)}</>}
        {!isAdmin && '. Solo l’admin può cambiare questa pagina.'}
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      {!rules && !error && <p className="muted">Caricamento…</p>}

      {rules && (<>
        <div className="rules-search">
          <input type="search" placeholder="Cerca: IVA, uova, humus, bando, SIAN…" aria-label="Cerca nei regolamenti" value={q} onChange={(e) => setQ(e.target.value)} />
          {outdatedCount > 0 && (
            <label className="check"><input type="checkbox" checked={showOutdated} onChange={(e) => setShowOutdated(e.target.checked)} /> Mostra superate ({outdatedCount})</label>
          )}
          <span className="note" aria-live="polite">{searching ? `${shown.size} ${shown.size === 1 ? 'regola trovata' : 'regole trovate'}` : `${shown.size} regole${toConfirm ? ` · ${toConfirm} da confermare` : ''}`}</span>
        </div>

        <div className="rules-layout">
          <nav className="rules-menu" aria-label="Sezioni dei regolamenti">
            <details open={typeof window === 'undefined' || window.innerWidth > 820}>
              <summary>Sezioni</summary>
              <ol>
                {sections.filter((s) => s.rules.length || !searching).map((s) => (
                  <li key={s.id}>
                    <button type="button" className="rules-menu-sec" onClick={() => jump('sec-' + s.id)}>{s.title} <span className="count">{s.rules.length}</span></button>
                    {s.rules.length > 0 && (
                      <ol>{s.rules.map((r) => (
                        <li key={r.id}><button type="button" className={'rules-menu-rule st-' + r.status} onClick={() => jump(anchor(r.id))}>
                          {highlight(r.title, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
                        </button></li>
                      ))}</ol>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </nav>

          <div className="rules-content">
            {searching && !shown.size && <p className="empty">Nessuna regola per “{q.trim()}”. Prova un'altra parola{outdatedCount && !showOutdated ? ', o mostra le regole superate' : ''}.</p>}
            {!rules.sections.length && (
              <div className="panel">
                <p className="empty">Ancora nessuna regola.{isAdmin && ' Inizia con “+ Nuova regola” o “Aggiorna con Claude”, o carica la prima versione.'}</p>
                {isAdmin && (
                  <div className="actions start">
                    <button className="btn primary" type="button" onClick={() => apply(rulesSeed(), 'editor').catch((e) => setError(errorText(e)))}>
                      Carica la prima versione (schema PDF e regole trovate il 2 novembre)
                    </button>
                  </div>
                )}
              </div>
            )}
            {sections.filter((s) => s.rules.length || (!searching && isAdmin)).map((s) => (
              <section key={s.id} className="rules-section" id={'sec-' + s.id} aria-labelledby={'sec-h-' + s.id}>
                <div className="rules-section-head">
                  <h3 id={'sec-h-' + s.id}>{s.title}</h3>
                  {isAdmin && !searching && <button type="button" className="linkbtn" onClick={() => setDialog({ kind: 'edit', rule: null, section: s.id })}>+ Aggiungi una regola qui</button>}
                </div>
                {!s.rules.length && <p className="empty">Nessuna regola in questa sezione.</p>}
                {s.rules.map((r) => (
                  <RuleCard key={r.id} rule={r} q={q} urls={urls} searching={searching} canEdit={isAdmin}
                    editor={r.updatedBy ? profiles[r.updatedBy]?.fullName : undefined}
                    onTag={(t) => setQ(t)} onCopyLink={() => copyLink(r)} onEdit={() => setDialog({ kind: 'edit', rule: r })} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </>)}

      {rules && dialog?.kind === 'edit' && (
        <RuleEditor repo={repo} rules={rules} rule={dialog.rule} section={dialog.section} urls={urls} onUrls={(u) => setUrls((o) => ({ ...o, ...u }))}
          onClose={() => setDialog(null)} onSave={(changes) => apply(changes, 'editor')} />
      )}
      {rules && dialog?.kind === 'sections' && <SectionsEditor rules={rules} onClose={() => setDialog(null)} onSave={(changes) => apply(changes, 'editor')} />}
      {rules && dialog?.kind === 'claude' && <ClaudeUpdate rules={rules} onClose={() => setDialog(null)} onApply={(changes) => apply(changes, 'claude')} />}
      {rules && dialog?.kind === 'history' && <RulesHistory rules={rules} profiles={profiles} onClose={() => setDialog(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}

function Marked({ text, q }: { text: string; q: string }) {
  return <>{highlight(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

function RuleBody({ html, urls }: { html: string; urls: Record<string, string> }) {
  const shown = useMemo(() => withFileUrls(sanitizeHtml(html, { media: true }), urls), [html, urls]);
  return <div className="richtext rules-body" dangerouslySetInnerHTML={{ __html: shown }} />;
}

function RuleCard({ rule: r, q, urls, searching, canEdit, editor, onTag, onCopyLink, onEdit }: {
  rule: Rule; q: string; urls: Record<string, string>; searching: boolean; canEdit: boolean; editor?: string;
  onTag: (t: string) => void; onCopyLink: () => void; onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const full = !searching || open;
  return (
    <article className={'rule-card st-' + r.status} id={anchor(r.id)} aria-labelledby={anchor(r.id) + '-h'}>
      <div className="rule-head">
        <h4 id={anchor(r.id) + '-h'}><Marked text={r.title} q={q} /></h4>
        <span className={'pill rule-status ' + r.status}>{RULE_STATUS_LABEL[r.status]}</span>
        <span className="rule-tools">
          <button type="button" className="rte-btn" title="Copia il link a questa regola" aria-label={`Copia il link a “${r.title}”`} onClick={onCopyLink}>🔗</button>
          {canEdit && <button type="button" className="btn small" onClick={onEdit}>Modifica</button>}
        </span>
      </div>
      {full ? <RuleBody html={r.body} urls={urls} /> : <p className="rule-snippet"><Marked text={snippet(r, q)} q={q} /></p>}
      <div className="rule-foot">
        {searching && <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Mostra meno' : 'Mostra tutta la regola'}</button>}
        {r.tags.map((t) => <button key={t} type="button" className="linkbtn tagbtn" onClick={() => onTag(t)}>#{t}</button>)}
        <span className="sub">
          {r.source && (r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Fonte: {r.source}</a> : <>Fonte: {r.source}</>)}
          {r.source && ' · '}Aggiornata il {dateLabel(r.updatedAt)}{editor ? ` da ${editor.split(' ')[0]}` : ''}
        </span>
      </div>
    </article>
  );
}

function RuleEditor({ repo, rules, rule, section, urls, onUrls, onClose, onSave }: {
  repo: Repo; rules: Rules; rule: Rule | null; section?: string; urls: Record<string, string>;
  onUrls: (u: Record<string, string>) => void; onClose: () => void; onSave: (changes: RuleChange[]) => Promise<void>;
}) {
  const sections = orderedSections(rules);
  const NEW = '__new__';
  const [title, setTitle] = useState(rule?.title ?? '');
  const [sec, setSec] = useState(rule?.section ?? section ?? sections[0]?.id ?? NEW);
  const [newSec, setNewSec] = useState('');
  const [status, setStatus] = useState<RuleStatus>(rule?.status ?? 'to_confirm');
  const [tags, setTags] = useState(rule?.tags.join(', ') ?? '');
  const [source, setSource] = useState(rule?.source ?? '');
  const [sourceUrl, setSourceUrl] = useState(rule?.sourceUrl ?? '');
  const linkMap = useRef<Record<string, string>>({ ...urls });
  const [initial] = useState(() => withFileUrls(sanitizeHtml(rule?.body ?? '', { media: true }), urls));
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function uploadFile(file: File): Promise<string> {
    if (file.size > FILE_MAX) throw new Error(`“${file.name}” è troppo grande (100 MB al massimo).`);
    if (!/^(image|video)\//.test(file.type) && file.type !== 'application/pdf') throw new Error(`“${file.name}”: si possono aggiungere solo immagini, video e PDF.`);
    const name = file.name || (file.type.startsWith('image/') ? 'screenshot.png' : 'file');
    const path = await repo.uploadRuleFile(file, name);
    const got = await repo.ruleFileUrls([path]);
    linkMap.current = { ...linkMap.current, ...got };
    onUrls(got);
    const url = got[path] || '';
    if (file.type.startsWith('image/') || isImage(path)) return `<p><img src="${esc(url)}" alt="${esc(name.replace(/\.[^.]+$/, ''))}"></p><p><br></p>`;
    if (file.type.startsWith('video/') || isVideo(path)) return `<p><video src="${esc(url)}" controls></video></p><p><br></p>`;
    return `<a href="${esc(url)}">${esc(name)}</a>&nbsp;`;
  }

  async function save() {
    setErr(null);
    const t = title.trim();
    if (!t) return setErr('Dai un titolo alla regola.');
    const changes: RuleChange[] = [];
    let secId = sec;
    if (sec === NEW) {
      const n = newSec.trim();
      if (!n) return setErr('Dai un nome alla nuova sezione.');
      secId = uniqueId(slugify(n), rules.sections.map((s) => s.id));
      changes.push({ op: 'upsert_section', id: secId, title: n });
    }
    const html = sanitizeHtml(withFileRefs(body, linkMap.current), { media: true });
    if (html.length > RULE_BODY_MAX) return setErr('Il testo è troppo lungo. Dividilo in due regole.');
    const url = sourceUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) return setErr('Il link della fonte deve iniziare con https://');
    changes.push({
      op: 'upsert_rule', id: rule?.id ?? uniqueId(slugify(t), rules.rules.map((r) => r.id)), section: secId, title: t, body: html, status,
      tags: tags.split(/[,#]/).map((x) => x.trim().toLowerCase()).filter(Boolean), source: source.trim(), source_url: url || null,
    });
    setBusy(true);
    try { await onSave(changes); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  }
  async function remove() {
    if (!rule) return;
    setBusy(true);
    try { await onSave([{ op: 'delete_rule', id: rule.id }]); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} wide label={rule ? `Modifica “${rule.title}”` : 'Nuova regola'} className="rule-modal">
      <h2>{rule ? 'Modifica regola' : 'Nuova regola'}</h2>
      <Field label="Titolo" htmlFor="rule-title"><input id="rule-title" type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="es. Esonero IVA" /></Field>
      <div className="fields">
        <Field label="Sezione" htmlFor="rule-sec">
          <select id="rule-sec" value={sec} onChange={(e) => setSec(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            <option value={NEW}>+ Nuova sezione…</option>
          </select>
        </Field>
        {sec === NEW && <Field label="Nuova sezione" htmlFor="rule-newsec"><input id="rule-newsec" type="text" maxLength={80} value={newSec} onChange={(e) => setNewSec(e.target.value)} /></Field>}
        <Field label="Stato" htmlFor="rule-status">
          <select id="rule-status" value={status} onChange={(e) => setStatus(e.target.value as RuleStatus)}>
            {RULE_STATUSES.map((s) => <option key={s} value={s}>{RULE_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Tag (separati da virgola)" htmlFor="rule-tags"><input id="rule-tags" type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="iva, fisco" /></Field>
      </div>
      <div className="field">
        <label htmlFor="rule-body">Text</label>
        <RichTextEditor id="rule-body" label="Testo della regola" value={initial} onChange={setBody} max={RULE_BODY_MAX} onUpload={uploadFile}
          placeholder="Cosa dice, passo per passo. Incolla o trascina qui foto, PDF e video, o usa 📎." />
      </div>
      <div className="fields two">
        <Field label="Fonte: chi lo dice, dove, quando" htmlFor="rule-source"><input id="rule-source" type="text" maxLength={300} value={source} onChange={(e) => setSource(e.target.value)} placeholder="SIAN ASP Reggio Calabria, email del 10 nov" /></Field>
        <Field label="Link della fonte" htmlFor="rule-url"><input id="rule-url" type="text" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></Field>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        {rule && (confirmDelete
          ? <><span className="note">Cancellarla per tutti?</span><button className="btn danger" type="button" disabled={busy} onClick={remove}>Sì, cancella</button></>
          : <button className="btn danger" type="button" disabled={busy} onClick={() => setConfirmDelete(true)} title="Meglio “Superata” per tenere visibile cosa è cambiato">Cancella</button>)}
        <span className="spacer" />
        <button className="btn" type="button" onClick={onClose}>Annulla</button>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </Modal>
  );
}

function SectionsEditor({ rules, onClose, onSave }: { rules: Rules; onClose: () => void; onSave: (changes: RuleChange[]) => Promise<void> }) {
  const counts = Object.fromEntries(rules.sections.map((s) => [s.id, rules.rules.filter((r) => r.section === s.id).length]));
  const [list, setList] = useState(() => orderedSections(rules).map((s) => ({ id: s.id, title: s.title, isNew: false, gone: false })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const set = (i: number, p: Partial<(typeof list)[number]>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function save() {
    setErr(null);
    if (list.some((s) => !s.gone && !s.title.trim())) return setErr('Ogni sezione ha bisogno di un nome.');
    const taken = rules.sections.map((s) => s.id);
    const changes: RuleChange[] = [];
    list.filter((s) => !s.gone).forEach((s, i) => {
      const id = s.isNew ? uniqueId(slugify(s.title), taken) : s.id;
      if (s.isNew) taken.push(id);
      changes.push({ op: 'upsert_section', id, title: s.title.trim(), position: i + 1 });
    });
    list.filter((s) => s.gone && !s.isNew).forEach((s) => changes.push({ op: 'delete_section', id: s.id }));
    setBusy(true);
    try { await onSave(changes); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} label="Sezioni" className="sections-modal">
      <h2>Sections</h2>
      <p className="note">Il menu dei Regolamenti, in quest'ordine. Una sezione si può cancellare quando non ha più regole.</p>
      <ol className="sections-list">
        {list.map((s, i) => !s.gone && (
          <li key={s.id + i}>
            <input type="text" aria-label="Nome della sezione" value={s.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} />
            <button type="button" className="rte-btn" aria-label={`Move ${s.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="rte-btn" aria-label={`Move ${s.title} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="rte-btn" aria-label={`Delete ${s.title}`} disabled={!s.isNew && counts[s.id] > 0}
              title={!s.isNew && counts[s.id] > 0 ? `Ha ${counts[s.id]} regole: spostale o cancellale prima` : 'Cancella'} onClick={() => set(i, { gone: true })}>✕</button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => setList((l) => [...l, { id: 'new-' + l.length, title: '', isNew: true, gone: false }])}>+ Aggiungi una sezione</button>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button className="btn" type="button" onClick={onClose}>Annulla</button>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </Modal>
  );
}

const KIND_LABEL: Record<PreviewItem['kind'], string> = {
  added: 'Nuova regola', changed: 'Cambiata', deleted: 'Cancellata', unchanged: 'Nessun cambiamento',
  section_added: 'Nuova sezione', section_changed: 'Sezione cambiata', section_deleted: 'Sezione cancellata',
};

function ClaudeUpdate({ rules, onClose, onApply }: { rules: Rules; onClose: () => void; onApply: (changes: RuleChange[]) => Promise<void> }) {
  const [request, setRequest] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseClaudeReply> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = () => exportForClaude(rules, request, new Date().toISOString().slice(0, 10));

  async function copy() {
    const t = text();
    try { await navigator.clipboard.writeText(t); setCopied('Copiato. Ora incollalo in Claude.'); }
    catch {
      const blob = new Blob([t], { type: 'text/markdown' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vik-rules-for-claude.md'; a.click();
      setCopied('Il browser non ha permesso di copiare, quindi è stato scaricato come file: allegalo a Claude.');
    }
  }
  function check() {
    setErr(null); setParsed(null);
    try { setParsed(parseClaudeReply(answer)); } catch (e) { setErr((e as Error).message); }
  }
  const preview = parsed ? previewChanges(rules, parsed.changes) : [];
  const real = preview.filter((p) => p.kind !== 'unchanged');
  const problems = preview.filter((p) => p.problem);

  async function apply() {
    if (!parsed) return;
    setBusy(true); setErr(null);
    try { await onApply(parsed.changes); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} wide label="Aggiorna con Claude" className="claude-modal">
      <h2>✦ Aggiorna con Claude</h2>
      <p className="note">Usa il tuo Claude (claude.ai o l'app): niente da installare. Non cambia niente finché non premi “Applica”.</p>
      <ol className="claude-steps">
        <li>
          <h3>Scrivi cosa è cambiato e copia</h3>
          <textarea rows={3} aria-label="Cosa è cambiato" value={request} onChange={(e) => setRequest(e.target.value)}
            placeholder="es. Il SIAN ha risposto per email il 10 novembre: i microgreens venduti vivi non sono germogli. (Facoltativo: puoi dirlo a Claude anche nella chat.)" />
          <div className="actions start"><button className="btn primary" type="button" onClick={copy}>Copia per Claude</button>{copied && <span className="note" role="status">✓ {copied}</span>}</div>
        </li>
        <li>
          <h3>Incollalo in Claude e invia</h3>
          <p className="note">Va bene qualsiasi chat con Claude. Puoi allegare la risposta dell'ufficio (email o PDF): Claude ne ricava le modifiche.</p>
          <div className="actions start"><a className="btn" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Apri Claude ↗</a></div>
        </li>
        <li>
          <h3>Incolla qui la risposta di Claude</h3>
          <textarea rows={6} aria-label="Risposta di Claude" value={answer} onChange={(e) => { setAnswer(e.target.value); setParsed(null); }}
            placeholder="Incolla tutta la risposta (con il blocco di codice json)." className="mono" />
          <div className="actions start"><button className="btn" type="button" disabled={!answer.trim()} onClick={check}>Controlla le modifiche</button></div>
        </li>
      </ol>
      {err && <p className="err" role="alert">{err}</p>}
      {parsed && (
        <div className="claude-preview" aria-live="polite">
          {parsed.summary && <p><b>Claude:</b> {parsed.summary}</p>}
          {parsed.questions.length > 0 && (
            <div className="callout"><b>Claude ha delle domande</b> (rispondi nella chat, poi incolla la nuova risposta):<ul>{parsed.questions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}
          {real.length ? (
            <ul className="preview-list">
              {real.map((p, i) => (
                <li key={i} className={'pv-' + p.kind + (p.problem ? ' pv-problem' : '')}>
                  <span className="pill">{KIND_LABEL[p.kind]}</span> <b>{p.title}</b>
                  {p.details.length > 0 && <span className="sub"> · {p.details.join(' · ')}</span>}
                  {p.problem && <div className="err">{p.problem}</div>}
                </li>
              ))}
            </ul>
          ) : <p className="empty">Nessuna modifica in questa risposta.</p>}
          {problems.length > 0 && <p className="err">Prima sistema questi: chiedi a Claude di correggerli, poi incolla la nuova risposta.</p>}
        </div>
      )}
      <div className="actions">
        <button className="btn" type="button" onClick={onClose}>Chiudi</button>
        <button className="btn primary" type="button" disabled={!parsed || !real.length || problems.length > 0 || busy} onClick={apply}>
          {busy ? 'Applicazione…' : real.length ? `Applica ${real.length} ${real.length === 1 ? 'modifica' : 'modifiche'}` : 'Applica'}
        </button>
      </div>
    </Modal>
  );
}

function RulesHistory({ rules, profiles, onClose }: { rules: Rules; profiles: Record<string, Profile>; onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide label="Storico dei regolamenti">
      <h2>Storico</h2>
      <p className="note">Le ultime modifiche, dalla più recente.</p>
      <ul className="rules-history">
        {rules.log.map((l) => (
          <li key={l.id}>
            <span className="sub mono">{timeLabel(l.at)}</span>{' '}
            <b>{l.actor ? profiles[l.actor]?.fullName.split(' ')[0] || 'L’admin' : 'Impostazione iniziale'}</b> {LOG_LABEL[l.action]}{' '}
            {l.action.startsWith('section') ? <i>{l.title}</i> : <a href={'#' + anchor(l.entryId)} onClick={onClose}>{l.title}</a>}
            {l.fields.length > 0 && <span className="sub"> ({l.fields.map((f) => ({ body: 'testo', title: 'titolo', status: 'stato', source: 'fonte', section: 'sezione', tags: 'tag', position: 'posizione' } as Record<string, string>)[f] ?? f).join(', ')})</span>}
            {l.via === 'claude' && <span className="pill via-claude">con Claude</span>}
          </li>
        ))}
        {!rules.log.length && <li className="empty">Ancora niente.</li>}
      </ul>
      <div className="actions"><button className="btn" type="button" onClick={onClose}>Chiudi</button></div>
    </Modal>
  );
}
