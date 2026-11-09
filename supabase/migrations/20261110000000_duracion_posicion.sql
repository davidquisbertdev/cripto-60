-- Duración propia de una posición seguida (min): el usuario puede alargarla (p. ej. de 60 a 120)
-- y la revisión se hace con ella. null = la de la señal o la de Ajustes.
alter table public.posiciones
  add column duracion_max_min integer check (duracion_max_min is null or duracion_max_min between 5 and 1440);
