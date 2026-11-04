// L'identità della parte pubblica: un solo posto da cambiare.
export const BRAND = {
  name: 'Lucia De Mojà',
  title: 'Funghi coltivati a Cinquefrondi',
  place: 'Cinquefrondi · Piana di Gioia Tauro',
  /** come contattarti dal sito (email o link WhatsApp): finché è null il pulsante non compare */
  contact: null as null | { label: string; href: string },
  /** La mia storia, con le tue parole: un paragrafo per voce. Finché è vuota la sezione non compare. */
  story: [] as string[],
  education: [
    { title: 'Laurea magistrale in Biologia Molecolare', where: 'Högskolan i Skövde, Svezia' },
    { title: 'Laurea triennale in Scienze e Tecnologie Zootecniche', where: 'Università Magna Græcia, Catanzaro' },
    { title: 'Diploma di perito agrario', where: '' },
  ],
};
