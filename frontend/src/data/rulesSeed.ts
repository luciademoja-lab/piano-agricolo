// The first version of the Regolamenti (2 November 2026): the PDF schema the catalogue is built on, and
// the rules found on the web while planning. Everything is "to_confirm": a rule becomes "confirmed" only
// when an office (SIAN, CAA, Region) or a professional confirms it in writing.
// Used by demo mode and by the "Carica la prima versione" button of the live tool, which applies it as the admin.
import { markdownToHtml, type RuleChange, type RuleStatus } from '../lib/rules';

type R = { id: string; title: string; status: RuleStatus; tags: string[]; source: string; url?: string; md: string };
const S = (id: string, title: string, rules: R[]) => ({ id, title, rules });

const BOOK = [
  S('come-funziona', 'Come funziona questa pagina', [
    { id: 'stati', title: 'Confermata, da confermare, superata', status: 'confirmed', tags: ['metodo'], source: 'Lucia, 2 nov 2026', md: `
Qui sta tutto quello che leggi, uffici e fonti dicono sul progetto. Non serve ricordarlo: serve sapere **da dove viene** e **quanto è aggiornato**.

- **Confermata**: un ufficio (SIAN, CAA, Regione) o un professionista l'ha confermata **per iscritto**. Scrivi chi e quando nella fonte.
- **Da confermare**: trovata in una fonte (web, schema, normativa), non ancora confermata da chi ha il compito di saperla.
- **Superata**: non vale più. Resta per vedere cosa è cambiato.

Le domande da fare agli uffici sono nel documento del progetto *progetto-agricolo.md*. Quando arriva una risposta scritta, aggiorna la regola con **Aggiorna con Claude** o con **Modifica**, e mettila in Confermata.` },
  ]),
  S('fonti', 'Fonti e schede', [
    { id: 'schema-operativo-coltivazioni', title: 'Schema operativo coltivazioni (Rendita Agricola)', status: 'to_confirm', tags: ['catalogo', 'ricavi', 'budget'],
      source: 'PDF "Schema operativo coltivazioni", Rendita Agricola (Lepren LLC)', url: 'https://renditaagricola.com', md: `
È la base del **catalogo delle colture** del tool: spazio, budget, avvio, ore, ricavi e canali di vendita di nove coltivazioni.

> "I ricavi sono stime basate su case study di corsisti Rendita Agricola. I risultati dipendono da gestione, marketing e condizioni locali." (nota dello schema)

| Coltura | Spazio | Budget | Avvio | Ore | Ricavo (schema) |
|---|---|---|---|---|---|
| Zafferano | 100–500 m² (10.000 bulbi in 100 m²) | €3.000–4.000 | dimora agosto, raccolta novembre | < 1 h/giorno | anno 1 ~€6.000 (80–100 g a €60/g), bulbi +30%/anno |
| Microgreens | 1–2 m² (50–100 vaschette) | €200–500 | 7–15 giorni | < 1 h/giorno | €500–1.000 ogni 7–15 giorni |
| Funghi (indoor) | 1–5–10 m² | €500–1.500 | ciclo ogni 30 giorni | < 1 h/giorno | €500–1.000/mese (min. 1 m²) |
| Orto eterno (no-dig) | 250 m² | €400–800 | dai primi mesi | 1 h/giorno | €800/mese su 250 m² |
| Pollaio da reddito | 60–100 m² per 20 galline | €1.000–1.500 | immediata | 4 h/mese + raccolta | €500–700/mese |
| Fiori eduli | indoor 2 m², outdoor 20 m² | €200–500 | tutto l'anno | 1 h/giorno | €500–1.000 (periodo non indicato) |
| Lombricoltura | 10–20 m² | < €500 | 6–12 mesi | 4–8 h/mese | €15.000–30.000/anno |
| Elicicoltura | min. 1.000 m², ottimale 5.000 | €5.000+ | avvio primavera, raccolta autunno | stagionale | 1 ha: €30.000–100.000 lordi, netto €8.000–15.000 |
| Olivo da specialista | 1–3 ettari | €5.000+ | 3–5 anni | stagionale | olio €20–50/l (resa non indicata) |

**Cosa non regge o manca**
- Lombricoltura: €15.000–30.000/anno su 10–20 m² vorrebbe dire 25–50 tonnellate di humus all'anno a €60/q. Comprende la vendita di lombrichi, che non è nel progetto.
- Fiori eduli: il ricavo non dice ogni quanto. Olivo: manca la resa. Elicicoltura e olivo: mancano le ore.
- Nessuna coltura ha i **costi ricorrenti** (substrato, semi, mangime, energia, imballaggi): nei prospetti sono un dato mancante.
- Le finestre di avvio e i task del ciclo nel catalogo sono **proposte di Claude**, non dello schema.` },
  ]),
  S('bando', 'Bando giovani agricoltori (SRE01)', [
    { id: 'sre01-requisiti', title: 'Primo insediamento: requisiti del bando 2025', status: 'to_confirm', tags: ['bando', 'sre01', 'finanziamenti'],
      source: 'Avviso pubblico SRE01, DDS n. 9287 del 26/06/2025, Regione Calabria (chiuso il 31/07/2025)', url: 'https://www.money.it/IMG/pdf/F5lkwwzInbwDTsBeI43nNAYi0zSITo7FEjT8dBan.pdf', md: `
Valgono per il bando 2025, già chiuso. **Il prossimo può cambiare**: da verificare al CAA quando esce.

- **Età**: tra 18 e 41 anni non compiuti alla domanda. La data limite si imposta in *Impostazioni*.
- **Premio**: fino a **€100.000**: il 70% va speso nel piano aziendale, il 30% è premio secco. Il piano deve valere almeno €50.000.
- **Titolo di studio**: la laurea magistrale, anche non agricola, è ammessa. A fine piano serve comunque un corso di almeno 150 ore.
- **Dimensione**: Produzione Standard tra **€12.000 e €200.000**; si può raggiungere anche entro il saldo.
- **Reddito e lavoro**: il piano deve dimostrare un reddito netto di almeno **€13.729** e **1.840 ore** di lavoro l'anno (–25% in zona montana o svantaggiata).
- **Terreno** in affitto o comodato: contratto scritto e registrato di **almeno 10 anni**; nel comodato chi presta rinuncia a chiederlo indietro prima.
- **Partita IVA agricola** aperta prima: al massimo **24 mesi** prima della domanda.
- **Impegni**: 5 anni come capo azienda; iscrizione INPS come IAP o coltivatore diretto entro 36 mesi.
- **Punteggi**: donna +2, agricoltura sociale o didattica +3, azienda piccola (€12.000–25.000) +25, titolo di studio.` },
    { id: 'produzione-standard', title: 'Produzione Standard: come si calcola', status: 'to_confirm', tags: ['bando', 'produzione standard'],
      source: 'Tabelle CREA usate nei bandi regionali (Sardegna, Emilia-Romagna, Basilicata, Piemonte)', md: `
È la somma di un valore fisso per ogni coltura (per ettaro o per 100 m²), per ogni gruppo di animali e per ogni alveare. **Non sono i soldi che incassi.**

- Funghi coltivati al coperto: circa €38.000 ogni 100 m² di bancale all'anno (Sardegna).
- Elicicoltura: €45.000 per ettaro (Basilicata, Piemonte).
- Api: €180–270 per alveare, secondo la regione.
- L'orto per la famiglia vale zero; trasformazione e agriturismo non contano.

**I valori calabresi vanno chiesti al CAA.** Nel tool la Produzione Standard conta solo le colture con un valore noto e elenca le altre come mancanti.` },
  ]),
  S('fisco', 'Fisco e forma dell’azienda', [
    { id: 'esonero-iva', title: 'Regime di esonero IVA per piccoli produttori', status: 'to_confirm', tags: ['iva', 'fisco'],
      source: 'Art. 34, comma 6, DPR 633/1972', url: 'https://brocardi.it/testo-unico-iva/titolo-ii/art34.html', md: `
- Vale fino a **€7.000** di volume d'affari l'anno, se almeno **due terzi** vengono dalla vendita di prodotti agricoli.
- Esonera da quasi tutti gli adempimenti IVA.
- Se vendi a un ristorante o a un negozio, l'**autofattura la emette l'acquirente**: va spiegato al ristoratore.
- Se superi la soglia, l'esonero cessa dall'anno successivo.` },
    { id: 'imprenditore-agricolo', title: 'Chi è imprenditore agricolo', status: 'to_confirm', tags: ['partita iva', 'inps'], source: 'Art. 2135 del Codice civile', md: `
È imprenditore agricolo chi coltiva, alleva e svolge attività connesse come trasformazione e vendita dei propri prodotti.

Da chiedere al CAA: se con 1.000 m² del terreno di famiglia e un locale in casa si può esserlo, e quanto costano i contributi INPS.

**Non aprire la partita IVA agricola prima di aver parlato con il CAA dei bandi.**` },
  ]),
  S('prodotti', 'Vendita dei prodotti', [
    { id: 'microgreens-germogli', title: 'Microgreens o germogli?', status: 'to_confirm', tags: ['microgreens', 'sian'],
      source: 'Reg. UE 208/2013 e 210/2013', md: `
Per la legge i **germogli** sono un'altra cosa, con regole più pesanti: lo stabilimento deve essere **riconosciuto** dall'autorità competente.

I microgreens ricevono la luce e fanno la fotosintesi. Se sono venduti vivi in vaschetta, non tagliati, potrebbero essere prodotto ortivo fresco. **Da far confermare per iscritto al SIAN** (domanda 1 dell'email).` },
    { id: 'piantine-ruop', title: 'Piantine e microgreens vivi: registro RUOP', status: 'to_confirm', tags: ['piantine', 'ruop', 'fitosanitario'],
      source: 'Reg. UE 2016/2031, art. 65; pagina RUOP della Regione Lazio (da verificare per la Calabria)', url: 'https://www.regione.lazio.it/cittadini/agricoltura/registrazione-nel-ruop', md: `
- Chi vende **solo e direttamente al consumatore finale** presso l'azienda di norma **non** deve registrarsi al RUOP.
- Vendita **online o a distanza**: la registrazione serve.
- Da chiedere al Servizio Fitosanitario Regionale della Calabria.` },
    { id: 'uova', title: 'Uova: esenzione per i piccoli pollai', status: 'to_confirm', tags: ['uova', 'galline'],
      source: 'Normativa UE sulla commercializzazione delle uova e decreto italiano di recepimento', md: `
Chi ha **fino a 50 galline** è esente dalla timbratura se vende su un **mercato pubblico locale** e indica nome e indirizzo nel punto vendita.

Da verificare: vendita a casa e registrazione del pollaio (SIAN o Servizio Veterinario).` },
    { id: 'humus', title: 'Humus: registro dei fabbricanti di fertilizzanti', status: 'to_confirm', tags: ['humus', 'lombrichi', 'fertilizzanti'],
      source: 'D.Lgs. 75/2010, art. 8', md: `
Per **vendere** humus come fertilizzante serve l'iscrizione al **Registro dei fabbricanti di fertilizzanti** prima della vendita, con conferma annuale entro il **31 dicembre**.

È il prodotto più complicato da mettere in regola. Usarlo per le proprie colture (microgreens, orto) non richiede l'iscrizione.` },
    { id: 'api', title: 'Api: denuncia e distanze', status: 'to_confirm', tags: ['api', 'miele'], source: 'L. 313/2004; art. 896-bis del Codice civile', md: `
- L'apicoltura è attività agricola anche senza terreno.
- Gli alveari si denunciano all'**Anagrafe apistica nazionale (BDA)**, anche se sono pochi.
- Distanze nazionali: **10 m** dalle strade di pubblico transito e **5 m** dai confini. Le regioni possono chiedere di più; siepi o muri continui possono ridurre l'obbligo.
- **Da verificare la legge calabrese.**` },
  ]),
  S('agriturismo', 'Agriturismo', [
    { id: 'agriturismo-calabria', title: 'Aprire un agriturismo in Calabria', status: 'to_confirm', tags: ['agriturismo'], source: 'L.R. Calabria 14/2009 (modificata dalla L.R. 19/2020)', md: `
1. Essere **imprenditore agricolo**.
2. Frequentare il corso di **operatore agrituristico** (almeno 30 ore).
3. Chiedere l'iscrizione all'**Elenco regionale degli operatori agrituristici**: domanda entro il **31 marzo** di ogni anno.
4. Presentare la **SCIA** al SUAP del Comune.

L'azienda agricola è il primo mattone obbligatorio dell'agriturismo.` },
  ]),
  S('uffici', 'Chi risponde a cosa', [
    { id: 'uffici', title: 'Uffici e professionisti', status: 'to_confirm', tags: ['contatti', 'sian', 'caa'], source: 'Piano del 2 nov 2026', md: `
| Ufficio | Di cosa si occupa | Costo |
|---|---|---|
| SIAN, ASP di Reggio Calabria | Igiene degli alimenti: microgreens, uova, funghi, humus come substrato | Pubblico |
| Servizio Veterinario, ASP | Registrazione del pollaio e degli alveari | Pubblico |
| Servizio Fitosanitario Regionale | Piantine e microgreens vivi (RUOP) | Pubblico |
| CAA (Coldiretti, CIA, Confagricoltura) | Partita IVA, fascicolo aziendale, INPS, bandi, Produzione Standard, agriturismo | Da chiedere |
| Commercialista agricolo | Tasse, contributi, conti | Preventivo prima |
| ARSAC | Assistenza tecnica di coltivazione | Da chiedere |
| Associazione apicoltori | Corso base, primi alveari, denuncia BDA | Da chiedere |

**Metodo**: al telefono solo per avere nome ed email del referente; le domande per iscritto e numerate, così la risposta resta, ha una data e si può mostrare.` },
  ]),
];

export function rulesSeed(): RuleChange[] {
  const out: RuleChange[] = [];
  BOOK.forEach((s, si) => {
    out.push({ op: 'upsert_section', id: s.id, title: s.title, position: si + 1 });
    s.rules.forEach((r, ri) => out.push({
      op: 'upsert_rule', id: r.id, section: s.id, title: r.title, status: r.status, tags: r.tags, source: r.source, source_url: r.url ?? null,
      position: ri + 1, body: markdownToHtml(r.md.trim()),
    }));
  });
  return out;
}
