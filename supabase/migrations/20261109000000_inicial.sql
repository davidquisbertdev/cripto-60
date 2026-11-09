-- Cripto Trader: esquema inicial. Cada usuario ve y cambia solo sus filas (RLS).

-- Perfil: capital inicial del diario y ajustes propios (se combinan con los valores del motor).
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  capital_inicial numeric(14, 4) check (capital_inicial is null or capital_inicial > 0),
  ajustes jsonb not null default '{}'::jsonb,
  acepto_aviso_en timestamptz,
  creado_en timestamptz not null default now()
);

-- Operaciones cerradas: el diario. El capital y los frenos del día salen de aquí.
create table public.operaciones (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha timestamptz not null default now(),
  simbolo text not null check (simbolo ~ '^[A-Z0-9]{1,20}$'),
  lado text check (lado in ('LONG', 'SHORT')),
  pnl numeric(14, 4) not null,
  margen numeric(14, 4) check (margen is null or margen > 0),
  nota text check (char_length(nota) <= 500),
  senal_id bigint
);
create index operaciones_user_fecha on public.operaciones (user_id, fecha desc);

-- Señales generadas por el motor (la salida completa en datos).
create table public.senales (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base text not null,
  creada timestamptz not null default now(),
  recomendacion text not null,
  datos jsonb not null
);
create index senales_user_base on public.senales (user_id, base, creada desc);

alter table public.operaciones
  add constraint operaciones_senal_fk foreign key (senal_id) references public.senales (id) on delete set null;

-- Posición abierta que el usuario está siguiendo (como mucho una a la vez).
create table public.posiciones (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  senal_id bigint references public.senales (id) on delete set null,
  base text not null,
  lado text not null check (lado in ('LONG', 'SHORT')),
  entrada numeric not null,
  sl numeric not null,
  tps numeric[] not null,
  contratos numeric,
  estrategia text not null default 'tendencia' check (estrategia in ('tendencia', 'reversion')),
  abierta timestamptz not null default now(),
  cerrada timestamptz
);
create unique index posiciones_una_abierta on public.posiciones (user_id) where cerrada is null;

-- Última foto de las ballenas por moneda, para decir qué cambió desde la revisión anterior.
create table public.instantaneas_ballenas (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base text not null,
  datos jsonb not null,
  actualizada timestamptz not null default now(),
  primary key (user_id, base)
);

alter table public.perfiles enable row level security;
alter table public.operaciones enable row level security;
alter table public.senales enable row level security;
alter table public.posiciones enable row level security;
alter table public.instantaneas_ballenas enable row level security;

create policy "perfil propio" on public.perfiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "operaciones propias" on public.operaciones for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "senales propias" on public.senales for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "posiciones propias" on public.posiciones for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ballenas propias" on public.instantaneas_ballenas for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cada cuenta nueva recibe su perfil vacío.
create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre) values (new.id, new.raw_user_meta_data ->> 'nombre');
  return new;
end;
$$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();
