-- Richieste dal questionario pubblico (#/interesse): preordini e manifestazioni di interesse.
--
-- Chi vede cosa (imposto qui, non solo nell'interfaccia):
--   - chiunque, anche senza login: può solo inviare una richiesta (interest_submit) e vedere
--     tra quali funghi scegliere (interest_options); non può leggere nessuna richiesta;
--   - solo l'admin legge le richieste e le gestisce: contengono nome, email e telefono.
--     Il login in sola lettura (socio, CAA, consulente) non le vede.
--
-- Due consensi separati, ognuno con la sua data:
--   privacy_at  -> ha letto l'informativa: i dati servono a rispondere alla richiesta (obbligatorio);
--   updates_at  -> vuole ricevere aggiornamenti (facoltativo); updates_stopped_at -> non li vuole più.

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('ristorante', 'privato')),
  name text not null check (length(btrim(name)) between 1 and 120),
  business text check (business is null or length(btrim(business)) between 1 and 120),
  town text not null check (length(btrim(town)) between 1 and 80),
  email text not null check (length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,25}$'),
  frequency text not null check (frequency in ('settimanale', 'quindicinale', 'mensile', 'occasionale')),
  note text check (note is null or length(note) <= 1000),
  privacy_at timestamptz not null,
  updates_at timestamptz,
  updates_stopped_at timestamptz,
  -- per il link "non voglio più aggiornamenti" nelle email, quando partiranno
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'nuova' check (status in ('nuova', 'contattata', 'cliente', 'archiviata')),
  admin_note text check (admin_note is null or length(admin_note) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index interests_email_idx on public.interests (lower(email), created_at desc);
create index interests_created_idx on public.interests (created_at desc);

-- I funghi di una richiesta (al massimo 3), con i kg che vorrebbe a ogni consegna.
-- label è il nome al momento della richiesta: resta anche se la varietà cambia o sparisce.
create table public.interest_items (
  interest_id uuid not null references public.interests (id) on delete cascade,
  position int not null check (position between 1 and 3),
  variety_id text references public.varieties (id) on delete set null,
  label text not null check (length(btrim(label)) between 1 and 80),
  kg numeric not null check (kg > 0 and kg <= 100),
  primary key (interest_id, position)
);

do $$
declare t text;
begin
  foreach t in array array['interests', 'interest_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy "solo l''admin legge" on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- I funghi tra cui scegliere: prima quelli del catalogo, poi quelli che vorrei portare
-- ma che non sono nell'elenco delle specie vendibili (sellable = false: prima serve l'ok dell'ASL).
create function public.interest_options()
returns table (id text, "position" int, common_name text, scientific_name text, sellable boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.position, v.data ->> 'commonName', v.data ->> 'scientificName',
    (v.public and v.data ->> 'legal' = 'ammesso')
  from public.varieties v
  where (v.public and v.data ->> 'legal' = 'ammesso') or v.data ->> 'legal' = 'non_in_elenco'
  order by (v.public and v.data ->> 'legal' = 'ammesso') desc, v.position, v.id
$$;

-- Invia una richiesta. p è un oggetto:
--   {kind, name, business, town, email, phone, frequency, note, privacy: true, updates: bool,
--    items: [{variety: "<id>" | null, other: "<nome>" | null, kg: n}, ...]}
-- Controlla tutto qui, qualunque cosa mandi il browser. Restituisce l'id della richiesta.
create function public.interest_submit(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_kind text;
  v_name text;
  v_business text;
  v_town text;
  v_email text;
  v_phone text;
  v_note text;
  v_items jsonb;
  it jsonb;
  i int := 0;
  v_var text;
  v_label text;
  v_kg numeric;
  v_seen text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'ERR_INVALID: richiesta non valida'; end if;
  v_kind := p ->> 'kind';
  v_name := btrim(coalesce(p ->> 'name', ''));
  v_business := nullif(btrim(coalesce(p ->> 'business', '')), '');
  v_town := btrim(coalesce(p ->> 'town', ''));
  v_email := lower(btrim(coalesce(p ->> 'email', '')));
  v_phone := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  v_note := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_items := p -> 'items';

  if coalesce(v_kind, '') not in ('ristorante', 'privato') then raise exception 'ERR_INVALID: dimmi se hai un locale o sei un privato'; end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then raise exception 'ERR_INVALID: scegli almeno un fungo'; end if;
  if jsonb_array_length(v_items) > 3 then raise exception 'ERR_INVALID: puoi scegliere al massimo 3 funghi'; end if;
  if coalesce(p ->> 'frequency', '') not in ('settimanale', 'quindicinale', 'mensile', 'occasionale') then
    raise exception 'ERR_INVALID: dimmi ogni quanto li vorresti';
  end if;
  if length(v_name) = 0 then raise exception 'ERR_INVALID: scrivi il tuo nome'; end if;
  if length(v_name) > 120 then raise exception 'ERR_INVALID: il nome è troppo lungo'; end if;
  if v_kind = 'ristorante' and v_business is null then raise exception 'ERR_INVALID: scrivi il nome del locale'; end if;
  if v_business is not null and length(v_business) > 120 then raise exception 'ERR_INVALID: il nome del locale è troppo lungo'; end if;
  if length(v_town) = 0 then raise exception 'ERR_INVALID: scrivi il comune dove vorresti la consegna'; end if;
  if length(v_town) > 80 then raise exception 'ERR_INVALID: il nome del comune è troppo lungo'; end if;
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'ERR_INVALID: controlla l''indirizzo email'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ().-]{6,25}$' then raise exception 'ERR_INVALID: controlla il numero di telefono'; end if;
  if v_note is not null and length(v_note) > 1000 then raise exception 'ERR_INVALID: la nota è troppo lunga (al massimo 1000 caratteri)'; end if;
  if (p -> 'privacy') is distinct from 'true'::jsonb then
    raise exception 'ERR_INVALID: per inviare la richiesta devi aver letto l''informativa sulla privacy';
  end if;

  -- contro chi riempie il modulo in automatico
  if (select count(*) from public.interests where lower(email) = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'ERR_INVALID: oggi hai già inviato tre richieste con questa email: se devi cambiare qualcosa, scrivimi';
  end if;
  if (select count(*) from public.interests where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'ERR_INVALID: in questo momento arrivano troppe richieste: riprova tra un''ora';
  end if;

  insert into public.interests (kind, name, business, town, email, phone, frequency, note, privacy_at, updates_at)
  values (v_kind, v_name, v_business, v_town, v_email, v_phone, p ->> 'frequency', v_note, now(),
    case when (p -> 'updates') = 'true'::jsonb then now() end)
  returning id into v_id;

  for it in select value from jsonb_array_elements(v_items) loop
    i := i + 1;
    if jsonb_typeof(it) <> 'object' or jsonb_typeof(it -> 'kg') is distinct from 'number' then
      raise exception 'ERR_INVALID: indica quanti kg vorresti di ogni fungo';
    end if;
    v_kg := round((it ->> 'kg')::numeric, 2);
    if v_kg <= 0 or v_kg > 100 then raise exception 'ERR_INVALID: i kg a consegna devono essere più di 0 e al massimo 100'; end if;
    v_var := nullif(btrim(coalesce(it ->> 'variety', '')), '');
    if v_var is not null then
      v_label := (select o.common_name from public.interest_options() o where o.id = v_var);
      if v_label is null then raise exception 'ERR_INVALID: questo fungo non è tra quelli che si possono scegliere'; end if;
    else
      v_label := btrim(coalesce(it ->> 'other', ''));
      if length(v_label) = 0 then raise exception 'ERR_INVALID: scrivi quale altro fungo ti interessa'; end if;
      if length(v_label) > 80 then raise exception 'ERR_INVALID: il nome dell''altro fungo è troppo lungo'; end if;
    end if;
    if lower(v_label) = any (v_seen) then raise exception 'ERR_INVALID: hai scelto due volte lo stesso fungo'; end if;
    v_seen := v_seen || lower(v_label);
    insert into public.interest_items (interest_id, position, variety_id, label, kg) values (v_id, i, v_var, v_label, v_kg);
  end loop;
  return v_id;
end $$;

-- admin: a che punto è la richiesta, e una nota per sé.
create function public.interest_update(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if coalesce(p_status, '') not in ('nuova', 'contattata', 'cliente', 'archiviata') then raise exception 'ERR_INVALID: stato non valido'; end if;
  if p_note is not null and length(p_note) > 2000 then raise exception 'ERR_INVALID: la nota è troppo lunga (al massimo 2000 caratteri)'; end if;
  update public.interests set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now(), updated_by = me.id
  where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa richiesta non esiste più'; end if;
end $$;

-- admin: questa persona non vuole più aggiornamenti (vale per tutte le sue richieste, cioè per la sua email).
create function public.interest_stop_updates(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  v_email text := (select lower(email) from public.interests where id = p_id);
begin
  if v_email is null then raise exception 'ERR_NOT_FOUND: questa richiesta non esiste più'; end if;
  update public.interests set updates_stopped_at = coalesce(updates_stopped_at, now()), updated_at = now(), updated_by = me.id
  where lower(email) = v_email;
end $$;

-- admin: cancella i dati di questa persona: tutte le richieste con la sua email.
create function public.interest_delete(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  v_email text := (select lower(email) from public.interests where id = p_id);
  n int;
begin
  if v_email is null then raise exception 'ERR_NOT_FOUND: questa richiesta non esiste più'; end if;
  delete from public.interests where lower(email) = v_email;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.interest_options() from public;
revoke execute on function public.interest_submit(jsonb) from public;
grant execute on function public.interest_options() to anon, authenticated;
grant execute on function public.interest_submit(jsonb) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['interest_update(uuid, text, text)', 'interest_stop_updates(uuid)', 'interest_delete(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['interests', 'interest_items'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
