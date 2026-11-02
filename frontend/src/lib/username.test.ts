import { describe, it, expect } from 'vitest';
import {
  normalizeUsername, validateUsername, loginEmail, validatePassword, usernameToEmail, emailToUsername, generatePassword, LOGIN_DOMAIN,
} from '../../../backend/supabase/functions/_shared/username.ts';

describe('usernames (logins made by us)', () => {
  it('normalizes case and spaces', () => {
    expect(normalizeUsername('  Regina.N ')).toBe('regina.n');
  });
  it('accepts simple handles', () => {
    expect(validateUsername('regina')).toBeNull();
    expect(validateUsername('kris_arevalo-2')).toBeNull();
  });
  it('rejects bad handles with a reason', () => {
    expect(validateUsername('ab')).toBe('Il nome utente deve avere da 3 a 32 caratteri.');
    expect(validateUsername('a'.repeat(33))).toBe('Il nome utente deve avere da 3 a 32 caratteri.');
    expect(validateUsername('regina nemeth')).toBe('Usa solo lettere, numeri, punti, trattini e trattini bassi.');
    expect(validateUsername('.regina')).toBe('Inizia con una lettera o un numero.');
    expect(validateUsername('régina')).toBe('Usa solo lettere, numeri, punti, trattini e trattini bassi.');
  });
  it('signs in with a username or, if typed, a full email', () => {
    expect(loginEmail(' Lucia ')).toBe(`lucia@${LOGIN_DOMAIN}`);
    expect(loginEmail(' Operations2@VikStudios.com ')).toBe('operations2@vikstudios.com');
  });
  it('maps a username to the internal sign-in email and back', () => {
    expect(usernameToEmail('Regina')).toBe(`regina@${LOGIN_DOMAIN}`);
    expect(emailToUsername(`regina@${LOGIN_DOMAIN}`)).toBe('regina');
    expect(emailToUsername('someone@gmail.com')).toBeNull();
  });
});

describe('passwords', () => {
  it('requires at least 10 characters with a letter and a number', () => {
    expect(validatePassword('short1')).toBe('La password deve avere almeno 10 caratteri.');
    expect(validatePassword('onlyletters')).toBe('La password deve contenere almeno una lettera e un numero.');
    expect(validatePassword('1234567890')).toBe('La password deve contenere almeno una lettera e un numero.');
    expect(validatePassword('shifts2026ok')).toBeNull();
  });
  it('generates passwords that pass the rules and avoid look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      expect(validatePassword(p)).toBeNull();
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});
