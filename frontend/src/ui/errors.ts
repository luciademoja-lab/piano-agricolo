import { RepoError } from '../data/repo';

/** Una frase per chi usa il tool, per qualsiasi errore del repository. */
export function errorText(e: unknown): string {
  if (e instanceof RepoError) {
    if (e.code === 'network') return e.message || 'Impossibile salvare. Controlla la connessione e riprova.';
    return e.message;
  }
  return 'Qualcosa è andato storto. Ricarica la pagina e riprova.';
}
