-- Regolamenti: leggi, regole e fonti del progetto, una pagina per tutti.
-- Chi è entrato li legge (anche i viewer); solo l'admin li cambia, e solo attraverso rules_apply(),
-- che prende un elenco di modifiche e le applica tutte o nessuna. L'editor della pagina e
-- "Aggiorna con Claude" passano entrambi da qui, e ogni modifica finisce nello storico.
-- I file (foto, PDF, video) stanno nel bucket privato "rules-files".

create table public.rules_sections (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  title text not null check (length(btrim(title)) between 1 and 80),
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.rules_entries (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  section_id text not null references public.rules_sections (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  -- rich text (HTML, sanitized again when shown); files are referenced as rules-file:<path>
  body text not null default '' check (length(body) <= 100000),
  -- confirmed: an admin confirmed it; to_confirm: written down but not confirmed yet; outdated: kept to show what changed
  status text not null default 'to_confirm' check (status in ('confirmed', 'to_confirm', 'outdated')),
  source text not null default '' check (length(source) <= 300),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  tags text[] not null default '{}',
  position int not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index rules_entries_section_idx on public.rules_entries (section_id, position);

create table public.rules_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references public.profiles (id) on delete set null,
  entry_id text not null,
  title text not null,
  action text not null check (action in ('created', 'changed', 'deleted', 'section_created', 'section_changed', 'section_deleted')),
  via text not null default 'editor' check (via in ('editor', 'claude')),
  fields text[] not null default '{}'
);

alter table public.rules_sections enable row level security;
alter table public.rules_entries enable row level security;
alter table public.rules_log enable row level security;
revoke all on public.rules_sections, public.rules_entries, public.rules_log from anon;
revoke insert, update, delete, truncate on public.rules_sections, public.rules_entries, public.rules_log from authenticated;
create policy "everyone signed in reads the rule sections" on public.rules_sections for select to authenticated using (true);
create policy "everyone signed in reads the rules" on public.rules_entries for select to authenticated using (true);
create policy "everyone signed in reads the rules history" on public.rules_log for select to authenticated using (true);

-- p_changes: a JSON array, applied in order. Each item is one of
--   {"op":"upsert_section","id","title","position"?}
--   {"op":"delete_section","id"}                       (only when it has no rules left)
--   {"op":"upsert_rule","id","section"?,"title"?,"body"?,"status"?,"source"?,"source_url"?,"tags"?,"position"?}
--   {"op":"delete_rule","id"}
-- upsert_rule changes only the fields it is given; a new rule needs at least section and title.
create function public.rules_apply(p_changes jsonb, p_via text default 'editor') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_profile();
  c jsonb;
  v_op text;
  v_id text;
  v_created int := 0;
  v_changed int := 0;
  v_deleted int := 0;
  s public.rules_sections;
  e public.rules_entries;
  n public.rules_entries;
  v_fields text[];
  v_title text;
  v_url text;
begin
  if me.role <> 'admin' then raise exception 'ERR_FORBIDDEN: solo l''admin può cambiare i regolamenti'; end if;
  if p_via is null or p_via not in ('editor', 'claude') then raise exception 'ERR_INVALID: origine della modifica sconosciuta %', p_via; end if;
  if jsonb_typeof(p_changes) <> 'array' then raise exception 'ERR_INVALID: le modifiche devono essere un elenco'; end if;
  if jsonb_array_length(p_changes) > 500 then raise exception 'ERR_INVALID: troppe modifiche in una volta (500 al massimo)'; end if;

  for c in select x from jsonb_array_elements(p_changes) x loop
    v_op := c ->> 'op';
    v_id := c ->> 'id';
    if v_op is null or v_op not in ('upsert_section', 'delete_section', 'upsert_rule', 'delete_rule') then
      raise exception 'ERR_INVALID: modifica sconosciuta "%"', coalesce(v_op, '');
    end if;
    if v_id is null or v_id !~ '^[a-z0-9][a-z0-9-]{0,99}$' then
      raise exception 'ERR_INVALID: "%" non è un id valido (lettere minuscole, cifre e trattini)', coalesce(v_id, '');
    end if;

    if v_op = 'upsert_section' then
      v_title := btrim(coalesce(c ->> 'title', ''));
      select * into s from public.rules_sections where id = v_id for update;
      if not found then
        if length(v_title) not between 1 and 80 then raise exception 'ERR_INVALID: la sezione "%" ha bisogno di un titolo da 1 a 80 caratteri', v_id; end if;
        insert into public.rules_sections (id, title, position)
          values (v_id, v_title, coalesce((c ->> 'position')::int, (select coalesce(max(position), 0) + 1 from public.rules_sections)));
        insert into public.rules_log (actor, entry_id, title, action, via) values (me.id, v_id, v_title, 'section_created', p_via);
        v_created := v_created + 1;
      else
        if c ? 'title' and length(v_title) not between 1 and 80 then raise exception 'ERR_INVALID: la sezione "%" ha bisogno di un titolo da 1 a 80 caratteri', v_id; end if;
        if (c ? 'title' and v_title <> s.title) or (c ? 'position' and (c ->> 'position')::int <> s.position) then
          update public.rules_sections set
            title = case when c ? 'title' then v_title else title end,
            position = coalesce((c ->> 'position')::int, position),
            updated_at = now()
          where id = v_id;
          insert into public.rules_log (actor, entry_id, title, action, via) values (me.id, v_id, case when c ? 'title' then v_title else s.title end, 'section_changed', p_via);
          v_changed := v_changed + 1;
        end if;
      end if;

    elsif v_op = 'delete_section' then
      select * into s from public.rules_sections where id = v_id for update;
      if not found then raise exception 'ERR_NOT_FOUND: non esiste la sezione "%"', v_id; end if;
      if exists (select 1 from public.rules_entries where section_id = v_id) then
        raise exception 'ERR_INVALID: la sezione "%" ha ancora regole: spostale o cancellale prima', s.title;
      end if;
      delete from public.rules_sections where id = v_id;
      insert into public.rules_log (actor, entry_id, title, action, via) values (me.id, v_id, s.title, 'section_deleted', p_via);
      v_deleted := v_deleted + 1;

    elsif v_op = 'delete_rule' then
      delete from public.rules_entries where id = v_id returning * into e;
      if not found then raise exception 'ERR_NOT_FOUND: non esiste la regola "%"', v_id; end if;
      insert into public.rules_log (actor, entry_id, title, action, via) values (me.id, v_id, e.title, 'deleted', p_via);
      v_deleted := v_deleted + 1;

    else -- upsert_rule
      if c ? 'section' and not exists (select 1 from public.rules_sections where id = c ->> 'section') then
        raise exception 'ERR_INVALID: la regola "%" punta alla sezione "%", che non esiste', v_id, c ->> 'section';
      end if;
      if c ? 'title' and length(btrim(coalesce(c ->> 'title', ''))) not between 1 and 200 then
        raise exception 'ERR_INVALID: la regola "%" ha bisogno di un titolo da 1 a 200 caratteri', v_id;
      end if;
      if c ? 'status' and coalesce(c ->> 'status', '') not in ('confirmed', 'to_confirm', 'outdated') then
        raise exception 'ERR_INVALID: stato sconosciuto "%" (confirmed, to_confirm o outdated)', c ->> 'status';
      end if;
      v_url := nullif(btrim(coalesce(c ->> 'source_url', '')), '');
      if c ? 'source_url' and v_url is not null and v_url !~* '^https?://' then
        raise exception 'ERR_INVALID: il link della fonte della regola "%" deve iniziare con https://', v_id;
      end if;
      if length(coalesce(c ->> 'body', '')) > 100000 then raise exception 'ERR_INVALID: la regola "%" è troppo lunga', v_id; end if;
      if length(coalesce(c ->> 'source', '')) > 300 then raise exception 'ERR_INVALID: la fonte della regola "%" è troppo lunga', v_id; end if;
      if c ? 'tags' and jsonb_typeof(c -> 'tags') <> 'array' then raise exception 'ERR_INVALID: i tag della regola "%" devono essere un elenco', v_id; end if;

      select * into e from public.rules_entries where id = v_id for update;
      if not found then
        if not (c ? 'section') then raise exception 'ERR_INVALID: la nuova regola "%" ha bisogno di una sezione', v_id; end if;
        if not (c ? 'title') then raise exception 'ERR_INVALID: la nuova regola "%" ha bisogno di un titolo', v_id; end if;
        insert into public.rules_entries (id, section_id, title, body, status, source, source_url, tags, position, updated_by)
        values (v_id, c ->> 'section', btrim(c ->> 'title'), coalesce(c ->> 'body', ''), coalesce(c ->> 'status', 'to_confirm'),
          btrim(coalesce(c ->> 'source', '')), v_url,
          coalesce(array(select lower(btrim(t)) from jsonb_array_elements_text(c -> 'tags') t where btrim(t) <> ''), '{}'),
          coalesce((c ->> 'position')::int, (select coalesce(max(position), 0) + 1 from public.rules_entries where section_id = c ->> 'section')),
          me.id);
        insert into public.rules_log (actor, entry_id, title, action, via) values (me.id, v_id, btrim(c ->> 'title'), 'created', p_via);
        v_created := v_created + 1;
      else
        n := e;
        if c ? 'section' then n.section_id := c ->> 'section'; end if;
        if c ? 'title' then n.title := btrim(c ->> 'title'); end if;
        if c ? 'body' then n.body := coalesce(c ->> 'body', ''); end if;
        if c ? 'status' then n.status := c ->> 'status'; end if;
        if c ? 'source' then n.source := btrim(coalesce(c ->> 'source', '')); end if;
        if c ? 'source_url' then n.source_url := v_url; end if;
        if c ? 'tags' then n.tags := coalesce(array(select lower(btrim(t)) from jsonb_array_elements_text(c -> 'tags') t where btrim(t) <> ''), '{}'); end if;
        if c ? 'position' then n.position := (c ->> 'position')::int; end if;
        v_fields := array_remove(array[
          case when n.section_id is distinct from e.section_id then 'section' end,
          case when n.title is distinct from e.title then 'title' end,
          case when n.body is distinct from e.body then 'body' end,
          case when n.status is distinct from e.status then 'status' end,
          case when n.source is distinct from e.source or n.source_url is distinct from e.source_url then 'source' end,
          case when n.tags is distinct from e.tags then 'tags' end,
          case when n.position is distinct from e.position then 'position' end
        ], null);
        if cardinality(v_fields) > 0 then
          update public.rules_entries set section_id = n.section_id, title = n.title, body = n.body, status = n.status, source = n.source,
            source_url = n.source_url, tags = n.tags, position = n.position, updated_by = me.id, updated_at = now()
          where id = v_id;
          -- moving a rule up or down is not worth a line in the history
          if v_fields <> array['position'] then
            insert into public.rules_log (actor, entry_id, title, action, via, fields) values (me.id, v_id, n.title, 'changed', p_via, v_fields);
          end if;
          v_changed := v_changed + 1;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'changed', v_changed, 'deleted', v_deleted);
end $$;

revoke execute on function public.rules_apply(jsonb, text) from public, anon;
grant execute on function public.rules_apply(jsonb, text) to authenticated;

-- Files: a private bucket. Everyone signed in can open the files (through short-lived signed links);
-- only admins upload, replace or delete them. Skipped where there is no Supabase Storage (database tests).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('rules-files', 'rules-files', false, 104857600, array['image/*', 'video/*', 'application/pdf'])
  on conflict (id) do nothing;
  execute $p$create policy "rules files: everyone signed in reads" on storage.objects for select to authenticated using (bucket_id = 'rules-files')$p$;
  execute $p$create policy "rules files: admins upload" on storage.objects for insert to authenticated with check (bucket_id = 'rules-files' and public.is_admin())$p$;
  execute $p$create policy "rules files: admins replace" on storage.objects for update to authenticated using (bucket_id = 'rules-files' and public.is_admin())$p$;
  execute $p$create policy "rules files: admins delete" on storage.objects for delete to authenticated using (bucket_id = 'rules-files' and public.is_admin())$p$;
end $$;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['rules_sections', 'rules_entries', 'rules_log'] loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
