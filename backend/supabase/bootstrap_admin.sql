-- Prima configurazione del login admin, da eseguire una volta nell'editor SQL di Supabase.
--
-- Prima crea l'utente in Authentication > Users > Add user:
--   lucia@login.piano-agricolo.app   qualsiasi password, spunta "Auto Confirm User"
-- La parte @login.piano-agricolo.app è interna: nell'app entri solo con "lucia".
-- A quell'indirizzo non parte mai nessuna email.

update public.profiles set role = 'admin', full_name = 'Lucia De Mojà' where username = 'lucia';

-- Imposta qui la password (almeno 10 caratteri, con una lettera e un numero):
select set_password('lucia', 'CAMBIAMI-2026');

select username, full_name, role from public.profiles order by username;
