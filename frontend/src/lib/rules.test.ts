import { describe, it, expect } from 'vitest';
import {
  exportForClaude, fileRefs, highlight, htmlToMarkdown, markdownToHtml, orderedSections, parseClaudeReply, previewChanges,
  rulesFromRows, searchRules, slugify, snippet, uniqueId, withFileRefs, withFileUrls, type Rules,
} from './rules';

const rules: Rules = rulesFromRows(
  [{ id: 'payments', title: 'Payments', position: 2, updated_at: '2026-10-27T10:00:00Z' }, { id: 'recruiting', title: 'Recruiting', position: 1, updated_at: '2026-10-27T10:00:00Z' }],
  [
    { id: 'invites', section_id: 'recruiting', title: 'Invitations per post', body: '<p>Invite <b>20</b> freelancers at most per post.</p>', status: 'confirmed',
      source: 'Max, #managers-updates', source_url: 'https://x.slack.com/p1', tags: ['upwork'], position: 2, updated_by: null, updated_at: '2026-10-26T15:00:00Z' },
    { id: 'reuse', section_id: 'recruiting', title: 'Reuse posting', body: '<p>Not enough? Use “Reuse posting”, your countries only.</p>', status: 'to_confirm',
      source: '', source_url: null, tags: [], position: 1, updated_by: null, updated_at: '2026-10-26T15:00:00Z' },
    { id: 'old-monthly', section_id: 'payments', title: 'Monthly milestones', body: '<p>Pay once a month.</p>', status: 'outdated',
      source: '', source_url: null, tags: ['milestones'], position: 1, updated_by: null, updated_at: '2026-10-01T15:00:00Z' },
    { id: 'monday', section_id: 'payments', title: 'Payday is Monday', body: '<p>Release last week, fund this week. Città: Zürich.</p>', status: 'confirmed',
      source: '', source_url: null, tags: ['milestones'], position: 2, updated_by: null, updated_at: '2026-10-26T15:00:00Z' },
  ],
  [{ id: 1, at: '2026-10-27T10:00:00Z', actor: null, entry_id: 'invites', title: 'Invitations per post', action: 'created', via: 'claude', fields: [] }],
);

describe('orderedSections', () => {
  it('orders sections and the rules inside them by position', () => {
    expect(orderedSections(rules).map((s) => [s.id, s.rules.map((r) => r.id)])).toEqual([
      ['recruiting', ['reuse', 'invites']],
      ['payments', ['old-monthly', 'monday']],
    ]);
  });
});

describe('searchRules', () => {
  it('finds rules by any word of the title, text, tags, source or section, ignoring case and accents', () => {
    expect(searchRules(rules, 'INVITE post').map((r) => r.id)).toEqual(['invites']);
    expect(searchRules(rules, 'zurich citta').map((r) => r.id)).toEqual(['monday']);
    expect(searchRules(rules, 'managers-updates').map((r) => r.id)).toEqual(['invites']);
    expect(searchRules(rules, 'recruiting').map((r) => r.id)).toEqual(['reuse', 'invites']);
  });
  it('hides outdated rules unless asked, and returns everything for an empty search', () => {
    expect(searchRules(rules, 'milestones').map((r) => r.id)).toEqual(['monday']);
    expect(searchRules(rules, 'milestones', true).map((r) => r.id)).toEqual(['old-monthly', 'monday']);
    expect(searchRules(rules, '  ').map((r) => r.id)).toEqual(['reuse', 'invites', 'monday']);
  });
});

describe('highlight and snippet', () => {
  it('marks every word of the search in a text', () => {
    expect(highlight('Reuse posting', 'post')).toEqual([{ text: 'Reuse ', hit: false }, { text: 'post', hit: true }, { text: 'ing', hit: false }]);
    expect(highlight('Città', 'citta')).toEqual([{ text: 'Città', hit: true }]);
    expect(highlight('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
  it('shows the part of the text around the first match', () => {
    const r = rules.rules.find((x) => x.id === 'invites')!;
    expect(snippet(r, 'freelancers')).toBe('Invite 20 freelancers at most per post.');
    expect(snippet({ ...r, body: '<p>' + 'x '.repeat(200) + 'needle ' + 'y '.repeat(200) + '</p>' }, 'needle')).toMatch(/^… .*needle.* …$/);
  });
});

describe('ids', () => {
  it('turns a title into an id and keeps it unique', () => {
    expect(slugify('Invitations per post (Upwork)!')).toBe('invitations-per-post-upwork');
    expect(slugify('Città più bella')).toBe('citta-piu-bella');
    expect(slugify('!!!')).toBe('rule');
    expect(uniqueId('invites', ['invites', 'invites-2'])).toBe('invites-3');
    expect(uniqueId('new', ['invites'])).toBe('new');
  });
});

describe('markdown', () => {
  it('turns the editor HTML into Markdown and back without losing anything', () => {
    const html = '<h3>Steps</h3><p>Open <b>Upwork</b>, then <i>Reuse posting</i> and <s>old</s> <u>new</u> <code>x</code>.<br>Next line.</p>'
      + '<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><blockquote>Quote</blockquote>'
      + '<p><a href="https://slack.com/a" target="_blank" rel="noopener noreferrer">link</a></p>'
      + '<p><img src="rules-file:2026-10/shot.png" alt="Screenshot"></p><p><video src="rules-file:2026-10/how.mp4" controls></video></p>';
    const md = htmlToMarkdown(html);
    expect(md).toBe([
      '### Steps', '', 'Open **Upwork**, then *Reuse posting* and ~~old~~ <u>new</u> `x`.', 'Next line.', '', '- one', '- two', '', '1. first', '',
      '> Quote', '', '[link](https://slack.com/a)', '', '![Screenshot](rules-file:2026-10/shot.png)', '', '![video](rules-file:2026-10/how.mp4)',
    ].join('\n'));
    expect(markdownToHtml(md)).toBe(html);
  });
  it('reads the Markdown Claude usually writes', () => {
    expect(markdownToHtml('## Title\n\n* a\n* b\n\nText with __bold__ and _it_.\n\n```\ncode\n```'))
      .toBe('<h3>Title</h3><ul><li>a</li><li>b</li></ul><p>Text with <b>bold</b> and <i>it</i>.</p><pre>code</pre>');
    expect(markdownToHtml('[x](javascript:alert(1)) <script>bad()</script>')).toBe('<p>x </p>');
    expect(markdownToHtml('')).toBe('');
  });
});

describe('files', () => {
  it('finds the stored files a text uses, and swaps them for links to show and back to save', () => {
    const html = '<p><img src="rules-file:a.png" alt=""><a href="rules-file:b.pdf" target="_blank" rel="noopener noreferrer">b</a></p>';
    expect(fileRefs(html)).toEqual(['a.png', 'b.pdf']);
    const urls = { 'a.png': 'https://s.co/a.png?token=1&x=2', 'b.pdf': 'https://s.co/b.pdf?token=2' };
    const shown = withFileUrls(html, urls);
    expect(shown).toContain('src="https://s.co/a.png?token=1&amp;x=2"');
    expect(withFileRefs(shown, urls)).toBe(html);
  });
});

describe('Update with Claude', () => {
  it('exports the whole rulebook with instructions and the request', () => {
    const out = exportForClaude(rules, 'Max says invites are now 30 per post.', '2026-10-27');
    expect(out).toMatch(/Max says invites are now 30 per post\./);
    expect(out).toMatch(/piano-agricolo-modifiche\/1/);
    const json = JSON.parse(out.split('```json')[1].split('```')[0]);
    expect(json.format).toBe('piano-agricolo-regole/1');
    expect(json.sections.map((s: { id: string }) => s.id)).toEqual(['recruiting', 'payments']);
    expect(json.sections[0].rules[1]).toEqual({
      id: 'invites', title: 'Invitations per post', status: 'confirmed', tags: ['upwork'], source: 'Max, #managers-updates',
      source_url: 'https://x.slack.com/p1', updated: '2026-10-26', body_md: 'Invite **20** freelancers at most per post.',
    });
  });

  it('reads the changes from Claude’s answer, text around the code block included', () => {
    const reply = 'Here you go:\n```json\n' + JSON.stringify({
      format: 'piano-agricolo-modifiche/1', summary: 'Invites go to 30.', questions: ['Does this apply to zone A too?'],
      changes: [
        { op: 'upsert_rule', id: 'invites', body_md: 'Invite **30** freelancers.', status: 'confirmed', source: 'Max DM 27/10' },
        { op: 'upsert_section', id: 'onboarding', title: 'Onboarding' },
        { op: 'upsert_rule', id: 'slack-invite', section: 'onboarding', title: 'Slack invite', body_md: 'After the contract starts.', tags: ['Slack'] },
        { op: 'delete_rule', id: 'old-monthly' },
      ],
    }, null, 2) + '\n```\nLet me know!';
    const r = parseClaudeReply(reply);
    expect(r.summary).toBe('Invites go to 30.');
    expect(r.questions).toEqual(['Does this apply to zone A too?']);
    expect(r.changes).toEqual([
      { op: 'upsert_rule', id: 'invites', body: '<p>Invite <b>30</b> freelancers.</p>', status: 'confirmed', source: 'Max DM 27/10' },
      { op: 'upsert_section', id: 'onboarding', title: 'Onboarding' },
      { op: 'upsert_rule', id: 'slack-invite', section: 'onboarding', title: 'Slack invite', body: '<p>After the contract starts.</p>', tags: ['slack'] },
      { op: 'delete_rule', id: 'old-monthly' },
    ]);
  });

  it('explains what is wrong with an answer it cannot use', () => {
    expect(() => parseClaudeReply('Sure! I updated the rules.')).toThrow(/non c’è JSON/);
    expect(() => parseClaudeReply('```json\n{"changes": [\n```')).toThrow(/non è valido/);
    expect(() => parseClaudeReply('{"format":"piano-agricolo-modifiche/1","changes":[{"op":"rename","id":"x"}]}')).toThrow(/modifica 1: operazione sconosciuta "rename"/);
    expect(() => parseClaudeReply('{"format":"piano-agricolo-modifiche/1","changes":[{"op":"delete_rule","id":"Bad Id"}]}')).toThrow(/modifica 1: .*id/);
    expect(() => parseClaudeReply('{"format":"piano-agricolo-modifiche/1","changes":[{"op":"upsert_rule","id":"x","status":"maybe"}]}')).toThrow(/modifica 1: .*stato/);
  });

  it('accepts an answer with questions only and no changes', () => {
    expect(parseClaudeReply('{"format":"piano-agricolo-modifiche/1","changes":[],"questions":["Which countries?"]}')).toEqual({ changes: [], summary: '', questions: ['Which countries?'] });
  });

  it('previews what each change will do before it is applied', () => {
    const { changes } = parseClaudeReply(JSON.stringify({ format: 'piano-agricolo-modifiche/1', changes: [
      { op: 'upsert_rule', id: 'invites', body_md: 'Invite **30** freelancers.', status: 'confirmed' },
      { op: 'upsert_rule', id: 'reuse', status: 'confirmed', title: 'Reuse posting (99 invites)' },
      { op: 'upsert_rule', id: 'new-one', section: 'payments', title: 'New rule', body_md: 'Text' },
      { op: 'upsert_rule', id: 'orphan', section: 'nowhere', title: 'Lost', body_md: 'Text' },
      { op: 'delete_rule', id: 'old-monthly' },
      { op: 'upsert_rule', id: 'monday', status: 'confirmed' },
    ] }));
    expect(previewChanges(rules, changes)).toEqual([
      { kind: 'changed', id: 'invites', title: 'Invitations per post', details: ['testo cambiato'], problem: null },
      { kind: 'changed', id: 'reuse', title: 'Reuse posting (99 invites)', details: ['titolo: “Reuse posting” → “Reuse posting (99 invites)”', 'stato: Da confermare → Confermata'], problem: null },
      { kind: 'added', id: 'new-one', title: 'New rule', details: ['in Payments', 'stato: Da confermare'], problem: null },
      { kind: 'added', id: 'orphan', title: 'Lost', details: ['in nowhere', 'stato: Da confermare'], problem: 'Non esiste la sezione “nowhere”.' },
      { kind: 'deleted', id: 'old-monthly', title: 'Monthly milestones', details: [], problem: null },
      { kind: 'unchanged', id: 'monday', title: 'Payday is Monday', details: [], problem: null },
    ]);
  });
});

describe('bare links', () => {
  it('turns a bare https address into a link, and keeps it bare in Markdown', () => {
    const html = markdownToHtml('Join: https://join.slack.com/t/x_y/abc. Thanks');
    expect(html).toBe('<p>Join: <a href="https://join.slack.com/t/x_y/abc" target="_blank" rel="noopener noreferrer">https://join.slack.com/t/x_y/abc</a>. Thanks</p>');
    expect(htmlToMarkdown(html)).toBe('Join: https://join.slack.com/t/x_y/abc. Thanks');
  });
});

describe('placeholders in Markdown', () => {
  it('keeps “<name>” style placeholders as text, and still drops real tags it does not allow', () => {
    expect(markdownToHtml('Name it “Week <number>” for <Name & co>.')).toBe('<p>Name it “Week &lt;number&gt;” for &lt;Name &amp; co&gt;.</p>');
    expect(markdownToHtml('a <script>x()</script> b')).toBe('<p>a  b</p>');
  });
});
