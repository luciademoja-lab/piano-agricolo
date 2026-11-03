-- Catalogo funghi e listino provvisorio.
-- varieties: una riga per varietà; data è la voce di backend/supabase/seed/funghi_v1.json (senza "public").
-- price_params: margini, energia, locale, temperature mese per mese; ognuno con la sua fonte e data.
-- Il costo per kg e i prezzi minimi li calcola frontend/src/lib/pricing.ts (testato); qui si salva
-- il listino che l'admin decide di pubblicare (list_wholesale, list_retail).
--
-- Chi vede cosa (imposto qui, non solo nell'interfaccia):
--   - chiunque, anche senza login: solo catalog_public() -> nomi, uso in cucina, foto, tempi, listino pubblicato,
--     e solo delle varietà pubbliche;
--   - admin e sola lettura: tutte le righe, con costi, fornitori, fonti;
--   - scrive solo l'admin, attraverso le funzioni qui sotto.

create table public.varieties (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  position int not null default 0,
  public boolean not null default false,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  list_wholesale numeric check (list_wholesale is null or list_wholesale > 0),
  list_retail numeric check (list_retail is null or list_retail > 0),
  list_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.price_params (
  key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  position int not null default 0,
  grp text not null,
  label text not null,
  unit text not null default '',
  value numeric not null,
  source text not null check (length(btrim(source)) between 1 and 1000),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_date date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- Chi lavora sul piano (admin o sola lettura, attivo). Un futuro ruolo "cliente" non ci rientra.
create function public._is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role in ('admin', 'viewer'))
$$;

do $$
declare t text;
begin
  foreach t in array array['varieties', 'price_params'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy "lo staff legge" on public.%I for select to authenticated using (public._is_staff())', t);
  end loop;
end $$;

-- Un intervallo {"min": n, "max": n} valido, oppure null.
create function public._range_ok(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select r is null or jsonb_typeof(r) = 'null' or (
    jsonb_typeof(r) = 'object' and jsonb_typeof(r -> 'min') = 'number' and jsonb_typeof(r -> 'max') = 'number'
    and (r ->> 'min')::numeric <= (r ->> 'max')::numeric
  )
$$;

-- Il catalogo pubblico: solo i campi che può vedere un ristoratore, solo le varietà pubbliche.
create function public.catalog_public()
returns table (id text, "position" int, data jsonb, list_wholesale numeric, list_retail numeric, list_updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.position,
    jsonb_build_object(
      'commonName', v.data -> 'commonName', 'scientificName', v.data -> 'scientificName', 'otherNames', v.data -> 'otherNames',
      'kitchen', v.data -> 'kitchen', 'photo', v.data -> 'photo',
      'shipDays', v.data -> 'shipDays', 'incubationDays', v.data -> 'incubationDays', 'firstHarvestDays', v.data -> 'firstHarvestDays'
    ),
    v.list_wholesale, v.list_retail, v.list_updated_at
  from public.varieties v
  where v.public and v.data ->> 'legal' = 'ammesso'
  order by v.position, v.id
$$;

-- Crea o aggiorna una varietà. I calcoli non dipendono da qui; qui si controlla che i dati abbiano senso.
create function public.variety_save(p_id text, p_position int, p_public boolean, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  k text;
begin
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,49}$' then raise exception 'ERR_INVALID: codice non valido: solo lettere minuscole, numeri e trattini'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ERR_INVALID: dati della varietà non validi'; end if;
  if length(btrim(coalesce(p_data ->> 'commonName', ''))) = 0 then raise exception 'ERR_INVALID: indica il nome comune'; end if;
  if length(btrim(coalesce(p_data ->> 'scientificName', ''))) = 0 then raise exception 'ERR_INVALID: indica il nome scientifico'; end if;
  if coalesce(p_data ->> 'legal', '') not in ('ammesso', 'non_in_elenco') then raise exception 'ERR_INVALID: stato legale non valido'; end if;
  if coalesce(p_public, false) and p_data ->> 'legal' <> 'ammesso' then
    raise exception 'ERR_INVALID: una specie che non è nell''elenco di quelle vendibili non può stare nel catalogo pubblico';
  end if;
  foreach k in array array['shipDays', 'incubationDays', 'firstHarvestDays', 'fruitingDays', 'yieldPct'] loop
    if not public._range_ok(p_data -> k) then raise exception 'ERR_INVALID: intervallo non valido (%)', k; end if;
  end loop;
  if not (public._range_ok(p_data #> '{incubation,t}') and public._range_ok(p_data #> '{incubation,rh}')
      and public._range_ok(p_data #> '{fruiting,t}') and public._range_ok(p_data #> '{fruiting,rh}')
      and public._range_ok(p_data #> '{market,wholesale}') and public._range_ok(p_data #> '{market,retail}')) then
    raise exception 'ERR_INVALID: intervallo non valido (temperature, umidità o prezzi di mercato)';
  end if;
  if jsonb_typeof(p_data -> 'yieldPct') = 'object' and (p_data #>> '{yieldPct,max}')::numeric > 100 then
    raise exception 'ERR_INVALID: la resa non può superare il 100%% del peso della balla';
  end if;
  if jsonb_typeof(p_data -> 'supply') <> 'object' or coalesce(p_data #>> '{supply,mode}', '') not in ('balla', 'ingrosso') then
    raise exception 'ERR_INVALID: dati del fornitore non validi';
  end if;

  insert into public.varieties (id, position, public, data, updated_at, updated_by)
  values (p_id, coalesce(p_position, 0), coalesce(p_public, false), p_data - 'public', now(), me.id)
  on conflict (id) do update set position = excluded.position, public = excluded.public, data = excluded.data,
    updated_at = now(), updated_by = me.id;
end $$;

-- Pubblica nel listino provvisorio i prezzi al kg (null = "prezzo in definizione").
create function public.variety_publish(p_id text, p_wholesale numeric, p_retail numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if (p_wholesale is not null and p_wholesale <= 0) or (p_retail is not null and p_retail <= 0) then
    raise exception 'ERR_INVALID: i prezzi del listino devono essere più di 0';
  end if;
  update public.varieties set list_wholesale = p_wholesale, list_retail = p_retail,
    list_updated_at = case when p_wholesale is null and p_retail is null then null else now() end,
    updated_at = now(), updated_by = me.id
  where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa varietà non esiste più'; end if;
end $$;

-- Cambia un parametro: valore, fonte (obbligatoria), link e data della fonte.
create function public.param_set(p_key text, p_value numeric, p_source text, p_url text, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if p_value is null then raise exception 'ERR_INVALID: indica un numero'; end if;
  if p_value < 0 and p_key not like 'temp\_%' then raise exception 'ERR_INVALID: il valore non può essere negativo'; end if;
  if length(btrim(coalesce(p_source, ''))) = 0 then raise exception 'ERR_INVALID: indica la fonte (anche "ipotesi" o "misura mia")'; end if;
  if p_url is not null and btrim(p_url) <> '' and p_url !~ '^https?://' then raise exception 'ERR_INVALID: il link della fonte deve iniziare con http:// o https://'; end if;
  update public.price_params set value = p_value, source = btrim(p_source), source_url = nullif(btrim(coalesce(p_url, '')), ''),
    source_date = p_date, updated_at = now(), updated_by = me.id
  where key = p_key;
  if not found then raise exception 'ERR_INVALID: parametro sconosciuto'; end if;
end $$;

revoke execute on function public._is_staff() from public, anon;
grant execute on function public._is_staff() to authenticated;
revoke execute on function public._range_ok(jsonb) from public, anon, authenticated;
revoke execute on function public.catalog_public() from public;
grant execute on function public.catalog_public() to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['variety_save(text, int, boolean, jsonb)', 'variety_publish(text, numeric, numeric)', 'param_set(text, numeric, text, text, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['varieties', 'price_params'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
