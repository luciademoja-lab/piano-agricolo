// Writes the migration that loads the crop catalogue into the database, from
// backend/supabase/seed/catalog_v1.json. Run with: npm run catalog:sql
// (A unit test checks the migration still matches the JSON.)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_JSON = join(root, 'backend/supabase/seed/catalog_v1.json');
export const CATALOG_SQL = join(root, 'backend/supabase/migrations/20261102090300_catalog_v1.sql');

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

export function catalogSql(json) {
  const { crops } = JSON.parse(json);
  const rows = crops.map((c, i) => `  (${q(c.id)}, ${i + 1}, ${q(c.name)}, ${q(c.space)}, ${q(JSON.stringify(c))}::jsonb)`);
  return [
    '-- Catalogo delle colture, versione 1: generato da backend/supabase/seed/catalog_v1.json',
    '-- con `npm run catalog:sql`. Non modificarlo a mano: cambia il JSON e rigeneralo.',
    'insert into public.crop_catalog (id, position, name, space, data) values',
    rows.join(',\n'),
    'on conflict (id) do update set position = excluded.position, name = excluded.name, space = excluded.space, data = excluded.data;',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(CATALOG_SQL, catalogSql(readFileSync(CATALOG_JSON, 'utf8')));
  console.log('Scritto', CATALOG_SQL);
}
