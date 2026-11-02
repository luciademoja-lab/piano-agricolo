// Coltivazioni: the crops in the plan, and the catalogue they come from.
import { useState } from 'react';
import { SPACE_LABEL, cropById, windowLabel } from '../lib/catalog';
import { dateLabel } from '../lib/dates';
import { m2 } from '../lib/format';
import { quantityLabel, spaceAvailable, usedSpace } from '../lib/plan';
import { missingFor } from '../lib/projection';
import { AddCropModal, CropFacts } from './AddCropModal';
import type { PageProps } from './shared';

export function CropsPage(props: PageProps) {
  const { farm, isAdmin, go } = props;
  const [adding, setAdding] = useState<{ crop?: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const out = usedSpace(farm.plantings, farm.catalog, 'outdoor'), inn = usedSpace(farm.plantings, farm.catalog, 'indoor');
  const inAvail = spaceAvailable(farm.settings, 'indoor');

  return (
    <section className="page" aria-labelledby="crops-h">
      <div className="panel-head">
        <div><div className="eyebrow">Piano d'azione</div><h2 id="crops-h">Coltivazioni</h2></div>
        {isAdmin && <button className="btn primary" type="button" onClick={() => setAdding({})}>+ Aggiungi</button>}
      </div>
      <p className="note">
        Spazio esterno: {m2(out)} usati su {m2(farm.settings.outdoorM2)} · Spazio interno: {inAvail === null ? <>{m2(inn)} usati, totale non indicato</> : <>{m2(inn)} usati su {m2(inAvail)}</>}
      </p>

      <div className="panel">
        <h3>Nel piano</h3>
        {!farm.plantings.length && (
          <div className="emptystate">
            <p>Il piano è vuoto. Aggiungi la prima coltura: il tool prepara i prospetti, la spesa iniziale e i task del suo ciclo.</p>
            {isAdmin && <button className="btn primary" type="button" onClick={() => setAdding({})}>+ Aggiungi una coltura</button>}
          </div>
        )}
        {farm.plantings.length > 0 && (
          <ul className="plantings">
            {farm.plantings.map((p) => {
              const c = cropById(farm.catalog, p.cropId);
              if (!c) return null;
              const late = farm.tasks.filter((t) => t.plantingId === p.id && !t.done && t.due < props.today).length;
              const missing = missingFor(c, p).length;
              return (
                <li key={p.id}>
                  <a href={`#/coltura/${p.id}`} onClick={(e) => { e.preventDefault(); go({ tab: 'coltivazioni', planting: p.id }); }}>
                    <b>{c.name}</b>
                    <span className="sub">{quantityLabel(c, p)} · {SPACE_LABEL[c.space].toLowerCase()} · dal {dateLabel(p.start)}{p.soldPct < 100 ? ` · vendita ${p.soldPct}%` : ''}</span>
                  </a>
                  <span className="badges">
                    {late > 0 && <span className="pill late">{late} task in ritardo</span>}
                    {missing > 0 && <span className="pill missing-tag">{missing} dati mancanti</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>Catalogo</h3>
        <p className="note">Dallo schema operativo di Rendita Agricola, da confermare (vedi Regolamenti › Fonti e schede). Le finestre di avvio e i task del ciclo sono proposte da verificare.</p>
        <ul className="catalog">
          {farm.catalog.map((c) => (
            <li key={c.id} className={open === c.id ? 'open' : ''}>
              <div className="cat-head">
                <button type="button" className="linkbtn cat-name" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>{c.name}</button>
                <span className="sub">{SPACE_LABEL[c.space]} · {windowLabel(c.windows)}</span>
                {isAdmin && <button type="button" className="btn small" onClick={() => setAdding({ crop: c.id })}>Aggiungi</button>}
              </div>
              {open === c.id && (
                <div className="cat-body">
                  <p><b>Ciclo di vendita.</b> {c.salesCycle}</p>
                  <p className="sub">Canali: {c.channels.join(' · ')} · {c.priceNote}</p>
                  <CropFacts crop={c} />
                  {c.notes.length > 0 && <ul className="warnlist">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {adding && <AddCropModal {...props} initialCrop={adding.crop} onClose={() => setAdding(null)} onAdded={(id) => { setAdding(null); go({ tab: 'coltivazioni', planting: id }); }} />}
    </section>
  );
}
