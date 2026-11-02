// Rules: the company rules and documentation, one page for everyone in the tool.
// Admins edit them in the page, or in three steps with their own Claude:
//   1. "Copy for Claude" copies the whole rulebook (as JSON, texts in Markdown) with instructions and their request,
//   2. they paste it into any Claude chat (claude.ai, the app, Claude with Slack...),
//   3. they paste Claude's answer back: the page previews each change and applies them all at once.
// Nothing to install: the answer is a small JSON list of changes that rules_apply() in the database checks again.
import { FILE_SCHEME, plainText, sanitizeHtml } from './richtext';

export const RULE_STATUSES = ['confirmed', 'to_confirm', 'outdated'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];
export const RULE_STATUS_LABEL: Record<RuleStatus, string> = { confirmed: 'Confirmed', to_confirm: 'To confirm', outdated: 'Outdated' };

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
const BLOCK = new Set(['p', 'h3', 'ul', 'ol', 'blockquote', 'pre', 'video']);

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

export const EXPORT_FORMAT = 'vik-rules/1';
export const CHANGES_FORMAT = 'vik-rules-changes/1';
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Step 1: the text an admin pastes into Claude: what to do, how to answer, and the whole rulebook. */
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
  const ask = request.trim() || '(The admin will tell you in the next message what changed. Ask them if it is not clear.)';
  return [
    `# Vik Studios rules: update request (${today})`,
    '',
    'You are helping an admin of Vik Studios keep the company rules up to date. The rules are the single place where the team checks how things work: recruiting, offers, milestones, payments, onboarding, Slack, the dashboard.',
    'The current rulebook is at the end of this message, as JSON. Each rule has a status: "confirmed" (an admin or Max confirmed it), "to_confirm" (written down, not confirmed yet) or "outdated" (kept to show what changed).',
    '',
    '## What changed',
    ask,
    '',
    '## How to answer',
    `Reply with ONE code block marked json and nothing else inside it, in this format ("${CHANGES_FORMAT}"):`,
    '',
    `    {"format": "${CHANGES_FORMAT}", "summary": "one sentence on what you changed", "questions": [],`,
    '     "changes": [',
    '       {"op": "upsert_rule", "id": "invites-per-post", "section": "recruiting", "title": "Invitations per post", "status": "confirmed",',
    '        "tags": ["upwork"], "source": "Max, #managers-updates, 26 Oct", "source_url": "https://...", "body_md": "Invite **20** freelancers at most per post."},',
    '       {"op": "upsert_section", "id": "onboarding", "title": "Onboarding"},',
    '       {"op": "delete_rule", "id": "some-rule"}',
    '     ]}',
    '',
    'Operations: upsert_rule (create or update a rule), delete_rule, upsert_section (create or rename a section), delete_section (only when it has no rules).',
    '- Only list what changes. For an existing rule, give its id and only the fields that change. For a new rule give section, title, status and body_md.',
    '- When you change the text of a rule, give the whole new body_md, not only the new sentence. Markdown: **bold**, *italic*, ### heading, - lists, 1. lists, > quote, [text](url), ![alt](image).',
    '- Ids: lowercase letters, digits and dashes, unique. Never change the id of an existing rule.',
    '- A rule that is replaced by a new one: mark the old one "outdated" instead of deleting it, unless the admin asks to delete it.',
    '- New or changed rules are "to_confirm" unless the admin says Max (or another admin) confirmed them; then "confirmed".',
    '- Always fill source (who said it, where, when) and source_url (e.g. the Slack message link) when you know them.',
    '- Keep image, video and file links that start with rules-file: exactly as they are.',
    '- Write in clear, short English. One rule = one thing people need to do or know.',
    '- If something is unclear or contradicts the rulebook, do not guess: put your questions in "questions" and leave those changes out.',
    '',
    '## The current rulebook',
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
  if (raw === null) throw new ClaudeReplyError('Claude’s answer has no JSON in it. Ask Claude to answer with the JSON code block, as the instructions say.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch (e) {
    throw new ClaudeReplyError(`The JSON in Claude’s answer is not valid JSON (${(e as Error).message}). Copy the whole answer, or ask Claude to send it again.`);
  }
  const obj = (Array.isArray(data) ? { changes: data } : data) as { format?: unknown; changes?: unknown; summary?: unknown; questions?: unknown };
  if (!obj || typeof obj !== 'object') throw new ClaudeReplyError('Claude’s answer is not a list of changes.');
  if (obj.format !== undefined && !String(obj.format).startsWith('vik-rules-changes')) {
    throw new ClaudeReplyError(`This is not a list of changes (format "${String(obj.format)}"). Paste Claude’s answer, not the rulebook you copied.`);
  }
  if (!Array.isArray(obj.changes)) throw new ClaudeReplyError('Claude’s answer has no "changes" list.');
  const changes = obj.changes.map((c, i): RuleChange => {
    const n = i + 1;
    if (!c || typeof c !== 'object') throw new ClaudeReplyError(`Change ${n} is not an object.`);
    const x = c as Record<string, unknown>;
    const op = String(x.op ?? '');
    if (!(OPS as readonly string[]).includes(op)) throw new ClaudeReplyError(`change ${n}: unknown op "${op}".`);
    const id = String(x.id ?? '');
    if (!ID_RE.test(id)) throw new ClaudeReplyError(`change ${n}: "${id}" is not a valid id (lowercase letters, digits and dashes).`);
    if (op === 'delete_rule' || op === 'delete_section') return { op, id } as RuleChange;
    const out: Record<string, unknown> = { op, id };
    if (x.title !== undefined) out.title = String(x.title).trim();
    if (x.position !== undefined) { const p = Number(x.position); if (!Number.isInteger(p)) throw new ClaudeReplyError(`change ${n}: position must be a whole number.`); out.position = p; }
    if (op === 'upsert_section') return out as RuleChange;
    if (x.section !== undefined) out.section = String(x.section);
    if (x.status !== undefined) {
      if (!(RULE_STATUSES as readonly string[]).includes(String(x.status))) throw new ClaudeReplyError(`change ${n}: unknown status "${String(x.status)}" (confirmed, to_confirm or outdated).`);
      out.status = x.status;
    }
    if (x.body_md !== undefined) out.body = markdownToHtml(String(x.body_md));
    else if (x.body !== undefined) out.body = sanitizeHtml(String(x.body), { media: true });
    if (x.source !== undefined) out.source = String(x.source ?? '').trim();
    if (x.source_url !== undefined) {
      const u = x.source_url === null ? '' : String(x.source_url).trim();
      if (u && !/^https?:\/\//i.test(u)) throw new ClaudeReplyError(`change ${n}: the source link must start with https://.`);
      out.source_url = u || null;
    }
    if (x.tags !== undefined) {
      if (!Array.isArray(x.tags)) throw new ClaudeReplyError(`change ${n}: tags must be a list.`);
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
        return { kind: 'section_added', id: c.id, title: c.title || c.id, details: [], problem: c.title ? null : 'A new section needs a title.' };
      }
      const details = c.title !== undefined && c.title !== s.title ? [`renamed: “${s.title}” → “${c.title}”`] : [];
      if (c.position !== undefined && c.position !== s.position) details.push('moved');
      if (c.title !== undefined) s.title = c.title;
      return { kind: details.length ? 'section_changed' : 'unchanged', id: c.id, title: s.title, details, problem: null };
    }
    if (c.op === 'delete_section') {
      const s = sections.get(c.id);
      const left = [...rules.values()].filter((x) => x.section === c.id).length;
      sections.delete(c.id);
      return { kind: 'section_deleted', id: c.id, title: s?.title ?? c.id, details: [],
        problem: !s ? `There is no section “${c.id}”.` : left ? `“${s.title}” still has ${left} rule${left === 1 ? '' : 's'}: move or delete them first.` : null };
    }
    if (c.op === 'delete_rule') {
      const x = rules.get(c.id);
      rules.delete(c.id);
      return { kind: 'deleted', id: c.id, title: x?.title ?? c.id, details: [], problem: x ? null : `There is no rule “${c.id}”.` };
    }
    const old = rules.get(c.id);
    const missingSection = c.section !== undefined && !sections.has(c.section) ? `There is no section “${c.section}”.` : null;
    if (!old) {
      const status = c.status || 'to_confirm';
      rules.set(c.id, { id: c.id, section: c.section || '', title: c.title || '', body: c.body || '', status, source: c.source || '', sourceUrl: c.source_url ?? null,
        tags: c.tags || [], position: c.position ?? 0, updatedBy: null, updatedAt: 0 });
      const problem = !c.section ? 'A new rule needs a section.' : missingSection || (!c.title ? 'A new rule needs a title.' : null);
      return { kind: 'added', id: c.id, title: c.title || c.id, details: [`in ${c.section ? secTitle(c.section) : '?'}`, `status: ${RULE_STATUS_LABEL[status]}`], problem };
    }
    const details: string[] = [];
    if (c.section !== undefined && c.section !== old.section) details.push(`moved to ${secTitle(c.section)}`);
    if (c.title !== undefined && c.title !== old.title) details.push(`title: “${old.title}” → “${c.title}”`);
    if (c.body !== undefined && norm(c.body) !== norm(old.body)) details.push('text changed');
    if (c.status !== undefined && c.status !== old.status) details.push(`status: ${RULE_STATUS_LABEL[old.status]} → ${RULE_STATUS_LABEL[c.status]}`);
    if ((c.source !== undefined && c.source !== old.source) || (c.source_url !== undefined && (c.source_url || null) !== old.sourceUrl)) details.push('source changed');
    if (c.tags !== undefined && c.tags.join(',') !== old.tags.join(',')) details.push(`tags: ${c.tags.length ? c.tags.join(', ') : 'none'}`);
    const next = { ...old, ...(c.section !== undefined && { section: c.section }), ...(c.title !== undefined && { title: c.title }), ...(c.body !== undefined && { body: c.body }),
      ...(c.status !== undefined && { status: c.status }), ...(c.tags !== undefined && { tags: c.tags }) };
    rules.set(c.id, next);
    return { kind: details.length ? 'changed' : 'unchanged', id: c.id, title: next.title, details, problem: missingSection };
  });
}

/** The log in words, for the history list. */
export const LOG_LABEL: Record<RuleLogAction, string> = {
  created: 'added', changed: 'changed', deleted: 'deleted', section_created: 'added the section', section_changed: 'renamed or moved the section', section_deleted: 'deleted the section',
};
