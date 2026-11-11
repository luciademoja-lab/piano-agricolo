// La storia di ogni fungo, per venderlo come lo farebbe Hormozi: un'etichetta che lo fa sentire
// importante, una frase che lo fa desiderare, da dove viene, e il risultato che porta in tavola.
//
// Regole (valgono per ogni riga, e un test le controlla):
//  - solo fatti veri e verificabili su origine, nome, aspetto e cucina;
//  - nessuna promessa sulla salute: quelle possibili sono solo le indicazioni di legge
//    calcolate in lib/nutrition.ts dai valori nutrizionali;
//  - niente "acquista" o "compra": per ora sono preordini.
// Fonti: Wikipedia "Shiitake" (nome; coltivazione documentata in Cina nel 1209; ~25% della
// produzione mondiale); naturnext.eu "Mushrooms at risk in Italy" (Hericium legato ai vecchi
// alberi dei boschi maturi, minacciato dalla loro scomparsa); mushroommountain.com (pioppino
// croccante, sapore di nocciola); nomi e usi in cucina dalle schede del catalogo.

export type Story = {
  /** a few words that make the mushroom feel special (shown on the photo) */
  badge: string;
  /** one line that makes you want it */
  hook: string;
  /** where it comes from, why it is called so */
  story: string;
  /** the result it brings to the table */
  why: string;
};

export const STORIES: Record<string, Story> = {
  'pleurotus-ostreatus': {
    badge: 'Il classico',
    hook: 'Il fungo che nasce quando arriva il freddo.',
    story: "Lo chiamano gelone perché in natura spunta sui tronchi con i primi geli, e orecchione per il cappello morbido a forma di orecchio. Cresce a ventagli, uno sull'altro, come le valve di un'ostrica: da qui il suo nome latino.",
    why: 'Delicato e versatile: è il fungo giusto anche per chi pensa di non amare i funghi.',
  },
  cardoncello: {
    badge: 'Il re dei pleurotus',
    hook: 'Sodo e carnoso: si taglia a fette e si griglia come una bistecca.',
    story: "In natura nasce nei pascoli del Sud, attaccato alle radici di un cardo selvatico: da lì il suo nome. Nel mondo lo chiamano king oyster, il re dei pleurotus. In Puglia e Basilicata è il fungo della tradizione.",
    why: 'Resta sodo anche dopo la cottura: in un piatto vegetariano può prendere il posto della carne.',
  },
  pioppino: {
    badge: 'Il fungo dei pioppi',
    hook: 'Cappello vellutato, gambo croccante e un profumo che sa di nocciola.',
    story: 'Il suo nome viene dai pioppi: in natura nasce a ciuffi sui loro tronchi. Si porta in tavola così, a mazzetti interi, come lo si raccoglie.',
    why: 'Resta croccante anche nel sugo: è il fungo dei risotti e dei piatti della tradizione italiana.',
  },
  shiitake: {
    badge: 'Otto secoli di storia',
    hook: 'Profumo intenso e quel sapore pieno che i giapponesi chiamano umami.',
    story: "Il nome giapponese vuol dire «fungo dello shii», l'albero sui cui tronchi nasce. La prima testimonianza scritta della sua coltivazione viene dalla Cina e risale al 1209. Oggi è uno dei funghi più coltivati al mondo.",
    why: 'Dà profondità a brodi, ramen e piatti vegani, senza bisogno di carne.',
  },
  'pleurotus-cornucopiae': {
    badge: "Il corno dell'abbondanza",
    hook: 'Ciuffi color crema con i cappelli a imbuto, come piccole cornucopie.',
    story: "Il suo nome latino viene dalla cornucopia, il corno dell'abbondanza dei miti antichi: in natura nasce a mazzi sui tronchi, con i cappelli che si aprono a imbuto.",
    why: "Più delicato dell'orecchione: perfetto per chi cerca un sapore leggero.",
  },
  'pleurotus-djamor': {
    badge: 'Rosa come un fiore',
    hook: 'Il fungo che sembra un fiore.',
    story: 'Viene dai paesi caldi e cresce a ventagli di un rosa acceso, come petali. In padella il rosa svanisce: chi lo vede crudo, però, non lo dimentica.',
    why: 'Uno spettacolo da mostrare al tavolo prima di cucinarlo.',
  },
  'pleurotus-citrinopileatus': {
    badge: "Grappoli d'oro",
    hook: 'Mazzi giallo limone che illuminano il piatto.',
    story: "Arriva dall'Asia orientale e nasce in grappoli giallo limone, sottili e delicati, con un profumo leggermente nocciolato.",
    why: 'Cuoce in pochi minuti e porta in tavola un colore che si vede di rado.',
  },
  hericium: {
    badge: 'Il più sorprendente',
    hook: 'Non ha cappello né lamelle: sembra una cascata di neve.',
    story: 'In natura vive sui vecchi alberi dei boschi più antichi, e con loro sta diventando sempre più raro. Al posto del cappello ha una criniera di aculei bianchi: da qui il suo nome.',
    why: "A fette, alla piastra, in tanti lo paragonano alla polpa di granchio o d'astice.",
  },
};

export const storyOf = (id: string): Story | null => STORIES[id] ?? null;

/** words that must never appear: health promises, or a sale before the sale starts */
export const FORBIDDEN = /\b(cura|curare|guarisc\w*|previen\w*|malatti\w*|cancro|tumor\w*|memoria|cervell\w*|immunit\w*|depurativ\w*|dimagr\w*|acquista\w*|compra\w*)\b/i;
