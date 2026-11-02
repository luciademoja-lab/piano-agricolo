import { describe, it, expect } from 'vitest';
import { errorText } from './errors';
import { RepoError, parseDbError } from '../data/repo';

describe('error messages', () => {
  it('shows the database reason as a sentence', () => {
    expect(errorText(parseDbError('ERR_INVALID: spazio esterno insufficiente: ne restano 0 m² su 1.000'))).toBe('Spazio esterno insufficiente: ne restano 0 m² su 1.000.');
    expect(errorText(parseDbError('ERR_FORBIDDEN: hai accesso in sola lettura'))).toBe('Hai accesso in sola lettura.');
  });
  it('falls back to a connection message', () => {
    expect(errorText(parseDbError('fetch failed'))).toBe('Impossibile salvare. Controlla la connessione e riprova.');
    expect(errorText(new Error('x'))).toBe('Qualcosa è andato storto. Ricarica la pagina e riprova.');
    expect(errorText(new RepoError('bad_login', 'Nome utente o password sbagliati.'))).toBe('Nome utente o password sbagliati.');
  });
});
