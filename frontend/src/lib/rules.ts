// Regolamenti: leggi, regole e fonti del progetto agricolo, in una pagina.
// L'admin li modifica nella pagina, o in tre passi con il proprio Claude:
//   1. "Copy for Claude" copies the whole rulebook (as JSON, texts in Markdown) with instructions and their request,
//   2. they paste it into any Claude chat (claude.ai, the app, Claude with Slack...),
//   3. they paste Claude's answer back: the page previews each change and applies them all at once.
// Nothing to install: the answer is a small JSON list of changes that rules_apply() in the database checks again.
import { FILE_SCHEME, plainText, sanitizeHtml } from './richtext';

export const RULE_STATUSES = ['confirmed', 'to_confirm', 'outdated'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];
export const RULE_STATUS_LABEL: Record<RuleStatus, string> = { confirmed: 'Confermata', to_confirm: 'Da confermare', outdated: 'Superata' };

/** The database check on rules_entries.body uses the same number. */
export const RULE_BODY_MAX = 100000;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export type RuleSection = { id: string; title: string; position: number };
export type Rule = {
  id: string; section: string; title: string;
  /** rich text (HTML); stored files appear as rules-file:<path> */
  body: string;
  status: RuleStatus; source: string; sourceUrl: string | null; tags: string[]; position: number;
  updatedBy: string | null; updatedAt: number;
};
export type RuleLogAction = 'created' | 'changed' | 'deleted' | 'section_created' | 'section_changed' | 'section_deleted';
export type RuleLog = { id: string; at: number; actor: string | null; entryId: string; title: string; action: RuleLogAction; via: 'editor' | 'claude'; fields: string[] };
export type Rules = { sections: RuleSection[]; rules: Rule[]; log: RuleLog[] };

export type RuleChange =
  | { op: 'upsert_section'; id: string; title?: string; position?: number }
  | { op: 'delete_section'; id: string }
  | { op: 'upsert_rule'; id: string; section?: string; title?: string; body?: string; status?: RuleStatus; source?: string; source_url?: string | null; tags?: string[]; position?: number }
  | { op: 'delete_rule'; id: string };
export type ApplyResult = { created: number; changed: number; deleted: number };

export type SectionRow = { id: string; title: string; position: number; updated_at: string };
export type EntryRow = {
  id: string; section_id: string; title: string; body: string; status: RuleStatus; source: string; source_url: string | null;
  tags: string[] | null; position: number; updated_by: string | null; updated_at: string;
};
export type LogRow = { id: number | string; at: string; actor: string | null; entry_id: string; title: string; action: RuleLogAction; via: 'editor' | 'claude'; fields: string[] | null };

export function rulesFromRows(sections: SectionRow[], entries: EntryRow[], log: LogRow[]): Rules {
  return {
    sections: sections.map((s) => ({ id: s.id, title: s.title, position: s.position })),
    rules: entries.map((e) => ({
      id: e.id, section: e.section_id, title: e.title, body: e.body, status: e.status, source: e.source, sourceUrl: e.source_url,
      tags: e.tags || [], position: e.position, updatedBy: e.updated_by, updatedAt: Date.parse(e.updated_at),
    })),
    log: log.map((l) => ({
      id: String(l.id), at: Date.parse(l.at), actor: l.actor, entryId: l.entry_id, title: l.title, action: l.action, via: l.via, fields: l.fields || [],
    })).sort((a, b) => b.at - a.at || Number(b.id) - Number(a.id)),
  };
}

const byPos = <T extends { position: number; title: string }>(a: T, b: T) => a.position - b.position || a.title.localeCompare(b.title);

/** Sections in order, each with its rules in order. */
export function orderedSections(r: Rules): Array<RuleSection & { rules: Rule[] }> {
  return [...r.sections].sort(byPos).map((s) => ({ ...s, rules: r.rules.filter((x) => x.section === s.id).sort(byPos) }));
}

// --- search -------------------------------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const words = (q: string) => fold(q).split(/\s+/).filter(Boolean);

/** Rules matching every word of the search (title, text, tags, source, section), in page order. Outdated ones only when asked. */
export function searchRules(r: Rules, q: string, showOutdated = false): Rule[] {
  const ws = words(q);
  const out: Rule[] = [];
  for (const s of orderedSections(r)) {
    for (const rule of s.rules) {
      if (rule.status === 'outdated' && !showOutdated) continue;
      const hay = fold([rule.title, plainText(rule.body), rule.tags.join(' '), rule.source, s.title].join(' '));
      if (ws.every((w) => hay.includes(w))) out.push(rule);
    }
  }
  return out;
}

/** Splits a text into parts, marking every place a word of the search appears (accents and case ignored). */
export function highlight(text: string, q: string): Array<{ text: string; hit: boolean }> {
  const ws = words(q);
  if (!ws.length || !text) return [{ text, hit: false }];
  // fold each character on its own, remembering where each folded character came from
  let folded = '';
  const from: number[] = [];
  [...text].reduce((i, ch) => { const f = fold(ch); for (let k = 0; k < f.length; k++) { folded += f[k]; from.push(i); } return i + ch.length; }, 0);
  const hit = new Array<boolean>(text.length).fill(false);
  for (const w of ws) {
    for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + 1)) {
      const start = from[at], end = at + w.length < from.length ? from[at + w.length] : text.length;
      for (let i = start; i < end; i++) hit[i] = true;
    }
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: hit[i] });
  }
  return parts;
}

/** The text of a rule around the first match of the search, about 160 characters. */
export function snippet(rule: Pick<Rule, 'body'>, q: string, size = 160): string {
  const text = plainText(rule.body).replace(/\s+/g, ' ').trim();
  if (text.length <= size) return text;
  const f = fold(text);
  const hits = words(q).map((w) => f.indexOf(w)).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  let start = Math.max(0, at - Math.floor(size * 0.4));
  let end = Math.min(text.length, start + size);
  start = Math.max(0, end - size);
  if (start > 0) { const sp = text.indexOf(' ', start); if (sp >= 0 && sp < at) start = sp + 1; }
  if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > at) end = sp; }
  return (start > 0 ? '… ' : '') + text.slice(start, end).trim() + (end < text.length ? ' …' : '');
}

// --- ids ----------------------------------------------------------------------------------

export function slugify(title: string): string {
  const s = fold(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'rule';
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let n = 2; ; n++) if (!t.has(`${base}-${n}`)) return `${base}-${n}`;
}

// --- files --------------------------------------------------------------------------------

const VIDEO = /\.(mp4|m4v|mov|webm|ogv)$/i;
export const isVideo = (path: string) => VIDEO.test(path);
export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path);

const unAmp = (s: string) => s.replace(/&amp;/g, '&');
const attrEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Paths of the stored files a rule uses, in order, without repeats. */
export function fileRefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/(?:src|href)="rules-file:([^"]+)"/g)) { const p = unAmp(m[1]); if (!out.includes(p)) out.push(p); }
  return out;
}

/** To show (or edit) a rule: stored files become their signed links. */
export function withFileUrls(html: string, urls: Record<string, string>): string {
  return html.replace(/((?:src|href)=")rules-file:([^"]+)"/g, (all, pre: string, p: string) => {
    const url = urls[unAmp(p)];
    return url ? `${pre}${attrEsc(url)}"` : all;
  });
}

/** Back from the editor: signed links become stored-file references again, so they never expire in the database. */
export function withFileRefs(html: string, urls: Record<string, string>): string {
  let out = html;
  for (const [path, url] of Object.entries(urls)) out = out.split(`="${attrEsc(url)}"`).join(`="${FILE_SCHEME}${attrEsc(path)}"`);
  return out;
}

/** Where an uploaded file is stored: "YYYY-MM/<random>-<clean-name>.<ext>". */
export function filePath(name: string, now: number, random: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  const base = slugify(dot > 0 ? name.slice(0, dot) : name).slice(0, 40);
  return `${new Date(now).toISOString().slice(0, 7)}/${random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'f'}-${base}${ext ? '.' + ext : ''}`;
}
/** The biggest file the bucket accepts (100 MB), checked before uploading. */
export const FILE_MAX = 100 * 1024 * 1024;

// --- Markdown (what Claude reads and writes) ------------------------------------------------

type Node = { tag: string; attrs: Record<string, string>; kids: Node[] } | string;
const VOID = new Set(['br', 'img']);
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

function parse(html: string): Node[] {
  const root: Node = { tag: '', attrs: {}, kids: [] };
  const stack = [root];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1] as Exclude<Node, string>;
    if (m[4] !== undefined) { top.kids.push(decode(m[4])); continue; }
    const name = m[2].toLowerCase();
    if (m[1]) { const at = stack.map((n) => (n as Exclude<Node, string>).tag).lastIndexOf(name); if (at > 0) stack.length = at; continue; }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([a-z]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const node: Node = { tag: name, attrs, kids: [] };
    top.kids.push(node);
    if (!VOID.has(name)) stack.push(node);
  }
  return (root as Exclude<Node, string>).kids;
}

const escMd = (s: string) => s.replace(/([\\*_`[\]~])/g, '\\$1').replace(/<(?=[a-z/])/gi, '\\<');
const escLineStart = (line: string) => line.replace(/^(\s*)(#|>|[-+*] |\d+[.)] )/, '$1\\$2');

function inline(nodes: Node[]): string {
  return nodes.map((n) => {
    if (typeof n === 'string') return escMd(n);
    const k = inline(n.kids);
    switch (n.tag) {
      case 'b': return `**${k}**`;
      case 'i': return `*${k}*`;
      case 's': return `~~${k}~~`;
      case 'u': return `<u>${k}</u>`;
      case 'code': return '`' + plain(n.kids) + '`';
      case 'a': return plain(n.kids) === n.attrs.href ? n.attrs.href : `[${k}](${n.attrs.href || ''})`;
      case 'br': return '\n';
      case 'img': return `![${n.attrs.alt || ''}](${n.attrs.src || ''})`;
      case 'video': return `![video](${n.attrs.src || ''})`;
      default: return k; // p, li or anything nested: its text
    }
  }).join('');
}
const plain = (nodes: Node[]): string => nodes.map((n) => (typeof n === 'string' ? n : plain(n.kids))).join('');
const BLOCK = new Set(['p', 'h3', 'ul', 'ol', 'blockquote', 'pre', 'video', 'table']);

/** The editor's HTML as Markdown, for Claude. */
export function htmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  let loose: Node[] = [];
  const flush = () => { const t = inline(loose).trim(); if (t) blocks.push(t.split('\n').map(escLineStart).join('\n')); loose = []; };
  for (const n of parse(sanitizeHtml(html, { media: true }))) {
    if (typeof n === 'string' || !BLOCK.has(n.tag)) { loose.push(n); continue; }
    flush();
    const t = n.tag;
    if (t === 'p') { const s = inline(n.kids).trim(); if (s) blocks.push(s.split('\n').map((l, i) => (i === 0 && /^!\[/.test(s) ? l : escLineStart(l))).join('\n')); }
    else if (t === 'h3') blocks.push('### ' + inline(n.kids).replace(/\n/g, ' ').trim());
    else if (t === 'ul' || t === 'ol') {
      const items = n.kids.filter((k): k is Exclude<Node, string> => typeof k !== 'string' && k.tag === 'li');
      blocks.push(items.map((li, i) => (t === 'ul' ? '- ' : `${i + 1}. `) + inline(li.kids).replace(/\n/g, ' ').trim()).join('\n'));
    } else if (t === 'blockquote') blocks.push(inline(n.kids).trim().split('\n').map((l) => '> ' + l).join('\n'));
    else if (t === 'pre') blocks.push('```\n' + plain(n.kids).replace(/\n$/, '') + '\n```');
    else if (t === 'video') blocks.push(`![video](${n.attrs.src || ''})`);
    else if (t === 'table') {
      const rows: Exclude<Node, string>[] = [];
      const walk = (k: Node) => { if (typeof k === 'string') return; if (k.tag === 'tr') rows.push(k); else k.kids.forEach(walk); };
      n.kids.forEach(walk);
      const cells = rows.map((r) => r.kids.filter((c): c is Exclude<Node, string> => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th'))
        .map((c) => inline(c.kids).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()));
      if (cells.length) {
        const width = Math.max(...cells.map((c) => c.length));
        const line = (c: string[]) => '| ' + Array.from({ length: width }, (_, i) => c[i] ?? '').join(' | ') + ' |';
        blocks.push([line(cells[0]), '|' + Array(width).fill('---').join('|') + '|', ...cells.slice(1).map(line)].join('\n'));
      }
    }
  }
  flush();
  return blocks.join('\n\n');
}

const HTML_TAGS = new Set(('p div br b strong i em u s strike del ul ol li h1 h2 h3 h4 h5 h6 blockquote code pre a img video span sup sub '
  + 'script style head title template iframe object noscript svg math table tr td th thead tbody form input button textarea select option label link meta body html').split(' '));

function mdInline(src: string): string {
  const keep: string[] = [];
  const hold = (html: string) => `\u0000${keep.push(html) - 1}\u0000`;
  const url = '((?:[^()\\s]|\\([^()\\s]*\\))+)';
  let s = src
    .replace(/\\([\\*_`[\]~<#>+\-.!])/g, (_, c: string) => hold(c === '<' ? '&lt;' : c))
    .replace(/`([^`]+)`/g, (_, c: string) => hold(`<code>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>`))
    .replace(new RegExp('!\\[([^\\]]*)\\]\\(' + url + '\\)', 'g'), (_, alt: string, u: string) =>
      hold(alt === 'video' || isVideo(u) ? `<video src="${attrEsc(u)}" controls></video>` : `<img src="${attrEsc(u)}" alt="${attrEsc(alt)}">`))
    .replace(new RegExp('\\[([^\\]]*)\\]\\(' + url + '\\)', 'g'), (_, t: string, u: string) => `<a href="${attrEsc(u)}">${t}</a>`)
    // bare links become links (held, so underscores in them are not read as italics)
    .replace(/(^|[\s(])(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]])/g, (_, pre: string, u: string) => pre + hold(`<a href="${attrEsc(u)}">${u.replace(/&/g, '&amp;')}</a>`));
  // "<name>" or "<number>" written as a placeholder is text, not an unknown tag the sanitizer would drop
  s = s.replace(/<(\/?)([a-zA-Z][\w-]*)([^<>]*)>/g, (all, _c: string, name: string) => (HTML_TAGS.has(name.toLowerCase()) ? all : hold('&lt;' + all.slice(1, -1).replace(/&/g, '&amp;') + '&gt;')));
  s = s.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+\d*);)/gi, '&amp;')
    .replace(/\*\*(?!\s)([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/__(?!\s)([\s\S]+?)__/g, '<b>$1</b>')
    .replace(/~~(?!\s)([\s\S]+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^\w*])\*(?![\s*])([^*]+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?![\s_])([^_]+?)_(?!\w)/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => keep[+i]);
}

/** Markdown written by Claude (or exported above) as the editor's HTML. */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [], list: { tag: 'ul' | 'ol'; items: string[] } | null = null, quote: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${mdInline(i)}</li>`).join('')}</${list.tag}>`);
    if (quote.length) out.push(`<blockquote>${quote.map(mdInline).join('<br>')}</blockquote>`);
    para = []; list = null; quote = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre>${code.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    // a table: a header row, a separator row of dashes, then the rows
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const split = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => mdInline(c.trim().replace(/\\\|/g, '|')));
      const head = split(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(split(lines[i]));
      i--;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { flush(); out.push(`<h3>${mdInline(m[1].trim())}</h3>`); continue; }
    if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(m[2]); continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { if (!quote.length) flush(); quote.push(m[1]); continue; }
    if (list || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return sanitizeHtml(out.join(''), { media: true });
}

// --- Update with Claude ---------------------------------------------------------------------

export const EXPORT_FORMAT = 'piano-agricolo-regole/1';
export const CHANGES_FORMAT = 'piano-agricolo-modifiche/1';
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Step 1: the text the admin pastes into Claude: what to do, how to answer, and the whole rulebook. */
export function exportForClaude(r: Rules, request: string, today: string): string {
  const book = {
    format: EXPORT_FORMAT,
    exported: today,
    sections: orderedSections(r).map((s) => ({
      id: s.id, title: s.title,
      rules: s.rules.map((x) => ({
        id: x.id, title: x.title, status: x.status, tags: x.tags, source: x.source, source_url: x.sourceUrl, updated: day(x.updatedAt), body_md: htmlToMarkdown(x.body),
      })),
    })),
  };
  const ask = request.trim() || '(Ti dirò nel prossimo messaggio cosa è cambiato. Chiedimelo se non è chiaro.)';
  return [
    `# Regolamenti del piano agricolo: richiesta di aggiornamento (${today})`,
    '',
    'Mi aiuti a tenere aggiornati i regolamenti del mio progetto agricolo a Cinquefrondi (Calabria): microgreens, orto, galline, lombrichi, funghi, api, agriturismo. Sono il posto unico dove controllo cosa dicono leggi, uffici e fonti.',
    'I regolamenti attuali sono in fondo a questo messaggio, in JSON. Ogni regola ha uno stato: "confirmed" (confermata per iscritto da un ufficio o da un professionista), "to_confirm" (trovata in una fonte, non ancora confermata) o "outdated" (superata, tenuta per vedere cosa è cambiato).',
    '',
    '## Cosa è cambiato',
    ask,
    '',
    '## Come rispondere',
    `Rispondi con UN solo blocco di codice marcato json e nient'altro dentro, in questo formato ("${CHANGES_FORMAT}"):`,
    '',
    `    {"format": "${CHANGES_FORMAT}", "summary": "una frase su cosa hai cambiato", "questions": [],`,
    '     "changes": [',
    '       {"op": "upsert_rule", "id": "esonero-iva", "section": "fisco", "title": "Regime di esonero IVA", "status": "confirmed",',
    '        "tags": ["iva"], "source": "CAA Coldiretti, email del 12 nov 2026", "source_url": "https://...", "body_md": "Fino a **7.000 €** di volume d\'affari..."},',
    '       {"op": "upsert_section", "id": "api", "title": "Api"},',
    '       {"op": "delete_rule", "id": "una-regola"}',
    '     ]}',
    '',
    'Operazioni: upsert_rule (crea o aggiorna una regola), delete_rule, upsert_section (crea o rinomina una sezione), delete_section (solo se non ha regole).',
    '- Elenca solo ciò che cambia. Per una regola esistente dai il suo id e solo i campi che cambiano. Per una nuova regola dai section, title, status e body_md.',
    '- Quando cambi il testo di una regola, dai tutto il nuovo body_md, non solo la frase nuova. Markdown: **grassetto**, *corsivo*, ### titolo, - elenchi, 1. elenchi, > citazione, [testo](url).',
    '- Id: lettere minuscole, cifre e trattini, unici. Non cambiare mai l\'id di una regola esistente.',
    '- Una regola sostituita da una nuova: segna la vecchia "outdated" invece di cancellarla, a meno che io non chieda di cancellarla.',
    '- Le regole nuove o cambiate sono "to_confirm", a meno che io non dica che un ufficio o un professionista le ha confermate per iscritto: allora "confirmed".',
    '- Compila sempre source (chi lo dice, dove, quando) e source_url quando li conosci.',
    '- Lascia identici i link a immagini, video e file che iniziano con rules-file:.',
    '- Scrivi in italiano chiaro e breve. Una regola = una cosa da sapere o da fare.',
    '- Se qualcosa non è chiaro o contraddice i regolamenti, non indovinare: metti le domande in "questions" e lascia fuori quelle modifiche.',
    '',
    '## I regolamenti attuali',
    '```json',
    JSON.stringify(book, null, 1),
    '```',
  ].join('\n');
}

export class ClaudeReplyError extends Error {}
const OPS = ['upsert_section', 'delete_section', 'upsert_rule', 'delete_rule'] as const;

/** Step 3: reads the changes out of Claude's answer (text around the code block is fine). */
export function parseClaudeReply(text: string): { changes: RuleChange[]; summary: string; questions: string[] } {
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  const unclosed = /```(?:json)?\s*\n([\s\S]*)$/i.exec(text);
  let raw = fences.length ? fences[fences.length - 1] : unclosed ? unclosed[1] : null;
  if (raw === null) {
    const a = text.search(/[{[]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    raw = a >= 0 && b > a ? text.slice(a, b + 1) : null;
  }
  if (raw === null) throw new ClaudeReplyError('Nella risposta di Claude non c’è JSON. Chiedi a Claude di rispondere con il blocco di codice JSON, come dicono le istruzioni.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch (e) {
    throw new ClaudeReplyError(`Il JSON nella risposta di Claude non è valido (${(e as Error).message}). Copia tutta la risposta, o chiedi a Claude di rimandarla.`);
  }
  const obj = (Array.isArray(data) ? { changes: data } : data) as { format?: unknown; changes?: unknown; summary?: unknown; questions?: unknown };
  if (!obj || typeof obj !== 'object') throw new ClaudeReplyError('La risposta di Claude non è un elenco di modifiche.');
  if (obj.format !== undefined && !String(obj.format).startsWith('piano-agricolo-modifiche')) {
    throw new ClaudeReplyError(`Questo non è un elenco di modifiche (formato "${String(obj.format)}"). Incolla la risposta di Claude, non i regolamenti che hai copiato.`);
  }
  if (!Array.isArray(obj.changes)) throw new ClaudeReplyError('Nella risposta di Claude manca l’elenco "changes".');
  const changes = obj.changes.map((c, i): RuleChange => {
    const n = i + 1;
    if (!c || typeof c !== 'object') throw new ClaudeReplyError(`La modifica ${n} non è un oggetto.`);
    const x = c as Record<string, unknown>;
    const op = String(x.op ?? '');
    if (!(OPS as readonly string[]).includes(op)) throw new ClaudeReplyError(`modifica ${n}: operazione sconosciuta "${op}".`);
    const id = String(x.id ?? '');
    if (!ID_RE.test(id)) throw new ClaudeReplyError(`modifica ${n}: "${id}" non è un id valido (lettere minuscole, cifre e trattini).`);
    if (op === 'delete_rule' || op === 'delete_section') return { op, id } as RuleChange;
    const out: Record<string, unknown> = { op, id };
    if (x.title !== undefined) out.title = String(x.title).trim();
    if (x.position !== undefined) { const p = Number(x.position); if (!Number.isInteger(p)) throw new ClaudeReplyError(`modifica ${n}: la posizione deve essere un numero intero.`); out.position = p; }
    if (op === 'upsert_section') return out as RuleChange;
    if (x.section !== undefined) out.section = String(x.section);
    if (x.status !== undefined) {
      if (!(RULE_STATUSES as readonly string[]).includes(String(x.status))) throw new ClaudeReplyError(`modifica ${n}: stato sconosciuto "${String(x.status)}" (confirmed, to_confirm o outdated).`);
      out.status = x.status;
    }
    if (x.body_md !== undefined) out.body = markdownToHtml(String(x.body_md));
    else if (x.body !== undefined) out.body = sanitizeHtml(String(x.body), { media: true });
    if (x.source !== undefined) out.source = String(x.source ?? '').trim();
    if (x.source_url !== undefined) {
      const u = x.source_url === null ? '' : String(x.source_url).trim();
      if (u && !/^https?:\/\//i.test(u)) throw new ClaudeReplyError(`modifica ${n}: il link della fonte deve iniziare con https://.`);
      out.source_url = u || null;
    }
    if (x.tags !== undefined) {
      if (!Array.isArray(x.tags)) throw new ClaudeReplyError(`modifica ${n}: i tag devono essere un elenco.`);
      out.tags = x.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }
    return out as RuleChange;
  });
  const questions = Array.isArray(obj.questions) ? obj.questions.map(String).filter((q) => q.trim()) : [];
  return { changes, summary: typeof obj.summary === 'string' ? obj.summary.trim() : '', questions };
}

export type PreviewItem = {
  kind: 'added' | 'changed' | 'deleted' | 'unchanged' | 'section_added' | 'section_changed' | 'section_deleted';
  id: string; title: string; details: string[];
  /** why the database will refuse it, when we can tell before sending */
  problem: string | null;
};

/** What each change will do, in order, before anything is saved. */
export function previewChanges(r: Rules, changes: RuleChange[]): PreviewItem[] {
  const sections = new Map(r.sections.map((s) => [s.id, { ...s }]));
  const rules = new Map(r.rules.map((x) => [x.id, { ...x }]));
  const secTitle = (id: string) => sections.get(id)?.title ?? id;
  const norm = (html: string) => sanitizeHtml(html, { media: true });
  return changes.map((c): PreviewItem => {
    if (c.op === 'upsert_section') {
      const s = sections.get(c.id);
      if (!s) {
        sections.set(c.id, { id: c.id, title: c.title || c.id, position: c.position ?? 0 });
        return { kind: 'section_added', id: c.id, title: c.title || c.id, details: [], problem: c.title ? null : 'Una nuova sezione ha bisogno di un titolo.' };
      }
      const details = c.title !== undefined && c.title !== s.title ? [`rinominata: “${s.title}” → “${c.title}”`] : [];
      if (c.position !== undefined && c.position !== s.position) details.push('spostata');
      if (c.title !== undefined) s.title = c.title;
      return { kind: details.length ? 'section_changed' : 'unchanged', id: c.id, title: s.title, details, problem: null };
    }
    if (c.op === 'delete_section') {
      const s = sections.get(c.id);
      const left = [...rules.values()].filter((x) => x.section === c.id).length;
      sections.delete(c.id);
      return { kind: 'section_deleted', id: c.id, title: s?.title ?? c.id, details: [],
        problem: !s ? `Non esiste la sezione “${c.id}”.` : left ? `“${s.title}” ha ancora ${left} ${left === 1 ? 'regola' : 'regole'}: spostale o cancellale prima.` : null };
    }
    if (c.op === 'delete_rule') {
      const x = rules.get(c.id);
      rules.delete(c.id);
      return { kind: 'deleted', id: c.id, title: x?.title ?? c.id, details: [], problem: x ? null : `Non esiste la regola “${c.id}”.` };
    }
    const old = rules.get(c.id);
    const missingSection = c.section !== undefined && !sections.has(c.section) ? `Non esiste la sezione “${c.section}”.` : null;
    if (!old) {
      const status = c.status || 'to_confirm';
      rules.set(c.id, { id: c.id, section: c.section || '', title: c.title || '', body: c.body || '', status, source: c.source || '', sourceUrl: c.source_url ?? null,
        tags: c.tags || [], position: c.position ?? 0, updatedBy: null, updatedAt: 0 });
      const problem = !c.section ? 'Una nuova regola ha bisogno di una sezione.' : missingSection || (!c.title ? 'Una nuova regola ha bisogno di un titolo.' : null);
      return { kind: 'added', id: c.id, title: c.title || c.id, details: [`in ${c.section ? secTitle(c.section) : '?'}`, `stato: ${RULE_STATUS_LABEL[status]}`], problem };
    }
    const details: string[] = [];
    if (c.section !== undefined && c.section !== old.section) details.push(`spostata in ${secTitle(c.section)}`);
    if (c.title !== undefined && c.title !== old.title) details.push(`titolo: “${old.title}” → “${c.title}”`);
    if (c.body !== undefined && norm(c.body) !== norm(old.body)) details.push('testo cambiato');
    if (c.status !== undefined && c.status !== old.status) details.push(`stato: ${RULE_STATUS_LABEL[old.status]} → ${RULE_STATUS_LABEL[c.status]}`);
    if ((c.source !== undefined && c.source !== old.source) || (c.source_url !== undefined && (c.source_url || null) !== old.sourceUrl)) details.push('fonte cambiata');
    if (c.tags !== undefined && c.tags.join(',') !== old.tags.join(',')) details.push(`tag: ${c.tags.length ? c.tags.join(', ') : 'nessuno'}`);
    const next = { ...old, ...(c.section !== undefined && { section: c.section }), ...(c.title !== undefined && { title: c.title }), ...(c.body !== undefined && { body: c.body }),
      ...(c.status !== undefined && { status: c.status }), ...(c.tags !== undefined && { tags: c.tags }) };
    rules.set(c.id, next);
    return { kind: details.length ? 'changed' : 'unchanged', id: c.id, title: next.title, details, problem: missingSection };
  });
}

/** The log in words, for the history list. */
export const LOG_LABEL: Record<RuleLogAction, string> = {
  created: 'ha aggiunto', changed: 'ha cambiato', deleted: 'ha cancellato', section_created: 'ha aggiunto la sezione', section_changed: 'ha rinominato o spostato la sezione', section_deleted: 'ha cancellato la sezione',
};
