-- Profili: uno per login. I login li crea l'admin dalla Edge Function admin-users.
-- Due ruoli: admin (cambia tutto) e viewer (vede tutto, non cambia niente: un socio, il CAA, un consulente).
-- Tutte le scritture passano da funzioni Postgres che controllano il ruolo; RLS lascia solo leggere.
-- Gli errori iniziano con ERR_<CODICE>: il frontend li traduce (frontend/src/data/repo.ts).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  full_name text not null check (length(btrim(full_name)) between 1 and 80),
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
create policy "chi è entrato vede le persone" on public.profiles for select to authenticated using (true);

-- Nuovo utente di Auth -> profilo. Il ruolo viene dai metadati app, che solo il service role
-- (la funzione admin-users) può scrivere.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'viewer' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Il profilo di chi chiama, o un errore se non è entrato o è disattivato.
create function public.current_profile() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'ERR_NOT_SIGNED_IN'; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found or not p.active then raise exception 'ERR_FORBIDDEN: questo login non è attivo'; end if;
  return p;
end $$;

-- Il profilo di chi chiama, se può cambiare il piano (solo admin).
create function public.current_admin() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := public.current_profile();
begin
  if p.role <> 'admin' then raise exception 'ERR_FORBIDDEN: hai accesso in sola lettura'; end if;
  return p;
end $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active)
$$;

create function public.admin_update_profile(p_id uuid, p_full_name text, p_role text, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles := public.current_admin();
begin
  if p_role is null or p_role not in ('admin', 'viewer') then raise exception 'ERR_INVALID: il ruolo deve essere admin o viewer'; end if;
  if p_id = me.id and (p_role <> 'admin' or not p_active) then
    raise exception 'ERR_INVALID: non puoi togliere a te stessa l''accesso da admin';
  end if;
  update public.profiles set full_name = btrim(p_full_name), role = p_role, active = p_active where id = p_id;
  if not found then raise exception 'ERR_NOT_FOUND: questa persona non esiste'; end if;
end $$;

-- Cambiare la password di un login dall'editor SQL di Supabase, con il nome utente:
--   select set_password('lucia', 'nuova-password-2026');
-- Conferma anche il login. Solo il proprietario del database (l'editor SQL) può usarla.
create function public.set_password(p_username text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_id uuid;
begin
  if p_password is null or length(p_password) < 10 then raise exception 'ERR_INVALID: la password deve avere almeno 10 caratteri'; end if;
  if p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then raise exception 'ERR_INVALID: la password deve contenere almeno una lettera e un numero'; end if;
  select id into v_id from public.profiles where username = v_username;
  if v_id is null then raise exception 'ERR_NOT_FOUND: nessun login con nome utente %', v_username; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_id;
  return 'Password aggiornata per ' || v_username || '.';
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_profile() from public, anon;
revoke execute on function public.current_admin() from public, anon;
revoke execute on function public.admin_update_profile(uuid, text, text, boolean) from public, anon;
revoke execute on function public.set_password(text, text) from public, anon, authenticated;
