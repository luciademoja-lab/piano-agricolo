-- Il piano agricolo: catalogo delle colture, spazio disponibile, colture nel piano, task e spese.
-- Le regole che decidono se una coltura entra nel piano (finestra di avvio, spazio, quantità) vivono qui,
-- in plan_add(), e uguali in frontend/src/lib/plan.ts per la modalità demo. I task e la spesa iniziale
-- di una nuova coltura li genera il frontend dal catalogo (lib/plan.ts, testato) e plan_add li salva
-- nella stessa transazione, così le due modalità non possono divergere.

-- Catalogo: una riga per coltura. data è la voce di backend/supabase/seed/catalog_v1.json così com'è.
create table public.crop_catalog (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  position int not null default 0,
  name text not null check (length(btrim(name)) between 1 and 80),
  space text not null check (space in ('indoor', 'outdoor')),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

-- Impostazioni: una sola riga.
create table public.farm_settings (
  id boolean primary key default true check (id),
  outdoor_m2 numeric not null default 1000 check (outdoor_m2 > 0),
  indoor_m2 numeric check (indoor_m2 is null or indoor_m2 >= 0),
  grant_deadline date,
  updated_at timestamptz not null default now()
);
insert into public.farm_settings (id) values (true);

create table public.plantings (
  id uuid primary key default gen_random_uuid(),
  crop_id text not null references public.crop_catalog (id) on delete restrict,
  m2 numeric not null check (m2 > 0),
  heads int check (heads is null or heads > 0),
  start_date date not null,
  sold_pct numeric not null default 100 check (sold_pct between 0 and 100),
  note text not null default '' check (length(note) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.farm_tasks (
  id uuid primary key default gen_random_uuid(),
  planting_id uuid references public.plantings (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  due date not null,
  done boolean not null default false,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('cycle', 'manual')),
  created_at timestamptz not null default now()
);
create index farm_tasks_due_idx on public.farm_tasks (due);
create index farm_tasks_planting_idx on public.farm_tasks (planting_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  planting_id uuid references public.plantings (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  date date not null,
  amount_min numeric not null check (amount_min >= 0),
  amount_max numeric not null check (amount_max >= amount_min),
  kind text not null default 'other' check (kind in ('investment', 'recurring', 'other')),
  paid boolean not null default false,
  actual_amount numeric check (actual_amount is null or actual_amount >= 0),
  source text not null default 'manual' check (source in ('catalog', 'manual')),
  created_at timestamptz not null default now()
);
create index expenses_planting_idx on public.expenses (planting_id);

do $$
declare t text;
begin
  foreach t in array array['crop_catalog', 'farm_settings', 'plantings', 'farm_tasks', 'expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy "chi è entrato legge" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- 1234.5 -> '1.234,5' (come nel frontend)
create function public._fmt(n numeric) returns text
language sql immutable set search_path = '' as $$
  select rtrim(rtrim(translate(to_char(round(n, 2), 'FM999,999,999,990.00'), ',.', '.,'), '0'), ',')
$$;

-- Una data cade in una delle finestre di avvio? Finestre: [{"from":"MM-DD","to":"MM-DD"}];
-- from > to attraversa il capodanno (ottobre–marzo).
create function public._in_window(p_windows jsonb, p_date date) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(p_windows) w
    where case when w ->> 'from' <= w ->> 'to'
      then to_char(p_date, 'MM-DD') between w ->> 'from' and w ->> 'to'
      else to_char(p_date, 'MM-DD') >= w ->> 'from' or to_char(p_date, 'MM-DD') <= w ->> 'to' end
  )
$$;

create function public._used_m2(p_space text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.m2), 0) from public.plantings p join public.crop_catalog c on c.id = p.crop_id where c.space = p_space
$$;

create function public.farm_set_settings(p_outdoor numeric, p_indoor numeric, p_deadline date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  v_out numeric := public._used_m2('outdoor');
  v_in numeric := public._used_m2('indoor');
begin
  perform 1 from public.farm_settings where id for update;
  if p_outdoor is null or p_outdoor <= 0 then raise exception 'ERR_INVALID: indica i m² esterni disponibili (più di 0)'; end if;
  if p_indoor is not null and p_indoor < 0 then raise exception 'ERR_INVALID: i m² interni non possono essere negativi'; end if;
  if p_outdoor < v_out then raise exception 'ERR_INVALID: le colture nel piano usano già % m² esterni', public._fmt(v_out); end if;
  if v_in > 0 and (p_indoor is null or p_indoor < v_in) then raise exception 'ERR_INVALID: le colture nel piano usano già % m² interni', public._fmt(v_in); end if;
  update public.farm_settings set outdoor_m2 = p_outdoor, indoor_m2 = p_indoor, grant_deadline = p_deadline, updated_at = now() where id;
end $$;

create function public.plan_add(
  p_crop text, p_m2 numeric, p_heads int, p_start date, p_sold_pct numeric, p_note text,
  p_tasks jsonb default '[]', p_expenses jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  c public.crop_catalog;
  s public.farm_settings;
  v_available numeric;
  v_used numeric;
  v_id uuid;
  t jsonb;
begin
  select * into c from public.crop_catalog where id = p_crop;
  if not found then raise exception 'ERR_INVALID: scegli una coltura dal catalogo'; end if;
  if p_m2 is null or p_m2 <= 0 then raise exception 'ERR_INVALID: indica i m² da assegnare (più di 0)'; end if;
  if c.data ->> 'scale' = 'capi' and (p_heads is null or p_heads < 1) then raise exception 'ERR_INVALID: indica il numero di capi (almeno 1)'; end if;
  if p_sold_pct is null or p_sold_pct < 0 or p_sold_pct > 100 then raise exception 'ERR_INVALID: la quota venduta va da 0 a 100%%'; end if;
  if p_start is null then raise exception 'ERR_INVALID: scegli la data di inizio'; end if;
  if not public._in_window(c.data -> 'windows', p_start) then
    raise exception 'ERR_INVALID: % non si può avviare in questa data: è fuori dalla finestra di avvio', c.name;
  end if;
  if p_start < (current_date - interval '24 months')::date or p_start > (current_date + interval '36 months')::date then
    raise exception 'ERR_INVALID: la data di inizio deve stare tra due anni fa e tre anni da oggi';
  end if;

  -- una coltura alla volta: il controllo dello spazio non può essere aggirato da due aggiunte insieme
  select * into s from public.farm_settings where id for update;
  v_available := case when c.space = 'outdoor' then s.outdoor_m2 else s.indoor_m2 end;
  if v_available is null then raise exception 'ERR_INVALID: indica prima quanto spazio interno hai a disposizione'; end if;
  v_used := public._used_m2(c.space);
  if v_used + p_m2 > v_available then
    raise exception 'ERR_INVALID: spazio % insufficiente: ne restano % m² su %',
      case when c.space = 'indoor' then 'interno' else 'esterno' end, public._fmt(greatest(0, v_available - v_used)), public._fmt(v_available);
  end if;

  if jsonb_typeof(coalesce(p_tasks, '[]')) <> 'array' or jsonb_array_length(coalesce(p_tasks, '[]')) > 2000 then
    raise exception 'ERR_INVALID: elenco dei task non valido';
  end if;
  if jsonb_typeof(coalesce(p_expenses, '[]')) <> 'array' or jsonb_array_length(coalesce(p_expenses, '[]')) > 50 then
    raise exception 'ERR_INVALID: elenco delle spese non valido';
  end if;

  insert into public.plantings (crop_id, m2, heads, start_date, sold_pct, note, created_by)
  values (c.id, p_m2, case when c.data ->> 'scale' = 'capi' then p_heads end, p_start, p_sold_pct, coalesce(btrim(p_note), ''), me.id)
  returning id into v_id;

  for t in select x from jsonb_array_elements(coalesce(p_tasks, '[]')) x loop
    insert into public.farm_tasks (planting_id, title, due, source) values (v_id, btrim(t ->> 'title'), (t ->> 'due')::date, 'cycle');
  end loop;
  for t in select x from jsonb_array_elements(coalesce(p_expenses, '[]')) x loop
    insert into public.expenses (planting_id, title, date, amount_min, amount_max, kind, source)
    values (v_id, btrim(t ->> 'title'), (t ->> 'date')::date, (t ->> 'amountMin')::numeric, (t ->> 'amountMax')::numeric, coalesce(t ->> 'kind', 'investment'), 'catalog');
  end loop;
  return v_id;
end $$;

-- Toglie una coltura dal piano con i suoi task e le sue spese.
create function public.plan_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  delete from public.plantings where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa coltura non è più nel piano'; end if;
end $$;

create function public.task_set_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  update public.farm_tasks set done = coalesce(p_done, false), done_at = case when p_done then now() end where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questo task non esiste più'; end if;
end $$;

create function public.task_add(p_title text, p_due date, p_planting uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin(); v_id uuid;
begin
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then raise exception 'ERR_INVALID: scrivi cosa c''è da fare (200 caratteri al massimo)'; end if;
  if p_due is null then raise exception 'ERR_INVALID: scegli una data'; end if;
  if p_planting is not null and not exists (select 1 from public.plantings where id = p_planting) then raise exception 'ERR_NOT_FOUND: questa coltura non è più nel piano'; end if;
  insert into public.farm_tasks (planting_id, title, due, source) values (p_planting, btrim(p_title), p_due, 'manual') returning id into v_id;
  return v_id;
end $$;

create function public.task_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  delete from public.farm_tasks where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questo task non esiste più'; end if;
end $$;

create function public.expense_add(p_title text, p_date date, p_min numeric, p_max numeric, p_kind text, p_planting uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin(); v_id uuid;
begin
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then raise exception 'ERR_INVALID: scrivi a cosa serve la spesa'; end if;
  if p_date is null then raise exception 'ERR_INVALID: scegli una data'; end if;
  if p_min is null or p_max is null or p_min < 0 or p_max < p_min then raise exception 'ERR_INVALID: l''importo massimo non può essere minore del minimo'; end if;
  if p_kind is null or p_kind not in ('investment', 'recurring', 'other') then raise exception 'ERR_INVALID: tipo di spesa sconosciuto'; end if;
  if p_planting is not null and not exists (select 1 from public.plantings where id = p_planting) then raise exception 'ERR_NOT_FOUND: questa coltura non è più nel piano'; end if;
  insert into public.expenses (planting_id, title, date, amount_min, amount_max, kind, source)
  values (p_planting, btrim(p_title), p_date, p_min, p_max, p_kind, 'manual') returning id into v_id;
  return v_id;
end $$;

-- Segna una spesa come pagata, con l'importo vero (che da quel momento vale in tutti gli scenari).
create function public.expense_set_paid(p_id uuid, p_paid boolean, p_actual numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if p_paid and (p_actual is null or p_actual < 0) then raise exception 'ERR_INVALID: indica quanto hai pagato'; end if;
  update public.expenses set paid = coalesce(p_paid, false), actual_amount = case when p_paid then p_actual end where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa spesa non esiste più'; end if;
end $$;

create function public.expense_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  delete from public.expenses where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa spesa non esiste più'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['_fmt(numeric)', '_in_window(jsonb, date)', '_used_m2(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['farm_set_settings(numeric, numeric, date)', 'plan_add(text, numeric, integer, date, numeric, text, jsonb, jsonb)', 'plan_delete(uuid)',
    'task_set_done(uuid, boolean)', 'task_add(text, date, uuid)', 'task_delete(uuid)',
    'expense_add(text, date, numeric, numeric, text, uuid)', 'expense_set_paid(uuid, boolean, numeric)', 'expense_delete(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Aggiornamenti in diretta per tutte le schede.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['profiles', 'crop_catalog', 'farm_settings', 'plantings', 'farm_tasks', 'expenses'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
