// Rich text for task descriptions. The editor writes HTML; what is saved and shown always
// goes through sanitizeHtml, which rebuilds every tag from an allowlist, so pasted pages or a
// hand-made request can never bring in scripts, styles or event handlers.
// Descriptions written before the editor are plain text: toHtml shows them with their line breaks.

/** Room for the formatting: the database check on tasks.description uses the same number. */
export const DESCRIPTION_MAX = 20000;

const RENAME: Record<string, string> = {
  p: 'p', div: 'p', br: 'br', b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's',
  ul: 'ul', ol: 'ol', li: 'li', h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h3', blockquote: 'blockquote', code: 'code', pre: 'pre', a: 'a',
  table: 'table', thead: 'thead', tbody: 'tbody', tr: 'tr', th: 'th', td: 'td',
};
/** Tags whose content is dropped too, not only the tag. */
const DROP_CONTENT = new Set(['script', 'style', 'head', 'title', 'template', 'iframe', 'object', 'noscript', 'svg', 'math']);

const escText = (s: string) => s.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+\d*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
}

/** Files uploaded to the Rules page are referenced as rules-file:<path> and turned into signed links when shown. */
export const FILE_SCHEME = 'rules-file:';

function safeUrl(attrs: string, name: string, schemes: RegExp): string | null {
  const v = attr(attrs, name);
  if (v === null) return null;
  // control characters and spaces inside the scheme are a classic way round a check like this
  const scheme = v.replace(/[\u0000- ]/g, '').toLowerCase();
  return schemes.test(scheme) ? v : null;
}

export type SanitizeOptions = {
  /** allow images and videos (https or rules-file: only) and links to stored files: the Rules page */
  media?: boolean;
};

export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  const linkSchemes = opts.media ? /^(https?:|mailto:|rules-file:)/ : /^(https?:|mailto:)/;
  const mediaSchemes = /^(https:|rules-file:)/;
  const out: string[] = [];
  const open: string[] = [];
  let dropping: string | null = null;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (s: string) => { if (!dropping && s) out.push(escText(s)); };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    if (!m[2]) continue; // a comment
    const closing = m[1] === '/', name = m[2].toLowerCase();
    if (dropping) { if (closing && name === dropping) dropping = null; continue; }
    if (DROP_CONTENT.has(name)) { if (!closing && !/\/\s*$/.test(m[3])) dropping = name; continue; }
    if (opts.media && (name === 'img' || name === 'video')) {
      if (closing) {
        const at = name === 'video' ? open.lastIndexOf('video') : -1;
        if (at >= 0) while (open.length > at) { const t = open.pop()!; if (t !== 'a!') out.push(`</${t}>`); }
        continue;
      }
      const src = safeUrl(m[3], 'src', mediaSchemes);
      if (!src) { if (name === 'video' && !/\/\s*$/.test(m[3])) dropping = 'video'; continue; }
      if (name === 'img') out.push(`<img src="${escAttr(src)}" alt="${escAttr(attr(m[3], 'alt') || '')}">`);
      else { out.push(`<video src="${escAttr(src)}" controls>`); open.push('video'); }
      continue;
    }
    const tag = RENAME[name];
    if (!tag) continue; // unknown tag: keep its text, lose the tag
    if (tag === 'br') { if (!closing) out.push('<br>'); continue; }
    if (!closing) {
      if (tag === 'a') {
        const href = safeUrl(m[3], 'href', linkSchemes);
        if (!href) { open.push('a!'); continue; } // a link we will not keep: its text stays, its closing tag goes too
        out.push(`<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">`);
      } else out.push(`<${tag}>`);
      open.push(tag);
      continue;
    }
    const at = open.lastIndexOf(tag === 'a' && open.lastIndexOf('a!') > open.lastIndexOf('a') ? 'a!' : tag);
    if (at < 0) continue; // closes nothing that is open
    while (open.length > at) { const t = open.pop()!; if (t !== 'a!') out.push(`</${t}>`); }
  }
  text(html.slice(last));
  while (open.length) { const t = open.pop()!; if (t !== 'a!') out.push(`</${t}>`); }
  return out.join('');
}

const looksLikeHtml = (s: string) => /<\/?(p|div|br|b|i|u|s|strong|em|ul|ol|li|h[1-6]|a|blockquote|code|pre|span)\b[^>]*>/i.test(s);

/** What to put on the page for a stored description, old plain text included. */
export function toHtml(desc: string, opts: SanitizeOptions = {}): string {
  if (!desc) return '';
  if (looksLikeHtml(desc) || (opts.media && /<(img|video)\b/i.test(desc))) return sanitizeHtml(desc, opts);
  return desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
}

/** The text of a description without its tags, one line per paragraph or list item. */
export function plainText(desc: string): string {
  if (!looksLikeHtml(desc)) return desc.trim();
  return decode(desc.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** An emptied editor still holds a <br> or an empty paragraph. */
export const isBlank = (desc: string) => plainText(desc).trim() === '';
