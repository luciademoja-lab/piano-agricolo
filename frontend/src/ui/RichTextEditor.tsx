import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DESCRIPTION_MAX, sanitizeHtml, toHtml, type SanitizeOptions } from '../lib/richtext';

type Cmd = { cmd: string; arg?: string; label: string; title: string; icon: ReactNode };
const B = (s: string) => <b>{s}</b>;
const COMMANDS: Cmd[][] = [
  [
    { cmd: 'bold', label: 'Bold', title: 'Bold (Ctrl+B)', icon: B('B') },
    { cmd: 'italic', label: 'Italic', title: 'Italic (Ctrl+I)', icon: <i style={{ fontFamily: 'Georgia, serif' }}>I</i> },
    { cmd: 'underline', label: 'Underline', title: 'Underline (Ctrl+U)', icon: <u>U</u> },
    { cmd: 'strikeThrough', label: 'Strikethrough', title: 'Strikethrough', icon: <s>S</s> },
  ],
  [
    { cmd: 'formatBlock', arg: 'h3', label: 'Heading', title: 'Heading', icon: B('H') },
    { cmd: 'insertUnorderedList', label: 'Bulleted list', title: 'Bulleted list', icon: <span aria-hidden>• ≡</span> },
    { cmd: 'insertOrderedList', label: 'Numbered list', title: 'Numbered list', icon: <span aria-hidden>1. ≡</span> },
    { cmd: 'formatBlock', arg: 'blockquote', label: 'Quote', title: 'Quote', icon: <span aria-hidden>❝</span> },
  ],
];

/**
 * A rich text box for long descriptions: bold, italic, headings, lists, quotes and links.
 * It writes HTML; the page that saves it runs it through sanitizeHtml (pasted content is cleaned here too).
 * With onUpload (the Rules page), it also takes files: the 📎 button, pasting a screenshot, or dropping a file;
 * onUpload stores the file and returns the HTML to insert (an image, a video or a link).
 */
export function RichTextEditor({ id, label, value, onChange, placeholder, max = DESCRIPTION_MAX, onUpload }: {
  id: string; label: string; value: string; onChange: (html: string) => void; placeholder?: string;
  max?: number; onUpload?: (file: File) => Promise<string>;
}) {
  const area = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const opts: SanitizeOptions = onUpload ? { media: true } : {};

  // the content is set once: after that the browser owns it, so the cursor never jumps
  useEffect(() => { if (area.current) area.current.innerHTML = toHtml(value, opts); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (!area.current || !sel?.anchorNode || !area.current.contains(sel.anchorNode)) return;
      const block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
      setActive({
        bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'), strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'), insertOrderedList: document.queryCommandState('insertOrderedList'),
        h3: block === 'h3', blockquote: block === 'blockquote',
      });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const emit = () => { if (area.current) onChange(area.current.innerHTML); };
  function run(c: Cmd) {
    area.current?.focus();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    if (c.cmd === 'formatBlock') {
      // the same button turns a heading or a quote back into a paragraph
      const on = active[c.arg!];
      document.execCommand('formatBlock', false, on ? 'p' : c.arg);
    } else document.execCommand(c.cmd, false);
    emit();
  }
  function keepSelection() {
    const sel = document.getSelection();
    saved.current = sel && sel.rangeCount && area.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  }
  function restoreSelection() {
    area.current?.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    else if (sel && area.current) { const r = document.createRange(); r.selectNodeContents(area.current); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  function startLink() {
    keepSelection();
    setLinking('https://');
  }
  async function upload(files: File[]) {
    if (!onUpload || !files.length) return;
    setUploadError(null);
    for (const f of files) {
      setUploading(f.name || 'file');
      try {
        const html = await onUpload(f);
        restoreSelection();
        document.execCommand('insertHTML', false, html);
        keepSelection();
        emit();
      } catch (e) { setUploadError(e instanceof Error ? e.message : String(e)); break; }
    }
    setUploading(null);
  }
  function applyLink() {
    const url = (linking || '').trim();
    setLinking(null);
    area.current?.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    if (!/^(https?:\/\/|mailto:)\S+/i.test(url)) return;
    if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, sanitizeHtml(`<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`));
    else document.execCommand('createLink', false, url);
    emit();
  }

  const length = value.length;
  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {COMMANDS.map((group, g) => (
          <span className="rte-group" key={g}>
            {group.map((c) => {
              const on = !!active[c.arg || c.cmd];
              return (
                <button key={c.label} type="button" className={'rte-btn' + (on ? ' on' : '')} title={c.title} aria-label={c.label} aria-pressed={on}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => run(c)}>{c.icon}</button>
              );
            })}
          </span>
        ))}
        <span className="rte-group">
          <button type="button" className="rte-btn" title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={startLink}>🔗</button>
          {onUpload && (<>
            <button type="button" className="rte-btn" title="Add a screenshot, video or PDF (you can also paste or drop it in the text)" aria-label="Add a file"
              disabled={!!uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => { keepSelection(); picker.current?.click(); }}>📎</button>
            <input ref={picker} type="file" hidden accept="image/*,video/*,application/pdf" multiple aria-label="Choose files"
              onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; void upload(fs); }} />
          </>)}
          <button type="button" className="rte-btn" title="Clear formatting" aria-label="Clear formatting" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { area.current?.focus(); document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); document.execCommand('unlink'); emit(); }}>⌫</button>
        </span>
      </div>
      {linking !== null && (
        <div className="rte-link">
          <input type="text" aria-label="Link address" value={linking} autoFocus onChange={(e) => setLinking(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') { e.stopPropagation(); setLinking(null); } }} />
          <button type="button" className="btn primary" onClick={applyLink}>Add link</button>
          <button type="button" className="btn" onClick={() => setLinking(null)}>Cancel</button>
        </div>
      )}
      {uploading && <div className="rte-status" role="status">Uploading {uploading}…</div>}
      {uploadError && <div className="rte-status err" role="alert">{uploadError}</div>}
      <div id={id} ref={area} className="rte-area richtext" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        data-placeholder={placeholder || ''} onInput={emit}
        onDragOver={onUpload ? (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); } : undefined}
        onDrop={onUpload ? (e) => {
          const fs = [...e.dataTransfer.files];
          if (!fs.length) return;
          e.preventDefault();
          const pos = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY);
          if (pos) saved.current = pos; else keepSelection();
          void upload(fs);
        } : undefined}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (onUpload && files.length) { e.preventDefault(); keepSelection(); void upload(files); return; }
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          e.preventDefault();
          if (html) document.execCommand('insertHTML', false, sanitizeHtml(html, opts));
          else document.execCommand('insertText', false, text);
          emit();
        }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); startLink(); } }} />
      {length > max * 0.8 && <div className={'rte-count' + (length > max ? ' over' : '')}>{length.toLocaleString('en-GB')} / {max.toLocaleString('en-GB')}</div>}
    </div>
  );
}

/** A saved description, formatted (old plain-text ones keep their line breaks). */
export function RichText({ html, className, media }: { html: string; className?: string; media?: boolean }) {
  return <div className={'richtext' + (className ? ' ' + className : '')} dangerouslySetInnerHTML={{ __html: toHtml(html, { media }) }} />;
}
