import { describe, it, expect } from 'vitest';
import { SEED_VARIETIES } from './pricing';
import { FORBIDDEN, STORIES } from './stories';

describe('the stories of the mushrooms', () => {
  it('cover every mushroom of the catalogue and of the questionnaire', () => {
    for (const v of SEED_VARIETIES) expect(STORIES[v.id], v.id).toBeDefined();
  });
  it('promise nothing about health and sell nothing yet', () => {
    for (const [id, s] of Object.entries(STORIES)) {
      for (const text of [s.badge, s.hook, s.story, s.why]) expect(text, id).not.toMatch(FORBIDDEN);
    }
    expect('aiuta la memoria').toMatch(FORBIDDEN);
    expect('Acquista ora').toMatch(FORBIDDEN);
  });
  it('stay short enough to read on a phone', () => {
    for (const [id, s] of Object.entries(STORIES)) {
      expect(s.badge.length, id).toBeLessThanOrEqual(26);
      expect(s.hook.length, id).toBeLessThanOrEqual(80);
      expect(s.story.length, id).toBeLessThanOrEqual(280);
    }
  });
});
