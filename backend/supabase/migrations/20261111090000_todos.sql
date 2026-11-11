-- Le cose da fare di Lucia, fuori dai cicli delle colture: telefonate, email, documenti, bandi.
-- Ognuna è "da fare", "in attesa di risposta" (l'hai fatta, ora tocca a qualcun altro) o "fatta".
-- Solo l'admin le vede e le cambia: contengono nomi, contatti e scadenze personali.
-- Il contenuto vero sta solo nel database, mai in questo repository (che è pubblico).

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'da_fare' check (status in ('da_fare', 'in_attesa', 'fatto')),
  -- con chi: un ente, un fornitore, una persona
  who text check (who is null or length(btrim(who)) between 1 and 120),
  -- entro quando (facoltativo)
  due date,
  -- da quando aspetti la risposta
  waiting_since date,
  note text check (note is null or length(note) <= 2000),
  -- per esempio la mail in Gmail
  link text check (link is null or (length(link) <= 500 and link ~ '^https?://')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index todos_status_idx on public.todos (status, due);

alter table public.todos enable row level security;
revoke all on public.todos from anon;
revoke insert, update, delete, truncate on public.todos from authenticated;
create policy "solo l'admin legge" on public.todos for select to authenticated using (public.is_admin());

-- Crea (p_id null) o modifica una cosa da fare. p: {title, status, who, due, waiting_since, note, link}
create function public.todo_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.current_admin();
  v_id uuid;
  v_title text;
  v_status text;
  v_who text;
  v_note text;
  v_link text;
  v_due date;
  v_since date;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'ERR_INVALID: dati non validi'; end if;
  v_title := btrim(coalesce(p ->> 'title', ''));
  v_status := coalesce(nullif(p ->> 'status', ''), 'da_fare');
  v_who := nullif(btrim(coalesce(p ->> 'who', '')), '');
  v_note := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_link := nullif(btrim(coalesce(p ->> 'link', '')), '');
  if length(v_title) = 0 then raise exception 'ERR_INVALID: scrivi cosa c''è da fare'; end if;
  if length(v_title) > 200 then raise exception 'ERR_INVALID: il titolo è troppo lungo (200 caratteri al massimo)'; end if;
  if v_status not in ('da_fare', 'in_attesa', 'fatto') then raise exception 'ERR_INVALID: stato non valido'; end if;
  if v_who is not null and length(v_who) > 120 then raise exception 'ERR_INVALID: il nome di chi è troppo lungo'; end if;
  if v_note is not null and length(v_note) > 2000 then raise exception 'ERR_INVALID: la nota è troppo lunga (2000 caratteri al massimo)'; end if;
  if v_link is not null and (length(v_link) > 500 or v_link !~ '^https?://') then raise exception 'ERR_INVALID: il link deve iniziare con http:// o https://'; end if;
  begin
    v_due := nullif(p ->> 'due', '')::date;
    v_since := nullif(p ->> 'waiting_since', '')::date;
  exception when others then
    raise exception 'ERR_INVALID: data non valida';
  end;
  if v_status = 'in_attesa' then v_since := coalesce(v_since, current_date); end if;

  if p_id is null then
    insert into public.todos (title, status, who, due, waiting_since, note, link, done_at, updated_by)
    values (v_title, v_status, v_who, v_due, v_since, v_note, v_link, case when v_status = 'fatto' then now() end, me.id)
    returning id into v_id;
  else
    update public.todos set title = v_title, status = v_status, who = v_who, due = v_due, waiting_since = v_since,
      note = v_note, link = v_link,
      done_at = case when v_status = 'fatto' then coalesce(done_at, now()) end,
      updated_at = now(), updated_by = me.id
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'ERR_NOT_FOUND: questa cosa da fare non esiste più'; end if;
  end if;
  return v_id;
end $$;

-- Sposta una cosa da fare: da fare -> in attesa (da oggi) -> fatta, o indietro.
create function public.todo_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if coalesce(p_status, '') not in ('da_fare', 'in_attesa', 'fatto') then raise exception 'ERR_INVALID: stato non valido'; end if;
  update public.todos set
    status = p_status,
    waiting_since = case when p_status = 'in_attesa' then coalesce(waiting_since, current_date) else waiting_since end,
    done_at = case when p_status = 'fatto' then coalesce(done_at, now()) end,
    updated_at = now(), updated_by = me.id
  where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa cosa da fare non esiste più'; end if;
end $$;

create function public.todo_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  delete from public.todos where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa cosa da fare non esiste più'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['todo_save(uuid, jsonb)', 'todo_set_status(uuid, text)', 'todo_delete(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todos') then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
