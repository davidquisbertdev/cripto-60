-- Suscripción: solo las cuentas activas usan el motor. El registro libre se cierra (config.toml y el
-- panel de Supabase: Authentication → Sign In / Providers → «Allow new users to sign up» desactivado).
-- Las cuentas nuevas se crean a mano (Authentication → Users → Add user) al confirmar el pago, y se
-- activan con:
--   update public.perfiles set activo = true, suscripcion_hasta = now() + interval '30 days'
--   where id = (select id from auth.users where email = 'correo@ejemplo.com');
-- suscripcion_hasta null = sin fecha de fin (la cuenta del dueño).

alter table public.perfiles
  add column activo boolean not null default false,
  add column suscripcion_hasta timestamptz;

-- Las cuentas que ya existen (la del dueño) quedan activas y sin fecha de fin.
update public.perfiles set activo = true, suscripcion_hasta = null;

-- El usuario puede editar su perfil (ajustes, capital), pero nunca su propia suscripción.
create function public.proteger_suscripcion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.activo is distinct from old.activo or new.suscripcion_hasta is distinct from old.suscripcion_hasta)
     and current_user in ('authenticated', 'anon') then
    raise exception 'La suscripción solo la cambia el administrador.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger proteger_suscripcion before update on public.perfiles
  for each row execute function public.proteger_suscripcion();

-- ¿La cuenta que llama tiene la suscripción al día?
create function public.suscripcion_activa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.activo and (p.suscripcion_hasta is null or p.suscripcion_hasta > now())
    from public.perfiles p where p.id = auth.uid()
  ), false);
$$;
