# Piano agricolo

Il cruscotto del progetto agricolo di Cinquefrondi: colture, spazio, prospetti di guadagno da 1 mese a 3 anni, spese con le date, calendario dei task e regolamenti. Tutto in un posto, con la fonte di ogni numero.

Costruito sulla base del tool Sophia-CM-Shifts: stessi login, stessa pagina dei regolamenti, stesso modo di lavorare (regole nel database, demo in memoria, test).

> **Provalo in un minuto.** `npm install && npm run dev`, apri http://localhost:5173 ed entra come `lucia` / `demo2026pass`. Senza database gira in modalità demo: niente viene salvato.

---

## Come si usa

**Coltivazioni → + Aggiungi.**
1. Scegli la coltura dal menu a tendina.
2. Indica i m² da assegnare (e il numero di galline per il pollaio).
3. Scegli il periodo di avvio: la data di inizio si può prendere **solo dentro la finestra** di quella coltura.
4. Indica la quota della produzione che pensi di vendere davvero.
5. Premi Invio.

La coltura entra nel piano e si apre la sua pagina: prospetto, spesa iniziale, prossimi task e calendario.

**Le schede**
- **Panoramica**: spazio usato, ricavi e saldo, ore di lavoro, task in ritardo, i numeri che contano per il bando (Produzione Standard, ore, esonero IVA, scadenza per l'età).
- **Coltivazioni**: le colture nel piano e il catalogo, con il ciclo di vendita di ognuna.
- **Prospetti**: saldo cumulato in tre scenari (pessimista, base, ottimista), tabelle per 1, 3, 6 mesi e 1, 2, 3 anni, anno per anno, per coltura e mese per mese.
- **Spese**: investimenti dallo schema e spese aggiunte a mano. "Segna pagata" registra l'importo vero, che da quel momento vale in tutti gli scenari.
- **Calendario**: i task giorno per giorno, **rossi se non fatti, verdi se fatti**. Un clic li segna. Ci sono anche le spese.
- **Task**: in ritardo, prossimi 7 giorni, più avanti, fatti. Si possono aggiungere task a mano.
- **Regolamenti**: leggi, regole e fonti, ognuna *confermata* o *da confermare*. Si aggiornano con "Aggiorna con Claude".
- **Impostazioni**: spazio esterno e interno disponibile, ultimo giorno per la domanda di primo insediamento.

**Due ruoli.** *Admin* cambia tutto. *Sola lettura* vede tutto e non cambia niente (per un socio, il CAA, un consulente): crea il login da **Persone**.

## Catalogo funghi (pubblico) e listino

- **La homepage è il catalogo pubblico**: si vede senza login, da telefono e tablet. Dice sempre "listino provvisorio" e "preordini / manifestazioni di interesse": niente vendita finché non ci sono le autorizzazioni sanitarie. **Accedi** in alto porta alla dashboard.
- **Funghi** (nella dashboard) mostra per ogni varietà il costo al kg, i prezzi minimi ai ristoranti e ai privati, il prezzo all'ingrosso di mercato e l'esito ("non conveniente" se il tuo minimo supera il prezzo all'ingrosso più alto trovato). Da qui pubblichi il listino che vedono i ristoratori.
- Formula: costo al kg = (balla + quota di spedizione + energia e acqua del locale per la durata del ciclo) ÷ kg venduti + imballaggio. Kg venduti = peso della balla × resa attesa × (1 − scarto). Prezzo minimo = costo × (1 + margine). Il calcolo è in `frontend/src/lib/pricing.ts`, con i test.
- Tutti i numeri (varietà e parametri) sono nel database con fonte e data, modificabili dall'admin. La prima versione è `backend/supabase/seed/funghi_v1.json`; dopo averlo cambiato, `npm run funghi:sql` rigenera la migrazione. Le modifiche fatte dalla dashboard non vengono sovrascritte.
- Chi vede cosa lo decide il database: senza login si legge solo `catalog_public()` (nomi, cucina, foto, tempi, listino pubblicato); costi, fornitori e fonti solo admin e sola lettura. Una specie fuori dall'elenco di quelle vendibili (DPR 376/95) non può entrare nel catalogo pubblico.

## Marchio (logo, post, stampe)

La scheda **Marchio** fa dentro l'app quello che fanno i servizi di branding in abbonamento, senza abbonamento.

- **Logo e colori**: logo originale (un fungo il cui cappello è anche un sole che sorge) in tre forme (orizzontale, verticale, solo simbolo) e tre versioni (a colori, su fondo oliva, a un colore). Si scarica in **SVG** vettoriale, con le scritte trasformate in tracciati (si apre uguale ovunque, va bene per la tipografia), e in **PNG**. Nome e sottotitolo si cambiano dalla scheda. Colori e caratteri del kit sono in `frontend/src/lib/brandkit.ts`.
- **Post per i social**: immagini 1080×1350, 1080×1080 o 1080×1920 da tre modelli (la storia di un fungo, raccolti stamattina, un'offerta), con la foto del catalogo (il nome dell'autore resta sull'immagine) o una tua. Il testo del post si scrive da solo dalle storie e dalle offerte e segue le stesse regole: niente promesse sulla salute, niente "compra" finché la vendita non parte.
- **Biglietto e volantino**: 10 biglietti da 85×55 mm o 2 volantini A5 su un A4, con il QR code che porta al questionario dei preordini. Si stampano o si salvano in PDF dal browser (dimensioni effettive, 100%).
- I caratteri (Fraunces e Public Sans, licenza OFL) sono dentro l'app, da `@fontsource`; le scritte del logo diventano tracciati con `opentype.js`; il QR code viene da `qrcode-generator`. La scheda si carica solo quando la apri.

## Da dove vengono i numeri

Il catalogo delle colture è in `backend/supabase/seed/catalog_v1.json`.
- **Ricavi, budget, spazio e ore** vengono dallo *Schema operativo coltivazioni* di Rendita Agricola. Lo schema stesso dice che sono stime da case study dei corsisti, quindi nel tool sono **da confermare**. Lo schema è anche la prima regola in Regolamenti › Fonti e schede.
- **Finestre di avvio e task del ciclo** sono proposte di Claude, da verificare.
- **Dato mancante non vuol dire zero.** Dove lo schema non dice niente, il campo è `null` e il tool lo mostra come mancante. Succede per i costi ricorrenti (tutte le colture), per il ricavo di fiori eduli e olivo, per le ore di elicicoltura e olivo e per la Produzione Standard di quasi tutto.
- Alcuni numeri dello schema non sono plausibili. Le note di ogni coltura lo dicono, a partire dalla lombricoltura.

**Cambiare il catalogo**: modifica `catalog_v1.json`, poi `npm run catalog:sql` rigenera la migrazione `20261102090300_catalog_v1.sql`. Un test controlla che i due file siano allineati.

## Collegarlo al database (Supabase)

Usa un **progetto Supabase nuovo**, non quello del tool di Vik Studios.

1. Crea il progetto su supabase.com, poi:
   ```bash
   npx supabase --workdir backend link --project-ref <ref>
   npx supabase --workdir backend db push
   npx supabase --workdir backend functions deploy admin-users
   ```
2. In Authentication > Providers > Email, spegni "Allow new users to sign up".
3. Crea l'utente `lucia@login.piano-agricolo.app` (Authentication > Users > Add user, "Auto Confirm User") ed esegui `backend/supabase/bootstrap_admin.sql` nell'editor SQL, con la tua password.
4. Copia `.env.example` in `.env.local` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings > API), poi `npm run dev`.
5. In **Regolamenti** premi "Carica la prima versione": entrano lo schema PDF e le regole trovate il 2 novembre, tutte da confermare.

Per pubblicarlo online: Vercel, come per l'altro tool (le impostazioni sono in `vercel.json`).

## Struttura

```
frontend/src/lib/      logica pura: catalogo, finestre di avvio, piano, prospetti, date (test accanto a ogni file)
frontend/src/data/     repository: Supabase (live) o in memoria (demo ed e2e), stesse regole
frontend/src/ui/       le pagine
frontend/e2e/          test nel browser (demo)
backend/supabase/      migrazioni (tabelle, RLS, funzioni), seed del catalogo, test del database, funzione admin-users
scripts/               generatore della migrazione del catalogo
```

- Le regole che decidono se una coltura entra nel piano (finestra, spazio, quantità) stanno in `plan_add()` nel database e, uguali, in `lib/plan.ts`. I task del ciclo e la spesa iniziale li genera `lib/plan.ts`, una volta sola per le due modalità.
- Tutte le scritture passano da funzioni Postgres che controllano il ruolo. RLS lascia solo leggere.

## Test

```bash
npm test               # logica e repository in memoria
npm run test:db        # database: serve Postgres (npm run db:start, oppure DATABASE_URL)
npm run test:e2e       # nel browser: serve una volta `npx playwright install chromium`
npm run typecheck
```
