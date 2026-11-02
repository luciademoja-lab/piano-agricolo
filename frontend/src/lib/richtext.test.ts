import { describe, it, expect } from 'vitest';
import { sanitizeHtml, toHtml, plainText, isBlank, DESCRIPTION_MAX } from './richtext';

describe('sanitizeHtml', () => {
  it('keeps the formatting the editor makes', () => {
    const html = '<p><b>Bold</b> <i>it</i> <u>u</u> <s>s</s></p><ul><li>one</li></ul><ol><li>two</li></ol><h3>Title</h3><blockquote>q</blockquote>';
    expect(sanitizeHtml(html)).toBe(html);
  });
  it('turns div and strong/em into the same tags every browser understands', () => {
    expect(sanitizeHtml('<div>a</div><strong>b</strong><em>c</em>')).toBe('<p>a</p><b>b</b><i>c</i>');
  });
  it('drops scripts, styles, event handlers and unknown attributes', () => {
    expect(sanitizeHtml('<p onclick="x()" style="color:red">hi</p><script>alert(1)</script><style>p{}</style>')).toBe('<p>hi</p>');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>ok')).toBe('ok');
    expect(sanitizeHtml('<span class="x">text</span>')).toBe('text');
  });
  it('keeps only safe links, opening in a new tab', () => {
    expect(sanitizeHtml('<a href="https://slack.com/x?a=1&b=2">s</a>')).toBe('<a href="https://slack.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">s</a>');
    expect(sanitizeHtml('<a href="javascript:alert(1)">bad</a>')).toBe('bad');
    expect(sanitizeHtml('<a href=" JavaScript:alert(1)">bad</a>')).toBe('bad');
    expect(sanitizeHtml('<a href="mailto:a@b.co">m</a>')).toContain('href="mailto:a@b.co"');
  });
  it('escapes stray angle brackets and closes what was left open', () => {
    expect(sanitizeHtml('a < b')).toBe('a &lt; b');
    expect(sanitizeHtml('<b>open')).toBe('<b>open</b>');
    expect(sanitizeHtml('close</b> me')).toBe('close me');
  });
});

describe('toHtml', () => {
  it('shows old plain-text descriptions with their line breaks, escaped', () => {
    expect(toHtml('Line 1\nLine <2>')).toBe('Line 1<br>Line &lt;2&gt;');
    expect(toHtml('')).toBe('');
  });
  it('sanitizes descriptions written with the editor', () => {
    expect(toHtml('<p>Hi <b>there</b></p><script>x</script>')).toBe('<p>Hi <b>there</b></p>');
  });
});

describe('plainText and isBlank', () => {
  it('reads the text without the tags', () => {
    expect(plainText('<p>Hi&nbsp;<b>there</b></p><ul><li>one</li><li>two</li></ul>')).toBe('Hi there\none\ntwo');
    expect(plainText('just text')).toBe('just text');
  });
  it('sees an emptied editor as blank', () => {
    expect(isBlank('<br>')).toBe(true);
    expect(isBlank('<p><br></p>')).toBe(true);
    expect(isBlank('<p> x</p>')).toBe(false);
  });
  it('leaves room for the formatting', () => {
    expect(DESCRIPTION_MAX).toBe(20000);
  });
});

describe('sanitizeHtml with media (the Rules page)', () => {
  it('keeps images and videos from our file store or https, with no other attributes', () => {
    expect(sanitizeHtml('<p><img src="rules-file:2026-10/a.png" alt="Step 1" onerror="x()" width="9"></p>', { media: true }))
      .toBe('<p><img src="rules-file:2026-10/a.png" alt="Step 1"></p>');
    expect(sanitizeHtml('<video src="rules-file:v.mp4" autoplay></video>', { media: true })).toBe('<video src="rules-file:v.mp4" controls></video>');
    expect(sanitizeHtml('<img src="https://example.com/a.png">', { media: true })).toBe('<img src="https://example.com/a.png" alt="">');
  });
  it('drops media with any other source, and keeps links to stored files', () => {
    expect(sanitizeHtml('<img src="javascript:alert(1)"><img src="data:image/png;base64,AA"><video src="file:///x"></video>ok', { media: true })).toBe('ok');
    expect(sanitizeHtml('<a href="rules-file:doc.pdf">guide</a>', { media: true })).toContain('href="rules-file:doc.pdf"');
  });
  it('still drops media and stored-file links in task descriptions', () => {
    expect(sanitizeHtml('<img src="rules-file:a.png"><a href="rules-file:doc.pdf">guide</a>')).toBe('guide');
  });
});
