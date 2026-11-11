// L'identità della parte pubblica: un solo posto da cambiare.
export const BRAND = {
  name: 'Lucia De Mojà',
  title: 'Funghi coltivati a Cinquefrondi',
  place: 'Cinquefrondi · Piana di Gioia Tauro',
  /** come contattarti dal sito (email o link WhatsApp): finché è null il pulsante non compare */
  contact: { label: 'Scrivimi una email', href: 'mailto:luciademoja@gmail.com' } as null | { label: string; href: string },
  /** l'email dell'informativa sulla privacy (chi tratta i dati e a chi scrivere): finché è null l'informativa dice di rispondere a una tua email */
  email: 'luciademoja@gmail.com' as null | string,
  /** La mia storia, con le tue parole: un paragrafo per voce. Finché è vuota la sezione non compare. */
  story: [] as string[],
  /**
   * Le offerte, una per chi ha un locale e una per le famiglie. Sono preordini:
   * niente si compra finché la vendita non parte (registrazione all'ASL).
   * Seguono Hormozi: il risultato che si ottiene, subito, con zero fatica, una garanzia,
   * un regalo e un limite vero (produco poco). Ogni frase deve restare vera: se cambia qualcosa, si cambia qui.
   */
  offers: [
    {
      kind: 'ristorante' as const,
      who: 'Per i ristoranti',
      name: "L'abbonamento fresco di giornata",
      promise: 'Funghi raccolti la mattina e in cucina lo stesso giorno, ogni settimana.',
      points: [
        'Ordine fisso, sempre nello stesso giorno: non devi ricordarti di ordinare.',
        'Un assaggio gratis prima di decidere.',
        'In regalo, la scheda di ogni fungo da usare nel menù: nome, provenienza e come lo coltivo.',
      ],
      guarantee: 'Se un fungo non è perfetto, lo sostituisco alla consegna successiva.',
      limit: 'Produco in piccolo: posso seguire pochi ristoranti per volta.',
      cta: 'Prenota il tuo posto',
    },
    {
      kind: 'privato' as const,
      who: 'Per le famiglie',
      name: 'La cassetta di funghi freschi',
      promise: 'Funghi raccolti in giornata, coltivati a pochi chilometri da casa tua.',
      points: [
        'Scegli tu ogni quanto: ogni settimana, ogni due settimane o una volta al mese.',
        'In ogni cassetta una ricetta semplice e come conservarli.',
        'Le prime cassette vanno a chi si prenota per primo.',
      ],
      guarantee: 'Se un fungo non è perfetto, lo sostituisco alla consegna successiva.',
      limit: null as string | null,
      cta: 'Preordina la tua cassetta',
    },
  ],
  education: [
    { title: 'Laurea magistrale in Biologia Molecolare', where: 'Högskolan i Skövde, Svezia' },
    { title: 'Laurea triennale in Scienze e Tecnologie Zootecniche', where: 'Università Magna Græcia, Catanzaro' },
    { title: 'Diploma di perito agrario', where: '' },
  ],
};
