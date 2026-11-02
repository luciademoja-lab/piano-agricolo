// The Regolamenti in memory, with the same checks as rules_apply() in the database.
// Used by the in-memory repository (demo mode and end-to-end tests).
import { ID_RE, RULE_BODY_MAX, RULE_STATUSES, type ApplyResult, type Rule, type RuleChange, type RuleLog, type RuleSection, type Rules } from '../lib/rules';
import { RepoError } from './repo';

const fail = (code: ConstructorParameters<typeof RepoError>[0], msg: string): never => { throw new RepoError(code, msg); };

export function createMemoryRules(now: () => number, newId: (p: string) => string) {
  const ruleSections: RuleSection[] = [];
  const ruleEntries: Rule[] = [];
  const ruleLog: RuleLog[] = [];
  const ruleFiles = new Map<string, string>();
  // Same checks as rules_apply() in the database. Works on copies, so a failing batch changes nothing.
  function applyRules(changes: RuleChange[], actor: string | null, via: 'editor' | 'claude'): ApplyResult {
    if (changes.length > 500) fail('invalid', 'Troppe modifiche in una volta (500 al massimo).');
    const secs = structuredClone(ruleSections), rules = structuredClone(ruleEntries), log: RuleLog[] = [];
    const res = { created: 0, changed: 0, deleted: 0 };
    const add = (entryId: string, title: string, action: RuleLog['action'], fields: string[] = []) =>
      log.push({ id: newId('rl'), at: now(), actor, entryId, title, action, via, fields });
    for (const c of changes) {
      if (!['upsert_section', 'delete_section', 'upsert_rule', 'delete_rule'].includes(c.op)) fail('invalid', `Modifica sconosciuta "${String(c.op)}".`);
      if (!ID_RE.test(c.id || '')) fail('invalid', `"${c.id}" non è un id valido (lettere minuscole, cifre e trattini).`);
      if (c.op === 'upsert_section') {
        const s = secs.find((x) => x.id === c.id);
        const title = (c.title ?? '').trim();
        if ((!s || c.title !== undefined) && (title.length < 1 || title.length > 80)) fail('invalid', `La sezione "${c.id}" ha bisogno di un titolo da 1 a 80 caratteri.`);
        if (!s) {
          secs.push({ id: c.id, title, position: c.position ?? Math.max(0, ...secs.map((x) => x.position)) + 1 });
          add(c.id, title, 'section_created'); res.created++;
        } else if ((c.title !== undefined && title !== s.title) || (c.position !== undefined && c.position !== s.position)) {
          if (c.title !== undefined) s.title = title;
          if (c.position !== undefined) s.position = c.position;
          add(c.id, s.title, 'section_changed'); res.changed++;
        }
      } else if (c.op === 'delete_section') {
        const i = secs.findIndex((x) => x.id === c.id); if (i < 0) fail('not_found', `Non esiste la sezione "${c.id}".`);
        if (rules.some((x) => x.section === c.id)) fail('invalid', `La sezione "${secs[i].title}" ha ancora regole: spostale o cancellale prima.`);
        add(c.id, secs[i].title, 'section_deleted'); secs.splice(i, 1); res.deleted++;
      } else if (c.op === 'delete_rule') {
        const i = rules.findIndex((x) => x.id === c.id); if (i < 0) fail('not_found', `Non esiste la regola "${c.id}".`);
        add(c.id, rules[i].title, 'deleted'); rules.splice(i, 1); res.deleted++;
      } else {
        if (c.section !== undefined && !secs.some((x) => x.id === c.section)) fail('invalid', `La regola "${c.id}" punta alla sezione "${c.section}", che non esiste.`);
        const title = c.title?.trim();
        if (c.title !== undefined && (!title || title.length > 200)) fail('invalid', `La regola "${c.id}" ha bisogno di un titolo da 1 a 200 caratteri.`);
        if (c.status !== undefined && !RULE_STATUSES.includes(c.status)) fail('invalid', `Stato sconosciuto "${c.status}".`);
        const url = c.source_url?.trim() || null;
        if (url && !/^https?:\/\//i.test(url)) fail('invalid', `Il link della fonte della regola "${c.id}" deve iniziare con https://.`);
        if ((c.body || '').length > RULE_BODY_MAX) fail('invalid', `La regola "${c.id}" è troppo lunga.`);
        const tags = c.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean);
        const old = rules.find((x) => x.id === c.id);
        if (!old) {
          if (!c.section) fail('invalid', `La nuova regola "${c.id}" ha bisogno di una sezione.`);
          if (!title) fail('invalid', `La nuova regola "${c.id}" ha bisogno di un titolo.`);
          rules.push({ id: c.id, section: c.section!, title: title!, body: c.body ?? '', status: c.status ?? 'to_confirm', source: c.source?.trim() ?? '', sourceUrl: url,
            tags: tags ?? [], position: c.position ?? Math.max(0, ...rules.filter((x) => x.section === c.section).map((x) => x.position)) + 1, updatedBy: actor, updatedAt: now() });
          add(c.id, title!, 'created'); res.created++;
        } else {
          const n: Rule = { ...old, ...(c.section !== undefined && { section: c.section }), ...(title !== undefined && { title }), ...(c.body !== undefined && { body: c.body ?? '' }),
            ...(c.status !== undefined && { status: c.status }), ...(c.source !== undefined && { source: c.source.trim() }), ...(c.source_url !== undefined && { sourceUrl: url }),
            ...(tags !== undefined && { tags }), ...(c.position !== undefined && { position: c.position }) };
          const fields = [n.section !== old.section && 'section', n.title !== old.title && 'title', n.body !== old.body && 'body', n.status !== old.status && 'status',
            (n.source !== old.source || n.sourceUrl !== old.sourceUrl) && 'source', n.tags.join() !== old.tags.join() && 'tags', n.position !== old.position && 'position']
            .filter((f): f is string => !!f);
          if (fields.length) {
            Object.assign(old, n, { updatedBy: actor, updatedAt: now() });
            if (fields.join() !== 'position') add(c.id, n.title, 'changed', fields);
            res.changed++;
          }
        }
      }
    }
    ruleSections.splice(0, ruleSections.length, ...secs);
    ruleEntries.splice(0, ruleEntries.length, ...rules);
    ruleLog.unshift(...log.reverse());
    return res;
  }

  return {
    apply: applyRules,
    load: (): Rules => structuredClone({ sections: ruleSections, rules: ruleEntries, log: ruleLog.slice(0, 200) }),
    files: ruleFiles,
  };
}
