// Writes the migration that loads the mushroom varieties and the price parameters, from
// backend/supabase/seed/funghi_v1.json. Run with: npm run funghi:sql
// (A unit test checks the migration still matches the JSON.)
// Existing rows are left alone: the admin's changes in the dashboard win over the seed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FUNGHI_JSON = join(root, 'backend/supabase/seed/funghi_v1.json');
export const FUNGHI_SQL = join(root, 'backend/supabase/migrations/20261103090100_funghi_seed.sql');

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const qn = (s) => (s === null || s === undefined ? 'null' : q(s));

export function funghiSql(json) {
  const { params, varieties } = JSON.parse(json);
  const prow = params.map((p, i) =>
    `  (${q(p.key)}, ${i + 1}, ${q(p.group)}, ${q(p.label)}, ${q(p.unit)}, ${p.value}, ${q(p.source)}, ${qn(p.url)}, ${p.date ? q(p.date) + '::date' : 'null'})`);
  const vrow = varieties.map((v, i) => {
    const { public: pub, list, ...data } = v;
    const lw = list?.wholesale ?? null, lr = list?.retail ?? null;
    return `  (${q(v.id)}, ${i + 1}, ${pub ? 'true' : 'false'}, ${q(JSON.stringify(data))}::jsonb, ${lw ?? 'null'}, ${lr ?? 'null'}, ${lw !== null || lr !== null ? 'now()' : 'null'})`;
  });
  return [
    '-- Funghi, versione 1: parametri dei prezzi e varietà, generati da backend/supabase/seed/funghi_v1.json',
    '-- con `npm run funghi:sql`. Non modificarlo a mano: cambia il JSON e rigeneralo.',
    '-- Le righe già presenti non vengono toccate: le modifiche fatte dall\'admin restano.',
    'insert into public.price_params (key, position, grp, label, unit, value, source, source_url, source_date) values',
    prow.join(',\n'),
    'on conflict (key) do nothing;',
    '',
    'insert into public.varieties (id, position, public, data, list_wholesale, list_retail, list_updated_at) values',
    vrow.join(',\n'),
    'on conflict (id) do nothing;',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(FUNGHI_SQL, funghiSql(readFileSync(FUNGHI_JSON, 'utf8')));
  console.log('Scritto', FUNGHI_SQL);
}

// Valori nutrizionali: una migrazione a parte, che li aggiunge alle varietà che non li hanno ancora.
export const NUTRITION_JSON = join(root, 'backend/supabase/seed/funghi_nutrition_v1.json');
export const NUTRITION_SQL = join(root, 'backend/supabase/migrations/20261103180100_funghi_nutrition_seed.sql');

export function nutritionSql(json) {
  const { varieties } = JSON.parse(json);
  const rows = Object.entries(varieties).map(([id, n]) => `  (${q(id)}, ${q(JSON.stringify(n))}::jsonb)`);
  return [
    '-- Valori nutrizionali delle varietà, generati da backend/supabase/seed/funghi_nutrition_v1.json',
    '-- con `npm run funghi:sql`. Non modificarlo a mano: cambia il JSON e rigeneralo.',
    '-- Si aggiungono solo dove mancano: le modifiche fatte dall\'admin restano.',
    'update public.varieties v set data = v.data || jsonb_build_object(\'nutrition\', n.nutrition)',
    'from (values',
    rows.join(',\n'),
    ') as n(id, nutrition)',
    'where v.id = n.id and not (v.data ? \'nutrition\');',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(NUTRITION_SQL, nutritionSql(readFileSync(NUTRITION_JSON, 'utf8')));
  console.log('Scritto', NUTRITION_SQL);
}
